import sqlite3
import unittest
from unittest.mock import patch


class AccountCredentialConsistencyTests(unittest.TestCase):
    def setUp(self):
        from app.database import init_db

        init_db()

    def test_create_rolls_back_new_credentials_when_database_insert_fails(self):
        from app.routers import accounts
        from app.schemas import ProviderAccountBody

        body = ProviderAccountBody(
            provider="mimo",
            display_name="MiMo",
            api_key="test-secret",
        )
        with patch.object(accounts.uuid, "uuid4") as uuid4, \
             patch.object(accounts, "save_provider_credentials") as save_credentials, \
             patch.object(accounts, "replace_provider_credentials") as replace_credentials, \
             patch.object(accounts, "db", side_effect=sqlite3.OperationalError("database unavailable")):
            uuid4.return_value.hex = "abcdef1234567890"
            with self.assertRaises(sqlite3.OperationalError):
                accounts.create_provider_account(body)

        save_credentials.assert_called_once()
        replace_credentials.assert_called_once_with("pa_abcdef123456", {})

    def test_update_restores_old_credentials_when_database_update_fails(self):
        from app import database
        from app.routers import accounts
        from app.schemas import ProviderAccountBody

        account_id = "pa_update_rollback"
        with database.db() as connection:
            timestamp = database.now()
            connection.execute(
                "INSERT INTO provider_accounts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (account_id, "mimo", "MiMo", None, None, None, "active", "••••-old", "", "", timestamp, timestamp, timestamp),
            )

        real_db = accounts.db
        calls = 0

        def fail_second_db():
            nonlocal calls
            calls += 1
            if calls == 1:
                return real_db()
            raise sqlite3.OperationalError("database unavailable")

        body = ProviderAccountBody(
            provider="mimo",
            display_name="MiMo Updated",
            api_key="new-secret",
        )
        old_credentials = {"api_key": "old-secret"}
        with patch.object(accounts, "db", side_effect=fail_second_db), \
             patch.object(accounts, "load_provider_credentials", return_value=old_credentials), \
             patch.object(accounts, "save_provider_credentials") as save_credentials, \
             patch.object(accounts, "replace_provider_credentials") as replace_credentials:
            with self.assertRaises(sqlite3.OperationalError):
                accounts.update_provider_account(account_id, body)

        save_credentials.assert_called_once_with(account_id, api_key="new-secret")
        replace_credentials.assert_called_once_with(account_id, old_credentials)

    def test_update_cannot_change_account_provider(self):
        from app import database
        from app.routers import accounts
        from app.schemas import ProviderAccountBody

        account_id = "pa_provider_immutable"
        with database.db() as connection:
            timestamp = database.now()
            connection.execute(
                "INSERT INTO provider_accounts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (account_id, "mimo", "MiMo", None, None, None, "active", "••••old", "", "", timestamp, timestamp, timestamp),
            )

        body = ProviderAccountBody(provider="minimax", display_name="MiniMax", api_key="new-secret")
        with patch.object(accounts, "save_provider_credentials") as save_credentials:
            with self.assertRaisesRegex(Exception, "厂商不能修改"):
                accounts.update_provider_account(account_id, body)
        save_credentials.assert_not_called()

    def test_delete_restores_account_and_project_credentials_when_database_delete_fails(self):
        from app import database
        from app.routers import accounts

        account_id = "pa_delete_rollback"
        project_name = "project-one"
        with database.db() as connection:
            timestamp = database.now()
            connection.execute(
                "INSERT INTO provider_accounts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (account_id, "volcengine", "Volcengine", project_name, None, None, "active", "••••base", "", "", timestamp, timestamp, timestamp),
            )
            connection.execute(
                """INSERT INTO provider_projects
                   (id,provider_account_id,project_name,display_name,status,has_permission,source,created_at,updated_at,last_synced_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                ("pp_delete_rollback", account_id, project_name, "Project One", "active", 1, "manual", timestamp, timestamp, timestamp),
            )

        real_db = accounts.db
        calls = 0

        def fail_third_db():
            nonlocal calls
            calls += 1
            if calls <= 2:
                return real_db()
            raise sqlite3.OperationalError("database unavailable")

        account_credentials = {"api_key": "base-secret"}
        with patch.object(accounts, "db", side_effect=fail_third_db), \
             patch.object(accounts, "load_provider_credentials", return_value=account_credentials), \
             patch.object(accounts, "load_project_api_key", return_value="project-secret"), \
             patch.object(accounts, "delete_project_api_key"), \
             patch.object(accounts, "delete_api_key"), \
             patch.object(accounts, "replace_provider_credentials") as replace_credentials, \
             patch.object(accounts, "save_project_api_key") as save_project_key:
            with self.assertRaises(sqlite3.OperationalError):
                accounts.remove_provider_account(account_id)

        replace_credentials.assert_called_once_with(account_id, account_credentials)
        save_project_key.assert_called_once_with(account_id, project_name, "project-secret")


if __name__ == "__main__":
    unittest.main()
