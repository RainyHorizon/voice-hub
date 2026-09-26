"""Voice Hub FastAPI application factory and process lifecycle.

Route handlers live in ``app.routers.*``; this module wires them into the app,
owns middleware, exception handlers, startup/shutdown tasks and SPA hosting.

Selected helpers remain re-exported for backward compatibility. Runtime code
uses ``app.config`` as the single source of truth for paths and settings.
"""
from __future__ import annotations

import asyncio
import platform
import uuid
from contextlib import asynccontextmanager, suppress
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from . import config, routers
from .config import (  # noqa: F401  (re-exported for tests/launcher)
    APP_PORT,
    AUDIO,
    DATA,
    DB_PATH,
    FRONTEND_DIST,
    GATEWAY_CONFIG_PATH,
    LOCAL_BASE_URL,
    LOCAL_BROWSER_ORIGINS,
    MINIMAX_ENDPOINT,
    LOGS,
    OFFICIAL_ENDPOINT_HOSTS,
    PROVIDER_SPECS,
    ROOT,
    TRUSTED_HOSTS,
)
from .credentials import credential_store_status  # noqa: F401
from .database import db, init_db, now, sync_environment_accounts  # noqa: F401
from .providers.demo import DemoProvider  # noqa: F401
from .schemas import (  # noqa: F401
    ImportVoiceBody,
    ImportVoicesBody,
    JobBatchBody,
    ProviderAccountBody,
    ProviderProjectBody,
    RenameVoiceBody,
    StoragePolicyBody,
    StreamingSynthesisBody,
    SynthesisBody,
    VoiceDesignBody,
)
from .services import (  # noqa: F401
    audio_metadata,
    available_models,
    convert_audio,
    demo_provider,
    openai_model_item,
    provider_account_for,
    provider_for,
    resolve_model,
    resolve_voice,
    storage_path,
    validate_provider_endpoint,
    voice_payload,
)
from .services import MiMoProvider  # noqa: F401
from .runtime import prepare_runtime_directories
from .storage import (  # noqa: F401
    automatic_cleanup_due,
    build_cleanup_plan,
    cleanup_preview,
    execute_cleanup,
    init_storage_schema,
    read_policy,
    storage_snapshot,
    write_policy,
)


async def reject_untrusted_browser_origin(request: Request, call_next):
    origin = request.headers.get("origin")
    if origin and origin not in config.LOCAL_BROWSER_ORIGINS:
        return JSONResponse(
            status_code=403,
            content={"error": {"message": "不允许的浏览器来源", "type": "authentication_error", "code": "untrusted_origin"}},
        )
    return await call_next(request)


async def openai_http_exception_handler(_, exc: HTTPException):
    detail = exc.detail
    if isinstance(detail, dict) and isinstance(detail.get("error"), dict):
        content = detail
    elif isinstance(detail, dict):
        content = {
            "error": {
                "message": str(detail.get("message") or detail),
                "type": "authentication_error" if exc.status_code == 401 else "invalid_request_error",
                "code": str(detail.get("code") or "request_failed"),
            }
        }
    else:
        content = {
            "error": {
                "message": str(detail),
                "type": "authentication_error" if exc.status_code == 401 else "invalid_request_error",
                "code": "authentication_error" if exc.status_code == 401 else "request_failed",
            }
        }
    return JSONResponse(status_code=exc.status_code, content=content, headers=exc.headers)


async def openai_validation_exception_handler(_, exc: RequestValidationError):
    messages = [str(item.get("msg") or "参数无效") for item in exc.errors()]
    return JSONResponse(
        status_code=400,
        content={
            "error": {
                "message": "; ".join(messages),
                "type": "invalid_request_error",
                "code": "invalid_request",
            }
        },
    )


def run_scheduled_storage_cleanup() -> dict[str, Any] | None:
    with db() as connection:
        if not automatic_cleanup_due(connection):
            return None
        return execute_cleanup(
            connection,
            config.ROOT,
            config.AUDIO,
            trigger="automatic",
            run_id="cleanup_" + uuid.uuid4().hex[:12],
        )


async def storage_cleanup_loop() -> None:
    while True:
        await asyncio.sleep(60 * 60)
        try:
            await asyncio.to_thread(run_scheduled_storage_cleanup)
        except Exception as exc:
            print(f"Storage cleanup check failed: {exc}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await asyncio.to_thread(prepare_runtime_directories)
    init_db()
    await asyncio.to_thread(run_scheduled_storage_cleanup)
    task = asyncio.create_task(storage_cleanup_loop())
    app.state.storage_cleanup_task = task
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


app = FastAPI(title="Voice Hub Gateway", version=config.APP_VERSION, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=sorted(config.LOCAL_BROWSER_ORIGINS), allow_methods=["*"], allow_headers=["*"])
app.add_middleware(TrustedHostMiddleware, allowed_hosts=config.TRUSTED_HOSTS)
app.middleware("http")(reject_untrusted_browser_origin)
app.add_exception_handler(HTTPException, openai_http_exception_handler)
app.add_exception_handler(RequestValidationError, openai_validation_exception_handler)


app.include_router(routers.system.router)
app.include_router(routers.accounts.router)
app.include_router(routers.voices.router)
app.include_router(routers.gateway.router)
app.include_router(routers.jobs.router)
app.include_router(routers.storage.router)

# --- Static SPA hosting (must come last so it does not shadow the API) ---
from .routers.system import _command_diagnostic  # noqa: F401  (re-exported for tests)
from .routers.storage import open_storage_directory  # noqa: F401  (re-exported for tests)
from .routers.gateway import _stream_speech_events  # noqa: F401  (re-exported for tests)

if config.FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=config.FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def spa(full_path: str):
        candidate = (config.FRONTEND_DIST / full_path).resolve()
        try:
            candidate.relative_to(config.FRONTEND_DIST.resolve())
        except ValueError as exc:
            raise HTTPException(404, "文件不存在") from exc
        if candidate.exists() and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(config.FRONTEND_DIST / "index.html")

