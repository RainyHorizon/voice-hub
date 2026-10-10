from __future__ import annotations

from fastapi.testclient import TestClient


def test_webui_password_setup_login_change_and_logout(monkeypatch):
    from app import config
    from app.database import init_db
    from app.main import app

    monkeypatch.setattr(config, "AUTH_ENABLED", True)
    monkeypatch.setattr(config, "MCP_ENABLED", False)
    init_db()
    from app.database import db
    with db() as connection:
        connection.execute("DELETE FROM auth_sessions")
        connection.execute("DELETE FROM auth_config")
    with TestClient(app, base_url="http://127.0.0.1:8765") as client:
        status = client.get("/api/auth/status")
        assert status.status_code == 200
        assert status.json()["configured"] is False
        assert client.get("/api/models").status_code == 428
        assert client.get("/api/summary").status_code == 200
        assert client.get("/v1/models", headers={"Authorization": "Bearer unit-test-gateway-key"}).status_code == 200

        setup = client.post("/api/auth/setup", json={"password": "first-pass-123", "confirmation": "first-pass-123"})
        assert setup.status_code == 200
        assert client.get("/api/models").status_code == 200

        changed = client.post(
            "/api/auth/password",
            json={"current_password": "first-pass-123", "password": "second-pass-456", "confirmation": "second-pass-456"},
        )
        assert changed.status_code == 200
        client.post("/api/auth/logout")
        assert client.get("/api/models").status_code == 401
        assert client.post("/api/auth/login", json={"password": "second-pass-456", "confirmation": ""}).status_code == 200


def test_webui_password_rejects_short_and_mismatched_values(monkeypatch):
    from app import config
    from app.database import init_db
    from app.main import app

    monkeypatch.setattr(config, "AUTH_ENABLED", True)
    monkeypatch.setattr(config, "MCP_ENABLED", False)
    init_db()
    from app.database import db
    with db() as connection:
        connection.execute("DELETE FROM auth_sessions")
        connection.execute("DELETE FROM auth_config")
    with TestClient(app, base_url="http://127.0.0.1:8765") as client:
        assert client.post("/api/auth/setup", json={"password": "short", "confirmation": "short"}).status_code == 400
        assert client.post("/api/auth/setup", json={"password": "long-enough", "confirmation": "different"}).status_code == 400
