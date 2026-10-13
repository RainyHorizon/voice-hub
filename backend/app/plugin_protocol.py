"""Validated external-provider protocol; plugin code never runs inside the core."""
from __future__ import annotations

import ipaddress
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, model_validator


def validate_endpoint(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError("插件连接地址必须是字符串")
    try:
        url = urlsplit(value.strip().rstrip("/"))
        host = ipaddress.ip_address(url.hostname or "")
        if url.scheme != "http" or not host.is_loopback or not url.port or url.username or url.password or url.query or url.fragment:
            raise ValueError
    except ValueError:
        raise ValueError("插件连接地址须使用带端口的本机 HTTP 地址，例如 http://127.0.0.1:8790") from None
    return url.geturl()


class SettingField(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: str = Field(pattern=r"^[a-z][a-z0-9_]{0,39}$")
    label: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=300)
    type: Literal["string", "integer", "boolean", "voice"]
    default: str | int | bool
    minimum: int | None = None
    maximum: int | None = None

    def check(self, value):
        if self.type == "integer":
            valid = type(value) is int and (self.minimum is None or value >= self.minimum) and (self.maximum is None or value <= self.maximum)
        elif self.type == "boolean":
            valid = type(value) is bool
        else:
            valid = isinstance(value, str) and len(value) <= 500
        if not valid:
            raise ValueError(f"{self.label}的值或范围不正确")
        return value

    @model_validator(mode="after")
    def valid_default(self):
        if self.key == "endpoint":
            raise ValueError("endpoint 是保留配置项")
        if self.minimum is not None and self.maximum is not None and self.minimum > self.maximum:
            raise ValueError("配置范围无效")
        self.check(self.default)
        return self


class PluginModel(BaseModel):
    id: str = Field(pattern=r"^[A-Za-z0-9._-]{1,64}$")
    name: str = Field(min_length=1, max_length=100)
    languages: list[str] = Field(min_length=1, max_length=250)


class PluginVoice(BaseModel):
    id: str = Field(pattern=r"^[A-Za-z0-9._-]{1,100}$")
    name: str = Field(min_length=1, max_length=100)
    model: str = Field(max_length=64)
    languages: list[str] = Field(min_length=1, max_length=20)


class PluginCatalog(BaseModel):
    models: list[PluginModel] = Field(min_length=1, max_length=100)
    voices: list[PluginVoice] = Field(min_length=1, max_length=5000)

    @model_validator(mode="after")
    def consistent(self):
        ids = {m.id for m in self.models}
        if len(ids) != len(self.models) or len({(v.model, v.id) for v in self.voices}) != len(self.voices):
            raise ValueError("模型或音色 ID 重复")
        if {v.model for v in self.voices} != ids:
            raise ValueError("音色与模型不匹配，或模型没有音色")
        return self
