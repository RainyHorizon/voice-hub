"""Domain services: model/voice resolution, provider adapter factory, audio helpers."""
from __future__ import annotations

import base64
import mimetypes
import os
import sqlite3
import subprocess
import time
import wave
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from . import config
from .credentials import (
    CredentialStoreError,
    credential_store_name,
    load_api_key,
    load_project_api_key,
    load_provider_credentials,
)
from .database import db
from .providers.base import ProviderError
from .providers.demo import DemoProvider
from .providers.mimo import MIMO_MODELS, MiMoProvider
from .providers.minimax import MINIMAX_MODELS, MiniMaxProvider
from .providers.qwen import QWEN_MODELS, QwenProvider
from .providers.volcengine import VOLCENGINE_MODELS, VolcengineProvider

demo_provider = DemoProvider()


def available_models():
    return [*demo_provider.models(), *QWEN_MODELS, *VOLCENGINE_MODELS, *MINIMAX_MODELS, *MIMO_MODELS]


def resolve_model(model_id: str):
    aliases = {"tts-default": "mimo/mimo-v2.5-tts", "tts-fast": "dashscope/qwen3-tts-flash", "tts-hq": "mimo/mimo-v2.5-tts"}
    target = aliases.get(model_id, model_id)
    for model in available_models():
        if model.gateway_id == target:
            return model
    return None


def openai_model_item(model, requested_id: str | None = None) -> dict[str, Any]:
    operations = list(model.operations)
    if "synthesis" in operations and "streaming" not in operations:
        operations.append("streaming")
    native_streaming = (
        model.provider == "volcengine"
        or model.provider == "minimax"
        or (model.provider == "mimo" and model.model_id != "mimo-v2.5-tts-voicedesign")
        or (model.provider == "dashscope" and model.model_id in {"cosyvoice-v3-flash", "cosyvoice-v3-plus", "cosyvoice-v3.5-flash", "cosyvoice-v3.5-plus"})
    )
    return {
        "id": requested_id or model.gateway_id,
        "object": "model",
        "created": int(time.time()),
        "owned_by": model.provider,
        "voice_studio": {
            "mode": model.mode,
            "operations": operations,
            "supports_clone": model.supports_clone,
            "native_streaming": native_streaming,
            "native_stream_formats": ["pcm"] if (model.provider == "mimo" and model.model_id != "mimo-v2.5-tts-voicedesign") else (["mp3"] if native_streaming else []),
            "design_prompt_max": model.design_prompt_max,
            "design_preview_min": model.design_preview_min,
            "design_preview_max": model.design_preview_max,
        },
    }


def resolve_voice(voice_id: str, model):
    if model.provider == "mimo" and model.model_id == "mimo-v2.5-tts":
        aliases = {"alloy": "mimo-default", "coral": "bingtang", "nova": "suda", "shimmer": "moli"}
    elif model.provider == "dashscope" and model.model_id == "qwen3-tts-flash":
        aliases = {"alloy": "Ethan", "coral": "Cherry", "nova": "Serena", "shimmer": "Chelsie"}
    elif model.provider == "dashscope" and model.model_id == "qwen3-tts-instruct-flash":
        aliases = {"alloy": "Ethan", "coral": "Cherry", "nova": "Serena", "shimmer": "Chelsie"}
    elif model.provider == "volcengine" and model.model_id == "seed-tts-2.0":
        aliases = {"alloy": "volc-yunzhou", "coral": "volc-vivi", "nova": "volc-xiaohe", "shimmer": "volc-sophie"}
    else:
        aliases = {"alloy": "voice_narrator", "coral": "voice_coral", "nova": "voice_nova"}
    target = aliases.get(voice_id, voice_id)
    with db() as connection:
        if model.mode == "demo":
            row = connection.execute(
                "SELECT * FROM voices WHERE provider=? AND (id=? OR public_name=? OR provider_voice_id=?) AND status='active'",
                (model.provider, target, target, target),
            ).fetchone()
        elif model.provider == "minimax":
            row = connection.execute(
                "SELECT * FROM voices WHERE provider='minimax' AND (id=? OR public_name=? OR provider_voice_id=?) AND status='active'",
                (target, target, target),
            ).fetchone()
        else:
            row = connection.execute(
                "SELECT * FROM voices WHERE provider=? AND model_id=? AND (id=? OR public_name=? OR provider_voice_id=?) AND status='active'",
                (model.provider, model.model_id, target, target, target),
            ).fetchone()
    if row:
        if model.mode == "demo" and row["provider"] == model.provider:
            return row
        if model.provider != "minimax" and f"{row['provider']}/{row['model_id']}" != model.gateway_id:
            return None
    return row


