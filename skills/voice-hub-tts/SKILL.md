---
name: voice-hub-tts
description: Use Voice Hub through its MCP tools or CLI to inspect TTS models and voices, generate requested speech, and retrieve saved audio. Apply only to Voice Hub workflows, not unrelated audio tools or local-model TTS products.
---

# Voice Hub TTS

Use an already connected Voice Hub MCP server when its tools are available. Use the CLI when working on a machine that has the Voice Hub client but no MCP connection. Do not ask the user for provider API keys; Voice Hub owns provider configuration.

## Choose a path

- MCP: call `get_voice_hub_status`, `list_tts_models`, `list_voices`, `create_speech`, `list_recent_speech_jobs`, `get_speech_job`, or `get_speech_audio`.
- CLI: read [references/cli.md](references/cli.md) only when CLI commands are needed.
- If neither is available, explain that Voice Hub must be running and connected; do not substitute another TTS service without the user's request.

## Generate speech

1. Resolve the model before choosing a voice. Use `tts-default` unless the user specifies otherwise; prefer `tts-fast` for speed and `tts-hq` for quality.
2. Query compatible voices for that model. Never invent or infer a voice ID from its display name.
3. If text, voice, or model is materially ambiguous, ask for the missing choice. Do not generate sample audio merely to test a guess.
4. Call the generation operation only after the user explicitly asks to create audio. It may contact a remote provider and incur charges.
5. Report the resolved model, voice, task ID, format, and returned audio or saved file. If MCP reports that audio is too large, use the CLI download flow when available.

Keep credentials, server filesystem paths, and hidden provider identifiers out of the response. Prefer MP3 unless the user requests another format.
