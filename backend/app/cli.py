"""Command-line client for a running Voice Hub instance."""
from __future__ import annotations

import argparse
import ipaddress
import json
import os
import socket
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any, Mapping, Sequence


DEFAULT_BASE_URL = "http://127.0.0.1:8765"
FORMATS = ("mp3", "wav", "opus", "aac", "flac", "pcm")


class CliError(RuntimeError):
    """An expected command-line error with a stable process exit code."""

    def __init__(self, message: str, exit_code: int = 1):
        super().__init__(message)
        self.exit_code = exit_code


def _is_loopback(hostname: str | None) -> bool:
    if not hostname:
        return False
    if hostname.lower() == "localhost":
        return True
    try:
        return ipaddress.ip_address(hostname).is_loopback
    except ValueError:
        return False


def normalize_base_url(value: str) -> str:
    raw = value.strip().rstrip("/")
    if not raw:
        raise CliError("服务地址不能为空。")
    if "://" not in raw:
        raw = "http://" + raw
    parsed = urllib.parse.urlsplit(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise CliError("服务地址必须是有效的 HTTP 或 HTTPS 地址。")
    path = parsed.path.rstrip("/")
    if path.endswith("/v1"):
        path = path[:-3]
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, path, "", "")).rstrip("/")


def _error_message(payload: Any, fallback: str) -> str:
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict) and error.get("message"):
            return str(error["message"])
        detail = payload.get("detail")
        if isinstance(detail, dict):
            nested = detail.get("error")
            if isinstance(nested, dict) and nested.get("message"):
                return str(nested["message"])
        if detail:
            return str(detail)
    return fallback


