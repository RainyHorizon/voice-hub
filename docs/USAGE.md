# Voice Hub 使用指南

安装入口见 [README](../README.md)。本文介绍运行后的配置、调用、更新和数据维护；具体功能以正在使用的源码或 Release 版本为准。

## 账号与凭据

| 凭据 | 用途 | 配置位置 |
| --- | --- | --- |
| WebUI 管理密码 | 登录网页，管理账号、音色、任务与设置 | 首次访问时创建；设置 → 账户安全 |
| Gateway Key | 调用 `/v1/*` 兼容接口 | API 网关；Docker 使用 `VOICE_STUDIO_GATEWAY_KEY` |
| 厂商凭据 | Voice Hub 后端调用各家语音服务 | 设置 → 厂商账号；Docker 使用环境变量 |

不要把厂商 API Key 填作 Gateway Key。轮换 Gateway Key 后旧 Key 立即失效，需要同步修改调用方配置。

### 桌面与源码运行

在 **设置 → 厂商账号** 添加实际使用的厂商。Endpoint 默认使用官方地址，地区和模型需要与账号权限匹配。系统凭据存储如下：

| 系统 | 存储位置 |
| --- | --- |
| Windows | Windows Credential Manager |
| macOS | Keychain |
| Linux | Secret Service，例如 GNOME Keyring 或 KWallet |

凭据已保存不等于厂商合成可用。保存后检查账号状态，并生成一条短句确认模型权限、网络与额度。

火山引擎的语音 API Key 和项目/音色同步所需的 OpenAPI Access Key、Secret Key 用途不同。AK/SK 用于读取项目及其已有语音密钥，不需要云端同步时可以留空。同一账号可在项目区域管理多个项目；同步还需要对应的 IAM 权限。

### Docker 环境变量

Docker 使用环境变量凭据模式，账号由环境变量初始化；修改凭据后需重新创建容器。以仓库中的 [配置模板](../.env.example) 为准：

| 变量 | 用途 |
| --- | --- |
| `VOICE_STUDIO_GATEWAY_KEY` | 网关 Key，必须设置为随机长字符串 |
| `VOICE_STUDIO_DASHSCOPE_API_KEY` | 通义千问 |
| `VOICE_STUDIO_VOLCENGINE_API_KEY` | 火山引擎语音 |
| `VOICE_STUDIO_VOLCENGINE_OPENAPI_ACCESS_KEY`、`VOICE_STUDIO_VOLCENGINE_OPENAPI_SECRET_KEY` | 火山引擎项目与音色同步 |
| `VOICE_STUDIO_VOLCENGINE_PROJECT_NAME` | 火山引擎默认项目 |
| `VOICE_STUDIO_MINIMAX_API_KEY` | MiniMax |
| `VOICE_STUDIO_MIMO_API_KEY` | 小米 MiMo |
| `VOICE_STUDIO_VERSION` | 发布镜像版本，建议固定标签 |
| `VOICE_STUDIO_HOST_PORT` | 宿主机端口，默认 `8765` |
| `VOICE_STUDIO_AUTH_ENABLED` | WebUI 密码保护，默认 `true` |
| `VOICE_STUDIO_AUTH_SESSION_DAYS` | WebUI 会话有效天数，默认 `7` |
| `VOICE_STUDIO_MCP_ENABLED` | MCP 开关，默认 `true` |
| `VOICE_STUDIO_MCP_MAX_AUDIO_BYTES` | MCP 音频返回上限，默认 15 MB |

`.env` 是 Compose 的配置输入；源码启动脚本不会自动加载它。模板未转发的环境变量需要在 Compose 的 `environment` 中显式添加。不要提交真实 `.env` 或公开环境变量截图。

## 语音与音色

合成时先选模型，再选择兼容音色。音色库中的 **Voice ID** 是兼容 API 的调用标识，显示名称用于识别，两者可能不同。外部插件使用独立的 `plugin-<id>` 命名空间。

