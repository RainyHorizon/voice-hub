# API 参考

Voice Hub 默认在本机 `http://127.0.0.1:8765` 提供管理 API 和 OpenAI 兼容网关。启动后也可以打开 FastAPI 自动生成的交互文档：

- Swagger UI：`http://127.0.0.1:8765/docs`
- OpenAPI JSON：`http://127.0.0.1:8765/openapi.json`

## 鉴权

网关接口使用 Bearer Key：

```http
Authorization: Bearer <Gateway Key>
```

 Gateway Key 可在网页的“API 网关”页面查看或轮换。`GET /api/gateway` 默认只返回脱敏提示；只有本机可信网页明确请求 `?reveal=true` 时才返回完整 Key。远程部署不要依赖该接口自动获取密钥。不要把厂商 API Key 放入客户端请求；网关会在本机后端读取系统密钥环或 Docker 环境变量。

## MCP

Voice Hub 默认在同一端口提供 Streamable HTTP MCP：

```text
POST http://127.0.0.1:8765/mcp
```

该端点使用 MCP JSON-RPC/Streamable HTTP 协议，不是普通 REST 接口。应由 ChatGPT、Codex 或其他 MCP 客户端连接，不要用浏览器直接打开来判断是否正常。

### 工具

| 工具 | 只读 | 是否访问远程厂商 | 说明 |
| --- | :---: | :---: | --- |
| `get_voice_hub_status` | 是 | 否 | 返回版本、模型/音色数量和已配置厂商摘要 |
| `list_tts_models` | 是 | 否 | 返回可合成模型及常用模型别名的实际目标 |
| `list_voices` | 是 | 否 | 按模型或别名返回兼容音色的调用名称 |
| `create_speech` | 否 | 是 | 生成语音并返回任务信息和音频，可能产生厂商费用 |
| `list_recent_speech_jobs` | 是 | 否 | 返回最近任务，不暴露服务器文件路径 |
| `get_speech_job` | 是 | 否 | 返回一个任务的元数据 |
| `get_speech_audio` | 是 | 否 | 返回已保存且未超过大小上限的任务音频 |

`create_speech` 的主要参数是 `text`、`voice`、`model`、`response_format`、`speed` 和 `instructions`。默认模型为 `tts-default`，默认格式为 `mp3`。Agent 应先调用 `list_tts_models` 和 `list_voices`，不能根据显示名称猜测音色调用 ID。

音频通过 MCP `AudioContent` Base64 返回，同时在 `structuredContent` 中提供任务 ID、解析后的真实模型、音色、格式、大小和是否包含音频。默认上限为 15 MB；超过 `VOICE_STUDIO_MCP_MAX_AUDIO_BYTES` 时不会把大文件塞进 MCP 响应，应使用 CLI 或 WebUI 按任务 ID 下载。

### Skills 扩展

服务声明 `io.modelcontextprotocol/skills` 扩展并提供：

| 方法 | 用途 |
| --- | --- |
| `skills/list` | 列出内置的 `voice-hub-tts` Skill 和资源摘要 |
| `skills/get` | 按名称读取 Skill 描述符 |
| `resources/read` | 读取 `SKILL.md` 与 CLI 参考文档 |

Skill 资源使用 `skill://voice-hub-tts/...` URI，并带 SHA-256 摘要。客户端扫描导入后保存的是静态快照，服务器升级后需要重新扫描。

### 安全边界

当前 MCP 没有独立的公网 OAuth 登录，默认只适合环回地址、SSH/Tailscale 私有通道或 Secure MCP Tunnel。不要直接把 `8765` 或 `/mcp` 反向代理到公网；公开插件需要稳定 HTTPS、OAuth、访问控制和限流，这不在当前实现范围内。

## OpenAI 兼容接口

### `GET /v1/models`

返回已配置厂商的模型列表，以及模型支持的操作、克隆能力和流式能力。

### `GET /v1/models/{model_id}`

查询单个模型。`model_id` 可以是带厂商前缀的完整模型 ID、能够唯一匹配的短模型 ID，也可以使用内置别名。例如 `volcengine/seed-icl-2.0` 与 `seed-icl-2.0` 都能定位到 Seed 声音复刻 2.0：

| 别名 | 用途 |
| --- | --- |
| `tts-default` | 默认语音模型 |
| `tts-fast` | 低延迟模型 |
| `tts-hq` | 高质量模型 |