def _decode_body(content: bytes, content_type: str) -> Any:
    if "json" in content_type.lower():
        try:
            return json.loads(content.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            pass
    return content


class VoiceHubClient:
    def __init__(
        self,
        base_url: str,
        api_key: str = "",
        *,
        timeout: float = 120,
        allow_insecure_http: bool = False,
    ) -> None:
        self.base_url = normalize_base_url(base_url)
        self.api_key = api_key.strip()
        self.timeout = timeout
        parsed = urllib.parse.urlsplit(self.base_url)
        if parsed.scheme == "http" and not _is_loopback(parsed.hostname) and not allow_insecure_http:
            raise CliError(
                "远程服务必须使用 HTTPS。确实处于可信内网时，可显式添加 --allow-insecure-http。"
            )

    def _url(self, path: str) -> str:
        return self.base_url + "/" + path.lstrip("/")

    def _discover_local_key(self) -> str:
        parsed = urllib.parse.urlsplit(self.base_url)
        if not _is_loopback(parsed.hostname):
            raise CliError(
                "远程调用需要 Gateway Key。请设置 VOICE_HUB_API_KEY 环境变量，"
                "不要把厂商 API Key 填在这里。"
            )
        payload, _ = self.request("/api/gateway?reveal=true", auth=False)
        if not isinstance(payload, dict) or not payload.get("key_exposed") or not payload.get("key"):
            raise CliError("无法从本机 Voice Hub 读取 Gateway Key，请在 API 网关页面确认服务状态。")
        self.api_key = str(payload["key"])
        return self.api_key

    def request(
        self,
        path: str,
        *,
        method: str = "GET",
        payload: Any | None = None,
        auth: bool = False,
    ) -> tuple[Any, Mapping[str, str]]:
        headers = {"Accept": "application/json", "User-Agent": "voice-hub-cli/1"}
        body = None
        if payload is not None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json; charset=utf-8"
        if auth:
            key = self.api_key or self._discover_local_key()
            headers["Authorization"] = f"Bearer {key}"
        request = urllib.request.Request(self._url(path), data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                content = response.read()
                result = _decode_body(content, response.headers.get("Content-Type", ""))
                return result, response.headers
        except urllib.error.HTTPError as exc:
            content = exc.read()
            decoded = _decode_body(content, exc.headers.get("Content-Type", ""))
            message = _error_message(decoded, f"服务器返回 HTTP {exc.code}")
            if exc.code == 401:
                message += "。请检查 Gateway Key 是否正确"
            raise CliError(message, 2 if exc.code == 401 else 1) from None
        except urllib.error.URLError as exc:
            reason = getattr(exc, "reason", exc)
            raise CliError(f"无法连接 Voice Hub：{reason}。请先启动服务并检查地址 {self.base_url}") from None
        except (TimeoutError, socket.timeout):
            raise CliError(f"连接 Voice Hub 超时（{self.timeout:g} 秒）。") from None

    def summary(self) -> dict[str, Any]:
        payload, _ = self.request("/api/summary")
        if not isinstance(payload, dict):
            raise CliError("服务返回了无法识别的诊断信息。")
        return payload

    def models(self) -> list[dict[str, Any]]:
        payload, _ = self.request("/v1/models", auth=True)
        if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
            raise CliError("服务返回了无法识别的模型列表。")
        return [item for item in payload["data"] if isinstance(item, dict)]

    def aliases(self) -> dict[str, str]:
        payload, _ = self.request("/api/gateway/aliases")
        if not isinstance(payload, dict):
            return {}
        return {
            str(item.get("alias")): str(item.get("model_id"))
            for item in payload.get("aliases", [])
            if isinstance(item, dict) and item.get("alias") and item.get("model_id")
        }

    def voices(self) -> list[dict[str, Any]]:
        payload, _ = self.request("/api/voices")
        if not isinstance(payload, list):
            raise CliError("服务返回了无法识别的音色列表。")
        return [item for item in payload if isinstance(item, dict)]

    def jobs(self, *, limit: int, date: str | None) -> list[dict[str, Any]]:
        query = {"limit": str(limit)}
        if date:
            query["date"] = date
        payload, _ = self.request("/api/jobs?" + urllib.parse.urlencode(query))
        if not isinstance(payload, list):
            raise CliError("服务返回了无法识别的任务列表。")
        return [item for item in payload if isinstance(item, dict)]

    def speak(
        self,
        *,
        model: str,
        voice: str,
        text: str,
        response_format: str,
        speed: float,
        instructions: str | None,
    ) -> tuple[bytes, Mapping[str, str]]:
        payload: dict[str, Any] = {
            "model": model,
            "voice": voice,
            "input": text,
            "response_format": response_format,
            "speed": speed,
        }
        if instructions:
            payload["instructions"] = instructions
        content, headers = self.request("/v1/audio/speech", method="POST", payload=payload, auth=True)
        if not isinstance(content, bytes):
            raise CliError("服务器没有返回音频文件。")
        return content, headers

    def download(self, job_id: str) -> tuple[bytes, Mapping[str, str]]:
        content, headers = self.request(f"/api/jobs/{urllib.parse.quote(job_id, safe='')}/audio")
        if not isinstance(content, bytes):
            raise CliError("服务器没有返回音频文件。")
        return content, headers


def _print_json(value: Any) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2))


def _short_text(value: str, limit: int = 80) -> str:
    compact = " ".join(value.split())
    return compact if len(compact) <= limit else compact[: limit - 1] + "..."


def _write_binary(path: Path, content: bytes, *, force: bool) -> Path:
    destination = path.expanduser().resolve()
    if destination.exists() and not force:
        raise CliError(f"输出文件已存在：{destination}。需要覆盖时添加 --force。")
    destination.parent.mkdir(parents=True, exist_ok=True)
    file_descriptor, temporary_name = tempfile.mkstemp(
        prefix=destination.name + ".", suffix=".part", dir=destination.parent
    )
    try:
        with os.fdopen(file_descriptor, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary_name, destination)
    except Exception:
        try:
            os.unlink(temporary_name)
        except OSError:
            pass
        raise
    return destination


