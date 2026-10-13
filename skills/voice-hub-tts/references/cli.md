# Voice Hub CLI

Use these commands only when the Voice Hub MCP tools are unavailable or when the user needs a local file. The examples use the repository launcher `voicehub.cmd`; packaged builds can use `VoiceHub.exe cli` with the same arguments.

The local service defaults to `http://127.0.0.1:8765`. Set `VOICE_HUB_BASE_URL` when using another port or a remote HTTPS server. Keep the Gateway Key in `VOICE_HUB_API_KEY`; never print it.

The current CLI does not implement WebUI login or session cookies. With WebUI password protection enabled, Gateway Key discovery and management endpoints require a session: supply the Gateway Key explicitly for `doctor`, `models`, and `speak`. `voices`, `jobs`, and `download` still require management access; a Gateway Key alone does not authorize them. Prefer connected MCP tools or the authenticated WebUI for these operations. Do not disable authentication merely to make a command work. The management examples below apply only where management access is already available.

## Inspect before generating

```powershell
.\voicehub.cmd doctor
.\voicehub.cmd models
.\voicehub.cmd voices --model tts-default
```

Use the calling name returned by `voices` or an ID already queried through MCP/the authenticated WebUI, not a guessed display name. Resolve the model/voice pair before generating.

## Generate an audio file

```powershell
.\voicehub.cmd speak "要朗读的文字" --model tts-default --voice "音色调用名称" --format mp3 --output .\voice.mp3
```

For longer text, prefer a UTF-8 file:

```powershell
.\voicehub.cmd speak --file .\script.txt --model tts-default --voice "音色调用名称" --output .\voice.mp3
```

Do not add `--force` unless the user has authorized overwriting the existing output.

## Retrieve history

```powershell
.\voicehub.cmd jobs --limit 20
.\voicehub.cmd download job_1234 --output .\job_1234.mp3
```

For machine-readable inspection, place the global `--json` option before the command:

```powershell
.\voicehub.cmd --json voices --model tts-default
```

For a remote server, require HTTPS by default:

```powershell
$env:VOICE_HUB_BASE_URL = "https://voice.example.com"
$env:VOICE_HUB_API_KEY = "<Gateway Key>"
.\voicehub.cmd doctor
```

Use `--allow-insecure-http` only for a user-approved trusted private network. It must not be the default for an Internet-facing server.
