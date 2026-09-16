import asyncio
import sqlite3
import tempfile
import unittest
from contextlib import ExitStack, contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import httpx


@contextmanager
def isolated_storage(main):
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        values = {
            "ROOT": root,
            "DATA": root / "data",
            "AUDIO": root / "data" / "audio",
            "DB_PATH": root / "data" / "voice_studio.db",
            "FRONTEND_DIST": root / "frontend" / "dist",
            "GATEWAY_CONFIG_PATH": root / "data" / "gateway.json",
        }
        with ExitStack() as stack:
            for name, value in values.items():
                stack.enter_context(patch.object(main.config, name, value))
                if hasattr(main, name):
                    stack.enter_context(patch.object(main, name, value))
            main.init_db()
            yield


def add_job(main, job_id: str, created_at: datetime, size: int) -> Path:
    main.AUDIO.mkdir(parents=True, exist_ok=True)
    audio_path = main.AUDIO / f"{job_id}.wav"
    audio_path.write_bytes(b"a" * size)
    with main.db() as connection:
        connection.execute(
            """
            INSERT INTO jobs
              (id, model, voice, input_chars, status, duration_ms, audio_path, created_at, source, demo, input_text)
            VALUES (?, 'test-model', 'test-voice', 4, 'completed', 1000, ?, ?, 'test', 1, ?)
            """,
            (job_id, str(audio_path), created_at.isoformat(), f"文字-{job_id}"),
        )
    return audio_path


