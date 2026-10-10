"""Single-user WebUI password authentication.

The password protects the management WebUI/API. OpenAI-compatible ``/v1``
clients continue to authenticate with the Gateway Key, so adding a WebUI
password does not break CLI or SDK integrations.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from datetime import datetime, timezone
from typing import Any

from . import config

PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 256
SESSION_COOKIE = "voice_hub_session"
SESSION_TTL_SECONDS = max(3600, config.AUTH_SESSION_DAYS * 24 * 60 * 60)
PBKDF2_ITERATIONS = 600_000


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_auth_schema(connection: Any) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS auth_config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS auth_sessions (
            token_hash TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            last_seen_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at
            ON auth_sessions(expires_at);
        """
    )
    connection.execute("DELETE FROM auth_sessions WHERE expires_at <= ?", (int(time.time()),))


def password_configured(connection: Any) -> bool:
    return connection.execute("SELECT 1 FROM auth_config WHERE id=1").fetchone() is not None


def _password_hash(password: str, salt: bytes, iterations: int = PBKDF2_ITERATIONS) -> str:
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${digest.hex()}"


def hash_password(password: str) -> str:
    return _password_hash(password, secrets.token_bytes(16))


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations_text, salt_hex, digest_hex = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iterations_text)
        if iterations < 100_000 or iterations > 2_000_000:
            return False
        expected = bytes.fromhex(digest_hex)
        actual = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), iterations
        )
        return hmac.compare_digest(actual, expected)
    except (TypeError, ValueError):
        return False


def save_password(connection: Any, password: str) -> None:
    timestamp = now()
    connection.execute(
        """INSERT INTO auth_config (id,password_hash,created_at,updated_at)
           VALUES (1,?,?,?)
           ON CONFLICT(id) DO UPDATE SET password_hash=excluded.password_hash,
           updated_at=excluded.updated_at""",
        (hash_password(password), timestamp, timestamp),
    )
    connection.execute("DELETE FROM auth_sessions")


def check_password(connection: Any, password: str) -> bool:
    row = connection.execute("SELECT password_hash FROM auth_config WHERE id=1").fetchone()
    return bool(row and verify_password(password, str(row["password_hash"])))


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(connection: Any) -> tuple[str, int]:
    token = secrets.token_urlsafe(32)
    expires_at = int(time.time()) + SESSION_TTL_SECONDS
    connection.execute(
        "INSERT INTO auth_sessions (token_hash,created_at,expires_at,last_seen_at) VALUES (?,?,?,?)",
        (_token_hash(token), now(), expires_at, now()),
    )
    return token, expires_at


def valid_session(connection: Any, token: str | None) -> bool:
    if not token:
        return False
    current = int(time.time())
    row = connection.execute(
        "SELECT expires_at FROM auth_sessions WHERE token_hash=?", (_token_hash(token),)
    ).fetchone()
    if not row or int(row["expires_at"]) <= current:
        if row:
            connection.execute("DELETE FROM auth_sessions WHERE token_hash=?", (_token_hash(token),))
        return False
    connection.execute(
        "UPDATE auth_sessions SET last_seen_at=? WHERE token_hash=?", (now(), _token_hash(token))
    )
    return True


def revoke_session(connection: Any, token: str | None) -> None:
    if token:
        connection.execute("DELETE FROM auth_sessions WHERE token_hash=?", (_token_hash(token),))


def request_authenticated(request: Any) -> bool:
    if not config.AUTH_ENABLED:
        return True
    from .database import db

    with db() as connection:
        return valid_session(connection, request.cookies.get(SESSION_COOKIE))


def validate_password_pair(password: str, confirmation: str) -> str | None:
    if not isinstance(password, str) or len(password) < PASSWORD_MIN_LENGTH:
        return f"密码至少需要 {PASSWORD_MIN_LENGTH} 个字符。"
    if len(password) > PASSWORD_MAX_LENGTH:
        return f"密码不能超过 {PASSWORD_MAX_LENGTH} 个字符。"
    if password != confirmation:
        return "两次输入的密码不一致。"
    return None
