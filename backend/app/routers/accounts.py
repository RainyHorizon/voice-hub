"""Provider account and Volcengine project management endpoints."""
from __future__ import annotations

import asyncio
import hashlib
import sqlite3
import uuid
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException

from .. import config
from ..credentials import (
    CredentialStoreError,
    credential_store_name,
    delete_api_key,
    delete_project_api_key,
    load_api_key,
    load_project_api_key,
    load_provider_credentials,
    replace_provider_credentials,
    save_project_api_key,
    save_provider_credentials,
)
from ..database import db, now
from ..providers.base import ProviderError
from ..providers.volcengine import VolcengineProvider
from ..schemas import ProviderAccountBody, ProviderProjectBody
from ..services import provider_account_for, provider_for, validate_provider_endpoint

router = APIRouter(tags=["accounts"])


def _restore_credentials(
    account_id: str,
    account_credentials: dict[str, str],
    project_credentials: dict[str, str | None] | None = None,
) -> None:
    replace_provider_credentials(account_id, account_credentials)
    for project_name, api_key in (project_credentials or {}).items():
        if api_key is None:
            delete_project_api_key(account_id, project_name)
        else:
            save_project_api_key(account_id, project_name, api_key)


def _rollback_or_raise(
    account_id: str,
    account_credentials: dict[str, str],
    project_credentials: dict[str, str | None] | None,
    message: str,
) -> None:
    try:
        _restore_credentials(account_id, account_credentials, project_credentials)
    except CredentialStoreError as rollback_error:
        raise HTTPException(503, f"{message}，且无法恢复{credential_store_name()}中的原凭据") from rollback_error


def account_response(row: sqlite3.Row) -> dict[str, Any]:
    result = {**dict(row), "has_secret": True}
    if row["provider"] == "volcengine":
        try:
            credentials = load_provider_credentials(row["id"])
        except CredentialStoreError:
            credentials = {}
        access_key = credentials.get("openapi_access_key") or ""
        result.update({"project_name": row["account_ref"] or "", "openapi_access_key_hint": ("••••" + access_key[-4:]) if access_key else "", "has_openapi_secret": bool(credentials.get("openapi_secret_key"))})
    return result


def project_response(row: sqlite3.Row) -> dict[str, Any]:
    payload = {
        **dict(row),
        "has_permission": None if row["has_permission"] is None else bool(row["has_permission"]),
        "has_api_key": None if row["has_api_key"] is None else bool(row["has_api_key"]),
    }
    if row["api_key_sync_error"]:
        payload["api_key_status"] = "error"
    elif row["has_api_key"] is None:
        payload["api_key_status"] = "unknown"
    else:
        payload["api_key_status"] = "available" if row["has_api_key"] else "missing"
    return payload


def normalize_account(body: ProviderAccountBody) -> tuple[dict[str, Any], dict[str, Any]]:
    spec = config.PROVIDER_SPECS.get(body.provider)
    if not spec:
        raise HTTPException(400, "不支持的厂商")
    try:
        endpoint = validate_provider_endpoint(body.provider, body.endpoint or spec["default_endpoint"])
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    values = {
        "provider": body.provider,
        "display_name": body.display_name.strip(),
        "account_ref": body.project_name.strip() if body.provider == "volcengine" and body.project_name else None,
        "region": None,
        "endpoint": endpoint or None,
    }
    return spec, values


@router.get("/api/providers")
def list_providers():
    from ..services import available_models
    names = {"dashscope": "通义千问", "volcengine": "火山引擎", "minimax": "MiniMax", "mimo": "小米 MiMo"}
    return [
        {
            "id": provider_id,
            "display_name": names[provider_id],
            "status": "provider",
            "models": [{**item.__dict__, "gateway_id": item.gateway_id} for item in available_models() if item.provider == provider_id],
        }
        for provider_id in names
    ]


@router.get("/api/provider-specs")
def provider_specs():
    return config.PROVIDER_SPECS


@router.get("/api/provider-accounts")
def list_provider_accounts():
    with db() as connection:
        rows = connection.execute("SELECT * FROM provider_accounts ORDER BY created_at").fetchall()
    return [account_response(row) for row in rows]


