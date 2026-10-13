"""HTTP adapter for separately running provider plugins."""
import asyncio
import json
import wave
from pathlib import Path

import httpx

from ..plugins import get_plugin
from ..plugin_protocol import validate_endpoint
from .base import ProviderError, SynthesisRequest


class ExternalProvider:
    def __init__(self, plugin_id: str):
        try:
            plugin = get_plugin(plugin_id)
            if not plugin["enabled"]:
                raise ValueError("插件已停用")
            self.endpoint = validate_endpoint(plugin["config"]["endpoint"])
            self.config = {k: v for k, v in plugin["config"].items() if k != "endpoint"}
            self.key = "plugin-" + plugin_id
        except (KeyError, ValueError) as exc:
            raise ProviderError(str(exc), code="plugin_unavailable", status=409) from exc

    async def synthesize(self, request: SynthesisRequest, output: Path) -> dict:
        output.parent.mkdir(parents=True, exist_ok=True)
        try:
            async with httpx.AsyncClient(timeout=180, trust_env=False, follow_redirects=False) as client:
                async with client.stream("POST", self.endpoint + "/speech", json={
                    "model": request.model.removeprefix(self.key + "/"), "voice": request.voice, "text": request.text,
                    "speed": request.speed, "config": self.config,
                }) as response:
                    if response.status_code == 502:
                        raw = bytearray()
                        async for chunk in response.aiter_bytes():
                            raw.extend(chunk)
                            if len(raw) > 4096:
                                break
                        if len(raw) <= 4096:
                            try:
                                if json.loads(raw).get("detail", {}).get("code") == "upstream_rejected":
                                    raise ProviderError("插件已连接，但上游语音服务拒绝了请求。请检查网络或稍后重试", code="plugin_upstream_rejected")
                            except (ValueError, AttributeError):
                                pass
                    response.raise_for_status()
                    size = 0
                    with output.open("wb") as handle:
                        async for chunk in response.aiter_bytes():
                            size += len(chunk)
                            if size > 50 * 1024 * 1024:
                                raise ProviderError("插件音频超过 50 MB 限制", code="plugin_audio_too_large")
                            handle.write(chunk)
            def inspect():
                with wave.open(str(output), "rb") as audio:
                    frames, rate = audio.getnframes(), audio.getframerate()
                    if frames <= 0 or rate <= 0 or audio.getnchannels() > 2 or audio.getsampwidth() != 2:
                        raise ValueError
                    if len(audio.readframes(frames)) != frames * audio.getnchannels() * 2:
                        raise ValueError
                    return round(frames / rate * 1000)
            duration = await asyncio.to_thread(inspect)
            return {"duration_ms": duration, "demo": False}
        except BaseException as exc:
            output.unlink(missing_ok=True)
            if isinstance(exc, (httpx.HTTPError, OSError, wave.Error, EOFError, ValueError)):
                raise ProviderError("插件语音生成失败，请检查插件连接及网络；插件须返回有效的 PCM WAV 音频", code="plugin_synthesis_failed") from None
            raise
