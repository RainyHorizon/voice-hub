"""CI-only smoke test for the operating system's real desktop keyring."""
from __future__ import annotations

import secrets
import uuid

from app.credentials import credential_store_status, delete_api_key, load_api_key, save_api_key


def main() -> None:
    status = credential_store_status()
    if not status["available"]:
        raise RuntimeError(str(status["message"]))
    account_id = "ci_keyring_" + uuid.uuid4().hex
    api_key = "ci-" + secrets.token_urlsafe(24)
    try:
        save_api_key(account_id, api_key)
        if load_api_key(account_id) != api_key:
            raise RuntimeError("系统密钥环写入后无法读回同一凭据")
    finally:
        delete_api_key(account_id)
    if load_api_key(account_id) is not None:
        raise RuntimeError("系统密钥环中的临时凭据未被删除")
    print(f"System keyring smoke test passed: {status['backend']}")


if __name__ == "__main__":
    main()
