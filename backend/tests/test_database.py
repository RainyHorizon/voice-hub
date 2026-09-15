import hashlib
import unittest


class DatabaseInitializationTests(unittest.TestCase):
    def test_repeated_initialization_does_not_rewrite_database(self):
        from app import config
        from app.database import init_db

        init_db()
        before = hashlib.sha256(config.DB_PATH.read_bytes()).digest()
        init_db()
        after = hashlib.sha256(config.DB_PATH.read_bytes()).digest()

        self.assertEqual(after, before)


if __name__ == "__main__":
    unittest.main()
