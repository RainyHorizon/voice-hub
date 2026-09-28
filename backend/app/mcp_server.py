"""Voice Hub MCP server and agent-facing TTS tools.

The MCP endpoint is mounted into the existing FastAPI process at ``/mcp``.
It intentionally exposes only synthesis and read-only discovery/history tools;
provider credentials, account management, deletion and voice mutation remain
available only through the local WebUI and REST API.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import mimetypes
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml
from fastapi.responses import FileResponse, JSONResponse
from mcp.server.context import HandlerResult, ServerRequestContext
from mcp.server.extension import Extension, MethodBinding
from mcp.server.mcpserver import MCPServer
from mcp_types import (
    AudioContent,
    CallToolResult,
    PaginatedRequestParams,
    RequestParams,
    TextContent,
    ToolAnnotations,
)
from pydantic import Field

from . import config
from .database import db
from .routers.gateway import gateway_aliases, openai_speech
from .routers.jobs import _job_audio_path, _job_response
from .routers.voices import list_voices as list_voice_records
from .schemas import SynthesisBody
from .services import available_models, openai_model_item, resolve_model

SKILL_NAME = "voice-hub-tts"
SKILL_URI = f"skill://{SKILL_NAME}/SKILL.md"
CLI_REFERENCE_URI = f"skill://{SKILL_NAME}/references/cli.md"
_runtime_skill_directory = config.ROOT / "skills" / SKILL_NAME
_source_skill_directory = Path(__file__).resolve().parents[2] / "skills" / SKILL_NAME
SKILL_DIRECTORY = (
    _runtime_skill_directory if _runtime_skill_directory.is_dir() else _source_skill_directory
)


class SkillsListParams(PaginatedRequestParams):
    """Pagination is accepted for extension compatibility; one skill is returned."""


class SkillsGetParams(RequestParams):
    name: str = Field(min_length=1, max_length=128)


@dataclass(frozen=True)
class SkillResource:
    uri: str
    name: str
    path: Path
    mime_type: str = "text/markdown"

    def descriptor(self) -> dict[str, Any]:
        content = self.path.read_bytes()
        return {
            "uri": self.uri,
            "name": self.name,
            "mimeType": self.mime_type,
            "digest": "sha256:" + hashlib.sha256(content).hexdigest(),
            "size": len(content),
        }


def _skill_resources() -> list[SkillResource]:
    return [
        SkillResource(SKILL_URI, "SKILL.md", SKILL_DIRECTORY / "SKILL.md"),
        SkillResource(CLI_REFERENCE_URI, "references/cli.md", SKILL_DIRECTORY / "references" / "cli.md"),
    ]


def _skill_frontmatter() -> dict[str, str]:
    path = SKILL_DIRECTORY / "SKILL.md"
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise RuntimeError("Voice Hub Skill 缺少 YAML frontmatter")
    _, frontmatter, _ = text.split("---", 2)
    parsed = yaml.safe_load(frontmatter) or {}
    name = str(parsed.get("name") or "").strip()
    description = str(parsed.get("description") or "").strip()
    if name != SKILL_NAME or not description:
        raise RuntimeError("Voice Hub Skill 的 name 或 description 无效")
    return {"name": name, "description": description}


def skill_descriptor() -> dict[str, Any]:
    metadata = _skill_frontmatter()
    return {
        "name": metadata["name"],
        "description": metadata["description"],
        "uri": SKILL_URI,
        "version": config.APP_VERSION,
        "resources": [resource.descriptor() for resource in _skill_resources()],
    }


class VoiceHubSkillsExtension(Extension):
    """Serve the bundled Agent Skill through the standard MCP skills extension."""

    identifier = "io.modelcontextprotocol/skills"

    def settings(self) -> dict[str, Any]:
        return {}

    def methods(self) -> tuple[MethodBinding, ...]:
        async def list_skills(
            _ctx: ServerRequestContext[Any, Any], _params: SkillsListParams
        ) -> HandlerResult:
            return {"skills": [skill_descriptor()]}

        async def get_skill(
            _ctx: ServerRequestContext[Any, Any], params: SkillsGetParams
        ) -> HandlerResult:
            if params.name != SKILL_NAME:
                return {"skill": None}
            return {"skill": skill_descriptor()}

        return (
            MethodBinding("skills/list", SkillsListParams, list_skills),
            MethodBinding("skills/get", SkillsGetParams, get_skill),
        )


def _read_only_annotations(title: str) -> ToolAnnotations:
    return ToolAnnotations(
        title=title,
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    )


def _tool_error(
    message: str,
    *,
    code: str = "voice_hub_error",
    details: dict[str, Any] | None = None,
) -> CallToolResult:
    structured = {"ok": False, "error": {"code": code, "message": message}}
    if details:
        structured["error"].update(details)
    return CallToolResult(
        content=[TextContent(text=message)],
        structuredContent=structured,
        isError=True,
    )


def _job_row(job_id: str):
    with db() as connection:
        return connection.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()


def _public_job(row) -> dict[str, Any]:
    item = _job_response(row)
    return {
        "id": item["id"],
        "model": item["model"],
        "voice": item["voice"],
        "status": item["status"],
        "input_chars": item["input_chars"],
        "input_text": item["input_text"],
        "duration_ms": item["duration_ms"],
        "created_at": item["created_at"],
        "source": item["source"],
        "audio_available": item["audio_available"],
    }


def _compatible_voice(voice: dict[str, Any], model) -> bool:
    if voice.get("provider") != model.provider:
        return False
    if model.provider == "minimax":
        return True
    return voice.get("model_id") == model.model_id


def _audio_result(
    path: Path,
    metadata: dict[str, Any],
    *,
    success_text: str,
    oversize_is_error: bool = True,
) -> CallToolResult:
    size = path.stat().st_size
    structured = {**metadata, "audio_bytes": size, "audio_included": False}
    if size > config.MCP_MAX_AUDIO_BYTES:
        limit_mb = config.MCP_MAX_AUDIO_BYTES / (1024 * 1024)
        message = (
            f"音频已生成，但大小为 {size} 字节，超过 MCP 返回上限 {limit_mb:.0f} MB。"
            "请使用 Voice Hub CLI 的 download 命令或 WebUI 下载该任务音频。"
        )
        details = {
            key: value for key, value in structured.items() if key != "ok"
        }
        details["suggested_action"] = "download_with_cli_or_webui"
        if oversize_is_error:
            return _tool_error(message, code="audio_too_large", details=details)
        return CallToolResult(
            content=[TextContent(text=message)],
            structuredContent={
                **structured,
                "ok": True,
                "delivery_status": "audio_too_large",
                "suggested_action": "download_with_cli_or_webui",
            },
        )
    mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    audio = base64.b64encode(path.read_bytes()).decode("ascii")
    structured["audio_included"] = True
    structured["mime_type"] = mime_type
    return CallToolResult(
        content=[TextContent(text=success_text), AudioContent(data=audio, mimeType=mime_type)],
        structuredContent=structured,
    )


def create_mcp_server() -> MCPServer:
    instructions = (
        "Voice Hub 通过远程语音厂商生成语音，调用 create_speech 可能产生费用。"
        "只有在用户明确要求生成时才调用；不要猜测音色 ID，应先调用 list_tts_models 和 list_voices。"
        "默认使用 tts-default，速度优先用 tts-fast，质量优先用 tts-hq。"
        "不要索取、显示或返回任何厂商 API Key。"
    )
    server = MCPServer(
        name="voice-hub",
        title="Voice Hub TTS",
        description="Query Voice Hub models and voices, generate speech, and retrieve recent audio.",
        instructions=instructions,
        version=config.APP_VERSION,
        extensions=[VoiceHubSkillsExtension()],
    )

    for resource in _skill_resources():
        if not resource.path.is_file():
            continue

        def make_reader(path: Path):
            def read_resource() -> str:
                return path.read_text(encoding="utf-8")

            return read_resource

        server.resource(
            resource.uri,
            name=resource.name,
            title=f"Voice Hub TTS · {resource.name}",
            description="Bundled Voice Hub Agent Skill resource.",
            mime_type=resource.mime_type,
        )(make_reader(resource.path))

    @server.tool(
        title="Get Voice Hub status",
        description="Check the local Voice Hub version and whether models, voices and provider accounts are available.",
        annotations=_read_only_annotations("Get Voice Hub status"),
    )
    def get_voice_hub_status() -> dict[str, Any]:
        with db() as connection:
            voice_count = connection.execute("SELECT COUNT(*) FROM voices WHERE status='active'").fetchone()[0]
            job_count = connection.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
            accounts = connection.execute(
                "SELECT provider, COUNT(*) AS count FROM provider_accounts "
                "WHERE status IN ('active','configured') GROUP BY provider"
            ).fetchall()
        return {
            "ok": True,
            "name": "Voice Hub",
            "version": config.APP_VERSION,
            "mcp_endpoint": "/mcp",
            "configured_providers": {row["provider"]: row["count"] for row in accounts},
            "model_count": len([model for model in available_models() if model.provider != "demo"]),
            "voice_count": voice_count,
            "job_count": job_count,
            "max_audio_bytes": config.MCP_MAX_AUDIO_BYTES,
        }

    @server.tool(
        title="List TTS models",
        description="List usable Voice Hub TTS models and the current tts-default, tts-fast and tts-hq alias targets.",
        annotations=_read_only_annotations("List TTS models"),
    )
    def list_tts_models() -> dict[str, Any]:
        models = [
            openai_model_item(model)
            for model in available_models()
            if model.provider != "demo" and "synthesis" in model.operations
        ]
        aliases = [
            {"alias": item["alias"], "model_id": item["model_id"], "valid": item["valid"]}
            for item in gateway_aliases()
        ]
        return {"models": models, "aliases": aliases, "default_model": "tts-default"}

    @server.tool(
        title="List compatible voices",
        description="List active Voice Hub voices. Pass a model ID or alias to return only voices compatible with that model.",
        annotations=_read_only_annotations("List compatible voices"),
        structured_output=False,
    )
    def list_voices(model: str = "tts-default") -> CallToolResult:
        resolved_model = resolve_model(model.strip())
        if not resolved_model or "synthesis" not in resolved_model.operations:
            return _tool_error(f"模型 {model} 不存在或不支持语音合成", code="model_not_found")
        voices = []
        for voice in list_voice_records():
            if not _compatible_voice(voice, resolved_model):
                continue
            voices.append(
                {
                    "voice": voice["public_name"],
                    "display_name": voice["display_name"],
                    "provider": voice["provider"],
                    "model_id": voice["model_id"],
                    "voice_type": voice["voice_type"],
                    "languages": voice["languages"],
                }
            )
        structured = {
            "requested_model": model,
            "resolved_model": resolved_model.gateway_id,
            "voices": voices,
        }
        return CallToolResult(
            content=[TextContent(text=f"找到 {len(voices)} 个兼容音色。")],
            structuredContent=structured,
        )

    @server.tool(
        title="Create speech",
        description="Generate speech through a configured remote provider. This may incur provider charges and must only be called after the user explicitly asks to generate audio.",
        annotations=ToolAnnotations(
            title="Create speech",
            readOnlyHint=False,
            destructiveHint=False,
            idempotentHint=False,
            openWorldHint=True,
        ),
        structured_output=False,
    )
    async def create_speech(
        text: str,
        voice: str,
        model: str = "tts-default",
        response_format: str = "mp3",
        speed: float = 1.0,
        instructions: str | None = None,
    ) -> CallToolResult:
        try:
            body = SynthesisBody(
                model=model,
                voice=voice,
                input=text,
                response_format=response_format,
                speed=speed,
                instructions=instructions,
            )
        except Exception as exc:
            return _tool_error(str(exc), code="invalid_request")
        response = await openai_speech(body)
        if isinstance(response, JSONResponse):
            try:
                payload = json.loads(response.body)
                problem = payload.get("error") or {}
                return _tool_error(
                    str(problem.get("message") or "语音生成失败"),
                    code=str(problem.get("code") or "speech_failed"),
                )
            except (TypeError, ValueError):
                return _tool_error("语音生成失败", code="speech_failed")
        if not isinstance(response, FileResponse):
            return _tool_error("Voice Hub 返回了未知的语音结果", code="unexpected_response")
        job_id = response.headers.get("X-Voice-Hub-Job") or ""
        requested_model = model.strip()
        resolved_model = resolve_model(requested_model)
        path = Path(response.path)
        metadata = {
            "ok": True,
            "job_id": job_id,
            "requested_model": requested_model,
            "resolved_model": resolved_model.gateway_id if resolved_model else requested_model,
            "voice": voice.strip(),
            "format": response_format.strip().lower(),
        }
        return await asyncio.to_thread(
            _audio_result,
            path,
            metadata,
            success_text=f"语音已生成，任务 ID：{job_id}",
            oversize_is_error=False,
        )

    @server.tool(
        title="List recent speech jobs",
        description="List recent Voice Hub speech jobs without exposing server file paths.",
        annotations=_read_only_annotations("List recent speech jobs"),
    )
    def list_recent_speech_jobs(limit: int = 20) -> dict[str, Any]:
        bounded_limit = max(1, min(limit, 100))
        with db() as connection:
            rows = connection.execute(
                "SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?", (bounded_limit,)
            ).fetchall()
        return {"jobs": [_public_job(row) for row in rows], "limit": bounded_limit}

    @server.tool(
        title="Get speech job",
        description="Get metadata for one Voice Hub speech job without exposing its server file path.",
        annotations=_read_only_annotations("Get speech job"),
        structured_output=False,
    )
    def get_speech_job(job_id: str) -> CallToolResult:
        row = _job_row(job_id.strip())
        if not row:
            return _tool_error("任务不存在", code="job_not_found")
        structured = {"job": _public_job(row)}
        return CallToolResult(
            content=[TextContent(text=f"已找到任务 {row['id']}。")],
            structuredContent=structured,
        )

    @server.tool(
        title="Get speech audio",
        description="Return the saved audio for a Voice Hub speech job when it is within the configured MCP response size limit.",
        annotations=_read_only_annotations("Get speech audio"),
        structured_output=False,
    )
    async def get_speech_audio(job_id: str) -> CallToolResult:
        row = await asyncio.to_thread(_job_row, job_id.strip())
        if not row:
            return _tool_error("任务不存在", code="job_not_found")
        try:
            path = await asyncio.to_thread(_job_audio_path, row)
        except Exception as exc:
            return _tool_error(str(getattr(exc, "detail", exc)), code="audio_not_found")
        return await asyncio.to_thread(
            _audio_result,
            path,
            {"ok": True, "job_id": row["id"], "model": row["model"], "voice": row["voice"]},
            success_text=f"已读取任务 {row['id']} 的音频。",
        )

    return server


mcp_server = create_mcp_server()
mcp_http_app = mcp_server.streamable_http_app(
    streamable_http_path="/mcp",
    json_response=True,
    stateless_http=True,
    host="127.0.0.1",
)
