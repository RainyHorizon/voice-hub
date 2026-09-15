"""Runtime directory setup and migration of files created by older launchers."""
from __future__ import annotations

from pathlib import Path

from . import config


def _legacy_log_paths() -> tuple[Path, ...]:
    return (
        config.ROOT / "backend" / "server.log",
        config.ROOT / "backend" / "server-error.log",
        config.DATA / "server.stdout.log",
        config.DATA / "server.stderr.log",
        config.DATA / "voice-studio.stdout.log",
        config.DATA / "voice-studio.stderr.log",
        config.DATA / "voice-studio.runtime.stdout.log",
        config.DATA / "voice-studio.runtime.stderr.log",
    )


def _available_log_target(source: Path) -> Path:
    target = config.LOGS / source.name
    if not target.exists():
        return target
    stamp = source.stat().st_mtime_ns
    target = config.LOGS / f"{source.stem}.legacy-{stamp}{source.suffix}"
    index = 1
    while target.exists():
        target = config.LOGS / f"{source.stem}.legacy-{stamp}-{index}{source.suffix}"
        index += 1
    return target


def prepare_runtime_directories() -> list[tuple[Path, Path]]:
    """Create data directories and move known legacy logs without overwriting."""
    config.AUDIO.mkdir(parents=True, exist_ok=True)
    config.LOGS.mkdir(parents=True, exist_ok=True)
    moved: list[tuple[Path, Path]] = []
    for source in _legacy_log_paths():
        if not source.is_file():
            continue
        target = _available_log_target(source)
        try:
            source.replace(target)
        except OSError:
            # A read-only legacy install should still be able to start using its data directory.
            continue
        moved.append((source, target))
    return moved
