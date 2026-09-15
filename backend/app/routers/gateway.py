"""OpenAI-compatible gateway endpoints (``/v1/*``) and local gateway management."""
from __future__ import annotations

import asyncio
import base64
import json
import os
import secrets
import sqlite3
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse

from .. import config
from ..database import db, now
from ..errors import error
from ..gateway_auth import gateway_key, gateway_key_source, require_gateway_key
from ..providers.base import ProviderError, SynthesisRequest
from ..schemas import StreamingSynthesisBody, SynthesisBody
from ..services import (
    audio_metadata,
    available_models,
    convert_audio,
    demo_provider,
    openai_model_item,
    provider_for,
    resolve_model,
    resolve_voice,
    storage_path,
    voice_payload,
)

router = APIRouter()


def _configured_synthesis_limit() -> int:
    try:
        return max(1, min(int(os.getenv("VOICE_STUDIO_MAX_CONCURRENT_SYNTHESIS", "4")), 32))
    except ValueError:
        return 4


_synthesis_semaphore: asyncio.Semaphore | None = None
_synthesis_semaphore_loop = None


def synthesis_semaphore() -> asyncio.Semaphore:
    """Keep the limit per event loop so tests and reloads do not cross-bind loops."""
    global _synthesis_semaphore, _synthesis_semaphore_loop
    loop = asyncio.get_running_loop()
    if _synthesis_semaphore is None or _synthesis_semaphore_loop is not loop:
        _synthesis_semaphore = asyncio.Semaphore(_configured_synthesis_limit())
        _synthesis_semaphore_loop = loop
    return _synthesis_semaphore


