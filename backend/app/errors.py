"""Shared helpers for building OpenAI-style error payloads."""
from __future__ import annotations

from fastapi.responses import JSONResponse


def error(message: str, type_: str = "invalid_request_error", code: str = "invalid_request", status_code: int = 400) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error": {"message": message, "type": type_, "code": code}})
