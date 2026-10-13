"""Local registrations, validated catalogs and configuration for HTTP plugins."""
from __future__ import annotations

import json
import re
import shutil
import tempfile
from pathlib import Path
from threading import RLock
from urllib.parse import urlsplit

import httpx
from pydantic import ValidationError

from . import config
from .plugin_protocol import PluginCatalog, SettingField, validate_endpoint
from .providers.base import ProviderModel

PLUGIN_MANIFEST = "voice-hub.plugin.json"
_lock = RLock()
EXAMPLES = Path(__file__).resolve().parents[2] / "examples" / "plugins"


def parse_manifest(path: Path) -> dict:
    if path.stat().st_size > 64 * 1024:
        raise ValueError("清单不能超过 64 KB")
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("清单必须是对象")
    for key, limit in {"id": 40, "name": 100, "version": 40, "description": 500, "author": 100}.items():
        if not isinstance(payload.get(key), str) or not 1 <= len(payload[key].strip()) <= limit:
            raise ValueError(f"{key} 必须是 1-{limit} 个字符")
        payload[key] = payload[key].strip()
    if not re.fullmatch(r"[a-z0-9][a-z0-9._-]{1,39}", payload["id"]):
        raise ValueError("id 只能包含小写字母、数字、点、下划线和连字符")
    if not re.fullmatch(r"\d+\.\d+\.\d+", payload["version"]):
        raise ValueError("version 必须是 x.y.z 格式")
    if payload.get("api_version") != "1" or payload.get("runtime") != "external_http":
        raise ValueError("目前支持 api_version=1、runtime=external_http")
    if set(payload.get("capabilities", [])) != {"synthesis", "voices"}:
        raise ValueError("接口 v1 需要声明 synthesis 和 voices 能力")
    payload["endpoint"] = validate_endpoint(payload.get("endpoint", ""))
    homepage = payload.get("homepage")
    if homepage:
        if not isinstance(homepage, str) or len(homepage) > 500:
            raise ValueError("homepage 须为公开 HTTP(S) 地址")
        url = urlsplit(homepage)
        if url.scheme not in {"http", "https"} or not url.netloc or url.username or url.password:
            raise ValueError("homepage 须为公开 HTTP(S) 地址")
    fields = [SettingField.model_validate(item) for item in payload.get("settings", [])]
    if len(fields) > 30 or len({f.key for f in fields}) != len(fields):
        raise ValueError("配置项重复或超过 30 项")
    return {k: payload.get(k) for k in ("id", "name", "version", "api_version", "description", "author", "homepage", "runtime", "endpoint", "capabilities")} | {"settings": [f.model_dump() for f in fields]}


def _read_state() -> dict:
    path = config.PLUGIN_STATE_PATH
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or any(not isinstance(v, (dict, bool)) for v in data.values()):
            raise ValueError
        # Old flags did not verify a connection; require re-enabling after migration.
        return {k: ({"enabled": False} if isinstance(v, bool) else v) for k, v in data.items()}
    except (OSError, ValueError):
        raise ValueError("插件状态文件无法读取，请保留原文件并检查内容") from None


def _write_state(state: dict) -> None:
    path = config.PLUGIN_STATE_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        json.dump(state, handle, ensure_ascii=False, indent=2)
        temporary = Path(handle.name)
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def list_plugins() -> list[dict]:
    root = config.PLUGINS_DIR
    root.mkdir(parents=True, exist_ok=True)
    state = _read_state()
    result = []
    for directory in sorted(root.iterdir()):
        if not directory.is_dir() or directory.name.startswith("."):
            continue
        try:
            path = directory / PLUGIN_MANIFEST
            path.resolve().relative_to(root.resolve())
            manifest = parse_manifest(path)
            saved = state.get(manifest["id"], {})
            enabled = saved.get("enabled", False) is True and bool(saved.get("catalog"))
            result.append(manifest | {"path": directory.name, "enabled": enabled, "status": "enabled" if enabled else "disabled", "config": saved.get("config", {}), "catalog": saved.get("catalog", {})})
        except (OSError, ValueError, TypeError):
            result.append({"id": directory.name, "path": directory.name, "enabled": False, "status": "invalid", "error": "清单无效或缺失，请检查插件说明与清单格式"})
    for item in result:
        if sum(p["id"] == item["id"] for p in result) > 1:
            item.update(enabled=False, status="invalid", error="插件 ID 重复")
    return result


def get_plugin(plugin_id: str) -> dict:
    item = next((p for p in list_plugins() if p["id"] == plugin_id), None)
    if not item:
        raise KeyError("插件不存在")
    if item["status"] == "invalid":
        raise ValueError(item["error"])
    return item


def public_plugin(item: dict) -> dict:
    catalog = item.get("catalog", {})
    return {k: v for k, v in item.items() if k != "catalog"} | {"model_count": len(catalog.get("models", [])), "voice_count": len(catalog.get("voices", [])), "voices": catalog.get("voices", [])}


