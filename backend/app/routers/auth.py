"""WebUI password setup, login and session endpoints."""
from __future__ import annotations

import time
from collections import defaultdict
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from .. import config
from ..auth import (
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    SESSION_COOKIE,
    SESSION_TTL_SECONDS,
    check_password,
    create_session,
    password_configured,
    request_authenticated,
    revoke_session,
    save_password,
    validate_password_pair,
)
from ..database import db

router = APIRouter(prefix="/api/auth", tags=["auth"])
_failed_logins: dict[str, list[float]] = defaultdict(list)


class PasswordPair(BaseModel):
    password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)
    confirmation: str = Field(default="", max_length=PASSWORD_MAX_LENGTH)


class PasswordChange(PasswordPair):
    current_password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _rate_limited(request: Request) -> bool:
    key = _client_key(request)
    cutoff = time.time() - 60
    attempts = [value for value in _failed_logins[key] if value > cutoff]
    _failed_logins[key] = attempts
    return len(attempts) >= 5


def _record_failed_login(request: Request) -> None:
    _failed_logins[_client_key(request)].append(time.time())


def _set_session_cookie(response: Response, request: Request, token: str, expires_at: int) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=max(0, expires_at - int(time.time())),
        httponly=True,
        secure=request.url.scheme == "https",
        samesite="strict",
        path="/",
    )


def _auth_response(connection: Any, request: Request) -> dict[str, Any]:
    configured = password_configured(connection)
    authenticated = config.AUTH_ENABLED and configured and request_authenticated(request)
    if not config.AUTH_ENABLED:
        authenticated = True
    return {
        "auth_enabled": config.AUTH_ENABLED,
        "configured": configured,
        "authenticated": authenticated,
        "session_ttl_seconds": SESSION_TTL_SECONDS,
        "password_min_length": PASSWORD_MIN_LENGTH,
    }


@router.get("/status")
def auth_status(request: Request) -> dict[str, Any]:
    with db() as connection:
        return _auth_response(connection, request)


@router.post("/setup")
def setup_password(body: PasswordPair, request: Request, response: Response) -> dict[str, Any]:
    if not config.AUTH_ENABLED:
        raise HTTPException(409, "内置密码保护已通过 VOICE_STUDIO_AUTH_ENABLED 关闭")
    error = validate_password_pair(body.password, body.confirmation)
    if error:
        raise HTTPException(400, error)
    with db() as connection:
        if password_configured(connection):
            raise HTTPException(409, "密码已经设置，请直接登录")
        save_password(connection, body.password)
        token, expires_at = create_session(connection)
    _set_session_cookie(response, request, token, expires_at)
    return {"authenticated": True, "configured": True, "message": "密码设置成功"}


@router.post("/login")
def login(body: PasswordPair, request: Request, response: Response) -> dict[str, Any]:
    if _rate_limited(request):
        raise HTTPException(429, "登录尝试过于频繁，请稍后再试")
    with db() as connection:
        configured = password_configured(connection)
        valid = configured and check_password(connection, body.password)
        if not valid:
            _record_failed_login(request)
            raise HTTPException(401, "密码不正确")
        token, expires_at = create_session(connection)
    _failed_logins.pop(_client_key(request), None)
    _set_session_cookie(response, request, token, expires_at)
    return {"authenticated": True, "configured": True, "message": "登录成功"}


@router.post("/logout")
def logout(request: Request, response: Response) -> dict[str, bool]:
    with db() as connection:
        revoke_session(connection, request.cookies.get(SESSION_COOKIE))
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"authenticated": False}


@router.post("/password")
def change_password(body: PasswordChange, request: Request, response: Response) -> dict[str, Any]:
    if not request_authenticated(request):
        raise HTTPException(401, "请先登录")
    error = validate_password_pair(body.password, body.confirmation)
    if error:
        raise HTTPException(400, error)
    with db() as connection:
        if not check_password(connection, body.current_password):
            raise HTTPException(401, "当前密码不正确")
        save_password(connection, body.password)
        token, expires_at = create_session(connection)
    _set_session_cookie(response, request, token, expires_at)
    return {"authenticated": True, "configured": True, "message": "密码已更新"}