def _read_speech_text(args: argparse.Namespace) -> str:
    sources = int(bool(args.text)) + int(bool(args.file))
    if sources > 1:
        raise CliError("文字参数和 --file 不能同时使用。")
    if args.file:
        try:
            text = Path(args.file).expanduser().read_text(encoding="utf-8-sig")
        except OSError as exc:
            raise CliError(f"无法读取文字文件：{exc}") from None
    elif args.text:
        text = args.text
    elif not sys.stdin.isatty():
        text = sys.stdin.read()
    else:
        raise CliError("请提供要朗读的文字、--file UTF-8 文件，或通过管道输入文字。")
    text = text.strip()
    if not text:
        raise CliError("朗读文字不能为空。")
    if len(text) > 10000:
        raise CliError(f"朗读文字共有 {len(text)} 个字符，接口单次最多支持 10000 个字符。")
    return text


def _command_doctor(client: VoiceHubClient, args: argparse.Namespace) -> int:
    summary = client.summary()
    models = client.models()
    result = {
        "healthy": summary.get("application") == "voice-hub",
        "base_url": client.base_url,
        "version": summary.get("version"),
        "voices": summary.get("voices", 0),
        "jobs": summary.get("jobs", 0),
        "gateway_authenticated": True,
        "models": len(models),
    }
    if args.json:
        _print_json(result)
    else:
        print("Voice Hub CLI 诊断通过")
        print(f"  服务地址：{result['base_url']}")
        print(f"  服务版本：{result['version'] or '未知'}")
        print(f"  网关鉴权：正常")
        print(f"  可见模型：{result['models']}")
        print(f"  音色数量：{result['voices']}")
        print(f"  历史任务：{result['jobs']}")
    return 0


def _command_models(client: VoiceHubClient, args: argparse.Namespace) -> int:
    models = client.models()
    if args.provider:
        provider = args.provider.lower()
        models = [item for item in models if str(item.get("owned_by", "")).lower() == provider]
    if args.json:
        _print_json(models)
        return 0
    if not models:
        print("没有找到符合条件的模型。")
        return 0
    for item in models:
        details = item.get("voice_studio") if isinstance(item.get("voice_studio"), dict) else {}
        operations = details.get("operations") or []
        print(str(item.get("id", "未知模型")))
        print(f"  厂商：{item.get('owned_by', '别名')}" )
        if operations:
            print(f"  能力：{', '.join(str(value) for value in operations)}")
        if details.get("mode"):
            print(f"  模式：{details['mode']}")
        print()
    return 0


def _voice_matches_model(item: dict[str, Any], target: str) -> bool:
    if "/" not in target:
        return True
    provider, model_id = target.split("/", 1)
    if str(item.get("provider")) != provider:
        return False
    return provider == "minimax" or str(item.get("model_id")) == model_id


def _command_voices(client: VoiceHubClient, args: argparse.Namespace) -> int:
    voices = client.voices()
    target_model = args.model
    if target_model:
        target_model = client.aliases().get(target_model, target_model)
        voices = [item for item in voices if _voice_matches_model(item, target_model)]
    if args.provider:
        voices = [item for item in voices if str(item.get("provider", "")).lower() == args.provider.lower()]
    if args.language:
        language = args.language.lower()
        voices = [
            item
            for item in voices
            if any(language in str(value).lower() for value in (item.get("languages") or []))
        ]
    if args.json:
        _print_json(voices)
        return 0
    if not voices:
        print("没有找到符合条件的音色。")
        return 0
    for item in voices:
        public_name = item.get("public_name") or item.get("id") or "未知音色"
        print(str(public_name))
        print(f"  显示名称：{item.get('display_name') or public_name}")
        print(f"  兼容模型：{item.get('provider')}/{item.get('model_id')}")
        languages = item.get("languages") or []
        if languages:
            print(f"  语言：{', '.join(str(value) for value in languages)}")
        print(f"  类型：{item.get('voice_type') or '未知'}")
        print()
    return 0


