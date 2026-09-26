"""Voice library endpoints: list, import, clone, design, rename, remove, preview."""
from __future__ import annotations

import asyncio
import json
import mimetypes
import sqlite3
import uuid
from pathlib import Path

import httpx
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from .. import config
from ..database import db, now
from ..providers.base import ProviderError, SynthesisRequest
from ..providers.minimax import MiniMaxProvider
from ..providers.mimo import MiMoProvider
from ..providers.qwen import QwenProvider
from ..providers.volcengine import VOLCENGINE_CLONE_LANGUAGES, VolcengineProvider
from ..schemas import ImportVoiceBody, ImportVoicesBody, RenameVoiceBody, VoiceDesignBody
from ..services import (
    available_models,
    provider_account_for,
    provider_for,
    resolve_model,
    storage_path,
)

router = APIRouter(tags=["voices"])


def _write_asset(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def list_voices():
    with db() as connection:
        rows = connection.execute("SELECT * FROM voices WHERE status='active' ORDER BY created_at DESC").fetchall()
    return [
        {
            **dict(row),
            "languages": json.loads(row["languages"]),
            "preview_url": f"/api/voices/{row['id']}/preview" if row["preview_asset"] else None,
        }
        for row in rows
    ]


def voice_already_imported(
    provider: str,
    model_id: str,
    provider_voice_id: str,
    provider_account_id: str | None = None,
    provider_project_name: str | None = None,
) -> bool:
    with db() as connection:
        if provider == "volcengine" and provider_account_id and provider_project_name:
            row = connection.execute(
                """SELECT 1 FROM voices
                   WHERE provider=? AND model_id=? AND provider_voice_id=?
                     AND provider_account_id=? AND provider_project_name=? AND status='active'""",
                (provider, model_id, provider_voice_id, provider_account_id, provider_project_name),
            ).fetchone()
        elif provider == "minimax" and provider_account_id:
            row = connection.execute(
                """SELECT 1 FROM voices WHERE provider=? AND provider_voice_id=?
                   AND provider_account_id=? AND status='active'""",
                (provider, provider_voice_id, provider_account_id),
            ).fetchone()
        elif provider_account_id:
            row = connection.execute(
                """SELECT 1 FROM voices WHERE provider=? AND model_id=? AND provider_voice_id=?
                   AND provider_account_id=? AND status='active'""",
                (provider, model_id, provider_voice_id, provider_account_id),
            ).fetchone()
        else:
            row = connection.execute(
                "SELECT 1 FROM voices WHERE provider=? AND model_id=? AND provider_voice_id=? AND status='active'",
                (provider, model_id, provider_voice_id),
            ).fetchone()
    return row is not None


@router.get("/api/voices")
def get_voices():
    return list_voices()


@router.get("/api/models")
def list_models():
    return [{**m.__dict__, "gateway_id": m.gateway_id} for m in available_models()]


@router.get("/api/voices/cloud/{provider}")
async def list_cloud_voices(provider: str, provider_account_id: str | None = None, provider_project_name: str | None = None):
    if provider not in {"dashscope", "minimax", "volcengine"}:
        raise HTTPException(400, "当前仅支持同步通义千问、火山引擎和 MiniMax 云端音色")
    try:
        account = await asyncio.to_thread(
            provider_account_for,
            provider,
            provider_account_id,
            require_explicit=True,
        )
        project_name = provider_project_name.strip() if provider == "volcengine" and provider_project_name else None
        if provider == "volcengine":
            if not project_name:
                project_name = account["account_ref"] or ""
            if not project_name:
                raise ProviderError("请先选择火山项目", code="volcengine_project_not_configured", status=409)
            def check_project() -> bool:
                with db() as connection:
                    return bool(connection.execute(
                        "SELECT 1 FROM provider_projects WHERE provider_account_id=? AND project_name=?",
                        (account["id"], project_name),
                    ).fetchone())
            if not await asyncio.to_thread(check_project):
                raise ProviderError("所选火山项目不存在，请先同步项目列表", code="volcengine_project_not_found", status=409)
        adapter = await asyncio.to_thread(
            provider_for,
            provider,
            account["id"],
            project_name,
            require_project_api_key=provider != "volcengine",
        )
        if provider == "dashscope" and isinstance(adapter, QwenProvider):
            items = await adapter.list_cloned_voices()
        elif provider == "minimax" and isinstance(adapter, MiniMaxProvider):
            items = await adapter.list_cloned_voices()
        elif provider == "volcengine" and isinstance(adapter, VolcengineProvider):
            items = await adapter.list_cloned_voices()
        else:
            raise ProviderError("厂商适配器不可用", code="provider_not_configured", status=409)
    except ProviderError as exc:
        raise HTTPException(exc.status, detail={"message": str(exc), "code": exc.code}) from exc

    supported_models = {
        model.model_id: model
        for model in available_models()
        if model.provider == provider and model.supports_clone and "clone" in model.operations
    }
    result = []
    for item in items:
        model_id = item["model_id"]
        compatible = provider == "minimax" or model_id in supported_models
        result.append(
            {
                **item,
                "provider_account_id": account["id"],
                "provider_project_name": project_name or "" if provider == "volcengine" else "",
                "compatible": compatible,
                "compatibility_message": "" if compatible else "Voice Hub 尚未接入这个音色绑定的模型",
                "imported": voice_already_imported(
                    provider,
                    model_id,
                    item["provider_voice_id"],
                    account["id"],
                    project_name,
                ),
            }
        )
    return {"provider": provider, "voices": result}


@router.post("/api/voices/import")
async def import_voice(body: ImportVoiceBody):
    model = resolve_model(f"{body.provider}/{body.model_id}")
    if not model:
        raise HTTPException(400, "所选模型不存在")
    if "clone" not in model.operations or not model.supports_clone:
        raise HTTPException(400, "请选择支持声音复刻的目标模型")
    if body.provider not in {"dashscope", "volcengine", "minimax"}:
        raise HTTPException(400, "当前仅支持导入千问、火山引擎或 MiniMax 的远端复刻音色 ID")
    provider_voice_id = body.provider_voice_id.strip()
    public_name = body.public_name.strip()
    display_name = body.display_name.strip()
    if not provider_voice_id or not public_name or not display_name:
        raise HTTPException(400, "音色 ID、显示名称和兼容别名不能为空")
    try:
        account = await asyncio.to_thread(
            provider_account_for,
            body.provider,
            body.provider_account_id,
            require_explicit=True,
        )
    except ProviderError as exc:
        raise HTTPException(exc.status, detail={"message": str(exc), "code": exc.code}) from exc
    project_name: str | None = None
    def check_duplicates() -> None:
        with db() as connection:
            if connection.execute("SELECT 1 FROM voices WHERE public_name=? AND status='active'", (public_name,)).fetchone():
                raise HTTPException(409, "兼容别名已存在，请换一个名称")
    await asyncio.to_thread(check_duplicates)
    if body.provider != "volcengine" and await asyncio.to_thread(
        voice_already_imported,
        body.provider,
        body.model_id,
        provider_voice_id,
        account["id"],
    ):
        raise HTTPException(409, "这个厂商音色 ID 已经导入")
    if body.provider == "volcengine":
        try:
            project_name = body.provider_project_name.strip() if body.provider_project_name else account["account_ref"] or ""
            if not project_name:
                raise ProviderError("请先选择火山项目", code="volcengine_project_not_configured", status=409)
            adapter = await asyncio.to_thread(provider_for, "volcengine", account["id"], project_name)
            if not isinstance(adapter, VolcengineProvider):
                raise ProviderError("火山引擎适配器不可用", code="provider_not_configured", status=409)
            await adapter.validate_cloned_voice(provider_voice_id)
        except ProviderError as exc:
            raise HTTPException(exc.status, detail={"message": str(exc), "code": exc.code}) from exc
        if await asyncio.to_thread(voice_already_imported, "volcengine", body.model_id, provider_voice_id, account["id"], project_name):
            raise HTTPException(409, "这个厂商音色 ID 已经导入到当前项目")
    voice_id = "voice_" + uuid.uuid4().hex[:10]
    def insert() -> None:
        with db() as connection:
            connection.execute(
                """INSERT INTO voices
                   (id,provider,model_id,provider_voice_id,display_name,public_name,voice_type,status,languages,created_at,preview_asset,provider_account_id,provider_project_name)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    voice_id,
                    body.provider,
                    body.model_id,
                    provider_voice_id,
                    display_name,
                    public_name,
                    "imported",
                    "active",
                    json.dumps(body.languages, ensure_ascii=False),
                    now(),
                    None,
                    account["id"],
                    project_name,
                ),
            )
    try:
        await asyncio.to_thread(insert)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(409, "兼容别名已存在，请换一个名称") from exc
    return {"id": voice_id, "message": "已有厂商音色已导入，可以直接在合成工作台选择。", "voice": next(v for v in list_voices() if v["id"] == voice_id)}


@router.post("/api/voices/import/batch")
async def import_voices(body: ImportVoicesBody):
    normalized = []
    aliases: set[str] = set()
    remote_ids: set[tuple[str, str, str, str, str]] = set()
    for item in body.voices:
        model = resolve_model(f"{item.provider}/{item.model_id}")
        if not model or not model.supports_clone or "clone" not in model.operations:
            raise HTTPException(400, f"{item.provider_voice_id} 没有兼容的目标模型")
        if item.provider not in {"dashscope", "minimax", "volcengine"}:
            raise HTTPException(400, "云端批量导入当前仅支持通义千问、火山引擎和 MiniMax")
        provider_voice_id = item.provider_voice_id.strip()
        display_name = item.display_name.strip()
        public_name = item.public_name.strip()
        if not provider_voice_id or not display_name or not public_name:
            raise HTTPException(400, "音色 ID、显示名称和兼容别名不能为空")
        if public_name in aliases:
            raise HTTPException(409, f"批量导入中存在重复兼容别名：{public_name}")
        try:
            account = await asyncio.to_thread(
                provider_account_for,
                item.provider,
                item.provider_account_id,
                require_explicit=True,
            )
            if item.provider == "volcengine":
                project_name = item.provider_project_name.strip() if item.provider_project_name else account["account_ref"] or ""
                if not project_name:
                    raise ProviderError("请先选择火山项目", code="volcengine_project_not_configured", status=409)
                def check_project() -> bool:
                    with db() as connection:
                        return bool(connection.execute(
                            "SELECT 1 FROM provider_projects WHERE provider_account_id=? AND project_name=?",
                            (account["id"], project_name),
                        ).fetchone())
                if not await asyncio.to_thread(check_project):
                    raise ProviderError("所选火山项目不存在，请先同步项目列表", code="volcengine_project_not_found", status=409)
            else:
                project_name = ""
        except ProviderError as exc:
            raise HTTPException(exc.status, detail={"message": str(exc), "code": exc.code}) from exc
        remote_key = (
            item.provider,
            "" if item.provider == "minimax" else item.model_id,
            provider_voice_id,
            account["id"],
            project_name,
        )
        if remote_key in remote_ids:
            raise HTTPException(409, f"批量导入中存在重复厂商音色：{provider_voice_id}")
        aliases.add(public_name)
        remote_ids.add(remote_key)
        normalized.append((item, provider_voice_id, display_name, public_name, account, project_name))

    def check_and_insert() -> list[str]:
        with db() as connection:
            for item, provider_voice_id, _, public_name, account, project_name in normalized:
                if connection.execute(
                    "SELECT 1 FROM voices WHERE public_name=? AND status='active'", (public_name,)
                ).fetchone():
                    raise HTTPException(409, f"兼容别名已存在：{public_name}")
                if item.provider == "volcengine" and project_name:
                    duplicate = connection.execute(
                        """SELECT 1 FROM voices
                           WHERE provider=? AND model_id=? AND provider_voice_id=?
                             AND provider_account_id=? AND provider_project_name=? AND status='active'""",
                        (item.provider, item.model_id, provider_voice_id, account["id"], project_name),
                    ).fetchone()
                elif item.provider == "minimax":
                    duplicate = connection.execute(
                        """SELECT 1 FROM voices WHERE provider=? AND provider_voice_id=?
                           AND provider_account_id=? AND status='active'""",
                        (item.provider, provider_voice_id, account["id"]),
                    ).fetchone()
                else:
                    duplicate = connection.execute(
                        """SELECT 1 FROM voices WHERE provider=? AND model_id=? AND provider_voice_id=?
                           AND provider_account_id=? AND status='active'""",
                        (item.provider, item.model_id, provider_voice_id, account["id"]),
                    ).fetchone()
                if duplicate:
                    raise HTTPException(409, f"厂商音色已经导入：{provider_voice_id}")

            created_ids = []
            for item, provider_voice_id, display_name, public_name, account, project_name in normalized:
                voice_id = "voice_" + uuid.uuid4().hex[:10]
                created_ids.append(voice_id)
                connection.execute(
                    """INSERT INTO voices
                       (id,provider,model_id,provider_voice_id,display_name,public_name,voice_type,status,languages,created_at,preview_asset,provider_account_id,provider_project_name)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (
                        voice_id,
                        item.provider,
                        item.model_id,
                        provider_voice_id,
                        display_name,
                        public_name,
                        "imported",
                        "active",
                        json.dumps(item.languages, ensure_ascii=False),
                        now(),
                        None,
                        account["id"],
                        project_name or None,
                    ),
                )
            return created_ids
    try:
        created_ids = await asyncio.to_thread(check_and_insert)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(409, "批量导入中存在已被其他请求占用的兼容别名") from exc
    voices_by_id = {item["id"]: item for item in list_voices()}
    created = [voices_by_id[voice_id] for voice_id in created_ids]
    return {
        "voices": created,
        "message": f"已从厂商云端导入 {len(created)} 个音色。",
    }


@router.delete("/api/voices/{voice_id}")
def remove_voice(voice_id: str):
    with db() as connection:
        voice = connection.execute("SELECT * FROM voices WHERE id=? AND status='active'", (voice_id,)).fetchone()
        if not voice:
            raise HTTPException(404, "音色不存在或已经移除")
        connection.execute("UPDATE voices SET status='deleted' WHERE id=?", (voice_id,))
    asset_path = voice["preview_asset"]
    if asset_path:
        asset = (config.ROOT / asset_path).resolve()
        try:
            asset.relative_to(config.AUDIO.resolve())
            asset.unlink(missing_ok=True)
        except ValueError:
            pass
    return {"deleted": True, "id": voice_id, "message": "已从 Voice Hub 音色库移除；厂商云端音色未删除。"}


@router.patch("/api/voices/{voice_id}")
def rename_voice(voice_id: str, body: RenameVoiceBody):
    display_name = body.display_name.strip()
    if not display_name:
        raise HTTPException(400, "显示名称不能为空")
    with db() as connection:
        voice = connection.execute("SELECT * FROM voices WHERE id=? AND status='active'", (voice_id,)).fetchone()
        if not voice:
            raise HTTPException(404, "音色不存在或已经移除")
        if voice["voice_type"] == "preset":
            raise HTTPException(409, "预置音色不能重命名")
        connection.execute("UPDATE voices SET display_name=? WHERE id=?", (display_name, voice_id))
    updated = next(item for item in list_voices() if item["id"] == voice_id)
    return {"voice": updated, "message": "音色显示名称已更新；兼容别名保持不变。"}


@router.post("/api/voices/clone")
async def clone_voice(provider_name: str, model_id: str, display_name: str, public_name: str,
                      speaker_id: str | None = None, provider_account_id: str | None = None,
                      provider_project_name: str | None = None,
                      clone_language: int = 0,
                      audio: UploadFile = File(...)):
    model = resolve_model(f"{provider_name}/{model_id}")
    if not model:
        raise HTTPException(400, "所选克隆模型不存在")
    if "clone" not in model.operations or not model.supports_clone:
        raise HTTPException(400, "所选模型不支持声音克隆")
    if not audio.filename:
        raise HTTPException(400, "需要参考音频")
    raw = await audio.read()
    if not raw:
        raise HTTPException(400, "参考音频不能为空")
    max_size = 10 * 1024 * 1024 if provider_name in {"dashscope", "volcengine"} else 20 * 1024 * 1024
    if len(raw) > max_size:
        raise HTTPException(400, f"该模型的参考音频不能超过 {max_size // 1024 // 1024} MB")
    suffix = Path(audio.filename).suffix.lower()
    if provider_name == "dashscope" and suffix not in {".wav", ".mp3", ".m4a"}:
        raise HTTPException(400, "千问声音复刻仅支持 WAV、MP3 或 M4A")
    if provider_name == "volcengine" and suffix not in {".wav", ".mp3", ".ogg", ".m4a", ".aac", ".pcm"}:
        raise HTTPException(400, "火山引擎声音复刻仅支持 WAV、MP3、OGG、M4A、AAC 或 PCM")
    volcengine_speaker_id = (speaker_id or "").strip()
    if provider_name == "volcengine" and (
        not volcengine_speaker_id.startswith("S_")
        or len(volcengine_speaker_id) <= 2
        or len(volcengine_speaker_id) > 200
    ):
        raise HTTPException(400, "火山引擎声音复刻需要填写控制台中的 S_ 开头音色槽位 ID")
    if provider_name == "volcengine" and clone_language not in VOLCENGINE_CLONE_LANGUAGES:
        raise HTTPException(400, "火山引擎不支持所选参考音频语言")
    if provider_name == "minimax" and suffix not in {".wav", ".mp3", ".m4a"}:
        raise HTTPException(400, "MiniMax 声音复刻仅支持 WAV、MP3 或 M4A")
    def check_alias() -> None:
        with db() as connection:
            if connection.execute("SELECT 1 FROM voices WHERE public_name=?", (public_name,)).fetchone():
                raise HTTPException(409, "兼容别名已存在，请换一个名称")
    await asyncio.to_thread(check_alias)

    await asyncio.to_thread(config.AUDIO.mkdir, parents=True, exist_ok=True)
    provider_voice_id = "reference_" + uuid.uuid4().hex[:8]
    asset_path: str | None = None
    clone_result: dict | None = None
    account = None
    if provider_name == "dashscope":
        mime_types = {".wav": "audio/wav", ".mp3": "audio/mpeg", ".m4a": "audio/mp4"}
        try:
            adapter = await asyncio.to_thread(provider_for, "dashscope")
            if not isinstance(adapter, QwenProvider):
                raise ProviderError("千问适配器不可用", code="provider_not_configured", status=409)
            clone_result = await adapter.clone_voice(
                raw,
                mime_types[suffix],
                "vs_" + uuid.uuid4().hex[:12],
                model_id,
            )
            provider_voice_id = clone_result["voice_id"]
        except ProviderError as exc:
            raise HTTPException(exc.status, detail={"message": str(exc), "code": exc.code}) from exc
    elif provider_name == "volcengine":
        try:
            account = await asyncio.to_thread(
                provider_account_for,
                "volcengine",
                provider_account_id,
                require_explicit=True,
            )
            project_name = provider_project_name.strip() if provider_project_name else account["account_ref"] or ""
            if not project_name:
                raise ProviderError("请先选择火山项目", code="volcengine_project_not_configured", status=409)
            def check_project() -> bool:
                with db() as connection:
                    return bool(connection.execute(
                        "SELECT 1 FROM provider_projects WHERE provider_account_id=? AND project_name=?",
                        (account["id"], project_name),
                    ).fetchone())
            if not await asyncio.to_thread(check_project):
                raise ProviderError("所选火山项目不存在，请先同步项目列表", code="volcengine_project_not_found", status=409)
            adapter = await asyncio.to_thread(provider_for, "volcengine", account["id"], project_name)
            if not isinstance(adapter, VolcengineProvider):
                raise ProviderError("火山引擎适配器不可用", code="provider_not_configured", status=409)
            clone_result = await adapter.clone_voice(
                raw,
                suffix.lstrip("."),
                volcengine_speaker_id,
                clone_language,
            )
            provider_voice_id = clone_result["voice_id"]
        except ProviderError as exc:
            raise HTTPException(exc.status, detail={"message": str(exc), "code": exc.code}) from exc
    elif provider_name == "minimax":
        try:
            adapter = await asyncio.to_thread(provider_for, "minimax")
            if not isinstance(adapter, MiniMaxProvider):
                raise ProviderError("MiniMax 适配器不可用", code="provider_not_configured", status=409)
            provider_voice_id = "vs_" + uuid.uuid4().hex[:12]
            clone_result = await adapter.clone_voice(raw, suffix.lstrip("."), provider_voice_id, model_id)
            provider_voice_id = clone_result["voice_id"]
        except ProviderError as exc:
            raise HTTPException(exc.status, detail={"message": str(exc), "code": exc.code}) from exc
    else:
        asset = config.AUDIO / f"reference_{uuid.uuid4().hex}_{suffix or '.wav'}"
        await asyncio.to_thread(asset.write_bytes, raw)
        asset_path = str(asset.relative_to(config.ROOT))

    voice_id = "voice_" + uuid.uuid4().hex[:10]
    def insert() -> None:
        with db() as connection:
            connection.execute(
                """INSERT INTO voices
                   (id,provider,model_id,provider_voice_id,display_name,public_name,voice_type,status,languages,created_at,preview_asset,provider_account_id,provider_project_name)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    voice_id,
                    provider_name,
                    model_id,
                    provider_voice_id,
                    display_name,
                    public_name,
                    "cloned",
                    "active",
                    json.dumps(
                        [VOLCENGINE_CLONE_LANGUAGES[clone_language]]
                        if provider_name == "volcengine"
                        else model.languages,
                        ensure_ascii=False,
                    ),
                    now(),
                    asset_path,
                    account["id"] if account else None,
                    (project_name or "") if account else None,
                ),
            )
    try:
        await asyncio.to_thread(insert)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(409, "兼容别名已存在，请换一个名称") from exc
    if provider_name == "dashscope":
        message = "千问远端克隆音色已创建，可直接使用所选模型合成。"
        if clone_result and clone_result.get("fallback_mode"):
            message += " 厂商提示样本质量可能影响复刻效果。"
    elif provider_name == "volcengine":
        message = "火山引擎声音复刻 2.0 音色已创建，可直接使用所选模型合成。首次正式合成可能触发厂商音色槽位计费。"
    elif provider_name == "minimax":
        message = "MiniMax 远端克隆音色已创建，可直接使用所选模型合成。"
    elif model.mode == "provider":
        message = "参考音色已创建，可直接使用所选模型合成。"
    else:
        message = "已创建本地演示音色。"
    return {"id": voice_id, "message": message, "mode": model.mode, "voice": next(v for v in list_voices() if v["id"] == voice_id)}


@router.post("/api/voices/design")
async def design_voice(body: VoiceDesignBody):
    model = resolve_model(f"{body.provider}/{body.model_id}")
    if not model or "design" not in model.operations:
        raise HTTPException(400, "所选模型不支持音色设计")
    display_name = body.display_name.strip()
    public_name = body.public_name.strip()
    prompt = body.prompt.strip()
    preview_text = body.preview_text.strip()
    if model.design_prompt_max is not None and len(prompt) > model.design_prompt_max:
        raise HTTPException(400, f"声音描述最多 {model.design_prompt_max} 个字符")
    if model.design_preview_min is not None and len(preview_text) < model.design_preview_min:
        raise HTTPException(400, f"试听文本至少需要 {model.design_preview_min} 个字符")
    if model.design_preview_max is not None and len(preview_text) > model.design_preview_max:
        raise HTTPException(400, f"试听文本最多 {model.design_preview_max} 个字符")
    def check_alias() -> None:
        with db() as connection:
            if connection.execute("SELECT 1 FROM voices WHERE public_name=? AND status='active'", (public_name,)).fetchone():
                raise HTTPException(409, "兼容别名已存在，请换一个名称")
    await asyncio.to_thread(check_alias)

    voice_id = "voice_" + uuid.uuid4().hex[:10]
    provider_voice_id = ""
    preview_asset: str | None = None
    request_id = ""
    message = ""
    try:
        adapter = await asyncio.to_thread(provider_for, body.provider)
        if body.provider == "dashscope" and isinstance(adapter, QwenProvider):
            result = await adapter.create_voice_design(
                prompt,
                preview_text,
                body.model_id,
                "vs_" + uuid.uuid4().hex[:12],
            )
            provider_voice_id = result["voice_id"]
            request_id = result.get("request_id", "")
            if result.get("preview_audio"):
                asset = config.AUDIO / f"design_{voice_id}.wav"
                await asyncio.to_thread(_write_asset, asset, result["preview_audio"])
                preview_asset = storage_path(asset)
            message = "千问设计音色已创建并保存到音色库。"
        elif body.provider == "minimax" and isinstance(adapter, MiniMaxProvider):
            result = await adapter.create_voice_design(prompt, preview_text, "vs_" + uuid.uuid4().hex[:12])
            provider_voice_id = result["voice_id"]
            request_id = result.get("request_id", "")
            if result.get("preview_audio"):
                asset = config.AUDIO / f"design_{voice_id}.mp3"
                await asyncio.to_thread(_write_asset, asset, result["preview_audio"])
                preview_asset = storage_path(asset)
            message = "MiniMax 设计音色已创建并保存到音色库。"
        elif body.provider == "mimo" and isinstance(adapter, MiMoProvider):
            asset = config.AUDIO / f"design_{voice_id}.wav"
            result = await adapter.synthesize(
                SynthesisRequest(model.gateway_id, "", preview_text, 1.0, "wav", prompt),
                asset,
            )
            request_id = result.get("provider_request_id", "")
            preview_asset = storage_path(asset)
            message = "MiMo 音色描述模板已保存，可在合成工作台重复使用。"
        else:
            raise ProviderError("音色设计适配器不可用", code="provider_not_configured", status=409)
    except HTTPException:
        raise
    except ProviderError as exc:
        raise HTTPException(exc.status, detail={"message": str(exc), "code": exc.code}) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(502, detail={"message": "无法下载厂商返回的试听音频", "code": "preview_download_failed"}) from exc

    if not preview_asset and provider_voice_id:
        asset = config.AUDIO / f"design_{voice_id}.wav"
        try:
            await adapter.synthesize(SynthesisRequest(model.gateway_id, provider_voice_id, preview_text, 1.0, "wav"), asset)
            preview_asset = storage_path(asset)
        except ProviderError:
            await asyncio.to_thread(asset.unlink, missing_ok=True)
            message += " 音色已创建，但本地试听生成失败，可直接到合成工作台使用。"

    def insert() -> None:
        with db() as connection:
            connection.execute(
                """INSERT INTO voices
                   (id,provider,model_id,provider_voice_id,display_name,public_name,voice_type,status,languages,created_at,preview_asset,design_prompt)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (voice_id, body.provider, body.model_id, provider_voice_id, display_name, public_name, "design", "active", json.dumps(model.languages, ensure_ascii=False), now(), preview_asset, prompt),
            )
    try:
        await asyncio.to_thread(insert)
    except sqlite3.IntegrityError as exc:
        if preview_asset:
            await asyncio.to_thread((config.ROOT / preview_asset).unlink, missing_ok=True)
        raise HTTPException(409, "兼容别名已存在，请换一个名称") from exc
    voice = next(item for item in list_voices() if item["id"] == voice_id)
    return {"id": voice_id, "message": message, "request_id": request_id, "persistent": body.provider != "mimo", "voice": voice}


@router.get("/api/voices/{voice_id}/preview")
def voice_preview(voice_id: str):
    with db() as connection:
        voice = connection.execute("SELECT * FROM voices WHERE id=? AND status='active'", (voice_id,)).fetchone()
    if not voice or not voice["preview_asset"]:
        raise HTTPException(404, "该音色没有本地试听音频")
    asset = (config.ROOT / voice["preview_asset"]).resolve()
    try:
        asset.relative_to(config.AUDIO.resolve())
    except ValueError as exc:
        raise HTTPException(404, "试听音频路径无效") from exc
    if not asset.is_file():
        raise HTTPException(404, "试听音频已不存在")
    return FileResponse(asset, media_type=mimetypes.guess_type(asset.name)[0] or "application/octet-stream")

