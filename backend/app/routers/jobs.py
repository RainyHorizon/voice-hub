"""Task history listing, download, batch export and deletion."""
from __future__ import annotations

import json
import mimetypes
import os
import shutil
import sqlite3
import tempfile
import uuid
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response
from starlette.background import BackgroundTask

from .. import config
from ..database import db
from ..schemas import JobBatchBody

router = APIRouter(tags=["jobs"])


def _job_response(row: sqlite3.Row) -> dict[str, Any]:
    item = dict(row)
    item["input_text"] = item.get("input_text") or ""
    item["created_date"] = datetime.fromisoformat(item["created_at"]).astimezone().date().isoformat()
    item["audio_available"] = False
    audio_path = item.get("audio_path")
    if audio_path:
        try:
            path = (config.ROOT / audio_path).resolve()
            path.relative_to(config.AUDIO.resolve())
            item["audio_available"] = path.is_file()
        except (OSError, ValueError):
            pass
    item["audio_url"] = f"/api/jobs/{item['id']}/audio" if item["audio_available"] else None
    item["text_url"] = f"/api/jobs/{item['id']}/text" if item["input_text"] else None
    return item


def _job_audio_path(row: sqlite3.Row) -> Path:
    audio_path = row["audio_path"]
    if not audio_path:
        raise HTTPException(404, "该任务没有保存音频文件")
    path = (config.ROOT / audio_path).resolve()
    try:
        path.relative_to(config.AUDIO.resolve())
    except ValueError as exc:
        raise HTTPException(404, "任务音频路径无效") from exc
    if not path.is_file():
        raise HTTPException(404, "该任务的音频文件已不存在")
    return path


def _job_rows_for_batch(body: JobBatchBody) -> list[sqlite3.Row]:
    job_ids = list(dict.fromkeys(item.strip() for item in body.job_ids if item.strip()))
    if not job_ids and not body.date:
        raise HTTPException(400, "请至少选择一个任务或指定日期")
    with db() as connection:
        if job_ids:
            placeholders = ",".join("?" for _ in job_ids)
            rows = connection.execute(
                # The placeholder count is generated internally; every job ID remains bound.
                f"SELECT * FROM jobs WHERE id IN ({placeholders}) ORDER BY created_at DESC",  # nosec B608
                job_ids,
            ).fetchall()
        else:
            rows = connection.execute(
                "SELECT * FROM jobs WHERE date(created_at, 'localtime')=? ORDER BY created_at DESC",
                (body.date,),
            ).fetchall()
    if not rows:
        raise HTTPException(404, "没有找到可处理的任务")
    return rows


def _safe_existing_audio_path(row: sqlite3.Row) -> Path | None:
    audio_path = row["audio_path"]
    if not audio_path:
        return None
    try:
        path = (config.ROOT / audio_path).resolve()
        path.relative_to(config.AUDIO.resolve())
    except (OSError, ValueError):
        return None
    return path if path.is_file() else None


def _delete_job_rows(rows: list[sqlite3.Row]) -> tuple[int, int]:
    selected_ids = {row["id"] for row in rows}
    selected_audio_paths = {
        row["audio_path"]
        for row in rows
        if row["audio_path"] and _safe_existing_audio_path(row) is not None
    }
    quarantine = config.DATA / "delete-trash" / ("jobs_" + uuid.uuid4().hex)
    backups: list[tuple[Path, Path, int]] = []
    quarantine.mkdir(parents=True, exist_ok=True)
    try:
        with db() as connection:
            # Do not remove an audio file that is still referenced by a job
            # outside this deletion batch.
            shared_paths = {
                item["audio_path"]
                for item in connection.execute(
                    "SELECT id, audio_path FROM jobs WHERE audio_path IS NOT NULL"
                ).fetchall()
                if item["id"] not in selected_ids and item["audio_path"] in selected_audio_paths
            }
            for row in rows:
                if not row["audio_path"] or row["audio_path"] in shared_paths:
                    continue
                path = _safe_existing_audio_path(row)
                if path is None or any(original == path for original, _, _ in backups):
                    continue
                size = path.stat().st_size
                target = quarantine / f"{len(backups):04d}_{path.name}"
                try:
                    os.link(path, target)
                except OSError:
                    shutil.copy2(path, target)
                backups.append((path, target, size))
                # Keep the backup until the database commit succeeds. This
                # lets us restore the live path if SQLite fails after unlink.
                path.unlink()
            connection.executemany("DELETE FROM jobs WHERE id=?", [(row["id"],) for row in rows])
    except Exception as exc:
        for original, target, _ in reversed(backups):
            if target.exists():
                if not original.exists():
                    original.parent.mkdir(parents=True, exist_ok=True)
                    target.replace(original)
                else:
                    try:
                        target.unlink()
                    except OSError:
                        pass
        try:
            quarantine.rmdir()
        except OSError:
            pass
        if isinstance(exc, HTTPException):
            raise
        raise HTTPException(500, "删除任务失败，任务记录和音频均已保留") from exc

    # The database commit succeeded. Quarantined copies are now safe to purge;
    # a transient purge failure is retried by the next deletion.
    deleted_bytes = 0
    for _, target, size in backups:
        try:
            target.unlink(missing_ok=True)
            deleted_bytes += size
        except OSError:
            pass
    try:
        quarantine.rmdir()
        parent = quarantine.parent
        for stale in parent.glob("jobs_*"):
            if not stale.is_dir():
                continue
            for item in stale.iterdir():
                try:
                    item.unlink(missing_ok=True)
                except OSError:
                    pass
            if not any(stale.iterdir()):
                stale.rmdir()
        if not any(parent.iterdir()):
            parent.rmdir()
    except OSError:
        pass
    return len(rows), deleted_bytes