克隆或设计音色需要厂商和模型支持；部分厂商要求声音槽位、特定地区或额外开通权限。删除本地音色不会自动删除厂商控制台中的远端资源。

在 **设置 → 默认模型** 可修改三个别名：

| 别名 | 用途 |
| --- | --- |
| `tts-default` | 常用默认模型 |
| `tts-fast` | 速度优先 |
| `tts-hq` | 质量优先 |

别名只决定模型，不会自动把其他模型的音色转换成兼容音色。修改别名后，调用方仍应重新查询或选择音色。

## 命令行使用

先启动 Voice Hub，然后在项目或安装目录运行：

- Windows：`.\voicehub.cmd --help`
- Windows 便携版：`.\VoiceHub.exe cli --help`
- macOS/Linux：在 `backend` 目录运行 `.venv/bin/python -m app.cli --help`

当前 CLI 不提供 WebUI 登录或会话 Cookie 管理。因此启用默认的 WebUI 密码保护时：

- `doctor`、`models`、`speak` 调用兼容接口，需要显式提供 Gateway Key；自动读取 Key 的管理接口受网页登录保护。
- `voices`、`jobs`、`download` 还会访问管理接口，仅设置 Gateway Key 不能解除其会话要求。此时可使用已登录的 WebUI 或通过私有通道连接 MCP 完成查询和下载。

在终端通过自己的凭据管理方式设置 `VOICE_HUB_API_KEY`，不要将真实值写入脚本。非默认端口还需设置 `VOICE_HUB_BASE_URL`，例如 `http://127.0.0.1:8766`。远程 CLI 默认要求 HTTPS。

已配置 MiMo 和网关凭据后的 PowerShell 示例：

```powershell
.\voicehub.cmd doctor
.\voicehub.cmd --json models
.\voicehub.cmd speak "你好，这是 Voice Hub。" --model mimo/mimo-v2.5-tts --voice mimo-default --output .\voice.mp3
```

其他模型请替换为音色库中对应的模型和调用名称。长文本可使用 `speak --file .\script.txt`；文件须为 UTF-8。默认不覆盖已有输出，确认需要覆盖时再加 `--force`。

## 接入 Agent

安装的是 **一个 `voice-hub-tts` Skill**，连接的是 **一个 Voice Hub MCP 服务器**。二者用途不同：Skill 是工作流程说明，MCP 提供实际可调用的工具。

MCP 地址默认是 `http://127.0.0.1:8765/mcp`，传输方式选择 **Streamable HTTP**。服务与 WebUI 共用进程及端口，无需额外启动 MCP 进程；更换端口后客户端地址也要修改。

| 工具 | 用途 |
| --- | --- |
| `get_voice_hub_status` | 查询服务与已配置厂商摘要 |
| `list_tts_models` | 查询可用模型与别名绑定 |
| `list_voices` | 查询模型兼容音色 |
| `create_speech` | 生成语音，可能产生厂商费用 |
| `list_recent_speech_jobs` | 查询最近生成记录 |
| `get_speech_job` | 查询单个任务 |
| `get_speech_audio` | 读取已保存音频 |

支持 Skills CLI 的客户端可安装：

```bash
npx skills add RainyHorizon/voice-hub --skill voice-hub-tts
```

也可按客户端说明导入 [技能目录](../skills/voice-hub-tts)。支持 MCP Skills 扩展的客户端可从服务器扫描导入；扫描得到的是快照，更新 Skill 后需重新扫描。

MCP 音频默认最多返回 15 MB；更大的生成结果仍保存在任务历史中，可通过 WebUI 下载。MCP 当前没有独立的登录或 OAuth，WebUI 密码和 Gateway Key 也不保护它。只通过本机或受控私有通道连接；能连接的客户端可以读取历史并发起合成。不要用浏览器能否打开 `/mcp` 判断连接是否正常，应使用 MCP 客户端初始化与工具查询。

## 更新

