import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


class RuntimeDirectoryTests(unittest.TestCase):
    def test_legacy_logs_move_to_data_logs_without_overwriting(self):
        from app import config
        from app.runtime import prepare_runtime_directories

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = root / "data"
            logs = data / "logs"
            backend = root / "backend"
            backend.mkdir()
            data.mkdir()
            (backend / "server.log").write_text("backend log", encoding="utf-8")
            (data / "server.stdout.log").write_text("data log", encoding="utf-8")
            logs.mkdir()
            (logs / "server.log").write_text("existing log", encoding="utf-8")

            with patch.object(config, "ROOT", root), \
                 patch.object(config, "DATA", data), \
                 patch.object(config, "AUDIO", data / "audio"), \
                 patch.object(config, "LOGS", logs):
                moved = prepare_runtime_directories()

            self.assertEqual(len(moved), 2)
            self.assertEqual((logs / "server.log").read_text(encoding="utf-8"), "existing log")
            self.assertEqual((logs / "server.stdout.log").read_text(encoding="utf-8"), "data log")
            archived = list(logs.glob("server.legacy-*.log"))
            self.assertEqual(len(archived), 1)
            self.assertEqual(archived[0].read_text(encoding="utf-8"), "backend log")
            self.assertTrue((data / "audio").is_dir())
            self.assertFalse((backend / "server.log").exists())


if __name__ == "__main__":
    unittest.main()
