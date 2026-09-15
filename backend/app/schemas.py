"""Request body schemas for the local management API and OpenAI-compatible gateway."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class SynthesisBody(BaseModel):
    model: str = Field(min_length=1, max_length=200)
    voice: str = Field(min_length=1, max_length=200)
    input: str = Field(min_length=1, max_length=10000)
    response_format: str = Field(default="mp3")
    speed: float = Field(default=1.0, ge=0.25, le=4.0)
    instructions: str | None = Field(default=None, max_length=2000)
    voice_studio: dict[str, Any] | None = None


class StreamingSynthesisBody(SynthesisBody):
    """Request body for the gateway's SSE audio stream."""

    chunk_size: int = Field(default=8192, ge=1024, le=65536)


class ImportVoiceBody(BaseModel):
    provider: str
    model_id: str
    provider_voice_id: str
    display_name: str
    public_name: str
    languages: list[str] = ["zh-CN"]
    provider_account_id: str | None = Field(default=None, max_length=100)
    provider_project_name: str | None = Field(default=None, max_length=200)


class ImportVoicesBody(BaseModel):
    voices: list[ImportVoiceBody] = Field(min_length=1, max_length=100)


class RenameVoiceBody(BaseModel):
    display_name: str = Field(min_length=1, max_length=100)


class JobBatchBody(BaseModel):
    job_ids: list[str] = Field(default_factory=list, max_length=500)
    date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")


class StoragePolicyBody(BaseModel):
    automatic_enabled: bool = False
    retention_days: int = Field(default=30, ge=1, le=3650)
    capacity_limit_bytes: int = Field(default=5 * 1024 * 1024 * 1024, ge=100 * 1024 * 1024, le=10 * 1024 * 1024 * 1024 * 1024)
    interval: str = Field(default="daily", pattern=r"^(daily|weekly)$")
    cleanup_scope: str = Field(default="audio_only", pattern=r"^(audio_only|jobs)$")


class ProviderAccountBody(BaseModel):
    provider: str
    display_name: str = Field(min_length=1, max_length=80)
    api_key: str | None = Field(default=None, min_length=6, max_length=4096)
    endpoint: str | None = Field(default=None, max_length=500)
    openapi_access_key: str | None = Field(default=None, max_length=4096)
    openapi_secret_key: str | None = Field(default=None, max_length=4096)
    project_name: str | None = Field(default=None, max_length=200)


class ProviderProjectBody(BaseModel):
    project_name: str = Field(min_length=1, max_length=200)
    display_name: str | None = Field(default=None, max_length=200)


class VoiceDesignBody(BaseModel):
    provider: str
    model_id: str
    prompt: str = Field(min_length=8, max_length=2048)
    preview_text: str = Field(min_length=1, max_length=2000)
    display_name: str = Field(min_length=1, max_length=100)
    public_name: str = Field(min_length=1, max_length=100)
