# Voice Hub

**把多家语音服务汇集到一个工作台。**

Voice Hub 是一个开源、单用户、本地优先的语音工作台。你可以在浏览器中生成语音、克隆声音、设计音色和管理音频，也可以通过 OpenAI 兼容 API、CLI 或 MCP 将语音能力接入自己的应用与 Agent。

界面和任务数据由你自己的电脑或服务器管理；合成文本、参考音频等必要内容会发送到所选语音厂商或插件服务。核心不直接加载本地语音模型，厂商服务需要自行配置账号，调用可能产生费用。

[下载发布版](https://github.com/RainyHorizon/voice-hub/releases) · [使用指南](docs/USAGE.md) · [API 参考](docs/API.md) · [问题反馈](https://github.com/RainyHorizon/voice-hub/issues)

## 能做什么

| 功能 | 说明 |
| --- | --- |
| 语音合成 | 选择模型与音色生成语音，试听并下载 WAV、MP3、Opus、AAC、FLAC 或 PCM |
| 声音克隆与设计 | 使用已获授权的参考音频克隆声音，或用文字描述声音特征；能力随厂商和模型变化 |
| 音色库 | 管理预置、克隆和设计音色，导入支持厂商的云端音色，复制模型与音色调用 ID |
| 任务历史 | 查看生成记录，下载音频与文本，批量导出 ZIP 或删除记录 |
| 存储管理 | 设置保留天数、容量上限和自动清理周期，执行前预览清理范围 |
| API 网关 | OpenAI 兼容的模型查询与语音合成接口、SSE 流式接口和请求统计 |
| Agent 接入 | 一个 MCP 服务器、一个 `voice-hub-tts` Skill，以及命令行客户端 |
| 外部插件 | 通过独立 HTTP 服务扩展模型与音色，在统一插件页配置、启停和同步 |

## 厂商支持

| 厂商 | 语音合成 | 声音克隆 | 声音设计 | 云端音色导入 |
| --- | :---: | :---: | :---: | :---: |
| 通义千问 | ✓ | ✓ | ✓ | ✓ |
| 火山引擎 | ✓ | ✓ | — | ✓ |
| MiniMax | ✓ | ✓ | ✓ | ✓ |
| 小米 MiMo | ✓ | ✓ | ✓ | — |

可用模型、音色、地区、额度和权限以应用中的模型列表及厂商控制台为准。请只使用你有权使用的声音，并遵守厂商服务条款。

## 安装与启动

本 README 描述当前源码。发布包和 Docker 版本可能尚未包含最新源码功能，安装前可查看对应版本的 [更新日志](CHANGELOG.md) 和 Release 说明。

### Windows 用户

从 [GitHub Releases](https://github.com/RainyHorizon/voice-hub/releases) 选择发布包：

| 文件 | 适用情况 |
| --- | --- |
| `VoiceHub-*-Windows-Setup.exe` | 安装到当前用户目录，创建快捷方式 |
| `VoiceHub-*-Windows-Portable.zip` | 完整解压后直接使用，无需安装 |
| `VoiceHub-*-Windows.zip` | 轻量包，需自行安装 Python 3.11+、FFmpeg 和 FFprobe |

安装版和便携版包含 Python、后端依赖、前端文件与 FFmpeg。便携版请完整解压到有写入权限的文件夹，再双击 `启动 Voice Hub.bat`。

浏览器会打开启动器显示的地址，默认是 `http://127.0.0.1:8765`。使用期间保持启动窗口运行；结束时使用 `停止 Voice Hub.bat`。详细说明见 [便携版指南](PORTABLE_README.md)。

### 从源码运行

需要 Git、Python 3.11+、可在 `PATH` 中调用的 FFmpeg/FFprobe，以及 Node.js 22.12+。macOS/Linux 还需要可用的系统密钥环；无桌面的服务器建议使用 Docker。

Windows PowerShell：

```powershell
git clone https://github.com/RainyHorizon/voice-hub.git
Set-Location voice-hub
.\start.ps1 -OpenBrowser
```

macOS / Linux：

```bash
git clone https://github.com/RainyHorizon/voice-hub.git
cd voice-hub
bash start.sh --open-browser
```

启动脚本会准备后端虚拟环境、安装依赖，并在需要时构建前端。指定端口可使用 `.\start.ps1 -Port 8766 -OpenBrowser` 或 `bash start.sh --port 8766 --open-browser`。

### Docker Compose

需要 Docker Engine 或 Docker Desktop，以及 Compose：

```bash
git clone https://github.com/RainyHorizon/voice-hub.git
cd voice-hub
cp .env.example .env
```

编辑 `.env`，设置随机的 `VOICE_STUDIO_GATEWAY_KEY` 和所需厂商凭据，然后启动发布镜像：

```bash
docker compose up -d --no-build
```

默认访问地址为 `http://127.0.0.1:8765`，数据保存到 `./data`。需要运行当前源码时使用 `docker compose up -d --build`。长期部署建议固定已发布版本；1Panel 部署、备份和升级见 [服务器部署指南](docs/1PANEL.md)。

## 第一次生成语音

1. 打开 WebUI，按提示创建管理密码。
2. 在 **设置 → 厂商账号** 添加账号和 API Key；官方 Endpoint 已预填，通常无需修改。
3. 在 **语音合成** 选择该厂商的模型及兼容音色，输入一段文字并生成。
4. 在页面或 **任务历史** 中试听、下载结果。

需要外部调用时，在 **设置 → 默认模型** 配置 `tts-default`、`tts-fast` 和 `tts-hq` 的绑定，在 **API 网关** 查看 Gateway Key 和接入示例。WebUI 管理密码、Gateway Key 和厂商 API Key 用途不同，不能互相替代。

## 接入应用与 Agent

### OpenAI 兼容 API

默认 Base URL 为 `http://127.0.0.1:8765/v1`，请求使用 `Authorization: Bearer <Gateway Key>`。

| 接口 | 用途 |
| --- | --- |
| `GET /v1/models` | 查询模型和别名 |
| `POST /v1/audio/speech` | 生成完整音频 |
| `POST /v1/audio/speech/stream` | SSE 音频分片扩展接口 |

例如，已配置 MiMo 时可使用以下 Bash 示例；其他模型请替换为音色库中的兼容模型和 Voice ID：

```bash
curl http://127.0.0.1:8765/v1/audio/speech \
  -H "Authorization: Bearer $VOICE_HUB_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"mimo/mimo-v2.5-tts","voice":"mimo-default","input":"你好，欢迎使用 Voice Hub。","response_format":"mp3"}' \
  --output voice.mp3
```

`VOICE_HUB_API_KEY` 为当前终端中的网关凭据变量。参数、流式事件和错误格式见 [API 参考](docs/API.md)。

### MCP 与 Skill

在支持 Streamable HTTP 的客户端中添加一个 Voice Hub MCP 服务器，地址为 `http://127.0.0.1:8765/mcp`。这个服务器提供 **7 个工具**，覆盖状态、模型、音色、合成和历史音频查询。

`voice-hub-tts` 是 **一个 Skill**，用于指导 Agent 先查模型与兼容音色，再生成语音。支持 Skills CLI 的客户端可运行：

```bash
npx skills add RainyHorizon/voice-hub --skill voice-hub-tts
```

也可手动导入 [技能目录](skills/voice-hub-tts)。安装 Skill 不会自动启动 Voice Hub 或配置 MCP，连接方式见 [使用指南](docs/USAGE.md#接入-agent)。

### CLI

Windows 使用 `.\voicehub.cmd`，便携版还支持 `.\VoiceHub.exe cli`。例如，已配置 MiMo，并在当前终端设置 `VOICE_HUB_API_KEY` 后：

```powershell
.\voicehub.cmd doctor
.\voicehub.cmd models
.\voicehub.cmd speak "你好" --model mimo/mimo-v2.5-tts --voice mimo-default --output .\voice.mp3
```

命令行还提供音色查询、历史查询和下载。当前这些管理操作受 WebUI 会话限制，CLI 尚未提供网页登录功能，具体适用范围见 [CLI 使用说明](docs/USAGE.md#命令行使用)。

## 插件扩展

插件服务独立运行，模型和音色启用后接入原有合成页、音色库与网关。Voice Hub 核心不会加载插件代码或安装其依赖；插件可自行适配云端服务或本地引擎。

当前支持本机 HTTP 插件的清单注册、配置、启停与目录同步，尚未提供公共社区插件目录、第三方自动下载或自动更新。插件页为空时，可按 [插件开发文档](docs/PLUGIN_DEVELOPMENT.md) 添加服务清单；仓库提供 [清单示例](docs/PLUGIN_MANIFEST.example.json)，不附带可直接运行的语音插件。

## 数据、隐私与更新

- 任务、音色元数据、生成音频和插件配置保存在运行实例的 `data/` 中。升级或迁移前请停止服务并备份。
- 桌面/源码运行时，厂商凭据保存到系统密钥环；Docker 从环境变量读取。仅复制 `data/` 不会复制系统密钥环中的凭据。
- 生成语音会向你选择的厂商或插件发送必要的文本及音频；数据不自动上传到项目维护者的服务器。
- WebUI 密码保护管理接口，Gateway Key 保护兼容 API。MCP 当前没有独立身份认证或 OAuth，只适合本机和受控私有通道。
- Windows 使用 `更新 Voice Hub.bat`，macOS/Linux 使用 `bash update.sh`。发布包更新至正式 Release；Git 源码更新跟随当前分支上游。Docker 需要手动拉取镜像并重建容器。

密码重置、备份、更新与排障见 [使用指南](docs/USAGE.md)。

## 文档与贡献

| 文档 | 内容 |
| --- | --- |
| [使用指南](docs/USAGE.md) | 配置凭据、CLI/MCP、更新、备份与常见问题 |
| [API 参考](docs/API.md) | 鉴权、兼容 API、MCP 和管理接口 |
| [插件开发](docs/PLUGIN_DEVELOPMENT.md) | 声明式配置、HTTP 协议和插件生命周期 |
| [架构说明](docs/ARCHITECTURE.md) | 数据流、模块职责、扩展与开发检查 |
| [1Panel 部署](docs/1PANEL.md) | 服务器部署、升级与回滚 |
| [桌面外壳开发](desktop/README.md) | Tauri 开发环境与构建说明 |
| [更新日志](CHANGELOG.md) | 已发布版本和未发布改动 |

欢迎通过 [Issues](https://github.com/RainyHorizon/voice-hub/issues) 反馈问题，或提交 Pull Request。请说明复现步骤、运行方式及版本，并移除日志中的密钥、私人文本和音频信息。新厂商和插件接入请附上相关测试与文档。

## 许可证

项目使用 [MIT License](LICENSE)。第三方组件说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)；厂商服务与生成内容还需遵守各自条款。
