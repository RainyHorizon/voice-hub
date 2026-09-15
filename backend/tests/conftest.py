"""Global safety rails for the backend unit-test suite."""
from __future__ import annotations

import atexit
import ipaddress
import os
import socket
import tempfile
from pathlib import Path

import pytest


_TEST_ROOT = tempfile.TemporaryDirectory(prefix="voice-studio-tests-")
atexit.register(_TEST_ROOT.cleanup)

# Configure isolation before pytest imports any application modules.
os.environ["VOICE_STUDIO_ROOT"] = _TEST_ROOT.name
os.environ["VOICE_STUDIO_CREDENTIALS_MODE"] = "env"
os.environ["VOICE_STUDIO_GATEWAY_KEY"] = "unit-test-gateway-key"
for name in (
    "VOICE_STUDIO_DASHSCOPE_API_KEY",
    "VOICE_STUDIO_VOLCENGINE_API_KEY",
    "VOICE_STUDIO_VOLCENGINE_OPENAPI_ACCESS_KEY",
    "VOICE_STUDIO_VOLCENGINE_OPENAPI_SECRET_KEY",
    "VOICE_STUDIO_VOLCENGINE_PROJECT_NAME",
    "VOICE_STUDIO_MINIMAX_API_KEY",
    "VOICE_STUDIO_MIMO_API_KEY",
):
    os.environ.pop(name, None)


@pytest.fixture(scope="session", autouse=True)
def assert_isolated_application_root():
    from app import config

    root = Path(config.ROOT).resolve()
    expected = Path(_TEST_ROOT.name).resolve()
    if root != expected:
        raise RuntimeError(f"Tests must use the isolated root, got: {root}")
    yield


@pytest.fixture(autouse=True)
def block_external_network(monkeypatch):
    """Fail closed if a unit test accidentally reaches a real provider."""

    original_connect = socket.socket.connect

    def guarded_connect(sock, address):
        host = address[0] if isinstance(address, tuple) else str(address)
        try:
            allowed = ipaddress.ip_address(host).is_loopback
        except ValueError:
            allowed = host.lower() == "localhost"
        if not allowed:
            raise RuntimeError(f"External network access is disabled in unit tests: {host}")
        return original_connect(sock, address)

    monkeypatch.setattr(socket.socket, "connect", guarded_connect)
