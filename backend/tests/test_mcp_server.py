import asyncio
import base64
import json
import uuid
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.responses import FileResponse
from fastapi.testclient import TestClient


def run_tool(name: str, arguments: dict):
    from app.mcp_server import mcp_server

    return asyncio.run(mcp_server.call_tool(name, arguments))


def test_mcp_http_initialize_tools_and_skill_extension():
    from app.main import app

    headers = {"accept": "application/json, text/event-stream", "content-type": "application/json"}
    with TestClient(app, base_url="http://127.0.0.1:8765") as client:
        initialize = client.post(
            "/mcp",
            headers=headers,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2025-11-25",
                    "capabilities": {},
                    "clientInfo": {"name": "voice-hub-tests", "version": "1.0"},
                },
            },
        )
        tools = client.post(
            "/mcp",
            headers=headers,
            json={"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
        )
        skills = client.post(
            "/mcp",
            headers=headers,
            json={"jsonrpc": "2.0", "id": 3, "method": "skills/list", "params": {}},
        )
        skill = client.post(
            "/mcp",
            headers=headers,
            json={
                "jsonrpc": "2.0",
                "id": 4,
                "method": "skills/get",
                "params": {"name": "voice-hub-tts"},
            },
        )
        skill_resource = client.post(
            "/mcp",
            headers=headers,
            json={
                "jsonrpc": "2.0",
                "id": 5,
                "method": "resources/read",
                "params": {"uri": "skill://voice-hub-tts/SKILL.md"},
            },
        )

    assert initialize.status_code == 200
    assert initialize.json()["result"]["serverInfo"]["name"] == "voice-hub"
    assert tools.status_code == 200
    listed = {item["name"]: item for item in tools.json()["result"]["tools"]}
    assert set(listed) == {
        "get_voice_hub_status",
        "list_tts_models",
        "list_voices",
        "create_speech",
        "list_recent_speech_jobs",
        "get_speech_job",
        "get_speech_audio",
    }
    assert listed["create_speech"]["annotations"] == {
        "title": "Create speech",
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": False,
        "openWorldHint": True,
    }
    assert skills.status_code == 200
    descriptor = skills.json()["result"]["skills"][0]
    assert descriptor["name"] == "voice-hub-tts"
    assert descriptor["uri"] == "skill://voice-hub-tts/SKILL.md"
    assert all(item["digest"].startswith("sha256:") for item in descriptor["resources"])
    assert skill.status_code == 200
    assert skill.json()["result"]["skill"] == descriptor
    assert skill_resource.status_code == 200
    resource_text = skill_resource.json()["result"]["contents"][0]["text"]
    assert "name: voice-hub-tts" in resource_text


def test_mcp_query_tools_return_models_and_compatible_voices():
    from app.database import init_db

    init_db()
    models = run_tool("list_tts_models", {})
    assert models.is_error is False
    assert {item["alias"] for item in models.structured_content["aliases"]} == {
        "tts-default",
        "tts-fast",
        "tts-hq",
    }

    voices = run_tool("list_voices", {"model": "tts-default"})
    assert voices.is_error is False
    assert voices.structured_content["resolved_model"] == "mimo/mimo-v2.5-tts"
    assert all(item["model_id"] == "mimo-v2.5-tts" for item in voices.structured_content["voices"])


def test_mcp_create_speech_returns_audio_without_server_path(tmp_path: Path):
    audio = tmp_path / "speech.mp3"
    audio.write_bytes(b"fake-mp3")
    response = FileResponse(
        audio,
        media_type="audio/mpeg",
        headers={"X-Voice-Hub-Job": "job_mcp_test"},
    )
    with patch("app.mcp_server.openai_speech", new=AsyncMock(return_value=response)) as synthesize:
        result = run_tool(
            "create_speech",
            {"text": "你好", "voice": "mimo-default", "model": "tts-default"},
        )

    assert result.is_error is False
    assert result.structured_content["job_id"] == "job_mcp_test"
    assert result.structured_content["resolved_model"] == "mimo/mimo-v2.5-tts"
    assert "audio_path" not in result.structured_content
    assert result.content[1].data == base64.b64encode(b"fake-mp3").decode("ascii")
    body = synthesize.await_args.args[0]
    assert body.input == "你好"
    assert body.voice == "mimo-default"


def test_mcp_job_audio_uses_size_limit_and_does_not_expose_paths(tmp_path: Path):
    from app import config
    from app.database import db, init_db, now

    init_db()
    job_id = "job_" + uuid.uuid4().hex[:12]
    audio = config.AUDIO / f"{job_id}.mp3"
    audio.parent.mkdir(parents=True, exist_ok=True)
    audio.write_bytes(b"saved-audio")
    with db() as connection:
        connection.execute(
            "INSERT INTO jobs (id,model,voice,input_chars,status,duration_ms,audio_path,created_at,source,demo,input_text) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (
                job_id,
                "mimo/mimo-v2.5-tts",
                "mimo-default",
                2,
                "completed",
                100,
                str(audio.relative_to(config.ROOT)),
                now(),
                "mcp-test",
                0,
                "你好",
            ),
        )

    metadata = run_tool("get_speech_job", {"job_id": job_id})
    assert metadata.is_error is False
    assert "audio_path" not in json.dumps(metadata.structured_content)

    downloaded = run_tool("get_speech_audio", {"job_id": job_id})
    assert downloaded.is_error is False
    assert downloaded.content[1].data == base64.b64encode(b"saved-audio").decode("ascii")

    with patch.object(config, "MCP_MAX_AUDIO_BYTES", 1):
        oversized = run_tool("get_speech_audio", {"job_id": job_id})
    assert oversized.is_error is True
    assert oversized.structured_content["error"]["code"] == "audio_too_large"
    assert oversized.structured_content["error"]["job_id"] == job_id
