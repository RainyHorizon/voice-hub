"""Centralised application settings and filesystem paths."""
from __future__ import annotations

import os
from pathlib import Path

from .providers.mimo import DEFAULT_ENDPOINT as MIMO_ENDPOINT
from .providers.minimax import DEFAULT_ENDPOINT as MINIMAX_PROVIDER_ENDPOINT
from .providers.qwen import DEFAULT_ENDPOINT as QWEN_ENDPOINT
from .providers.volcengine import DEFAULT_ENDPOINT as VOLCENGINE_ENDPOINT

ROOT = Path(os.getenv("VOICE_STUDIO_ROOT", Path(__file__).resolve().parents[2])).expanduser().resolve()
DATA = ROOT / "data"
AUDIO = DATA / "audio"
LOGS = DATA / "logs"
DB_PATH = DATA / "voice_studio.db"
FRONTEND_DIST = ROOT / "frontend" / "dist"
GATEWAY_CONFIG_PATH = DATA / "gateway.json"
APP_VERSION = os.getenv("VOICE_STUDIO_VERSION", "1.4.0").strip() or "1.4.0"
try:
    APP_PORT = int(os.getenv("VOICE_STUDIO_PORT", "8765"))
except ValueError:
    APP_PORT = 8765
if not 1 <= APP_PORT <= 65535:
    APP_PORT = 8765
LOCAL_BASE_URL = f"http://127.0.0.1:{APP_PORT}"
MINIMAX_ENDPOINT = MINIMAX_PROVIDER_ENDPOINT
PROVIDER_SPECS = {
    "dashscope": {"display_name": "通义千问", "secret_label": "标准 API Key", "default_endpoint": QWEN_ENDPOINT, "endpoint_note": "中国大陆站官方地址", "verification": "remote_auth"},
    "volcengine": {"display_name": "火山引擎", "secret_label": "API Key", "default_endpoint": VOLCENGINE_ENDPOINT, "endpoint_note": "新版豆包语音 API 官方地址", "verification": "remote_auth", "openapi_note": "云端音色同步需要额外的 OpenAPI AK/SK 与项目名称"},
    "minimax": {"display_name": "MiniMax", "secret_label": "API Key", "default_endpoint": MINIMAX_ENDPOINT, "endpoint_note": "中国大陆站官方地址，必须包含 /v1", "verification": "credential_storage"},
    "mimo": {"display_name": "小米 MiMo", "secret_label": "API Key", "default_endpoint": MIMO_ENDPOINT, "endpoint_note": "官方公共 API 地址", "verification": "remote_auth"},
}
OFFICIAL_ENDPOINT_HOSTS = {
    "dashscope": {"dashscope.aliyuncs.com", "dashscope-intl.aliyuncs.com", "dashscope-us.aliyuncs.com"},
    "volcengine": {"openspeech.bytedance.com"},
    "minimax": {"api.minimaxi.com", "api.minimax.io"},
    "mimo": {"api.xiaomimimo.com"},
}
LOCAL_BROWSER_ORIGINS = {
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    LOCAL_BASE_URL,
    f"http://localhost:{APP_PORT}",
}
LOCAL_BROWSER_ORIGINS.update(
    origin.strip()
    for origin in os.getenv("VOICE_STUDIO_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
)
TRUSTED_HOSTS = ["127.0.0.1", "localhost", "test"]
TRUSTED_HOSTS.extend(
    host.strip()
    for host in os.getenv("VOICE_STUDIO_ALLOWED_HOSTS", "").split(",")
    if host.strip()
)