@router.get("/api/jobs")
def list_jobs(date: str | None = None, limit: int = 100):
    if date:
        try:
            datetime.strptime(date, "%Y-%m-%d")
        except ValueError as exc:
            raise HTTPException(400, "date 必须使用 YYYY-MM-DD 格式") from exc
    limit = max(1, min(limit, 500))
    with db() as connection:
        if date:
            rows = connection.execute(
                "SELECT * FROM jobs WHERE date(created_at, 'localtime')=? ORDER BY created_at DESC LIMIT ?",
                (date, limit),
            ).fetchall()
        else:
            rows = connection.execute("SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
    return [_job_response(row) for row in rows]


@router.get("/api/jobs/{job_id}/audio")
def download_job_audio(job_id: str):
    with db() as connection:
        row = connection.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    if not row:
        raise HTTPException(404, "任务不存在")
    path = _job_audio_path(row)
    media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return FileResponse(path, media_type=media_type, filename=f"voice-hub-{job_id}{path.suffix}")


@router.get("/api/jobs/{job_id}/text")
def download_job_text(job_id: str):
    with db() as connection:
        row = connection.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    if not row:
        raise HTTPException(404, "任务不存在")
    text = row["input_text"] or ""
    if not text:
        raise HTTPException(404, "该任务是历史旧记录，未保存原始文字")
    return Response(
        content=text,
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="voice-hub-{job_id}.txt"'},
    )


@router.post("/api/jobs/export")
def export_jobs(body: JobBatchBody):
    rows = _job_rows_for_batch(body)
    total_audio_bytes = sum(path.stat().st_size for row in rows if (path := _safe_existing_audio_path(row)) is not None)
    if total_audio_bytes > 512 * 1024 * 1024:
        raise HTTPException(413, "所选音频超过 512 MB，请分批导出")
    archive_dir = config.DATA / "archives"
    archive_dir.mkdir(parents=True, exist_ok=True)
    archive_fd, archive_name = tempfile.mkstemp(prefix="jobs-", suffix=".zip", dir=archive_dir)
    os.close(archive_fd)
    archive_path = Path(archive_name)
    manifest: list[dict[str, Any]] = []
    try:
        with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for row in rows:
                job_id = row["id"]
                text = row["input_text"] or ""
                audio_path = _safe_existing_audio_path(row)
                item = {
                    "id": job_id,
                    "model": row["model"],
                    "voice": row["voice"],
                    "status": row["status"],
                    "created_at": row["created_at"],
                    "text_file": f"text/{job_id}.txt" if text else None,
                    "audio_file": f"audio/{job_id}{audio_path.suffix}" if audio_path else None,
                }
                manifest.append(item)
                if text:
                    archive.writestr(f"text/{job_id}.txt", text)
                if audio_path:
                    archive.write(audio_path, f"audio/{job_id}{audio_path.suffix}")
            archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    except Exception:
        archive_path.unlink(missing_ok=True)
        raise
    return FileResponse(
        archive_path,
        media_type="application/zip",
        filename="voice-hub-jobs.zip",
        background=BackgroundTask(archive_path.unlink, missing_ok=True),
    )


@router.post("/api/jobs/delete")
def delete_jobs(body: JobBatchBody):
    rows = _job_rows_for_batch(body)
    deleted_count, deleted_bytes = _delete_job_rows(rows)
    return {"deleted": deleted_count, "freed_bytes": deleted_bytes, "message": f"已删除 {deleted_count} 条任务记录"}


@router.delete("/api/jobs/{job_id}")
def delete_job(job_id: str):
    rows = _job_rows_for_batch(JobBatchBody(job_ids=[job_id]))
    deleted_count, deleted_bytes = _delete_job_rows(rows)
    return {"deleted": deleted_count, "freed_bytes": deleted_bytes, "message": "任务记录与对应音频已删除"}
