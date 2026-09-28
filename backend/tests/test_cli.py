from __future__ import annotations

import io
import json
import tempfile
import unittest
import urllib.error
from email.message import Message
from pathlib import Path
from unittest.mock import patch

from app import cli


class FakeResponse:
    def __init__(self, content: bytes, content_type: str = "application/json"):
        self.content = content
        self.headers = Message()
        self.headers["Content-Type"] = content_type
        self.headers["X-Voice-Hub-Job"] = "job_test"
        self.headers["X-Voice-Hub-Request-Id"] = "req_test"
        self.headers["X-Voice-Hub-Latency-Ms"] = "42"

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self) -> bytes:
        return self.content


def json_response(payload):
    return FakeResponse(json.dumps(payload, ensure_ascii=False).encode("utf-8"))


class VoiceHubClientTests(unittest.TestCase):
    def test_normalize_base_url_accepts_openai_style_v1_url(self):
        self.assertEqual(cli.normalize_base_url("127.0.0.1:8765/v1/"), "http://127.0.0.1:8765")

    def test_remote_http_requires_explicit_opt_in(self):
        with self.assertRaisesRegex(cli.CliError, "远程服务必须使用 HTTPS"):
            cli.VoiceHubClient("http://voice.example.com")

    @patch("app.cli.urllib.request.urlopen")
    def test_local_gateway_key_is_discovered_before_models_request(self, urlopen):
        urlopen.side_effect = [
            json_response({"key_exposed": True, "key": "local-key"}),
            json_response({"object": "list", "data": [{"id": "tts-default"}]}),
        ]
        client = cli.VoiceHubClient("http://127.0.0.1:8765")

        self.assertEqual(client.models(), [{"id": "tts-default"}])
        self.assertEqual(urlopen.call_count, 2)
        second_request = urlopen.call_args_list[1].args[0]
        self.assertEqual(second_request.get_header("Authorization"), "Bearer local-key")

    def test_remote_gateway_key_is_never_auto_discovered(self):
        client = cli.VoiceHubClient("https://voice.example.com")
        with self.assertRaisesRegex(cli.CliError, "VOICE_HUB_API_KEY"):
            client.models()

    @patch("app.cli.urllib.request.urlopen")
    def test_api_error_message_is_read_from_gateway_response(self, urlopen):
        headers = Message()
        headers["Content-Type"] = "application/json"
        urlopen.side_effect = urllib.error.HTTPError(
            "http://127.0.0.1:8765/v1/audio/speech",
            400,
            "Bad Request",
            headers,
            io.BytesIO(json.dumps({"error": {"message": "音色与模型不兼容"}}).encode()),
        )
        client = cli.VoiceHubClient("http://127.0.0.1:8765", "test-key")
        with self.assertRaisesRegex(cli.CliError, "音色与模型不兼容"):
            client.speak(
                model="tts-default",
                voice="wrong",
                text="你好",
                response_format="mp3",
                speed=1,
                instructions=None,
            )


class CliCommandTests(unittest.TestCase):
    @patch("app.cli.urllib.request.urlopen")
    def test_speak_writes_audio_and_reports_metadata(self, urlopen):
        urlopen.return_value = FakeResponse(b"fake-mp3", "audio/mpeg")
        with tempfile.TemporaryDirectory() as temporary_directory:
            output = Path(temporary_directory) / "voice.mp3"
            stdout = io.StringIO()
            with patch("sys.stdout", stdout):
                exit_code = cli.run_cli(
                    [
                        "--api-key",
                        "test-key",
                        "speak",
                        "你好",
                        "--voice",
                        "mimo-default",
                        "--output",
                        str(output),
                    ]
                )

            self.assertEqual(exit_code, 0)
            self.assertEqual(output.read_bytes(), b"fake-mp3")
            self.assertIn("job_test", stdout.getvalue())
            request = urlopen.call_args.args[0]
            body = json.loads(request.data.decode("utf-8"))
            self.assertEqual(body["input"], "你好")
            self.assertEqual(body["model"], "tts-default")

    @patch("app.cli.VoiceHubClient.voices")
    @patch("app.cli.VoiceHubClient.aliases", return_value={"tts-fast": "dashscope/qwen3-tts-flash"})
    def test_voices_resolves_alias_before_filtering(self, _aliases, voices):
        voices.return_value = [
            {
                "id": "voice_qwen",
                "public_name": "Cherry",
                "display_name": "芊悦",
                "provider": "dashscope",
                "model_id": "qwen3-tts-flash",
                "languages": ["zh-CN"],
                "voice_type": "preset",
            },
            {
                "id": "voice_mimo",
                "public_name": "mimo-default",
                "display_name": "默认",
                "provider": "mimo",
                "model_id": "mimo-v2.5-tts",
                "languages": ["zh-CN"],
                "voice_type": "preset",
            },
        ]
        stdout = io.StringIO()
        with patch("sys.stdout", stdout):
            exit_code = cli.run_cli(["--api-key", "test-key", "voices", "--model", "tts-fast"])

        self.assertEqual(exit_code, 0)
        self.assertIn("Cherry", stdout.getvalue())
        self.assertNotIn("mimo-default", stdout.getvalue())

    def test_existing_output_requires_force(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            output = Path(temporary_directory) / "voice.mp3"
            output.write_bytes(b"original")
            with self.assertRaisesRegex(cli.CliError, "--force"):
                cli._write_binary(output, b"replacement", force=False)
            self.assertEqual(output.read_bytes(), b"original")


if __name__ == "__main__":
    unittest.main()