@router.get("/api/provider-accounts/{account_id}/projects")
def list_provider_projects(account_id: str):
    try:
        provider_account_for("volcengine", account_id)
    except ProviderError as exc:
        raise HTTPException(exc.status, detail={"message": str(exc), "code": exc.code}) from exc
    with db() as connection:
        rows = connection.execute(
            "SELECT * FROM provider_projects WHERE provider_account_id=? ORDER BY display_name, project_name",
            (account_id,),
        ).fetchall()
    return {"account_id": account_id, "projects": [project_response(row) for row in rows]}


@router.post("/api/provider-accounts/{account_id}/projects/sync")
async def sync_provider_projects(account_id: str):
    try:
        await asyncio.to_thread(provider_account_for, "volcengine", account_id)
        adapter = await asyncio.to_thread(provider_for, "volcengine", account_id, require_project_api_key=False)
        if not isinstance(adapter, VolcengineProvider):
            raise ProviderError("火山引擎适配器不可用", code="provider_not_configured", status=409)
        remote_projects = await adapter.list_projects()
    except ProviderError as exc:
        raise HTTPException(exc.status, detail={"message": str(exc), "code": exc.code}) from exc
    timestamp = now()
    discovered: list[str] = []
    key_results: dict[str, dict[str, Any]] = {}
    for item in remote_projects:
        project_name = str(item.get("ProjectName") or item.get("project_name") or "").strip()
        if not project_name:
            continue
        try:
            remote_keys = await adapter.list_api_keys(project_name)
            available_keys = [
                key for key in remote_keys
                if not bool(key.get("Disable") if "Disable" in key else key.get("disable"))
                and str(key.get("APIKey") or key.get("api_key") or "").strip()
            ]
            def key_order(key: dict[str, Any]) -> tuple[int, str]:
                raw_id = key.get("ID") if "ID" in key else key.get("id")
                try:
                    return int(raw_id), str(raw_id or "")
                except (TypeError, ValueError):
                    return 0, str(raw_id or "")
            selected_key = max(available_keys, key=key_order) if available_keys else None
            if selected_key:
                secret = str(selected_key.get("APIKey") or selected_key.get("api_key") or "").strip()
                await asyncio.to_thread(save_project_api_key, account_id, project_name, secret)
                key_results[project_name] = {
                    "has_api_key": 1,
                    "api_key_name": str(selected_key.get("Name") or selected_key.get("name") or "API Key"),
                    "api_key_hint": "••••" + secret[-4:],
                    "api_key_remote_id": str(selected_key.get("ID") or selected_key.get("id") or ""),
                    "api_key_count": len(available_keys),
                    "api_key_last_synced_at": timestamp,
                    "api_key_sync_error": None,
                }
            else:
                await asyncio.to_thread(delete_project_api_key, account_id, project_name)
                key_results[project_name] = {
                    "has_api_key": 0,
                    "api_key_name": None,
                    "api_key_hint": None,
                    "api_key_remote_id": None,
                    "api_key_count": 0,
                    "api_key_last_synced_at": timestamp,
                    "api_key_sync_error": None,
                }
        except ProviderError as exc:
            key_results[project_name] = {"api_key_sync_error": str(exc)[:300]}
        except CredentialStoreError as exc:
            raise HTTPException(503, str(exc)) from exc
    with db() as connection:
        for item in remote_projects:
            project_name = str(item.get("ProjectName") or item.get("project_name") or "").strip()
            if not project_name:
                continue
            display_name = str(item.get("DisplayName") or item.get("display_name") or project_name).strip() or project_name
            status = str(item.get("Status") or item.get("status") or "active")
            has_permission = item.get("HasPermission") if "HasPermission" in item else item.get("has_permission")
            has_permission_value = None if has_permission is None else int(bool(has_permission))
            project_id = "pp_" + hashlib.sha256(f"{account_id}:{project_name}".encode()).hexdigest()[:16]
            connection.execute(
                """INSERT INTO provider_projects
                   (id,provider_account_id,project_name,display_name,status,has_permission,source,created_at,updated_at,last_synced_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(provider_account_id, project_name) DO UPDATE SET
                     display_name=excluded.display_name,status=excluded.status,
                     has_permission=excluded.has_permission,source='remote',updated_at=excluded.updated_at,last_synced_at=excluded.last_synced_at""",
                (project_id, account_id, project_name, display_name, status, has_permission_value, "remote", timestamp, timestamp, timestamp),
            )
            key_result = key_results.get(project_name, {})
            if key_result.get("api_key_last_synced_at"):
                connection.execute(
                    """UPDATE provider_projects SET has_api_key=?,api_key_name=?,api_key_hint=?,api_key_remote_id=?,
                       api_key_count=?,api_key_last_synced_at=?,api_key_sync_error=?
                       WHERE provider_account_id=? AND project_name=?""",
                    (
                        key_result["has_api_key"], key_result["api_key_name"], key_result["api_key_hint"],
                        key_result["api_key_remote_id"], key_result["api_key_count"],
                        key_result["api_key_last_synced_at"], None, account_id, project_name,
                    ),
                )
            elif key_result.get("api_key_sync_error"):
                connection.execute(
                    "UPDATE provider_projects SET api_key_sync_error=? WHERE provider_account_id=? AND project_name=?",
                    (key_result["api_key_sync_error"], account_id, project_name),
                )
            discovered.append(project_name)
        if "default" not in discovered:
            existing = connection.execute(
                "SELECT 1 FROM provider_projects WHERE provider_account_id=? AND project_name='default'",
                (account_id,),
            ).fetchone()
            if not existing:
                connection.execute(
                    """INSERT INTO provider_projects
                       (id,provider_account_id,project_name,display_name,status,has_permission,source,created_at,updated_at,last_synced_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?)""",
                    ("pp_" + hashlib.sha256(f"{account_id}:default".encode()).hexdigest()[:16], account_id, "default", "default（默认项目）", "active", None, "fallback", timestamp, timestamp, timestamp),
                )
        rows = connection.execute(
            "SELECT * FROM provider_projects WHERE provider_account_id=? ORDER BY display_name, project_name",
            (account_id,),
        ).fetchall()
    return {
        "account_id": account_id,
        "projects": [project_response(row) for row in rows],
        "synced": len(discovered),
        "keys_synced": sum(1 for result in key_results.values() if result.get("api_key_last_synced_at")),
        "projects_with_api_key": sum(1 for result in key_results.values() if result.get("has_api_key") == 1),
    }