class StoragePolicyTests(unittest.TestCase):
    def test_snapshot_ignores_file_removed_during_scan(self):
        from app import main
        from app import storage

        with isolated_storage(main):
            audio = add_job(main, "job_race", datetime.now(timezone.utc), 128)
            def disappearing_safe_path(*_args):
                return audio

            original_stat = Path.stat

            def disappearing_stat(path, *args, **kwargs):
                if path == audio:
                    audio.unlink(missing_ok=True)
                    raise FileNotFoundError(path)
                return original_stat(path, *args, **kwargs)

            with patch.object(storage, "safe_audio_path", side_effect=disappearing_safe_path), \
                 patch.object(Path, "stat", disappearing_stat):
                with main.db() as connection:
                    snapshot = storage.storage_snapshot(connection, main.ROOT, main.AUDIO)
            self.assertEqual(snapshot["usage"]["audio_count"], 0)

    def test_default_policy_and_update_endpoint(self):
        from app import main

        async def run():
            transport = httpx.ASGITransport(app=main.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                status = await client.get("/api/storage")
                self.assertEqual(status.status_code, 200)
                self.assertFalse(status.json()["policy"]["automatic_enabled"])
                self.assertEqual(status.json()["policy"]["retention_days"], 30)

                updated = await client.put(
                    "/api/storage/policy",
                    json={
                        "automatic_enabled": True,
                        "retention_days": 45,
                        "capacity_limit_bytes": 1024 * 1024 * 1024,
                        "interval": "weekly",
                        "cleanup_scope": "audio_only",
                    },
                )
                self.assertEqual(updated.status_code, 200)
                self.assertTrue(updated.json()["policy"]["automatic_enabled"])
                self.assertEqual(updated.json()["policy"]["retention_days"], 45)
                self.assertEqual(updated.json()["policy"]["interval"], "weekly")

        with isolated_storage(main):
            asyncio.run(run())

    def test_manual_cleanup_preserves_job_text_by_default(self):
        from app import main

        async def run():
            old_audio = add_job(main, "job_old", datetime.now(timezone.utc) - timedelta(days=40), 2048)
            recent_audio = add_job(main, "job_recent", datetime.now(timezone.utc) - timedelta(days=2), 1024)
            transport = httpx.ASGITransport(app=main.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                preview = await client.post("/api/storage/cleanup/preview")
                self.assertEqual(preview.status_code, 200)
                self.assertEqual(preview.json()["file_count"], 1)
                self.assertEqual(preview.json()["jobs_preserved"], 1)

                cleaned = await client.post("/api/storage/cleanup")
                self.assertEqual(cleaned.status_code, 200)
                self.assertEqual(cleaned.json()["result"]["files_removed"], 1)
                self.assertEqual(cleaned.json()["result"]["jobs_preserved"], 1)
                self.assertFalse(old_audio.exists())
                self.assertTrue(recent_audio.exists())

                jobs = (await client.get("/api/jobs?limit=500")).json()
                old_job = next(item for item in jobs if item["id"] == "job_old")
                self.assertFalse(old_job["audio_available"])
                self.assertIsNone(old_job["audio_url"])
                self.assertIsNotNone(old_job["audio_cleaned_at"])
                self.assertEqual(old_job["input_text"], "文字-job_old")
                text = await client.get(old_job["text_url"])
                self.assertEqual(text.text, "文字-job_old")

        with isolated_storage(main):
            asyncio.run(run())

    def test_capacity_cleanup_removes_oldest_audio_first(self):
        from app import main

        current = datetime.now(timezone.utc)
        with isolated_storage(main):
            old_audio = add_job(main, "job_larger_old", current - timedelta(days=3), 70 * 1024 * 1024)
            recent_audio = add_job(main, "job_larger_recent", current - timedelta(days=2), 70 * 1024 * 1024)
            with main.db() as connection:
                main.write_policy(
                    connection,
                    {
                        "automatic_enabled": False,
                        "retention_days": 365,
                        "capacity_limit_bytes": 100 * 1024 * 1024,
                        "interval": "daily",
                        "cleanup_scope": "audio_only",
                    },
                )
                plan = main.build_cleanup_plan(connection, main.ROOT, main.AUDIO)
                self.assertEqual(plan["file_count"], 1)
                self.assertEqual(plan["affected_job_ids"], ["job_larger_old"])
                result = main.execute_cleanup(
                    connection,
                    main.ROOT,
                    main.AUDIO,
                    trigger="manual",
                    run_id="cleanup_capacity_test",
                    current_time=current,
                )
            self.assertEqual(result["files_removed"], 1)
            self.assertFalse(old_audio.exists())
            self.assertTrue(recent_audio.exists())

    def test_jobs_scope_removes_expired_task_rows(self):
        from app import main

        with isolated_storage(main):
            add_job(main, "job_expired", datetime.now(timezone.utc) - timedelta(days=60), 512)
            with main.db() as connection:
                main.write_policy(
                    connection,
                    {
                        "automatic_enabled": False,
                        "retention_days": 30,
                        "capacity_limit_bytes": 1024 * 1024 * 1024,
                        "interval": "daily",
                        "cleanup_scope": "jobs",
                    },
                )
                result = main.execute_cleanup(
                    connection,
                    main.ROOT,
                    main.AUDIO,
                    trigger="manual",
                    run_id="cleanup_jobs_test",
                )
                row = connection.execute("SELECT 1 FROM jobs WHERE id='job_expired'").fetchone()
            self.assertEqual(result["jobs_removed"], 1)
            self.assertIsNone(row)

    def test_cleanup_restores_audio_when_database_update_fails(self):
        from app import main

        class FailingConnection:
            def __init__(self, connection):
                self.connection = connection

            def __getattr__(self, name):
                return getattr(self.connection, name)

            def execute(self, sql, parameters=()):
                if "INSERT INTO storage_cleanup_runs" in sql:
                    raise sqlite3.OperationalError("simulated database failure")
                return self.connection.execute(sql, parameters)

        with isolated_storage(main):
            old_audio = add_job(main, "job_restore", datetime.now(timezone.utc) - timedelta(days=60), 512)
            with self.assertRaisesRegex(sqlite3.OperationalError, "simulated"):
                with main.db() as connection:
                    main.execute_cleanup(
                        FailingConnection(connection),
                        main.ROOT,
                        main.AUDIO,
                        trigger="manual",
                        run_id="cleanup_restore_test",
                    )
            self.assertTrue(old_audio.is_file())
            with main.db() as connection:
                job = connection.execute("SELECT audio_path FROM jobs WHERE id='job_restore'").fetchone()
                run = connection.execute("SELECT 1 FROM storage_cleanup_runs WHERE id='cleanup_restore_test'").fetchone()
            self.assertEqual(job["audio_path"], str(old_audio))
            self.assertIsNone(run)

    def test_automatic_cleanup_runs_only_when_due(self):
        from app import main

        with isolated_storage(main):
            add_job(main, "job_auto", datetime.now(timezone.utc) - timedelta(days=45), 1024)
            with main.db() as connection:
                main.write_policy(
                    connection,
                    {
                        "automatic_enabled": True,
                        "retention_days": 30,
                        "capacity_limit_bytes": 1024 * 1024 * 1024,
                        "interval": "daily",
                        "cleanup_scope": "audio_only",
                    },
                )
                self.assertTrue(main.automatic_cleanup_due(connection))
                result = main.execute_cleanup(
                    connection,
                    main.ROOT,
                    main.AUDIO,
                    trigger="automatic",
                    run_id="cleanup_auto_test",
                )
                self.assertEqual(result["files_removed"], 1)
                self.assertFalse(main.automatic_cleanup_due(connection))


if __name__ == "__main__":
    unittest.main()