def voice_payload(model, voice: sqlite3.Row, fallback: str) -> str:
    if model.provider == "mimo" and model.model_id == "mimo-v2.5-tts-voicedesign":
        return ""
    if model.provider == "mimo" and model.model_id == "mimo-v2.5-tts-voiceclone":
        asset_path = voice["preview_asset"]
        if not asset_path:
            raise ProviderError("该复刻音色缺少本地参考音频", code="missing_reference_audio", status=409)
        asset = (config.ROOT / asset_path).resolve()
        try:
            asset.relative_to(config.AUDIO.resolve())
        except ValueError as exc:
            raise ProviderError("复刻音色的参考音频路径无效", code="invalid_reference_audio", status=409) from exc
        if not asset.is_file():
            raise ProviderError("找不到复刻音色的本地参考音频", code="missing_reference_audio", status=409)
        mime_type = mimetypes.guess_type(asset.name)[0] or "audio/wav"
        return f"data:{mime_type};base64,{base64.b64encode(asset.read_bytes()).decode('ascii')}"
    return voice["provider_voice_id"] or fallback


def provider_account_for(model_provider: str, account_id: str | None = None, *, require_explicit: bool = False) -> sqlite3.Row:
    if model_provider not in {"dashscope", "mimo", "volcengine", "minimax"}:
        raise ProviderError("本地演示模型没有厂商配置", code="provider_not_configured", status=409)
    with db() as connection:
        if account_id:
            row = connection.execute(
                "SELECT * FROM provider_accounts WHERE id=? AND provider=?",
                (account_id, model_provider),
            ).fetchone()
            if not row:
                raise ProviderError("所选厂商配置不存在或与当前厂商不匹配", code="provider_account_not_found", status=409)
            if model_provider == "volcengine" and row["account_ref"]:
                connection.execute(
                    """INSERT OR IGNORE INTO provider_projects
                       (id,provider_account_id,project_name,display_name,status,has_permission,source,created_at,updated_at,last_synced_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?)""",
                    (
                        "pp_" + row["id"], row["id"], row["account_ref"], row["account_ref"],
                        "active", 1, "legacy", row["created_at"], row["updated_at"], row["updated_at"],
                    ),
                )
            return row
        rows = connection.execute(
            "SELECT * FROM provider_accounts WHERE provider=? ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, created_at",
            (model_provider,),
        ).fetchall()
    provider_name = {"dashscope": "通义千问", "mimo": "小米 MiMo", "volcengine": "火山引擎", "minimax": "MiniMax"}[model_provider]
    if not rows:
        raise ProviderError(f"尚未在设置中配置{provider_name} API Key", code="provider_not_configured", status=409)
    if require_explicit and len(rows) > 1:
        raise ProviderError(f"检测到多个{provider_name}配置，请先选择项目", code="provider_account_required", status=409)
    row = rows[0]
    if model_provider == "volcengine" and row["account_ref"]:
        with db() as connection:
            connection.execute(
                """INSERT OR IGNORE INTO provider_projects
                   (id,provider_account_id,project_name,display_name,status,has_permission,source,created_at,updated_at,last_synced_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (
                    "pp_" + row["id"], row["id"], row["account_ref"], row["account_ref"],
                    "active", 1, "legacy", row["created_at"], row["updated_at"], row["updated_at"],
                ),
            )
    return row


def provider_for(
    model_provider: str,
    account_id: str | None = None,
    project_name: str | None = None,
    *,
    require_project_api_key: bool = True,
):
    if model_provider not in {"dashscope", "mimo", "volcengine", "minimax"}:
        return demo_provider
    row = provider_account_for(model_provider, account_id)
    provider_name = {"dashscope": "通义千问", "mimo": "小米 MiMo", "volcengine": "火山引擎", "minimax": "MiniMax"}[model_provider]
    try:
        api_key = load_api_key(row["id"])
    except CredentialStoreError as exc:
        raise ProviderError(str(exc), code="credential_store_error", status=503) from exc
    if not api_key:
        raise ProviderError(f"{credential_store_name()}中没有找到{provider_name}凭据", code="provider_not_configured", status=409)
    try:
        endpoint = validate_provider_endpoint(model_provider, row["endpoint"] or config.PROVIDER_SPECS[model_provider]["default_endpoint"])
    except ValueError as exc:
        raise ProviderError(str(exc), code="unsafe_provider_endpoint", status=409) from exc
    if model_provider == "dashscope":
        return QwenProvider(api_key, endpoint)
    if model_provider == "volcengine":
        try:
            credentials = load_provider_credentials(row["id"])
            selected_project = project_name or row["account_ref"] or ""
            project_api_key = load_project_api_key(row["id"], selected_project) if selected_project else None
        except CredentialStoreError as exc:
            raise ProviderError(str(exc), code="credential_store_error", status=503) from exc
        if project_api_key:
            api_key = project_api_key
        elif require_project_api_key and selected_project and selected_project != (row["account_ref"] or ""):
            raise ProviderError(
                "当前火山项目没有已同步的语音 API Key，请到设置中点击“同步项目与密钥”；"
                "如果仍显示未创建，请先在火山控制台为该项目创建 API Key",
                code="volcengine_project_api_key_missing",
                status=409,
            )
        return VolcengineProvider(
            api_key,
            endpoint,
            credentials.get("openapi_access_key"),
            credentials.get("openapi_secret_key"),
            selected_project,
        )
    if model_provider == "minimax":
        return MiniMaxProvider(api_key, endpoint)
    return MiMoProvider(api_key, endpoint)


def validate_provider_endpoint(provider: str, endpoint: str) -> str:
    normalized = endpoint.strip().rstrip("/")
    parsed = urlparse(normalized)
    if not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("Endpoint 必须是有效地址，且不能包含账号、密码、查询参数或片段")
    custom_allowed = os.getenv("VOICE_STUDIO_ALLOW_CUSTOM_ENDPOINTS", "").strip().lower() in {"1", "true", "yes"}
    hostname = (parsed.hostname or "").lower()
    loopback_http = custom_allowed and parsed.scheme == "http" and hostname in {"127.0.0.1", "localhost", "::1"}
    if parsed.scheme != "https" and not loopback_http:
        raise ValueError("Endpoint 必须使用 HTTPS；仅显式启用自定义端点后允许本机 HTTP")
    if not custom_allowed and hostname not in config.OFFICIAL_ENDPOINT_HOSTS.get(provider, set()):
        raise ValueError("为防止 API Key 外传，Endpoint 只能使用该厂商的官方域名")
    return normalized


def convert_audio(wav_path: Path, output_format: str) -> tuple[Path, str]:
    if output_format == "wav":
        return wav_path, "audio/wav"
    mime_types = {"mp3": "audio/mpeg", "opus": "audio/ogg", "aac": "audio/aac", "flac": "audio/flac", "pcm": "application/octet-stream"}
    target = wav_path.with_suffix("." + output_format)
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav_path)]
    if output_format == "pcm":
        command += ["-f", "s16le", "-acodec", "pcm_s16le"]
    elif output_format == "opus":
        command += ["-c:a", "libopus"]
    command.append(str(target))
    try:
        completed = subprocess.run(command, capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.SubprocessError) as exc:
        raise ProviderError("音频格式转换失败，请确认 FFmpeg 已安装并可在系统 Path 中调用", code="audio_conversion_failed") from exc
    if completed.returncode != 0:
        raise ProviderError("音频格式转换失败", code="audio_conversion_failed")
    return target, mime_types[output_format]


def audio_metadata(wav_path: Path) -> dict[str, int]:
    try:
        with wave.open(str(wav_path), "rb") as stream:
            return {"sample_rate": stream.getframerate(), "channels": stream.getnchannels(), "sample_width": stream.getsampwidth()}
    except (OSError, wave.Error):
        return {}


def storage_path(path: Path) -> str:
    try:
        return str(path.relative_to(config.ROOT))
    except ValueError:
        return str(path)