def record_gateway_request(
    *,
    request_id: str,
    endpoint: str,
    status: str,
    status_code: int,
    provider: str | None = None,
    model: str | None = None,
    voice: str | None = None,
    error_code: str | None = None,
    first_chunk_latency_ms: int | None = None,
    total_latency_ms: int | None = None,
    chunk_count: int = 0,
    audio_bytes: int = 0,
    input_chars: int = 0,
    response_format: str | None = None,
    native_streaming: bool = False,
) -> None:
    with db() as connection:
        connection.execute(
            """INSERT OR REPLACE INTO gateway_requests
               (id,endpoint,provider,model,voice,status,status_code,error_code,first_chunk_latency_ms,total_latency_ms,
                chunk_count,audio_bytes,input_chars,response_format,native_streaming,created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                request_id,
                endpoint,
                provider,
                model,
                voice,
                status,
                status_code,
                error_code,
                first_chunk_latency_ms,
                total_latency_ms,
                chunk_count,
                audio_bytes,
                input_chars,
                response_format,
                int(native_streaming),
                now(),
            ),
        )


async def record_gateway_request_async(**values: Any) -> None:
    await asyncio.to_thread(record_gateway_request, **values)


def _unlink_paths(*paths: Path | None) -> None:
    for path in paths:
        if path is not None:
            path.unlink(missing_ok=True)


def percentile(values: list[int], fraction: float) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, int((len(ordered) - 1) * fraction + 0.5)))
    return ordered[index]


def latency_summary(rows: list[sqlite3.Row], column: str) -> dict[str, int | None]:
    values = [int(row[column]) for row in rows if row[column] is not None]
    return {"p50": percentile(values, 0.5), "p95": percentile(values, 0.95), "samples": len(values)}


@router.get("/v1/models", dependencies=[Depends(require_gateway_key)])
def openai_models():
    items = [openai_model_item(m) for m in available_models() if m.provider != "demo"]
    items += [{"id": "tts-default", "object": "model", "created": int(time.time()), "owned_by": "voice-studio"}, {"id": "tts-fast", "object": "model", "created": int(time.time()), "owned_by": "voice-studio"}, {"id": "tts-hq", "object": "model", "created": int(time.time()), "owned_by": "voice-studio"}]
    return {"object": "list", "data": items}


@router.get("/v1/models/{model_id:path}", dependencies=[Depends(require_gateway_key)])
def openai_model(model_id: str):
    model = resolve_model(model_id)
    if not model:
        return error(f"模型 {model_id} 不存在", code="model_not_found", status_code=404)
    return openai_model_item(model, model_id)


@router.post("/v1/audio/speech", dependencies=[Depends(require_gateway_key)])
async def openai_speech(body: SynthesisBody):
    request_id = "req_" + uuid.uuid4().hex[:12]
    started = time.perf_counter()
    model_id = body.model.strip()
    voice_id = body.voice.strip()
    response_format = body.response_format.strip().lower()
    model = resolve_model(model_id)
    if not model:
        await record_gateway_request_async(
            request_id=request_id, endpoint="speech", status="failed", status_code=400,
            model=model_id, voice=voice_id, error_code="model_not_found",
            total_latency_ms=int((time.perf_counter() - started) * 1000), input_chars=len(body.input),
            response_format=response_format,
        )
        return error(f"模型 {model_id} 不存在", code="model_not_found")
    if "synthesis" not in model.operations:
        await record_gateway_request_async(
            request_id=request_id, endpoint="speech", status="failed", status_code=400,
            provider=model.provider, model=model.gateway_id, voice=voice_id,
            error_code="unsupported_model_operation", total_latency_ms=int((time.perf_counter() - started) * 1000),
            input_chars=len(body.input), response_format=response_format,
        )
        return error(f"模型 {model_id} 不支持语音合成", code="unsupported_model_operation")
    resolved_model = model.gateway_id
    resolved_voice = await asyncio.to_thread(resolve_voice, voice_id, model)
    if not resolved_voice:
        await record_gateway_request_async(
            request_id=request_id, endpoint="speech", status="failed", status_code=400,
            provider=model.provider, model=resolved_model, voice=voice_id, error_code="invalid_voice_scope",
            total_latency_ms=int((time.perf_counter() - started) * 1000), input_chars=len(body.input),
            response_format=response_format,
        )
        return error(f"音色 {voice_id} 与模型 {model_id} 不兼容", code="invalid_voice_scope")
    if response_format not in {"wav", "mp3", "opus", "aac", "flac", "pcm"}:
        await record_gateway_request_async(
            request_id=request_id, endpoint="speech", status="failed", status_code=400,
            provider=model.provider, model=resolved_model, voice=voice_id, error_code="invalid_response_format",
            total_latency_ms=int((time.perf_counter() - started) * 1000), input_chars=len(body.input),
            response_format=response_format,
        )
        return error("response_format 仅支持 wav、mp3、opus、aac、flac、pcm", code="invalid_response_format")
    job_id = "job_" + uuid.uuid4().hex[:12]
    wav_path = config.AUDIO / f"{job_id}.wav"
    design_instructions = body.instructions or (resolved_voice["design_prompt"] if "design" in model.operations else None)
    try:
        if model.mode == "demo":
            adapter = demo_provider
        else:
            adapter = await asyncio.to_thread(
                provider_for,
                model.provider,
                resolved_voice["provider_account_id"],
                resolved_voice["provider_project_name"],
            )
        provider_voice = await asyncio.to_thread(voice_payload, model, resolved_voice, voice_id)
        async with synthesis_semaphore():
            result = await adapter.synthesize(SynthesisRequest(resolved_model, provider_voice, body.input, body.speed, "wav", design_instructions), wav_path)
            wav_info = await asyncio.to_thread(audio_metadata, wav_path)
            output_path, media_type = await asyncio.to_thread(convert_audio, wav_path, response_format)
    except ProviderError as exc:
        elapsed = int((time.perf_counter() - started) * 1000)
        await record_gateway_request_async(
            request_id=request_id, endpoint="speech", status="failed", status_code=exc.status,
            provider=model.provider, model=resolved_model, voice=voice_id, error_code=exc.code,
            total_latency_ms=elapsed, input_chars=len(body.input), response_format=response_format,
        )
        return JSONResponse(
            status_code=exc.status,
            content={"error": {"message": str(exc), "type": "provider_error", "code": exc.code}},
        )
    elapsed = int((time.perf_counter() - started) * 1000)
    output_size = await asyncio.to_thread(lambda: output_path.stat().st_size)
    def record_job() -> None:
        with db() as connection:
            connection.execute(
                "INSERT INTO jobs (id,model,voice,input_chars,status,duration_ms,audio_path,created_at,source,demo,input_text) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (job_id, resolved_model, voice_id, len(body.input), "completed", result["duration_ms"], storage_path(output_path), now(), "openai", int(result.get("demo", True)), body.input),
            )
    await asyncio.to_thread(record_job)
    await record_gateway_request_async(
        request_id=request_id, endpoint="speech", status="completed", status_code=200,
        provider=model.provider, model=resolved_model, voice=voice_id, total_latency_ms=elapsed,
        audio_bytes=output_size, input_chars=len(body.input), response_format=response_format,
    )
    headers = {
        "X-VoxNest-Job": job_id,
        "X-VoxNest-Request-Id": request_id,
        "X-VoxNest-Latency-Ms": str(elapsed),
        "X-VoxNest-Mode": "demo" if result.get("demo") else "provider",
        "X-VoxNest-Response-Format": response_format,
        "X-Voice-Studio-Job": job_id,
        "X-Voice-Studio-Request-Id": request_id,
        "X-Voice-Studio-Latency-Ms": str(elapsed),
        "X-Voice-Studio-Mode": "demo" if result.get("demo") else "provider",
        "X-Voice-Studio-Response-Format": response_format,
    }
    if response_format == "pcm":
        headers.update(
            {
                "X-VoxNest-PCM-Encoding": "s16le",
                "X-VoxNest-PCM-Sample-Rate": str(wav_info.get("sample_rate", "unknown")),
                "X-VoxNest-PCM-Channels": str(wav_info.get("channels", "unknown")),
                "X-VoxNest-PCM-Bit-Depth": "16",
            }
        )
    return FileResponse(output_path, media_type=media_type, filename=output_path.name, headers=headers)


def _sse(event: str, payload: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False, separators=(',', ':'))}\n\n"


async def _stream_speech_events(
    body: StreamingSynthesisBody,
    model,
    resolved_voice: sqlite3.Row,
    adapter,
    job_id: str,
    response_format: str,
) -> AsyncIterator[str]:
    """Yield a stable SSE envelope around gateway audio chunks.

    Native MP3 adapters are forwarded as provider data arrives. Other formats
    are synthesized and converted first, then emitted in bounded chunks without
    changing the client-facing event contract.
    """
    wav_path = config.AUDIO / f"{job_id}.wav"
    request_id = "req_" + job_id.removeprefix("job_")
    started = time.perf_counter()
    output_path: Path | None = None
    total_bytes = 0
    chunk_index = 0
    first_chunk_latency_ms: int | None = None
    completed = False
    can_native_stream = False
    use_native_stream = False
    native_format = "mp3"
    try:
        provider_voice = await asyncio.to_thread(voice_payload, model, resolved_voice, body.voice.strip())
        design_instructions = body.instructions or (resolved_voice["design_prompt"] if "design" in model.operations else None)
        synthesis_request = SynthesisRequest(model.gateway_id, provider_voice, body.input, body.speed, "wav", design_instructions)
        native_stream = getattr(adapter, "stream_synthesize", None)
        native_support = getattr(adapter, "supports_native_streaming", None)
        native_format_fn = getattr(adapter, "native_stream_format", None)
        can_native_stream = callable(native_stream) and (
            not callable(native_support) or native_support(model.gateway_id)
        )
        if callable(native_format_fn):
            native_format = str(native_format_fn(model.gateway_id)).strip().lower() or "mp3"
        use_native_stream = can_native_stream and response_format == native_format
        if use_native_stream:
            output_path = config.AUDIO / f"{job_id}.{native_format}"
            await asyncio.to_thread(output_path.parent.mkdir, parents=True, exist_ok=True)
            native_result: dict[str, Any] = {}
            with output_path.open("wb") as output:
                async for item in native_stream(
                    SynthesisRequest(model.gateway_id, provider_voice, body.input, body.speed, native_format, design_instructions)
                ):
                    if item.get("audio"):
                        audio = item["audio"]
                        if first_chunk_latency_ms is None:
                            first_chunk_latency_ms = int((time.perf_counter() - started) * 1000)
                        await asyncio.to_thread(output.write, audio)
                        total_bytes += len(audio)
                        for offset in range(0, len(audio), body.chunk_size):
                            chunk = audio[offset : offset + body.chunk_size]
                            yield _sse(
                                "audio",
                                {
                                    "type": "audio.chunk",
                                    "index": chunk_index,
                                    "audio": base64.b64encode(chunk).decode("ascii"),
                                    "format": native_format,
                                    "native": True,
                                },
                            )
                            chunk_index += 1
                    if item.get("done"):
                        native_result = item
            if total_bytes <= 0:
                raise ProviderError("流式适配器没有返回音频数据", code="invalid_provider_response")
            elapsed = int((time.perf_counter() - started) * 1000)
            def record_native_job() -> None:
                with db() as connection:
                    connection.execute(
                        "INSERT INTO jobs (id,model,voice,input_chars,status,duration_ms,audio_path,created_at,source,demo,input_text) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                        (job_id, model.gateway_id, body.voice.strip(), len(body.input), "completed", int(native_result.get("duration_ms") or 0), storage_path(output_path), now(), "openai-stream", 0, body.input),
                    )
            await asyncio.to_thread(record_native_job)
            completed = True
            await record_gateway_request_async(
                request_id=request_id, endpoint="speech/stream", status="completed", status_code=200,
                provider=model.provider, model=model.gateway_id, voice=body.voice.strip(),
                first_chunk_latency_ms=first_chunk_latency_ms, total_latency_ms=elapsed,
                chunk_count=chunk_index, audio_bytes=total_bytes, input_chars=len(body.input),
                response_format=native_format, native_streaming=True,
            )
            done_pcm = {}
            if native_format == "pcm":
                done_pcm = {
                    "pcm": {
                        "encoding": "s16le",
                        "sample_rate": native_result.get("sample_rate", 24000),
                        "channels": native_result.get("channels", 1),
                        "bit_depth": native_result.get("bit_depth", 16),
                    }
                }
            yield _sse(
                "done",
                {
                    "type": "audio.done",
                    "job_id": job_id,
                    "model": model.gateway_id,
                    "voice": body.voice.strip(),
                    "format": native_format,
                    "bytes": total_bytes,
                    "chunks": chunk_index,
                    "first_chunk_latency_ms": first_chunk_latency_ms,
                    "duration_ms": int(native_result.get("duration_ms") or 0),
                    "latency_ms": elapsed,
                    "mode": "provider",
                    "native_streaming": True,
                    "provider_request_id": native_result.get("provider_request_id", ""),
                    **done_pcm,
                },
            )
            return
        result = await adapter.synthesize(
            synthesis_request,
            wav_path,
        )
        wav_info = await asyncio.to_thread(audio_metadata, wav_path)
        output_path, _ = await asyncio.to_thread(convert_audio, wav_path, response_format)
        with output_path.open("rb") as stream:
            while True:
                chunk = await asyncio.to_thread(stream.read, body.chunk_size)
                if not chunk:
                    break
                if first_chunk_latency_ms is None:
                    first_chunk_latency_ms = int((time.perf_counter() - started) * 1000)
                total_bytes += len(chunk)
                yield _sse(
                    "audio",
                    {
                        "type": "audio.chunk",
                        "index": chunk_index,
                        "audio": base64.b64encode(chunk).decode("ascii"),
                        "format": response_format,
                    },
                )
                chunk_index += 1

        elapsed = int((time.perf_counter() - started) * 1000)
        def record_stream_job() -> None:
            with db() as connection:
                connection.execute(
                    "INSERT INTO jobs (id,model,voice,input_chars,status,duration_ms,audio_path,created_at,source,demo,input_text) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    (job_id, model.gateway_id, body.voice.strip(), len(body.input), "completed", result["duration_ms"], storage_path(output_path), now(), "openai-stream", int(result.get("demo", True)), body.input),
                )
        await asyncio.to_thread(record_stream_job)
        done: dict[str, Any] = {
            "type": "audio.done",
            "job_id": job_id,
            "model": model.gateway_id,
            "voice": body.voice.strip(),
            "format": response_format,
            "bytes": total_bytes,
            "chunks": chunk_index,
            "first_chunk_latency_ms": first_chunk_latency_ms,
            "duration_ms": result.get("duration_ms", 0),
            "latency_ms": elapsed,
            "mode": "demo" if result.get("demo") else "provider",
            "native_streaming": False,
        }
        if response_format == "pcm":
            done["pcm"] = {
                "encoding": "s16le",
                "sample_rate": wav_info.get("sample_rate"),
                "channels": wav_info.get("channels"),
                "bit_depth": 16,
            }
        completed = True
        await record_gateway_request_async(
            request_id=request_id, endpoint="speech/stream", status="completed", status_code=200,
            provider=model.provider, model=model.gateway_id, voice=body.voice.strip(),
            first_chunk_latency_ms=first_chunk_latency_ms, total_latency_ms=elapsed,
            chunk_count=chunk_index, audio_bytes=total_bytes, input_chars=len(body.input),
            response_format=response_format, native_streaming=False,
        )
        yield _sse("done", done)
    except ProviderError as exc:
        if not completed:
            await record_gateway_request_async(
                request_id=request_id, endpoint="speech/stream", status="failed", status_code=exc.status,
                provider=model.provider, model=model.gateway_id, voice=body.voice.strip(), error_code=exc.code,
                first_chunk_latency_ms=first_chunk_latency_ms, total_latency_ms=int((time.perf_counter() - started) * 1000),
                chunk_count=chunk_index, audio_bytes=total_bytes, input_chars=len(body.input),
                response_format=response_format,
                native_streaming=use_native_stream,
            )
        yield _sse("error", {"type": "error", "error": {"message": str(exc), "type": "provider_error", "code": exc.code}})
    except asyncio.CancelledError:
        if not completed:
            await record_gateway_request_async(
                request_id=request_id, endpoint="speech/stream", status="cancelled", status_code=499,
                provider=model.provider, model=model.gateway_id, voice=body.voice.strip(), error_code="client_cancelled",
                first_chunk_latency_ms=first_chunk_latency_ms, total_latency_ms=int((time.perf_counter() - started) * 1000),
                chunk_count=chunk_index, audio_bytes=total_bytes, input_chars=len(body.input),
                response_format=response_format,
                native_streaming=use_native_stream,
            )
        raise
    except Exception as exc:
        if not completed:
            await record_gateway_request_async(
                request_id=request_id, endpoint="speech/stream", status="failed", status_code=500,
                provider=model.provider, model=model.gateway_id, voice=body.voice.strip(), error_code="stream_failed",
                first_chunk_latency_ms=first_chunk_latency_ms, total_latency_ms=int((time.perf_counter() - started) * 1000),
                chunk_count=chunk_index, audio_bytes=total_bytes, input_chars=len(body.input),
                response_format=response_format,
                native_streaming=use_native_stream,
            )
        yield _sse("error", {"type": "error", "error": {"message": str(exc) or "流式音频生成失败", "type": "gateway_error", "code": "stream_failed"}})
    finally:
        if not completed:
            await asyncio.to_thread(_unlink_paths, output_path, wav_path)


@router.post("/v1/audio/speech/stream", dependencies=[Depends(require_gateway_key)])
async def openai_speech_stream(body: StreamingSynthesisBody):
    started = time.perf_counter()
    request_id = "req_" + uuid.uuid4().hex[:12]
    model_id = body.model.strip()
    voice_id = body.voice.strip()
    response_format = body.response_format.strip().lower()
    model = resolve_model(model_id)
    if not model:
        await record_gateway_request_async(
            request_id=request_id, endpoint="speech/stream", status="failed", status_code=400,
            model=model_id, voice=voice_id, error_code="model_not_found",
            total_latency_ms=int((time.perf_counter() - started) * 1000), input_chars=len(body.input),
            response_format=response_format,
        )
        return error(f"模型 {model_id} 不存在", code="model_not_found")
    if "synthesis" not in model.operations:
        await record_gateway_request_async(
            request_id=request_id, endpoint="speech/stream", status="failed", status_code=400,
            provider=model.provider, model=model.gateway_id, voice=voice_id,
            error_code="unsupported_model_operation", total_latency_ms=int((time.perf_counter() - started) * 1000),
            input_chars=len(body.input), response_format=response_format,
        )
        return error(f"模型 {model_id} 不支持语音合成", code="unsupported_model_operation")
    if response_format not in {"wav", "mp3", "opus", "aac", "flac", "pcm"}:
        await record_gateway_request_async(
            request_id=request_id, endpoint="speech/stream", status="failed", status_code=400,
            provider=model.provider, model=model.gateway_id, voice=voice_id,
            error_code="invalid_response_format", total_latency_ms=int((time.perf_counter() - started) * 1000),
            input_chars=len(body.input), response_format=response_format,
        )
        return error("response_format 仅支持 wav、mp3、opus、aac、flac、pcm", code="invalid_response_format")
    resolved_voice = await asyncio.to_thread(resolve_voice, voice_id, model)
    if not resolved_voice:
        await record_gateway_request_async(
            request_id=request_id, endpoint="speech/stream", status="failed", status_code=400,
            provider=model.provider, model=model.gateway_id, voice=voice_id,
            error_code="invalid_voice_scope", total_latency_ms=int((time.perf_counter() - started) * 1000),
            input_chars=len(body.input), response_format=response_format,
        )
        return error(f"音色 {voice_id} 与模型 {model_id} 不兼容", code="invalid_voice_scope")
    try:
        if model.mode == "demo":
            adapter = demo_provider
        else:
            adapter = await asyncio.to_thread(
                provider_for,
                model.provider,
                resolved_voice["provider_account_id"],
                resolved_voice["provider_project_name"],
            )
    except ProviderError as exc:
        await record_gateway_request_async(
            request_id=request_id, endpoint="speech/stream", status="failed", status_code=exc.status,
            provider=model.provider, model=model.gateway_id, voice=voice_id, error_code=exc.code,
            total_latency_ms=int((time.perf_counter() - started) * 1000), input_chars=len(body.input),
            response_format=response_format,
        )
        return JSONResponse(status_code=exc.status, content={"error": {"message": str(exc), "type": "provider_error", "code": exc.code}})
    job_id = "job_" + uuid.uuid4().hex[:12]

    async def limited_stream():
        async with synthesis_semaphore():
            async for event in _stream_speech_events(body, model, resolved_voice, adapter, job_id, response_format):
                yield event

    return StreamingResponse(
        limited_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-VoxNest-Job": job_id,
            "X-VoxNest-Request-Id": request_id,
            "X-VoxNest-Stream": "sse",
            "X-VoxNest-Chunk-Encoding": "base64",
            "X-Voice-Studio-Job": job_id,
            "X-Voice-Studio-Request-Id": request_id,
            "X-Voice-Studio-Stream": "sse",
            "X-Voice-Studio-Chunk-Encoding": "base64",
        },
    )


@router.get("/api/gateway/stats")
def gateway_stats(window: str = "7d", provider: str = ""):
    windows = {"24h": timedelta(hours=24), "7d": timedelta(days=7), "30d": timedelta(days=30), "all": None}
    if window not in windows:
        raise HTTPException(status_code=400, detail={"message": "window 仅支持 24h、7d、30d、all", "code": "invalid_window"})
    cutoff = None if windows[window] is None else (datetime.now(timezone.utc) - windows[window]).isoformat()
    clauses = ["provider != 'demo'"]
    params: list[str] = []
    if cutoff:
        clauses.append("created_at >= ?")
        params.append(cutoff)
    if provider:
        clauses.append("provider = ?")
        params.append(provider)
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    with db() as connection:
        # WHERE fragments are fixed literals; user-controlled values remain bound parameters.
        rows = connection.execute(f"SELECT * FROM gateway_requests{where} ORDER BY created_at DESC", params).fetchall()  # nosec B608

    def bucket(items: list[sqlite3.Row], key: str) -> list[dict[str, Any]]:
        grouped: dict[str, list[sqlite3.Row]] = {}
        for row in items:
            grouped.setdefault(str(row[key] or "unknown"), []).append(row)
        result = []
        for name, group in sorted(grouped.items(), key=lambda item: (-len(item[1]), item[0])):
            completed = sum(row["status"] == "completed" for row in group)
            result.append({
                "name": name,
                "requests": len(group),
                "completed": completed,
                "failed": sum(row["status"] == "failed" for row in group),
                "cancelled": sum(row["status"] == "cancelled" for row in group),
                "success_rate": round(completed / len(group) * 100, 1) if group else 0,
                "first_chunk_latency": latency_summary(group, "first_chunk_latency_ms"),
                "total_latency": latency_summary(group, "total_latency_ms"),
            })
        return result

    total = len(rows)
    completed = sum(row["status"] == "completed" for row in rows)
    errors: dict[str, dict[str, Any]] = {}
    for row in rows:
        if row["status"] != "failed":
            continue
        code = str(row["error_code"] or "unknown_error")
        item = errors.setdefault(code, {"code": code, "count": 0, "last_seen_at": row["created_at"]})
        item["count"] += 1
        item["last_seen_at"] = max(item["last_seen_at"], row["created_at"])
    return {
        "window": window,
        "provider": provider or None,
        "sample_count": total,
        "total_requests": total,
        "completed_requests": completed,
        "failed_requests": sum(row["status"] == "failed" for row in rows),
        "cancelled_requests": sum(row["status"] == "cancelled" for row in rows),
        "success_rate": round(completed / total * 100, 1) if total else 0,
        "first_chunk_latency": latency_summary(rows, "first_chunk_latency_ms"),
        "total_latency": latency_summary(rows, "total_latency_ms"),
        "by_provider": bucket(rows, "provider"),
        "by_model": bucket(rows, "model"),
        "errors": sorted(errors.values(), key=lambda item: (-item["count"], item["code"])),
    }


def _is_local_ui_request(request: Request) -> bool:
    """Only loopback UI requests may explicitly retrieve the gateway secret."""
    origin = request.headers.get("origin")
    local_origins = {
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        config.LOCAL_BASE_URL,
        f"http://localhost:{config.APP_PORT}",
    }
    if origin:
        return origin in local_origins
    host = request.headers.get("host", "").split(":", 1)[0].strip("[]").lower()
    return host in {"127.0.0.1", "localhost", "::1", "test"}


@router.get("/api/gateway")
def gateway_config(request: Request, reveal: bool = False):
    key = gateway_key()
    exposed = bool(reveal and _is_local_ui_request(request))
    return {
        "enabled": True,
        "base_url": f"{config.LOCAL_BASE_URL}/v1",
        "key": key if exposed else "",
        "key_hint": key[:7] + "..." + key[-4:],
        "key_exposed": exposed,
        "key_source": gateway_key_source(),
        "managed": not bool(os.getenv("VOICE_STUDIO_GATEWAY_KEY", "").strip()),
        "mode": "hybrid",
        "note": "通义千问、火山引擎、MiniMax 与 MiMo 已接入真实接口。",
    }


@router.post("/api/gateway/rotate")
def rotate_gateway_key(request: Request):
    if not _is_local_ui_request(request):
        raise HTTPException(status_code=403, detail="网关 Key 只能由本机管理界面轮换")
    if os.getenv("VOICE_STUDIO_GATEWAY_KEY", "").strip():
        raise HTTPException(status_code=409, detail="当前由环境变量 VOICE_STUDIO_GATEWAY_KEY 管理网关 Key，不能在界面轮换")
    value = "vs_" + secrets.token_urlsafe(24)
    config.DATA.mkdir(parents=True, exist_ok=True)
    temp_path = config.GATEWAY_CONFIG_PATH.with_suffix(".tmp")
    temp_path.write_text(json.dumps({"key": value}, ensure_ascii=False, indent=2), encoding="utf-8")
    temp_path.replace(config.GATEWAY_CONFIG_PATH)
    return {"key": value, "key_hint": value[:7] + "..." + value[-4:], "key_source": "本地 gateway.json", "managed": True}

