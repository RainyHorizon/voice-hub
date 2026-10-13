# API 参考

Voice Hub 默认在本机 `http://127.0.0.1:8765` 提供管理 API 和 OpenAI 兼容网关。启动后也可以打开 FastAPI 自动生成的交互文档：

- Swagger UI：`http://127.0.0.1:8765/docs`
- OpenAPI JSON：`http://127.0.0.1:8765/openapi.json`

## 鉴权

三类接口的认证不同：

| 接口 | 认证方式 |
| --- | --- |
| `/api/*` 管理接口 | WebUI 登录会话 Cookie；`/api/summary` 和认证流程端点例外 |
| `/v1/*` 兼容接口 | Gateway Key，使用 Bearer Header |
| `/mcp` | 当前无独立身份认证或 OAuth，仅用于本机或受控私有通道 |

管理密码与 Gateway Key 不能互相替代。WebUI 登录不会自动为 CLI 建立会话，Gateway Key 也不能用于解锁管理接口。

### WebUI 管理密码

WebUI 管理接口默认启用单用户密码。首次打开网页时调用 `GET /api/auth/status`，如果尚未设置密码，网页会显示创建密码页面；已有密码时需要先登录。登录成功后服务端通过 HttpOnly、SameSite Cookie 维持会话，密码只以 PBKDF2-SHA256 哈希形式保存在 SQLite 中。

登录后的密码修改和退出登录位于 **设置 → 账户安全**。

| 路径 | 用途 |
| --- | --- |
| `GET /api/auth/status` | 查看是否启用、是否已设置密码和当前会话状态 |
| `POST /api/auth/setup` | 首次设置密码，JSON 字段为 `password`、`confirmation` |
| `POST /api/auth/login` | 登录，JSON 字段为 `password` |
| `POST /api/auth/logout` | 注销当前 WebUI 会话 |
| `POST /api/auth/password` | 登录后修改密码，需提供 `current_password`、`password`、`confirmation` |

WebUI 密码只保护 `/api/*` 管理接口，不替代兼容接口的 Gateway Key，也不保护 `/mcp`。忘记密码时，在 `backend` 目录用应用的 Python 环境执行 `python -m app.auth_admin reset` 进行交互式重置；Docker 使用 `docker compose exec voice-hub python -m app.auth_admin reset`。运行环境和数据目录要求见 [使用指南](USAGE.md#忘记-webui-管理密码)。密码保护可以通过 `VOICE_STUDIO_AUTH_ENABLED=false` 明确关闭，仅适用于可信本机环境。

网关接口使用 Bearer Key：

```http
Authorization: Bearer <Gateway Key>
```

Gateway Key 可在网页的“API 网关”页面查看或轮换。`GET /api/gateway` 默认只返回脱敏提示；只有满足管理认证与本机请求检查的调用显式传入 `?reveal=true` 时才返回完整 Key。环境变量管理的 Key 不能在网页轮换。远程部署不要依赖该接口自动获取密钥。不要把厂商 API Key 放入客户端请求；网关会在后端读取系统密钥环或 Docker 环境变量。

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

当前 MCP 没有独立身份认证或 OAuth，WebUI 密码和网关 Bearer Key 不保护该端点。能连接的客户端可以调用工具，包括读取历史音频与生成语音。默认只适合环回地址或带访问控制的 SSH/Tailscale 等私有通道；若使用 MCP 隧道，应由隧道服务负责身份验证。不要直接将 `/mcp` 公开反向代理到互联网。

## OpenAI 兼容接口

### `GET /v1/models`

返回已配置厂商及已启用插件的模型列表，以及模型支持的操作、克隆能力和流式能力。

### `GET /v1/models/{model_id}`

查询单个模型。`model_id` 可以是带厂商前缀的完整模型 ID、能够唯一匹配的短模型 ID，也可以使用内置别名。例如 `volcengine/seed-icl-2.0` 与 `seed-icl-2.0` 都能定位到 Seed 声音复刻 2.0：

| 别名 | 用途 |
| --- | --- |
| `tts-default` | 默认语音模型 |
| `tts-fast` | 低延迟模型 |
| `tts-hq` | 高质量模型 |

三个别名可以在网页的“设置 → 默认模型”区域修改，分别绑定到任意已配置且支持语音合成的模型。修改后立即生效；恢复默认会指向 `mimo/mimo-v2.5-tts`、`dashscope/qwen3-tts-flash`、`mimo/mimo-v2.5-tts`。也可以使用需登录会话的管理接口读取或修改：`GET /api/gateway/aliases`、`PUT /api/gateway/aliases/{alias}`、`POST /api/gateway/aliases/reset`。修改绑定后需选择新模型的兼容音色。

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

这是 Voice Hub 的扩展接口，通过 Server-Sent Events（SSE）返回音频分片；不代表所有 OpenAI 客户端都支持此路径与事件格式。原生流式由模型能力决定，不支持时使用合成后的分片回退。请求体与上一个接口相同，并可增加：

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | ---: | --- |
| `chunk_size` | integer | `8192` | `1024` 到 `65536`，控制兼容分片大小 |

每个事件的 `data` 是 JSON：

| 事件 | 主要字段 | 说明 |
| --- | --- | --- |
| `audio` | `audio`、`index` | `audio` 为 Base64 音频分片 |
| `done` | `job_id`、`provider`、`native_streaming` | 流式生成完成 |
| `error` | `code`、`message` | 生成或上游请求失败 |

Bash 示例（`VOICE_HUB_API_KEY` 为已设置的 Gateway Key；需先配置 MiMo）：

```bash
curl -N "http://127.0.0.1:8765/v1/audio/speech/stream" \
  -H "Authorization: Bearer $VOICE_HUB_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"mimo/mimo-v2.5-tts","voice":"mimo-default","input":"你好","response_format":"mp3"}'
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

网页界面使用 `/api/*` 管理接口完成账号、音色、任务和存储操作。它们默认由单用户 WebUI 会话保护，不提供多用户权限隔离。部署到局域网或公网前，保留内置认证，并配置 HTTPS、可信 Host/Origin、外层访问控制和限流。CLI 当前不能自动建立 WebUI 会话，访问这些接口的限制见 [使用指南](USAGE.md#命令行使用)。

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

### 插件管理

插件管理沿用 WebUI 会话，不能使用 Gateway Key 代替：

| 方法与路径 | 用途 |
| --- | --- |
| `GET /api/plugins` | 已安装清单、状态、声明式配置与音色数量 |
| `GET /api/plugins/market` | 可选示例清单；没有可用示例时返回空数组，不连接公共市场 |
| `POST /api/plugins/refresh` | 重新扫描本机注册目录 |
| `POST /api/plugins/{id}/install` | 注册实现中已知且本机存在的示例清单，不下载依赖或启动服务 |
| `POST /api/plugins/{id}/enable` | 验证服务身份与目录后启用 |
| `POST /api/plugins/{id}/disable` | 停用，保留历史与配置 |
| `POST /api/plugins/{id}/refresh` | 同步模型与音色目录 |
| `POST /api/plugins/{id}/check` | JSON `{"config":{...}}`，检查连接，不保存或启用 |
| `PUT /api/plugins/{id}/config` | JSON `{"config":{...}}`，校验并保存配置 |
| `DELETE /api/plugins/{id}` | 卸载注册；保留历史音频并备份注册目录 |

新插件通过清单文件注册，不通过示例安装接口上传。服务协议、配置字段和卸载行为见 [插件开发文档](PLUGIN_DEVELOPMENT.md)。