def validated_config(plugin: dict, values: dict) -> dict:
    fields = [SettingField.model_validate(f) for f in plugin["settings"]]
    if set(values) - {"endpoint", *(f.key for f in fields)}:
        raise ValueError("存在未声明的配置项")
    return {"endpoint": validate_endpoint(values.get("endpoint", plugin["endpoint"]))} | {f.key: f.check(values.get(f.key, f.default)) for f in fields}


def fetch_catalog(plugin: dict, values: dict) -> dict:
    try:
        with httpx.Client(timeout=30, trust_env=False, follow_redirects=False) as client:
            def read(route):
                with client.stream("GET", values["endpoint"] + route) as response:
                    response.raise_for_status()
                    data = bytearray()
                    for chunk in response.iter_bytes():
                        data.extend(chunk)
                        if len(data) > 2 * 1024 * 1024:
                            raise ValueError("插件目录响应过大")
                    return json.loads(data)
            health = read("/health")
            if health.get("id") != plugin["id"] or health.get("api_version") != "1":
                raise ValueError("连接的插件 ID 或接口版本不匹配")
            catalog = PluginCatalog.model_validate({"models": read("/models")["models"], "voices": read("/voices")["voices"]})
            return catalog.model_dump()
    except (httpx.HTTPError, json.JSONDecodeError, KeyError, TypeError, AttributeError, ValidationError):
        raise ValueError("无法连接插件或返回内容不符合接口规范，请确认服务已启动") from None


def update_plugin(plugin_id: str, *, enabled: bool | None = None, values: dict | None = None, sync: bool = False) -> dict:
    with _lock:
        plugin = get_plugin(plugin_id)
        settings = validated_config(plugin, plugin["config"] | (values or {}))
        should_enable = plugin["enabled"] if enabled is None else enabled
        catalog = fetch_catalog(plugin, settings) if sync or should_enable else plugin["catalog"]
        for field in plugin["settings"]:
            if catalog and field["type"] == "voice" and settings[field["key"]] not in {v["id"] for v in catalog["voices"]}:
                raise ValueError("默认音色不在插件音色列表中，请打开配置检查连接并重新选择")
        state = _read_state()
        state[plugin_id] = {"enabled": should_enable, "config": settings, "catalog": catalog}
        _write_state(state)
        return public_plugin(get_plugin(plugin_id))


def set_plugin_enabled(plugin_id: str, enabled: bool) -> dict:
    return update_plugin(plugin_id, enabled=enabled)


def plugin_models() -> list[ProviderModel]:
    models = []
    for plugin in list_plugins():
        if not plugin["enabled"]:
            continue
        for model in plugin["catalog"]["models"]:
            models.append(ProviderModel(
                provider="plugin-" + plugin["id"], model_id=model["id"], display_name=model["name"],
                kind="tts", quality="自然", latency="在线", languages=model["languages"], supports_clone=False,
                mode="provider", plugin_id=plugin["id"], provider_display_name=plugin["name"],
                default_voice=plugin["config"].get("default_voice"),
            ))
    return models


def plugin_voices() -> list[dict]:
    result = []
    for plugin in list_plugins():
        if not plugin["enabled"]:
            continue
        for voice in plugin["catalog"]["voices"]:
            public_id = f"plugin-{plugin['id']}:{voice['model']}:{voice['id']}"
            result.append({"id": public_id, "public_name": public_id, "api_voice_id": public_id,
                "provider": "plugin-" + plugin["id"], "model_id": voice["model"], "provider_voice_id": voice["id"],
                "display_name": voice["name"], "languages": voice["languages"], "voice_type": "preset", "status": "active",
                "plugin_id": plugin["id"], "preview_url": None, "provider_account_id": None, "provider_project_name": None})
    return result


def example_market() -> list[dict]:
    path = EXAMPLES / "edge-tts" / PLUGIN_MANIFEST
    return [parse_manifest(path)] if path.is_file() else []


def install_example(plugin_id: str) -> dict:
    if plugin_id != "edge-tts" or not example_market():
        raise KeyError("示例插件不存在")
    with _lock:
        if any(p["id"] == plugin_id for p in list_plugins()):
            raise ValueError("插件已安装")
        target = config.PLUGINS_DIR / plugin_id
        target.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(EXAMPLES / plugin_id / PLUGIN_MANIFEST, target / PLUGIN_MANIFEST)
        return public_plugin(get_plugin(plugin_id))


def uninstall_plugin(plugin_id: str) -> None:
    with _lock:
        plugin = get_plugin(plugin_id)
        # Keep service files; only remove registration. Hidden folder is excluded from discovery.
        directory = config.PLUGINS_DIR / plugin["path"]
        target = config.PLUGINS_DIR / (".removed-" + plugin["path"])
        if target.exists():
            raise ValueError("已有卸载备份，请先处理 .removed 插件目录")
        directory.rename(target)
        try:
            state = _read_state()
            state.pop(plugin_id, None)
            _write_state(state)
        except Exception:
            target.rename(directory)
            raise