def _command_jobs(client: VoiceHubClient, args: argparse.Namespace) -> int:
    jobs = client.jobs(limit=args.limit, date=args.date)
    if args.json:
        _print_json(jobs)
        return 0
    if not jobs:
        print("没有找到任务。")
        return 0
    for item in jobs:
        print(f"{item.get('id', '未知任务')}  [{item.get('status', 'unknown')}]")
        print(f"  时间：{item.get('created_at', '未知')}")
        print(f"  模型：{item.get('model', '未知')}")
        print(f"  音色：{item.get('voice', '未知')}")
        if item.get("input_text"):
            print(f"  文字：{_short_text(str(item['input_text']))}")
        print(f"  音频：{'可下载' if item.get('audio_available') else '不可用'}")
        print()
    return 0


def _command_speak(client: VoiceHubClient, args: argparse.Namespace) -> int:
    text = _read_speech_text(args)
    if args.instructions and len(args.instructions) > 2000:
        raise CliError("instructions 最多支持 2000 个字符。")
    content, headers = client.speak(
        model=args.model,
        voice=args.voice,
        text=text,
        response_format=args.format,
        speed=args.speed,
        instructions=args.instructions,
    )
    output = Path(args.output) if args.output else Path(
        f"voice-{datetime.now().strftime('%Y%m%d-%H%M%S')}.{args.format}"
    )
    try:
        destination = _write_binary(output, content, force=args.force)
    except OSError as exc:
        raise CliError(f"无法保存音频：{exc}") from None
    result = {
        "output": str(destination),
        "bytes": len(content),
        "job_id": headers.get("X-Voice-Hub-Job"),
        "request_id": headers.get("X-Voice-Hub-Request-Id"),
        "latency_ms": headers.get("X-Voice-Hub-Latency-Ms"),
        "model": args.model,
        "voice": args.voice,
        "format": args.format,
    }
    if args.json:
        _print_json(result)
    else:
        print("语音生成完成")
        print(f"  文件：{destination}")
        print(f"  模型：{args.model}")
        print(f"  音色：{args.voice}")
        if result["job_id"]:
            print(f"  任务：{result['job_id']}")
        if result["latency_ms"]:
            print(f"  耗时：{result['latency_ms']} ms")
    return 0


def _extension_from_headers(headers: Mapping[str, str]) -> str:
    content_type = str(headers.get("Content-Type", "")).split(";", 1)[0].lower()
    return {
        "audio/mpeg": ".mp3",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
        "audio/ogg": ".opus",
        "audio/aac": ".aac",
        "audio/flac": ".flac",
    }.get(content_type, ".mp3")


