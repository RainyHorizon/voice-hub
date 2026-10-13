import asyncio
import io
import json
import wave

import httpx
import pytest
from fastapi.testclient import TestClient

from app import config, plugins
from app.plugin_protocol import PluginCatalog, validate_endpoint
from app.providers.base import ProviderError, SynthesisRequest
from app.providers.external import ExternalProvider


@pytest.fixture
def registry(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "PLUGINS_DIR", tmp_path / "plugins")
    monkeypatch.setattr(config, "PLUGIN_STATE_PATH", tmp_path / "state.json")
    monkeypatch.setattr(plugins, "EXAMPLES", tmp_path / "examples")
    plugin_dir = config.PLUGINS_DIR / "test-tts"
    plugin_dir.mkdir(parents=True)
    (plugin_dir / plugins.PLUGIN_MANIFEST).write_text(json.dumps({
        "id": "test-tts", "name": "测试语音", "version": "1.0.0",
        "api_version": "1", "description": "测试插件", "author": "tests",
        "runtime": "external_http", "endpoint": "http://127.0.0.1:8790",
        "capabilities": ["synthesis", "voices"],
        "settings": [
            {"key": "default_voice", "label": "默认音色", "description": "测试音色",
             "type": "voice", "default": "zh-CN-XiaoxiaoNeural"},
            {"key": "pitch", "label": "音调", "description": "测试音调",
             "type": "integer", "default": 0, "minimum": -50, "maximum": 50},
            {"key": "volume", "label": "音量", "description": "测试音量",
             "type": "integer", "default": 0, "minimum": -100, "maximum": 100},
        ],
    }), encoding="utf-8")
    return tmp_path


@pytest.fixture
def catalog_transport(monkeypatch):
    original = httpx.Client
    def handle(request):
        if request.url.path == "/health":
            return httpx.Response(200, json={"id": "test-tts", "api_version": "1"})
        if request.url.path == "/models":
            return httpx.Response(200, json={"models": [{"id": "edge", "name": "Edge TTS", "languages": ["zh-CN"]}]})
        return httpx.Response(200, json={"voices": [{"id": "zh-CN-XiaoxiaoNeural", "name": "晓晓", "model": "edge", "languages": ["zh-CN"]}]})
    monkeypatch.setattr(plugins.httpx, "Client", lambda **kwargs: original(**kwargs, transport=httpx.MockTransport(handle)))


def test_lifecycle_config_and_scope(registry, catalog_transport):
    from app.services import resolve_model, resolve_voice
    assert plugins.plugin_models() == []
    enabled = plugins.set_plugin_enabled("test-tts", True)
    assert enabled["enabled"] and enabled["voice_count"] == 1
    model = resolve_model("plugin-test-tts/edge")
    voice = plugins.plugin_voices()[0]
    assert resolve_voice(voice["id"], model) == voice
    assert resolve_voice("voice_nova", model) is None
    from app.database import init_db
    init_db()
    assert resolve_voice(voice["id"], resolve_model("demo/local-demo")) is None
    plugins.update_plugin("test-tts", values={"pitch": 12, "volume": -20})
    saved = json.loads(config.PLUGIN_STATE_PATH.read_text())
    assert saved["test-tts"]["config"]["pitch"] == 12
    before = config.PLUGIN_STATE_PATH.read_bytes()
    with pytest.raises(ValueError):
        plugins.update_plugin("test-tts", values={"volume": 101})
    assert config.PLUGIN_STATE_PATH.read_bytes() == before
    plugins.set_plugin_enabled("test-tts", False)
    assert resolve_model("plugin-test-tts/edge") is None
    assert plugins.plugin_voices() == []
    plugins.uninstall_plugin("test-tts")
    assert plugins.list_plugins() == []
    assert (config.PLUGINS_DIR / ".removed-test-tts" / plugins.PLUGIN_MANIFEST).exists()


def test_failed_connection_does_not_enable(registry):
    with pytest.raises(ValueError):
        plugins.update_plugin("test-tts", values={"endpoint": "http://127.0.0.1:1"}, enabled=True)
    assert not config.PLUGIN_STATE_PATH.exists()
    assert plugins.list_plugins()[0]["enabled"] is False


@pytest.mark.parametrize("endpoint", ["https://example.com", "http://localhost:8790", "http://127.0.0.1", "http://127.0.0.1:8790?token=x", "http://user:pass@127.0.0.1:8790", "http://10.0.0.1:8790", None])
def test_endpoint_boundary(endpoint):
    with pytest.raises(ValueError):
        validate_endpoint(endpoint)


def test_bad_manifest_duplicate_and_corrupt_state(registry):
    source = config.PLUGINS_DIR / "test-tts" / plugins.PLUGIN_MANIFEST
    other = config.PLUGINS_DIR / "duplicate"
    other.mkdir()
    (other / plugins.PLUGIN_MANIFEST).write_bytes(source.read_bytes())
    assert all(p["status"] == "invalid" for p in plugins.list_plugins())
    config.PLUGIN_STATE_PATH.write_text("{broken")
    with pytest.raises(ValueError):
        plugins.set_plugin_enabled("test-tts", True)
    assert config.PLUGIN_STATE_PATH.read_text() == "{broken"


