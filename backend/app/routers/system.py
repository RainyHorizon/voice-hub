"""System diagnostics and summary endpoints."""
from __future__ import annotations

import platform
import shutil
import subprocess
import sys
import tempfile
import json
import urllib.error
import urllib.request
import re
import asyncio
import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from .. import config
from ..credentials import credential_store_status
from ..database import db

router = APIRouter(tags=["system"])

GITHUB_REPOSITORY = "RainyHorizon/voice-studio"
_update_task: asyncio.Task | None = None
_update_state: dict[str, Any] = {"status": "idle", "message": ""}


@router.get("/api/update/check")
def check_for_update() -> dict[str, Any]:
    """Check the latest public GitHub Release without downloading anything."""
    current = config.APP_VERSION
    result: dict[str, Any] = {
        "current_version": current,
        "latest_version": current,
        "available": False,
        "release_url": f"https://github.com/{GITHUB_REPOSITORY}/releases",
        "setup_asset_url": None,
        "checksum_asset_url": None,
        "can_install": bool(platform.system() == "Windows" and getattr(sys, "frozen", False) and (config.ROOT / "voxnest-install.ini").is_file()),
        "error": None,
    }
    request = urllib.request.Request(
        f"https://api.github.com/repos/{GITHUB_REPOSITORY}/releases/latest",
        headers={"Accept": "application/vnd.github+json", "User-Agent": "VoxNest-Updater"},
    )
    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            payload = json.loads(response.read().decode("utf-8"))
        tag = str(payload.get("tag_name") or "").strip().lstrip("v")
        if not re.fullmatch(r"\d+\.\d+\.\d+", tag):
            raise ValueError("GitHub Release 版本号无效")
        result["latest_version"] = tag
        result["available"] = bool(re.fullmatch(r"\d+\.\d+\.\d+", current) and tuple(map(int, tag.split("."))) > tuple(map(int, current.split("."))))
        result["release_url"] = payload.get("html_url") or result["release_url"]
        for asset in payload.get("assets") or []:
            if asset.get("name") == f"VoxNest-{tag}-Windows-Setup.exe":
                result["setup_asset_url"] = asset.get("browser_download_url")
            elif asset.get("name") == f"VoxNest-{tag}-Windows-Setup.exe.sha256":
                result["checksum_asset_url"] = asset.get("browser_download_url")
    except (OSError, urllib.error.URLError, ValueError, json.JSONDecodeError) as exc:
        result["error"] = str(exc)
    return result


@router.get("/api/update/status")
def update_status():
    return dict(_update_state)


async def _watch_installer(ready_file: Path, process: subprocess.Popen, shutdown) -> None:
    try:
        for _ in range(900):
            if ready_file.is_file():
                state = ready_file.read_text(encoding="utf-8-sig").strip()
                if state == "ready":
                    _update_state.update(status="restarting", message="下载校验完成，正在安装并重启 VoxNest…")
                    await asyncio.sleep(2)
                    shutdown()
                    return
                if state.startswith("error:"):
                    raise RuntimeError(state[6:])
            if process.poll() is not None:
                raise RuntimeError("更新器提前退出，请查看 data/logs/installer-update.log")
            await asyncio.sleep(1)
        raise RuntimeError("下载更新超时")
    except Exception as exc:
        _update_state.update(status="error", message=str(exc))


@router.post("/api/update/install")
async def install_update(request: Request):
    global _update_task
    if not request.client or request.client.host not in {"127.0.0.1", "::1"}:
        raise HTTPException(403, "只能从本机安装更新")
    if _update_task and not _update_task.done():
        raise HTTPException(409, "更新已经在进行中")
    release = await asyncio.to_thread(check_for_update)
    shutdown = getattr(request.app.state, "request_shutdown", None)
    if not release["can_install"] or not callable(shutdown):
        raise HTTPException(409, "此功能仅适用于 Windows Setup 安装版；源码或便携版请使用对应更新器")
    if not release["available"] or not release["setup_asset_url"] or not release["checksum_asset_url"]:
        raise HTTPException(409, "没有可安装的更新，或 Release 仍在构建中")
    helper = config.ROOT / "installer-update.ps1"
    if not helper.is_file():
        raise HTTPException(409, "缺少独立更新器，请手动安装一次新版 Setup")
    temporary = Path(tempfile.mkdtemp(prefix="VoxNest-Update-"))
    helper_copy = temporary / "installer-update.ps1"
    shutil.copy2(helper, helper_copy)
    ready = temporary / "status.txt"
    process = subprocess.Popen(
        ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(helper_copy),
         "-InstallDirectory", str(config.ROOT), "-ParentProcessId", str(os.getpid()),
         "-SetupUrl", release["setup_asset_url"], "-ChecksumUrl", release["checksum_asset_url"],
         "-Version", release["latest_version"], "-ReadyFile", str(ready)],
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP,
    )
    _update_state.update(status="downloading", message="正在下载并校验更新，完成后将自动重启…")
    _update_task = asyncio.create_task(_watch_installer(ready, process, shutdown))
    return dict(_update_state)


