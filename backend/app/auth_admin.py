"""Server-side password management for Voice Hub.

Run from the ``backend`` directory:

    python -m app.auth_admin reset

The password is read interactively and is never placed in a command line or
environment variable. This is the recovery path when the WebUI password is
forgotten.
"""
from __future__ import annotations

import argparse
import getpass
import sys

from .auth import PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, hash_password, validate_password_pair
from .database import db, init_db, now


def reset_password() -> int:
    first = getpass.getpass("新的 Voice Hub 管理密码：")
    second = getpass.getpass("再次输入管理密码：")
    error = validate_password_pair(first, second)
    if error:
        print(error, file=sys.stderr)
        return 2
    with db() as connection:
        timestamp = now()
        connection.execute(
            """INSERT INTO auth_config (id,password_hash,created_at,updated_at) VALUES (1,?,?,?)
               ON CONFLICT(id) DO UPDATE SET password_hash=excluded.password_hash,
               updated_at=excluded.updated_at""",
            (hash_password(first), timestamp, timestamp),
        )
        connection.execute("DELETE FROM auth_sessions")
    print("Voice Hub 管理密码已重置。")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Voice Hub 服务端密码管理")
    subparsers = parser.add_subparsers(dest="command", required=True)
    reset = subparsers.add_parser("reset", help="交互式重置 WebUI 管理密码")
    reset.set_defaults(handler=reset_password)
    args = parser.parse_args(argv)
    if args.command == "reset":
        init_db()
        return int(args.handler())
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