| 安装方式 | 更新方法 |
| --- | --- |
| Windows 发布包 | 停止服务后运行 `更新 Voice Hub.bat`；安装版也可用新版 Setup 覆盖安装 |
| macOS/Linux 发布包 | 停止服务后运行 `bash update.sh` |
| Git 源码 | Windows 使用更新批处理，macOS/Linux 使用 `bash update.sh`，跟随当前分支上游 |
| Docker | 修改固定版本、拉取镜像并重建容器；详见部署指南 |

发布包更新器下载官方 Release 并校验 SHA256，保留 `data`。Git 更新要求官方远程、已配置上游且工作区干净，使用 fast-forward 更新；有本地改动或历史分叉时会停止。

仅检查更新、不安装：

```powershell
.\update.ps1 -CheckOnly
```

```bash
bash update.sh --check
```

源码新功能不会随着 `main` 更新自动出现在旧发布包或运行中的容器里；请选择需要的运行方式与版本。

## 数据与备份

普通源码和 Windows 便携版/安装版默认在程序根目录保存 `data/`。Tauri 打包版使用独立应用数据目录；若复用已运行后端，则使用该后端的数据。Docker 数据位置以卷挂载为准。

`data/` 包括任务数据库、生成与参考音频、网关配置、WebUI 密码哈希与会话、插件注册和配置，以及日志。备份时：

1. 停止 Voice Hub，完整复制 `data/` 或备份容器卷。
2. Docker 另外妥善保存 `.env` 或平台 Secret；桌面凭据位于系统密钥环，迁移到其他电脑后通常需要重新配置。
3. 插件服务文件和独立运行环境按各插件说明另行备份。

备份可能包含私人文本、音频和网关凭据，不能作为问题附件公开上传。恢复数据库前停止服务，避免覆盖正在使用的 SQLite 和 WAL 文件。

**设置 → 存储与清理** 可预览并执行清理。默认仅清理音频，任务文字记录仍保留；选择任务记录范围后，相关记录和音频一起删除。删除程序目录前请先备份；删除目录也不会移除系统密钥环内的凭据。

## 常见问题

### 忘记 WebUI 管理密码

源码或轻量版在 `backend` 目录使用该实例的 Python 环境运行：

```powershell
.\.venv\Scripts\python.exe -m app.auth_admin reset
```

macOS/Linux 对应 `.venv/bin/python -m app.auth_admin reset`。使用自定义数据目录时，需保留与服务一致的 `VOICE_STUDIO_ROOT`。重置会注销已有 WebUI 会话，不修改厂商凭据或 Gateway Key。

Docker 在项目的 Compose 目录运行：

```bash
docker compose exec voice-hub python -m app.auth_admin reset
```

便携版没有独立的密码重置启动参数；需要使用含应用代码与依赖的 Python 环境并将 `VOICE_STUDIO_ROOT` 指向其程序目录。不要删除数据库来重置密码；数据库还包含音色和历史。关闭 `VOICE_STUDIO_AUTH_ENABLED` 会关闭管理保护，不是常规找回密码步骤。

### 无法启动或浏览器打不开

检查启动窗口实际地址、端口和错误信息。Windows 启动器可在默认端口被占用时尝试其他端口；macOS/Linux 可通过 `--port` 指定。源码版确认 Python、Node.js、FFmpeg/FFprobe 和系统密钥环可用；便携版确认压缩包已完整解压、目录可写。

### 保存凭据成功，但生成失败

检查当前模型、音色与账号是否匹配，厂商地区、权限、额度和网络是否正常。服务健康检查只证明程序能响应，不证明上游合成可用。

### 插件页或市场为空

公共社区插件源尚未上线，仓库不附带可运行的语音插件。按 [插件开发文档](PLUGIN_DEVELOPMENT.md) 注册清单、启动独立服务，再刷新、检查连接并启用。检查连接只验证目录协议，仍需实际合成确认插件上游可用。

### 远程访问返回 Host 或 Origin 错误

默认只允许本机地址。反向代理时需要配置可信 Host 与浏览器 Origin，并重建容器；同时保留 WebUI 认证和外层访问控制。服务器部署细节见 [1Panel 指南](1PANEL.md)。
