"""Storage policy, capacity statistics and cleanup endpoints."""
from __future__ import annotations

import os
import platform
import subprocess
import uuid

from fastapi import APIRouter

from .. import config
from ..database import db
from ..schemas import StoragePolicyBody
from ..storage import (
    build_cleanup_plan,
    cleanup_preview,
    execute_cleanup,
    read_policy,
    storage_snapshot,
    write_policy,
)

router = APIRouter(tags=["storage"])


@router.get("/api/jobs/storage")
def job_storage():
    with db() as connection:
        usage = storage_snapshot(connection, config.ROOT, config.AUDIO)["usage"]
    return {
        "job_count": usage["job_count"],
        "audio_count": usage["audio_count"],
        "audio_bytes": usage["audio_bytes"],
        "audio_megabytes": round(usage["audio_bytes"] / 1024 / 1024, 2),
        "missing_audio_count": usage["missing_audio_count"],
    }


@router.get("/api/storage")
def get_storage_status():
    with db() as connection:
        return storage_snapshot(connection, config.ROOT, config.AUDIO)


@router.put("/api/storage/policy")
def update_storage_policy(body: StoragePolicyBody):
    with db() as connection:
        write_policy(connection, body.model_dump())
        return storage_snapshot(connection, config.ROOT, config.AUDIO)


@router.post("/api/storage/cleanup/preview")
def preview_storage_cleanup():
    with db() as connection:
        plan = build_cleanup_plan(connection, config.ROOT, config.AUDIO, read_policy(connection))
        return cleanup_preview(plan)


@router.post("/api/storage/cleanup")
def clean_storage_now():
    with db() as connection:
        result = execute_cleanup(
            connection,
            config.ROOT,
            config.AUDIO,
            trigger="manual",
            run_id="cleanup_" + uuid.uuid4().hex[:12],
        )
        return {"result": result, "storage": storage_snapshot(connection, config.ROOT, config.AUDIO)}


@router.post("/api/storage/open-directory")
def open_storage_directory():
    config.AUDIO.mkdir(parents=True, exist_ok=True)
    path = config.AUDIO.resolve()
    try:
        system = platform.system()
        if system == "Windows":
            os.startfile(str(path))  # type: ignore[attr-defined]
        elif system == "Darwin":
            subprocess.Popen(["open", str(path)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        elif system == "Linux":
            # A server or SSH session may have no desktop session. Return the
            # path instead of failing when no graphical session is available.
            if not (os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")):
                return {"opened": False, "path": str(path), "message": "当前 Linux 会话没有图形桌面，请手动打开该路径。"}
            subprocess.Popen(["xdg-open", str(path)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            return {"opened": False, "path": str(path), "message": "当前系统没有可用的目录打开器，请手动打开该路径。"}
    except OSError as exc:
        return {"opened": False, "path": str(path), "message": f"无法自动打开目录，请手动打开：{exc}"}
    return {"opened": True, "path": str(path), "message": "已请求系统文件管理器打开目录。"}