def _command_diagnostic(command: str, arguments: list[str], required: bool) -> dict[str, Any]:
    path = shutil.which(command)
    if not path:
        return {
            "id": command,
            "label": command,
            "status": "error" if required else "warning",
            "version": "",
            "detail": f"未找到 {command}，请安装后加入系统 Path。" if required else f"未找到 {command}；使用预构建版本时不影响运行。",
        }
    try:
        completed = subprocess.run([path, *arguments], capture_output=True, text=True, timeout=10)
        output = (completed.stdout or completed.stderr).splitlines()
        if completed.returncode != 0:
            raise OSError(f"exit code {completed.returncode}")
        return {"id": command, "label": command, "status": "ok", "version": output[0] if output else "可用", "detail": path}
    except (OSError, subprocess.SubprocessError) as exc:
        return {"id": command, "label": command, "status": "error" if required else "warning", "version": "", "detail": f"{command} 无法正常运行：{exc}"}


def system_diagnostics() -> dict[str, Any]:
    checks: list[dict[str, Any]] = [
        {
            "id": "python",
            "label": "Python",
            "status": "ok" if sys.version_info >= (3, 11) else "error",
            "version": platform.python_version(),
            "detail": sys.executable,
        },
        _command_diagnostic("ffmpeg", ["-version"], True),
        _command_diagnostic("ffprobe", ["-version"], True),
    ]
    frontend_ready = (config.FRONTEND_DIST / "index.html").is_file()
    checks.append({
        "id": "frontend",
        "label": "前端文件",
        "status": "ok" if frontend_ready else "error",
        "version": "已构建" if frontend_ready else "缺失",
        "detail": str(config.FRONTEND_DIST),
    })
    node = _command_diagnostic("node", ["--version"], False)
    if frontend_ready:
        node["detail"] = f"{node['detail']} 当前前端已构建，日常启动不依赖 Node.js。"
    checks.append(node)
    credential = credential_store_status()
    checks.append({
        "id": "credentials",
        "label": "凭据存储",
        "status": "ok" if credential["available"] else "error",
        "version": credential["backend"],
        "detail": credential["message"],
    })
    try:
        config.DATA.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(prefix="voice-studio-", dir=config.DATA):
            pass
        data_check = {"id": "data", "label": "数据目录", "status": "ok", "version": "可写", "detail": str(config.DATA)}
    except OSError as exc:
        data_check = {"id": "data", "label": "数据目录", "status": "error", "version": "不可写", "detail": str(exc)}
    checks.append(data_check)
    required_failures = sum(item["status"] == "error" for item in checks)
    return {
        "status": "error" if required_failures else ("warning" if any(item["status"] == "warning" for item in checks) else "ok"),
        "platform": platform.platform(),
        "base_url": config.LOCAL_BASE_URL,
        "port": config.APP_PORT,
        "checks": checks,
        "required_failures": required_failures,
        "demo": {"model": "demo/local-demo", "voice": "local-demo", "available": True},
    }


@router.get("/api/summary")
def summary():
    with db() as connection:
        voices = connection.execute("SELECT COUNT(*) FROM voices WHERE status='active'").fetchone()[0]
        jobs = connection.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
        successful = connection.execute("SELECT COUNT(*) FROM jobs WHERE status='completed'").fetchone()[0]
    return {"application": "voice-studio", "version": config.APP_VERSION, "voices": voices, "jobs": jobs, "successful_jobs": successful, "gateway": {"enabled": True, "base_url": "/v1"}}


@router.get("/api/system/diagnostics")
def get_system_diagnostics():
    return system_diagnostics()