def _command_download(client: VoiceHubClient, args: argparse.Namespace) -> int:
    content, headers = client.download(args.job_id)
    output = Path(args.output) if args.output else Path(args.job_id + _extension_from_headers(headers))
    try:
        destination = _write_binary(output, content, force=args.force)
    except OSError as exc:
        raise CliError(f"无法保存音频：{exc}") from None
    result = {"job_id": args.job_id, "output": str(destination), "bytes": len(content)}
    if args.json:
        _print_json(result)
    else:
        print("任务音频已下载")
        print(f"  任务：{args.job_id}")
        print(f"  文件：{destination}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="voicehub",
        description="Voice Hub 命令行客户端。请先启动 Voice Hub 服务。",
    )
    parser.add_argument(
        "--base-url",
        default=os.getenv("VOICE_HUB_BASE_URL", DEFAULT_BASE_URL),
        help="Voice Hub 地址；也可设置 VOICE_HUB_BASE_URL",
    )
    parser.add_argument(
        "--api-key",
        default=os.getenv("VOICE_HUB_API_KEY") or os.getenv("VOICE_STUDIO_GATEWAY_KEY", ""),
        help="Gateway Key；本机通常自动读取，远程调用推荐设置 VOICE_HUB_API_KEY",
    )
    parser.add_argument("--timeout", type=float, default=120, help="HTTP 超时秒数，默认 120")
    parser.add_argument(
        "--allow-insecure-http",
        action="store_true",
        help="允许通过非本机 HTTP 地址传输 Gateway Key，仅用于可信内网",
    )
    parser.add_argument("--json", action="store_true", help="以 JSON 输出，便于脚本处理")
    subparsers = parser.add_subparsers(dest="command", required=True)

    doctor = subparsers.add_parser("doctor", help="检查服务连接和 Gateway Key")
    doctor.set_defaults(handler=_command_doctor)

    models = subparsers.add_parser("models", help="列出可用模型和常用别名")
    models.add_argument("--provider", help="只显示指定厂商，例如 mimo 或 dashscope")
    models.set_defaults(handler=_command_models)

    voices = subparsers.add_parser("voices", help="列出可调用的音色名称")
    voices.add_argument("--model", help="只显示兼容该模型或别名的音色")
    voices.add_argument("--provider", help="只显示指定厂商")
    voices.add_argument("--language", help="按语言筛选，例如 zh-CN 或 ja")
    voices.set_defaults(handler=_command_voices)

    jobs = subparsers.add_parser("jobs", help="查看最近的生成任务")
    jobs.add_argument("--limit", type=int, default=20, choices=range(1, 501), metavar="1-500")
    jobs.add_argument("--date", help="只显示某一天，格式 YYYY-MM-DD")
    jobs.set_defaults(handler=_command_jobs)

    speak = subparsers.add_parser("speak", help="把文字生成音频文件")
    speak.add_argument("text", nargs="?", help="要朗读的文字；也可通过管道输入")
    speak.add_argument("--file", help="读取 UTF-8 文字文件")
    speak.add_argument("--model", default="tts-default", help="模型 ID 或别名，默认 tts-default")
    speak.add_argument("--voice", required=True, help="音色的调用名称，可通过 voices 查询")
    speak.add_argument("--format", choices=FORMATS, default="mp3", help="输出格式，默认 mp3")
    speak.add_argument("--speed", type=float, default=1.0, choices=None, help="语速 0.25 到 4.0")
    speak.add_argument("--instructions", help="支持指令控制的模型可使用，最多 2000 字符")
    speak.add_argument("--output", "-o", help="输出文件；默认保存到当前目录")
    speak.add_argument("--force", action="store_true", help="覆盖已有输出文件")
    speak.set_defaults(handler=_command_speak)

    download = subparsers.add_parser("download", help="按任务 ID 下载历史音频")
    download.add_argument("job_id", help="任务 ID，例如 job_1234")
    download.add_argument("--output", "-o", help="输出文件；默认使用任务 ID 命名")
    download.add_argument("--force", action="store_true", help="覆盖已有输出文件")
    download.set_defaults(handler=_command_download)
    return parser


def run_cli(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.timeout <= 0:
        parser.error("--timeout 必须大于 0")
    if args.command == "speak" and not 0.25 <= args.speed <= 4.0:
        parser.error("--speed 必须在 0.25 到 4.0 之间")
    if args.command == "jobs" and args.date:
        try:
            datetime.strptime(args.date, "%Y-%m-%d")
        except ValueError:
            parser.error("--date 必须使用 YYYY-MM-DD 格式")
    try:
        client = VoiceHubClient(
            args.base_url,
            args.api_key,
            timeout=args.timeout,
            allow_insecure_http=args.allow_insecure_http,
        )
        return int(args.handler(client, args))
    except CliError as exc:
        print(f"错误：{exc}", file=sys.stderr)
        return exc.exit_code
    except KeyboardInterrupt:
        print("已取消。", file=sys.stderr)
        return 130


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    raise SystemExit(run_cli())


if __name__ == "__main__":
    main()