三个别名可以在网页的“设置 → 默认模型”区域修改，分别绑定到任意已配置且支持语音合成的模型。修改后立即生效；恢复默认会指向 `mimo/mimo-v2.5-tts`、`dashscope/qwen3-tts-flash`、`mimo/mimo-v2.5-tts`。也可以使用本地管理接口读取或修改：`GET /api/gateway/aliases`、`PUT /api/gateway/aliases/{alias}`、`POST /api/gateway/aliases/reset`。

### `POST /v1/audio/speech`

生成完整音频文件。请求体：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | :---: | --- |
| `model` | string | 是 | 唯一短模型 ID、完整 `provider/model` ID 或模型别名 |
| `voice` | string | 是 | 与模型兼容的 `api_voice_id`；通常为厂商真实 Voice ID |
| `input` | string | 是 | 待合成文本，最多 10000 字符 |
| `response_format` | string | 否 | `wav`、`mp3`、`opus`、`aac`、`flac` 或 `pcm`，默认 `mp3` |
| `speed` | number | 否 | `0.25` 到 `4.0`，默认 `1.0` |
| `instructions` | string | 否 | 支持指令控制的模型可使用，最多 2000 字符 |

成功时直接返回音频二进制，并附带 `X-Voice-Hub-Job`、`X-Voice-Hub-Request-Id`、响应格式和延迟等响应头。PCM 是 `s16le` 原始数据，采样率、声道数和位深见 `X-Voice-Hub-PCM-*` 响应头。

管理接口 `GET /api/voices` 会为每条音色返回 `api_voice_id`。它优先使用厂商返回的 `provider_voice_id`，因此可以直接复制到兼容接口的 `voice` 字段；如果某类模型没有厂商永久 Voice ID，则回退为 Voice Hub 的唯一 `public_name`。为兼容已有调用，`public_name` 仍可继续作为 `voice` 请求值。

### `POST /v1/audio/speech/stream`

通过 Server-Sent Events（SSE）返回音频分片。请求体与上一个接口相同，并可增加：

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | ---: | --- |
| `chunk_size` | integer | `8192` | `1024` 到 `65536`，控制兼容分片大小 |

每个事件的 `data` 是 JSON：

| 事件 | 主要字段 | 说明 |
| --- | --- | --- |
| `audio` | `audio`、`index` | `audio` 为 Base64 音频分片 |
| `done` | `job_id`、`provider`、`native_streaming` | 流式生成完成 |
| `error` | `code`、`message` | 生成或上游请求失败 |

示例：

```bash
curl.exe -N "http://127.0.0.1:8765/v1/audio/speech/stream" \
  -H "Authorization: Bearer $VOICE_STUDIO_GATEWAY_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"tts-default","voice":"mimo-default","input":"你好","response_format":"mp3"}'
```

## 错误格式

网关将错误统一为：

```json
{
  "error": {
    "message": "可读错误信息",
    "type": "invalid_request_error",
    "code": "invalid_request"
  }
}
```

常见状态码：

| 状态码 | 含义 |
| ---: | --- |
| `400` | 请求字段、模型、音色或格式无效 |
| `401` | Gateway Key 缺失或错误 |
| `404` | 模型或资源不存在 |
| `409` | 厂商未配置、模型不支持该操作或资源冲突 |
| `502` | 厂商接口或上游音频下载失败 |

## 本地管理 API

网页界面使用 `/api/*` 管理接口完成账号、音色、任务和存储操作。这些接口默认只绑定本机，不是面向公网的独立用户管理 API。部署到局域网或公网前，应增加管理认证、HTTPS 和限流。

主要资源：

| 路径 | 用途 |
| --- | --- |
| `/api/provider-accounts` | 管理厂商账号元数据 |
| `/api/provider-accounts/{account_id}/projects` | 查看、添加或删除火山引擎项目；同一账号可管理多个项目 |
| `/api/provider-accounts/{account_id}/projects/sync` | 使用火山 IAM AK/SK 同步项目列表，并读取各项目已有的语音 API Key；只返回密钥名称、脱敏提示和状态 |
| `/api/provider-accounts/{account_id}/volcengine-slots` | 按指定项目查询可用声音槽位 |
| `/api/models`、`/api/voices` | 读取模型和音色库 |
| `/api/voices/clone`、`/api/voices/design` | 创建克隆或设计音色 |
| `/api/jobs` | 查询、下载、导出和删除任务 |
| `/api/storage` | 读取和更新存储策略 |
| `/api/gateway` | 读取本机网关配置 |

