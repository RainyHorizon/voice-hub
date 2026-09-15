"""Local OpenAI-compatible gateway key management.

The gateway key authenticates external clients hitting ``/v1/*``. It lives in
``data/gateway.json`` for desktop builds or ``VOICE_STUDIO_GATEWAY_KEY`` for
Docker deployments.
"""
from __future__ import annotations

import json
import os
import secrets

from fastapi import Header, HTTPException

from . import config


def gateway_key() -> str:
    configured = os.getenv("VOICE_STUDIO_GATEWAY_KEY", "").strip()
    if configured:
        return configured
    try:
        if config.GATEWAY_CONFIG_PATH.exists():
            content = json.loads(config.GATEWAY_CONFIG_PATH.read_text(encoding="utf-8"))
            value = str(content.get("key") or "").strip()
            if value:
                return value
    except (OSError, json.JSONDecodeError, AttributeError):
        pass
    value = "vs_" + secrets.token_urlsafe(24)
    config.DATA.mkdir(parents=True, exist_ok=True)
    temp_path = config.GATEWAY_CONFIG_PATH.with_suffix(".tmp")
    temp_path.write_text(json.dumps({"key": value}, ensure_ascii=False, indent=2), encoding="utf-8")
    temp_path.replace(config.GATEWAY_CONFIG_PATH)
    return value


def gateway_key_source() -> str:
    return "环境变量 VOICE_STUDIO_GATEWAY_KEY" if os.getenv("VOICE_STUDIO_GATEWAY_KEY", "").strip() else "本地 gateway.json"


def require_gateway_key(authorization: str | None = Header(default=None)) -> None:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not secrets.compare_digest(token.strip(), gateway_key()):
        raise HTTPException(status_code=401, detail={"error": {"message": "无效的网关 Key", "type": "authentication_error", "code": "gateway_auth_failed"}})