def test_catalog_rejects_unknown_voice_model():
    with pytest.raises(ValueError):
        PluginCatalog.model_validate({"models": [{"id": "one", "name": "One", "languages": ["zh"]}],
            "voices": [{"id": "a", "name": "A", "model": "other", "languages": ["zh"]}]})


def test_adapter_audio_validation_cleanup_and_settings(registry, catalog_transport, monkeypatch, tmp_path):
    plugins.set_plugin_enabled("test-tts", True)
    plugins.update_plugin("test-tts", values={"pitch": 9})
    adapter = ExternalProvider("test-tts")
    data = io.BytesIO()
    with wave.open(data, "wb") as audio:
        audio.setparams((1, 2, 24000, 0, "NONE", ""))
        audio.writeframes(b"\x01\x00" * 2400)
    original = httpx.AsyncClient
    def good(request):
        body = json.loads(request.content)
        assert body["model"] == "edge"
        assert body["config"]["pitch"] == 9
        assert "endpoint" not in body["config"]
        return httpx.Response(200, content=data.getvalue())
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original(**kwargs, transport=httpx.MockTransport(good)))
    output = tmp_path / "speech.wav"
    result = asyncio.run(adapter.synthesize(SynthesisRequest("plugin-test-tts/edge", "zh-CN-XiaoxiaoNeural", "测试"), output))
    assert result == {"duration_ms": 100, "demo": False}
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original(**kwargs, transport=httpx.MockTransport(lambda _: httpx.Response(200, content=b"invalid"))))
    with pytest.raises(ProviderError):
        asyncio.run(adapter.synthesize(SynthesisRequest("edge", "zh-CN-XiaoxiaoNeural", "测试"), output))
    assert not output.exists()


def test_management_routes(registry, catalog_transport):
    from fastapi import FastAPI
    from app.routers import plugins as plugin_router, voices as voice_router
    from app.database import init_db
    init_db()
    app = FastAPI()
    app.include_router(plugin_router.router)
    app.include_router(voice_router.router)
    with TestClient(app, base_url="http://test") as client:
        assert client.get("/api/plugins/market").json()["plugins"] == []
        assert client.post("/api/plugins/test-tts/check", json={"config": {}}).json()["voices"]
        assert client.get("/api/plugins").json()["plugins"][0]["enabled"] is False
        assert client.post("/api/plugins/test-tts/enable").status_code == 200
        assert client.put("/api/plugins/test-tts/config", json={"config": {"pitch": -9}}).json()["plugin"]["config"]["pitch"] == -9
        assert client.put("/api/plugins/test-tts/config", json={"config": {"unknown": "value"}}).status_code == 400
        assert client.post("/api/plugins/not-here/enable").status_code == 404
        assert any(m["provider"] == "plugin-test-tts" for m in client.get("/api/models").json())
        assert client.delete("/api/plugins/test-tts").status_code == 200


def test_gateway_generates_plugin_audio_and_retains_job_on_disable(registry, catalog_transport, monkeypatch):
    from fastapi import FastAPI
    from app.routers.gateway import router
    from app.database import init_db, db
    init_db()
    plugins.set_plugin_enabled("test-tts", True)
    audio = io.BytesIO()
    with wave.open(audio, "wb") as stream:
        stream.setparams((1, 2, 24000, 0, "NONE", ""))
        stream.writeframes(b"\x02\x00" * 4800)
    original = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original(**kwargs, transport=httpx.MockTransport(lambda _: httpx.Response(200, content=audio.getvalue()))))
    app = FastAPI()
    app.include_router(router)
    with TestClient(app, base_url="http://test") as client:
        response = client.post("/v1/audio/speech", headers={"Authorization": "Bearer unit-test-gateway-key"},
            json={"model": "plugin-test-tts/edge", "voice": plugins.plugin_voices()[0]["id"], "input": "测试插件语音", "response_format": "wav"})
        assert response.status_code == 200
        assert response.content.startswith(b"RIFF")
        assert response.headers["X-Voice-Hub-Mode"] == "provider"
        job_id = response.headers["X-Voice-Hub-Job"]
        plugins.set_plugin_enabled("test-tts", False)
        with db() as connection:
            row = connection.execute("SELECT duration_ms,demo FROM jobs WHERE id=?", (job_id,)).fetchone()
        assert row["duration_ms"] == 200 and row["demo"] == 0


def test_default_voice_validation_preserves_saved_config(registry, catalog_transport):
    plugins.set_plugin_enabled("test-tts", True)
    before = config.PLUGIN_STATE_PATH.read_bytes()
    with pytest.raises(ValueError):
        plugins.update_plugin("test-tts", values={"default_voice": "unknown"})
    assert config.PLUGIN_STATE_PATH.read_bytes() == before