@router.post("/api/provider-accounts/{account_id}/projects")
def add_provider_project(account_id: str, body: ProviderProjectBody):
    try:
        provider_account_for("volcengine", account_id)
    except ProviderError as exc:
        raise HTTPException(exc.status, detail={"message": str(exc), "code": exc.code}) from exc
    project_name = body.project_name.strip()
    display_name = (body.display_name or project_name).strip() or project_name
    timestamp = now()
    project_id = "pp_" + hashlib.sha256(f"{account_id}:{project_name}".encode()).hexdigest()[:16]
    try:
        with db() as connection:
            connection.execute(
                """INSERT INTO provider_projects
                   (id,provider_account_id,project_name,display_name,status,has_permission,source,created_at,updated_at,last_synced_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (project_id, account_id, project_name, display_name, "active", None, "manual", timestamp, timestamp, None),
            )
            row = connection.execute("SELECT * FROM provider_projects WHERE id=?", (project_id,)).fetchone()
    except sqlite3.IntegrityError as exc:
        raise HTTPException(409, "这个项目已经存在") from exc
    return project_response(row)


@router.delete("/api/provider-accounts/{account_id}/projects/{project_id}")
def remove_provider_project(account_id: str, project_id: str):
    with db() as connection:
        row = connection.execute(
            "SELECT * FROM provider_projects WHERE id=? AND provider_account_id=?",
            (project_id, account_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "项目不存在")
        bound = connection.execute(
            "SELECT COUNT(*) FROM voices WHERE provider_account_id=? AND provider_project_name=? AND status='active'",
            (account_id, row["project_name"]),
        ).fetchone()[0]
        if bound:
            raise HTTPException(409, "该项目仍有音色绑定，不能删除")
        project_name = row["project_name"]
    try:
        project_api_key = load_project_api_key(account_id, project_name)
        delete_project_api_key(account_id, project_name)
    except CredentialStoreError as exc:
        raise HTTPException(503, str(exc)) from exc
    try:
        with db() as connection:
            connection.execute("DELETE FROM provider_projects WHERE id=?", (project_id,))
    except Exception:
        try:
            if project_api_key is not None:
                save_project_api_key(account_id, project_name, project_api_key)
        except CredentialStoreError as rollback_error:
            raise HTTPException(503, f"项目元数据删除失败，且无法恢复{credential_store_name()}中的原凭据") from rollback_error
        raise
    return {"deleted": True, "id": project_id}


@router.get("/api/provider-accounts/{account_id}/volcengine-slots")
async def list_volcengine_slots(account_id: str, project_name: str | None = None):
    try:
        account = await asyncio.to_thread(provider_account_for, "volcengine", account_id)
        selected_project = project_name.strip() if project_name else ""
        if selected_project:
            def check_project() -> bool:
                with db() as connection:
                    return bool(connection.execute(
                        "SELECT project_name FROM provider_projects WHERE provider_account_id=? AND project_name=?",
                        (account_id, selected_project),
                    ).fetchone())
            if not await asyncio.to_thread(check_project):
                raise ProviderError("所选火山项目不存在，请先同步项目列表", code="volcengine_project_not_found", status=409)
        else:
            selected_project = account["account_ref"] or ""
        if not selected_project:
            raise ProviderError("请先同步或手动添加火山项目", code="volcengine_project_not_configured", status=409)
        adapter = await asyncio.to_thread(provider_for, "volcengine", account_id, selected_project, require_project_api_key=False)
        if not isinstance(adapter, VolcengineProvider):
            raise ProviderError("火山引擎适配器不可用", code="provider_not_configured", status=409)
        slots = await adapter.list_empty_voice_slots()
    except ProviderError as exc:
        raise HTTPException(exc.status, detail={"message": str(exc), "code": exc.code}) from exc
    return {
        "account_id": account["id"],
        "project_name": selected_project,
        "slots": slots,
    }


@router.post("/api/provider-accounts")
def create_provider_account(body: ProviderAccountBody):
    spec, values = normalize_account(body)
    if not body.api_key:
        raise HTTPException(400, "首次创建账号必须填写 API Key")
    account_id = "pa_" + uuid.uuid4().hex[:12]
    try:
        save_provider_credentials(account_id, api_key=body.api_key, **({"openapi_access_key": body.openapi_access_key, "openapi_secret_key": body.openapi_secret_key} if body.provider == "volcengine" else {}))
    except CredentialStoreError as exc:
        raise HTTPException(503, str(exc)) from exc
    try:
        timestamp = now()
        with db() as connection:
            connection.execute(
                "INSERT INTO provider_accounts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (account_id, values["provider"], values["display_name"], values["account_ref"], values["region"], values["endpoint"], "configured", "••••" + body.api_key[-4:], spec["verification"], "凭据已安全保存，尚未完成真实鉴权。", timestamp, timestamp, None),
            )
            if values["provider"] == "volcengine" and values["account_ref"]:
                connection.execute(
                    """INSERT INTO provider_projects
                       (id,provider_account_id,project_name,display_name,status,has_permission,source,created_at,updated_at,last_synced_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?)""",
                    ("pp_" + account_id, account_id, values["account_ref"], values["account_ref"], "active", 1, "legacy", timestamp, timestamp, timestamp),
                )
            row = connection.execute("SELECT * FROM provider_accounts WHERE id=?", (account_id,)).fetchone()
    except Exception:
        _rollback_or_raise(account_id, {}, None, "账号元数据保存失败")
        raise
    return account_response(row)


@router.put("/api/provider-accounts/{account_id}")
def update_provider_account(account_id: str, body: ProviderAccountBody):
    spec, values = normalize_account(body)
    with db() as connection:
        current = connection.execute("SELECT * FROM provider_accounts WHERE id=?", (account_id,)).fetchone()
    if not current:
        raise HTTPException(404, "厂商账号不存在")
    if current["provider"] != values["provider"]:
        raise HTTPException(409, "账号所属厂商不能修改，请删除后重新创建该厂商账号")
    updates = {}
    if body.api_key:
        updates["api_key"] = body.api_key
    if body.provider == "volcengine":
        if body.openapi_access_key:
            updates["openapi_access_key"] = body.openapi_access_key
        if body.openapi_secret_key:
            updates["openapi_secret_key"] = body.openapi_secret_key
    old_credentials: dict[str, str] = {}
    try:
        if updates:
            old_credentials = load_provider_credentials(account_id)
            save_provider_credentials(account_id, **updates)
    except CredentialStoreError as exc:
        raise HTTPException(503, str(exc)) from exc
    secret_hint = "••••" + body.api_key[-4:] if body.api_key else current["secret_hint"]
    try:
        with db() as connection:
            connection.execute(
                "UPDATE provider_accounts SET provider=?,display_name=?,account_ref=?,region=?,endpoint=?,status=?,secret_hint=?,verification_scope=?,verification_message=?,updated_at=?,last_verified_at=NULL WHERE id=?",
                (values["provider"], values["display_name"], values["account_ref"], values["region"], values["endpoint"], "configured", secret_hint, spec["verification"], "配置已更新，等待重新验证。", now(), account_id),
            )
            if values["provider"] == "volcengine" and values["account_ref"]:
                timestamp = now()
                connection.execute(
                    """INSERT OR IGNORE INTO provider_projects
                       (id,provider_account_id,project_name,display_name,status,has_permission,source,created_at,updated_at,last_synced_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?)""",
                    ("pp_" + account_id, account_id, values["account_ref"], values["account_ref"], "active", 1, "legacy", timestamp, timestamp, timestamp),
                )
            row = connection.execute("SELECT * FROM provider_accounts WHERE id=?", (account_id,)).fetchone()
    except Exception:
        if updates:
            _rollback_or_raise(account_id, old_credentials, None, "账号元数据更新失败")
        raise
    return account_response(row)


@router.delete("/api/provider-accounts/{account_id}")
def remove_provider_account(account_id: str):
    with db() as connection:
        row = connection.execute("SELECT id FROM provider_accounts WHERE id=?", (account_id,)).fetchone()
        if row:
            bound = connection.execute(
                "SELECT COUNT(*) FROM voices WHERE provider_account_id=? AND status='active'",
                (account_id,),
            ).fetchone()[0]
            if bound:
                raise HTTPException(409, "该账号仍有音色绑定，请先移除或重新绑定这些音色")
    if not row:
        raise HTTPException(404, "厂商账号不存在")
    with db() as connection:
        project_names = [
            item["project_name"]
            for item in connection.execute(
                "SELECT project_name FROM provider_projects WHERE provider_account_id=?",
                (account_id,),
            ).fetchall()
        ]
    try:
        account_credentials = load_provider_credentials(account_id)
        project_credentials = {
            project_name: load_project_api_key(account_id, project_name)
            for project_name in project_names
        }
        for project_name in project_names:
            delete_project_api_key(account_id, project_name)
        delete_api_key(account_id)
    except CredentialStoreError as exc:
        if "account_credentials" in locals():
            _rollback_or_raise(account_id, account_credentials, locals().get("project_credentials"), "账号凭据删除失败")
        raise HTTPException(503, str(exc)) from exc
    try:
        with db() as connection:
            connection.execute("DELETE FROM provider_projects WHERE provider_account_id=?", (account_id,))
            connection.execute("DELETE FROM provider_accounts WHERE id=?", (account_id,))
    except Exception:
        _rollback_or_raise(account_id, account_credentials, project_credentials, "账号元数据删除失败")
        raise
    return {"deleted": True, "id": account_id}


@router.post("/api/provider-accounts/{account_id}/test")
async def test_provider_account(account_id: str):
    def load_account():
        with db() as connection:
            return connection.execute("SELECT * FROM provider_accounts WHERE id=?", (account_id,)).fetchone()
    row = await asyncio.to_thread(load_account)
    if not row:
        raise HTTPException(404, "厂商账号不存在")
    try:
        api_key = await asyncio.to_thread(load_api_key, account_id)
    except CredentialStoreError as exc:
        raise HTTPException(503, str(exc)) from exc
    if not api_key:
        raise HTTPException(409, f"{credential_store_name()}中没有找到该账号的凭据")
    try:
        endpoint = validate_provider_endpoint(row["provider"], row["endpoint"] or config.PROVIDER_SPECS[row["provider"]]["default_endpoint"])
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc

    status = "configured"
    verified_at = now()
    if row["provider"] == "minimax":
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.get(
                    endpoint.rstrip("/") + "/files/list",
                    headers={"Authorization": "Bearer " + api_key},
                    params={"purpose": "voice_clone"},
                )
            if response.status_code == 200 and (response.json().get("base_resp") or {}).get("status_code", 0) == 0:
                status = "active"
                message = "MiniMax API Key 真实鉴权通过，文件接口可用。"
            elif response.status_code in {401, 403}:
                status = "error"
                message = "MiniMax 鉴权失败，请检查 API Key。"
            else:
                status = "error"
                try:
                    detail = (response.json().get("base_resp") or {}).get("status_msg")
                except ValueError:
                    detail = None
                message = f"MiniMax 鉴权探针返回 HTTP {response.status_code}" + (f"：{str(detail)[:160]}" if detail else "。")
        except (httpx.HTTPError, ValueError):
            status = "error"
            message = "无法读取 MiniMax 文件列表，请检查网络和 Endpoint。"
    elif row["provider"] == "dashscope":
        if api_key.startswith("sk-sp-"):
            status = "error"
            message = "Token Plan Key 不支持 TTS，请使用千问控制台创建的标准 sk- API Key。"
        else:
            try:
                async with httpx.AsyncClient(timeout=20) as client:
                    response = await client.post(
                        endpoint.rstrip("/") + "/compatible-mode/v1/chat/completions",
                        headers={"Authorization": "Bearer " + api_key, "Content-Type": "application/json"},
                        json={"model": "qwen-turbo", "messages": [{"role": "user", "content": "Hi"}], "max_tokens": 1},
                    )
                if response.status_code == 200:
                    status = "active"
                    message = "千问标准 API Key 真实鉴权通过。"
                elif response.status_code in {401, 403}:
                    status = "error"
                    message = "千问鉴权失败，请检查 Key 来源、有效期和账号权限。"
                else:
                    status = "error"
                    message = f"千问鉴权探针返回 HTTP {response.status_code}，未判定为可用。"
            except httpx.HTTPError:
                status = "error"
                message = "无法连接千问 Endpoint，请检查网络和地址。"
    elif row["provider"] == "volcengine":
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                async with client.stream(
                    "POST",
                    endpoint.rstrip("/") + "/api/v3/tts/unidirectional",
                    headers={"X-Api-Key": api_key, "X-Api-Resource-Id": "seed-tts-2.0", "X-Api-Request-Id": str(uuid.uuid4()), "Content-Type": "application/json"},
                    json={"req_params": {"text": "Hello", "speaker": "zh_female_vv_uranus_bigtts", "audio_params": {"format": "mp3", "sample_rate": 24000}}},
                ) as response:
                    if response.status_code == 200:
                        items = [json.loads(line) async for line in response.aiter_lines() if line.strip()]
                        failed = next((item for item in items if item.get("code") not in {None, 0, 20000000}), None)
                        if failed:
                            status = "error"
                            message = f"火山引擎鉴权通过，但 Seed TTS 2.0 探针失败：{str(failed.get('message') or failed.get('code'))[:160]}"
                        elif any(item.get("data") for item in items):
                            status = "active"
                            message = "火山引擎 API Key 真实鉴权通过，账号可调用 Seed TTS 2.0。"
                        else:
                            status = "error"
                            message = "火山引擎鉴权探针未返回音频数据，未判定为可用。"
                    elif response.status_code in {401, 403}:
                        status = "error"
                        message = "火山引擎鉴权失败，请检查新版豆包语音 API Key。"
                    else:
                        await response.aread()
                        status = "error"
                        try:
                            detail = response.json().get("message")
                        except ValueError:
                            detail = None
                        message = f"火山引擎鉴权探针返回 HTTP {response.status_code}" + (f"：{str(detail)[:160]}" if detail else "。")
        except httpx.HTTPError:
            status = "error"
            message = "无法连接火山引擎 Endpoint，请检查网络和地址。"
    elif row["provider"] == "mimo":
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.get(endpoint.rstrip("/") + "/models", headers={"api-key": api_key})
            if response.status_code == 200:
                model_ids = {item.get("id") for item in response.json().get("data", [])}
                if "mimo-v2.5-tts" in model_ids:
                    status = "active"
                    message = "MiMo API Key 真实鉴权通过，账号已开放 MiMo V2.5 TTS。"
                else:
                    status = "error"
                    message = "MiMo 鉴权通过，但当前账号的模型列表中没有 MiMo V2.5 TTS。"
            elif response.status_code in {401, 403}:
                status = "error"
                message = "MiMo 鉴权失败，请检查 API Key。"
            else:
                status = "error"
                message = f"MiMo 鉴权探针返回 HTTP {response.status_code}，未判定为可用。"
        except (httpx.HTTPError, ValueError):
            status = "error"
            message = "无法读取 MiMo 模型列表，请检查网络和 Endpoint。"
    else:
        message = f"凭据已从{credential_store_name()}成功读取；真实鉴权将在该厂商适配器接入后启用。"

    def persist():
        with db() as connection:
            connection.execute("UPDATE provider_accounts SET status=?,verification_message=?,last_verified_at=?,updated_at=? WHERE id=?", (status, message, verified_at, now(), account_id))
            return connection.execute("SELECT * FROM provider_accounts WHERE id=?", (account_id,)).fetchone()
    updated = await asyncio.to_thread(persist)
    return account_response(updated)
