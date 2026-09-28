# Voice Hub

Voice Hub 是一个本地运行的多厂商云端语音工作台。它通过 API 远程调用通义千问、火山引擎、MiniMax 和小米 MiMo 的语音服务，将模型、音色和任务集中在一个网页界面中，并提供 OpenAI 兼容 API，方便其他应用调用。Voice Hub 本身不加载或运行本地语音模型。

API Key、音频、任务历史和音色信息默认保存在本机，不会上传到 Voice Hub 服务端。

## 主要功能

| 功能 | 说明 |
| --- | --- |
| 语音合成 | 按厂商、模型和音色生成语音，支持试听与下载 |
| 声音克隆 | 上传已获授权的参考音频，创建可复用音色 |
| 声音设计 | 用文字描述声音特征并生成试听音色 |
| 音色库 | 按厂商筛选音色，单行查看可复制的真实 Voice ID、模型名称、模型 ID、类型与语言 |
| 任务历史 | 查看生成记录，下载音频和文字，批量导出 ZIP 或删除记录 |
| 存储策略 | 设置音频保留天数、容量上限和自动清理周期 |
| API 网关 | 提供 OpenAI 兼容的模型、语音合成和 SSE 流式接口；模型别名在设置中统一管理 |
| 运行诊断 | 查看 Python、FFmpeg、凭据存储和前端状态 |

声音克隆和声音设计只能用于你已经获得授权的声音或描述，并应遵守相关法律及厂商条款。

## 厂商能力

| 厂商 | 语音合成 | 声音克隆 | 声音设计 | 已有云端音色导入 |
| --- | :---: | :---: | :---: | :---: |
| 通义千问 | 支持 | 支持 | 支持 | 支持 |
| 火山引擎 | 支持 | 支持 | 不支持 | 支持 |
| MiniMax | 支持 | 支持 | 支持 | 支持 |
| 小米 MiMo | 支持 | 支持 | 支持 | 不提供 |

每个厂商可用的模型、音色、地区和额度不同，最终以应用中的模型列表及厂商控制台为准。

## 运行方式

| 方式 | 推荐对象 | 需要安装 |
| --- | --- | --- |
| Windows 便携版 | 普通 Windows 用户 | 不需要 Python、Node.js 或 FFmpeg |
| Windows 轻量版 | 已安装运行环境的 Windows 用户 | Python 3.11+、FFmpeg |
| 源码启动 | Windows、macOS、Linux 开发者 | Python 3.11+、FFmpeg；首次构建前端需要 Node.js 20+ |
| Docker Compose | 服务器或容器用户 | Docker Desktop 或 Docker Engine + Compose |

### Windows 便携版

1. 在 [Releases](https://github.com/RainyHorizon/voice-hub/releases) 下载 `VoiceHub-*-Windows-Portable.zip`。
2. 将压缩包完整解压到有写入权限的普通文件夹，不要直接在压缩包预览窗口中运行。
3. 双击 `启动 Voice Hub.bat`。
4. 浏览器打开启动器显示的地址，默认是 `http://127.0.0.1:8765`。
5. 使用完毕后双击 `停止 Voice Hub.bat`；它会自动识别并停止 Voice Hub 使用的本地端口。

便携版包含运行所需的 Python、后端依赖、前端文件、FFmpeg 和 FFprobe。数据库、音频和网关配置保存在程序目录的 `data` 文件夹中。升级时请保留这个文件夹。

从首个包含自动更新器的版本开始，可先关闭 Voice Hub，再双击 `更新 Voice Hub.bat`。更新器会自动识别 Portable、Windows 轻量版或 Git 源码目录，并选择对应的安全更新方式。更早的便携版需要先手动升级一次。

### Windows 轻量版

在 Releases 下载 `VoiceHub-*-Windows.zip` 并完整解压，安装 Python 3.11+ 和 FFmpeg 后，双击 `启动 Voice Hub.bat`。使用完毕后可双击 `停止 Voice Hub.bat`。轻量版已包含预构建前端，通常不需要安装 Node.js。

### Windows 安装版（EXE）

Release 同时提供 `VoiceHub-*-Windows-Setup.exe`。它是 Inno Setup 安装包，默认安装到当前用户的 `%LOCALAPPDATA%\Voice Hub`，不需要管理员权限，并创建开始菜单和桌面快捷方式。安装包内包含独立 Python、FFmpeg、FFprobe 和前端文件，用户不需要另行安装运行环境。`data` 和系统密钥环中的 API Key 会保留在升级过程中。

安装版与便携版使用相同的程序核心；升级时可以运行新版 Setup 覆盖安装。当前目录更新器会轮询 GitHub 并下载、校验 Portable 包后替换程序文件。首次安装后，Windows 客户端只能通过“检查更新”或启动时轮询发现新版本，GitHub 无法直接向离线客户端推送进程消息。

自动更新器仅信任 `RainyHorizon/voice-hub` 官方仓库，并会在替换程序文件前校验 Release 中提供的 SHA256。

### Windows 源码启动

先安装 Python 3.11+ 和 FFmpeg，并将它们加入系统 `Path`。如果仓库没有预构建的前端文件，还需要 Node.js 20+。

```powershell
git clone https://github.com/RainyHorizon/voice-hub.git
Set-Location voice-hub
.\start.ps1 -OpenBrowser
```

不希望自动打开浏览器时运行：

```powershell
.\start.ps1
```

指定端口示例：

```powershell
.\start.ps1 -Port 8766 -OpenBrowser
```

### macOS / Linux 源码启动

安装 Python 3.11+、FFmpeg/FFprobe，并确保当前用户可以使用系统密钥环（macOS Keychain，或 Linux Secret Service、GNOME Keyring、KWallet）。

```bash
git clone https://github.com/RainyHorizon/voice-hub.git
cd voice-hub
chmod +x start.sh
./start.sh --open-browser
```

`start.sh` 会自动创建 `backend/.venv`、安装后端依赖，并在需要时构建前端。

项目 CI 会在真实 macOS Runner 上读写并删除一条临时 Keychain 凭据，也会在 Ubuntu Runner 的临时 D-Bus 会话中验证 GNOME Keyring/Secret Service。该检查覆盖系统密钥环适配路径，但无法代替用户电脑上的桌面会话、锁屏状态和钱包解锁验证；遇到诊断异常时仍应在实际安装环境运行一次设置页检查。

## 命令行工具

先启动 Voice Hub，再在程序或源码根目录打开 PowerShell。Windows 便携版、安装版和轻量版均可使用同一入口：

```powershell
.\voicehub.cmd doctor
```

常用命令：

```powershell
.\voicehub.cmd models
```

```powershell
.\voicehub.cmd voices --model tts-default --language zh-CN
```

```powershell
.\voicehub.cmd speak "你好，这是 Voice Hub 命令行生成的语音。" --model tts-default --voice mimo-default --output .\voice.mp3
```

```powershell
.\voicehub.cmd jobs --limit 10
```

```powershell
.\voicehub.cmd download job_123456789abc --output .\history.mp3
```

本机调用会从正在运行的本机服务安全读取 Gateway Key，不需要把 Key 写进命令历史。`voice` 应填写 `voices` 命令显示的“调用名称”，不是随意填写的显示名称。默认不会覆盖已有输出文件；确实需要覆盖时添加 `--force`。

所有命令均支持放在子命令之前的 `--json`，方便 PowerShell 或其他程序处理：

```powershell
.\voicehub.cmd --json models
```

远程调用时应使用 HTTPS，并在当前 PowerShell 会话设置 CLI 专用环境变量：

```powershell
$env:VOICE_HUB_BASE_URL = "https://voice.example.com"
$env:VOICE_HUB_API_KEY = "<Gateway Key>"
.\voicehub.cmd doctor
```

`VOICE_HUB_API_KEY` 是 Voice Hub Gateway Key，不是厂商 API Key。环境变量仅用于 CLI 客户端，不会取代服务器上的 `VOICE_STUDIO_GATEWAY_KEY`。不要把真实 Key 写进脚本、README 或 Git 仓库。完整参数可运行 `.\voicehub.cmd --help` 查看。

## MCP 与 Agent Skill

Voice Hub 在同一个服务和端口提供 Streamable HTTP MCP：

```text
http://127.0.0.1:8765/mcp
```

不需要额外开放端口。MCP 提供以下工具：

| 工具 | 用途 |
| --- | --- |
| `get_voice_hub_status` | 检查版本、模型、音色和已配置厂商状态 |
| `list_tts_models` | 查询模型和 `tts-default`、`tts-fast`、`tts-hq` 的实际绑定 |
| `list_voices` | 按模型查询兼容音色，避免 Agent 猜测音色 ID |
| `create_speech` | 调用远程厂商生成语音，可能产生费用 |
| `list_recent_speech_jobs` | 查询最近任务 |
| `get_speech_job` | 查询单个任务元数据 |
| `get_speech_audio` | 读取未超过 MCP 大小上限的历史音频 |

仓库同时包含 `skills/voice-hub-tts`。支持 MCP Skills 扩展的 Agent 可以通过 `skills/list`、`skills/get` 和 `resources/read` 扫描导入；导入后是静态快照，Voice Hub 升级了 Skill 时需要在客户端重新扫描工具。没有 MCP 连接时，Skill 会改用上面的 CLI 工作流。

`create_speech` 只有在用户明确要求生成音频时才应调用。默认返回 MP3；单个 MCP 音频默认最多 15 MB，超过上限时任务仍保存在 Voice Hub，可改用 CLI 的 `download` 或 WebUI 下载。上限可用 `VOICE_STUDIO_MCP_MAX_AUDIO_BYTES` 调整。

MCP 当前面向个人私有部署，没有实现面向公网插件所需的 OAuth。服务器上应继续保持 `127.0.0.1:8765` 绑定，通过 Secure MCP Tunnel、SSH 隧道或其他受控私有通道连接到 `http://127.0.0.1:8765/mcp`；不要直接把 `/mcp`、`/api` 或 `8765` 暴露到互联网。

## 更新

| 当前安装方式 | 更新入口 | 更新来源 |
| --- | --- | --- |
| Windows Portable | 双击 `更新 Voice Hub.bat` | 最新正式版 Portable ZIP |
| Windows 安装版 | 运行新版 Setup 或安装目录中的更新器 | 最新正式版 Setup/Portable |
| Windows 轻量版 | 双击 `更新 Voice Hub.bat` | 最新正式版 Windows ZIP |
| Windows Git 源码 | 双击 `更新 Voice Hub.bat` | 当前分支的上游 Git 分支 |
| Windows Source ZIP | 双击 `更新 Voice Hub.bat` | 最新正式版 Windows ZIP |
| macOS / Linux Release 包 | `bash update.sh` | 对应系统的最新正式版 TAR 包 |
| macOS / Linux Git 源码 | `bash update.sh` | 当前分支的上游 Git 分支 |
| macOS / Linux Source ZIP | `bash update.sh` | 对应系统的最新正式版 TAR 包 |

Release 包更新前会校验 GitHub 提供的 SHA256，只替换清单内的程序文件，并保留 `data`、系统凭据、虚拟环境和其他用户文件。没有 `.git` 的 GitHub Source ZIP 会在首次更新后转为对应系统的 Release 包维护。Git 更新只允许官方仓库、已配置上游且工作区完全干净的分支，并使用 `git pull --ff-only`；存在本地改动或分叉历史时会停止，不会覆盖代码。

只检查更新：

```powershell
.\update.ps1 -CheckOnly
```

```bash
bash update.sh --check
```

## Docker Compose

Docker 使用环境变量读取厂商密钥，不访问宿主机的系统密钥环。

```bash
git clone https://github.com/RainyHorizon/voice-hub.git
cd voice-hub
cp .env.example .env
```

编辑 `.env`，至少设置一个随机的 `VOICE_STUDIO_GATEWAY_KEY`，然后启动：

```bash
docker compose up -d
docker compose ps
docker compose logs -f voice-hub
```

默认地址为 `http://127.0.0.1:8765`。停止服务但保留 `data` 数据：

MCP 与 WebUI 共用该地址，MCP URL 为 `http://127.0.0.1:8765/mcp`。

```bash
docker compose down
```

Docker 镜像不使用桌面更新脚本。更新 `.env` 中的 `VOICE_STUDIO_VERSION` 后执行：

```bash
docker compose pull
docker compose up -d --no-build
```

如果使用本地源码构建镜像，则先更新 Git 源码，再执行 `docker compose up -d --build`。`./data` 挂载目录和 `.env` 不会被镜像更新覆盖。

正式版本镜像发布到 `ghcr.io/rainyhorizon/voice-hub`。例如 `v1.7.0` 对应 `ghcr.io/rainyhorizon/voice-hub:1.7.0`、`ghcr.io/rainyhorizon/voice-hub:v1.7.0` 和 `ghcr.io/rainyhorizon/voice-hub:latest`。

使用 1Panel 的服务器可以直接采用仓库中的 `deploy/1panel/compose.yml`。首次创建编排、持久化目录、HTTPS 安全边界、升级和回滚步骤见 [1Panel 部署指南](docs/1PANEL.md)。长期运行推荐固定版本标签；GitHub 发布新版本不会自动替换正在运行的容器，需要先备份 `data`，再拉取新标签并重新创建容器。

首次使用本地源码构建镜像：

```bash
docker compose up -d --build
```

## 发布自动化

向 GitHub 推送 `v*.*.*` 格式的标签时，仓库会自动运行两条发布工作流：

- `Build Voice Hub Release Assets`：构建 Windows 轻量版、Windows 便携版、Windows 安装版，以及 Linux/macOS 发布包，并创建带 SHA256 校验文件的 GitHub Release。
- `Publish Voice Hub Docker Image`：构建并推送 `linux/amd64` 与 `linux/arm64` 的 GHCR 镜像，同时生成版本标签和稳定版的 `latest` 标签。

两条工作流都以标签指向的同一提交为源码。发布前应确保版本文件已同步、CI 已通过，并使用带说明的 Git 标签。

## 配置厂商 API Key

启动后进入 **设置**，选择厂商并填写 API Key。Endpoint 已预填官方地址，通常不需要修改。只有厂商账号或网络环境明确要求时才调整。

桌面版默认使用当前用户的系统密钥环：

| 系统 | 保存位置 |
| --- | --- |
| Windows | Windows Credential Manager |
| macOS | Keychain |
| Linux | Secret Service（GNOME Keyring/KWallet） |
| Docker | `.env` 或部署平台 Secret |

Docker 可用变量：

| 变量 | 用途 |
| --- | --- |
| `VOICE_STUDIO_GATEWAY_KEY` | OpenAI 兼容 API 的 Bearer Key，必填 |
| `VOICE_STUDIO_DASHSCOPE_API_KEY` | 通义千问 API Key |
| `VOICE_STUDIO_VOLCENGINE_API_KEY` | 火山引擎语音 API Key |
| `VOICE_STUDIO_VOLCENGINE_OPENAPI_ACCESS_KEY` | 火山引擎云端音色同步 Access Key |
| `VOICE_STUDIO_VOLCENGINE_OPENAPI_SECRET_KEY` | 火山引擎云端音色同步 Secret Key |
| `VOICE_STUDIO_VOLCENGINE_PROJECT_NAME` | 火山引擎默认项目名称（可选；桌面版可在设置中同步并管理多个项目） |
| `VOICE_STUDIO_MINIMAX_API_KEY` | MiniMax API Key |
| `VOICE_STUDIO_MIMO_API_KEY` | 小米 MiMo API Key |
| `VOICE_STUDIO_MAX_CONCURRENT_SYNTHESIS` | 同时生成语音的上限，默认 4，最大 32 |
| `VOICE_STUDIO_MCP_ENABLED` | 是否启用 `/mcp`，默认 `true` |
| `VOICE_STUDIO_MCP_MAX_AUDIO_BYTES` | MCP 单次返回的最大音频字节数，默认 `15728640`（15 MB） |

火山引擎的语音 API Key 与云端音色同步使用的 Access Key/Secret Key 是两组不同凭据。不使用云端音色同步时，后两项可以留空。桌面版只需配置一套火山凭据，然后在 **设置 → 火山引擎 → 项目** 中点击“同步项目与密钥”；程序会用 AK/SK 读取每个项目已有的语音 API Key，并将密钥本体保存到系统密钥环。之后声音克隆、云端音色同步和空槽位查询都会按所选项目执行，不需要为每个项目重复添加账号。没有 IAM 项目读取权限时，也可以手动添加 `ProjectName`，但需要在控制台为该项目创建 API Key 后再同步。`.env` 只保存在本机，不要提交到 GitHub。

## OpenAI 兼容 API

在 **API 网关** 页面查看或轮换 Gateway Key。默认 Base URL：

```text
http://127.0.0.1:8765/v1
```

所有请求都需要：

```http
Authorization: Bearer <Gateway Key>
```

管理接口默认只返回脱敏的 Gateway Key；本机网页在明确请求查看时才会读取完整 Key。远程部署不要依赖 `/api/gateway` 自动获取密钥，应通过部署环境安全地注入并保存 Gateway Key。

| 接口 | 方法 | 用途 |
| --- | --- | --- |
| `/v1/models` | `GET` | 查询可用模型及支持的操作 |
| `/v1/audio/speech` | `POST` | 生成完整音频 |
| `/v1/audio/speech/stream` | `POST` | 通过 SSE 接收音频分片 |

`model` 可以填写音色库显示的短模型 ID（例如 `seed-icl-2.0`）、带厂商前缀的完整模型 ID（例如 `volcengine/seed-icl-2.0`），也可以使用 `tts-default`、`tts-fast` 或 `tts-hq`。短模型 ID 仅在能够唯一对应一个厂商模型时生效；固定别名的实际绑定在 **设置 → 默认模型** 中管理。`voice` 必须与所选模型兼容，可在 **音色库 → Voice ID** 列复制后端明确返回的 `api_voice_id`。该值通常就是厂商真实 Voice ID；对于厂商不提供永久 Voice ID 的特殊模型，Voice Hub 会回退到稳定的兼容别名。

### Python SDK

```python
from openai import OpenAI

client = OpenAI(
    api_key="<Gateway Key>",
    base_url="http://127.0.0.1:8765/v1",
)

with client.audio.speech.with_streaming_response.create(
    model="tts-default",
    voice="mimo-default",
    input="你好，这是 Voice Hub 生成的语音。",
    response_format="mp3",
) as response:
    response.stream_to_file("speech.mp3")
```

### Node.js SDK

```javascript
import { writeFile } from "node:fs/promises";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "<Gateway Key>",
  baseURL: "http://127.0.0.1:8765/v1",
});

const response = await client.audio.speech.create({
  model: "tts-default",
  voice: "mimo-default",
  input: "你好，这是 Voice Hub 生成的语音。",
  response_format: "mp3",
});

await writeFile("speech.mp3", Buffer.from(await response.arrayBuffer()));
```

普通 OpenAI SDK 使用 `/v1/audio/speech`。需要边接收边处理音频时，再使用 `/v1/audio/speech/stream`。

## 数据与存储

| 数据 | 默认位置 |
| --- | --- |
| 生成音频、参考音频 | `data/audio` |
| 任务、音色和账号元数据 | `data/voice_studio.db` |
| 本地 Gateway Key | `data/gateway.json`（Docker 优先使用环境变量） |
| 运行日志 | `data/logs/` |

在 **设置 → 存储与清理** 中可以配置自动清理、音频保留天数、容量上限和检查周期。需要长期保存时，先在 **任务历史** 导出文字和音频，再启用自动清理。

PCM 是不带文件头的原始音频数据，浏览器通常无法直接播放。日常使用建议选择 MP3 或 WAV；PCM 适合流式处理或专业音频软件。

## 安全提示

- 厂商密钥默认保存在系统密钥环，不写入 SQLite、前端文件或 Git。
- 页面默认显示脱敏密钥；只有本机管理界面明确查看时才读取完整 Gateway Key，浏览器不会直接请求厂商 API。
- 服务默认只监听 `127.0.0.1`。不要在没有 HTTPS、访问控制和限流的情况下暴露到公网。
- Gateway Key 具有调用已配置付费语音接口的权限，请像保护厂商 API Key 一样保护它。
- Docker 使用 `.env` 或平台 Secret 注入密钥；不要提交 `.env`、数据库、音频和日志。
- 不要把自定义 Endpoint 指向不可信域名，以免 API Key 被发送到错误的目标。

## 技术架构

| 层级 | 技术 |
| --- | --- |
| 前端 | React、TypeScript、Vite、原生 CSS、Lucide、Sonner |
| 后端 | FastAPI、Python |
| 本地数据 | SQLite、文件系统 |
| 厂商连接 | HTTP、WebSocket |
| 兼容接口 | OpenAI 风格 REST API、SSE |
| 部署 | Windows 便携版、跨平台源码启动、Docker Compose |

浏览器或 OpenAI 客户端 → FastAPI 本地服务 → 厂商语音 API；前端不直接携带厂商 API Key。

开发者文档：

- [API 参考](docs/API.md)
- [架构说明](docs/ARCHITECTURE.md)
- [1Panel 部署指南](docs/1PANEL.md)

## 开发与测试

```powershell
# 前端
Set-Location frontend
npm ci
npm run lint
npm test
npm run build

# 后端测试
Set-Location ..\backend
python -m pip install -r requirements.txt
python -m pip install pytest==8.3.5
python -m pytest -q tests
```

### 前端字体

前端字体全部离线打包，运行时不会请求任何外部字体服务：

- 等宽字体 JetBrains Mono 来自 npm 包 `@fontsource-variable/jetbrains-mono`，`npm ci` 后即可使用。
- 中文字体 HarmonyOS Sans SC 不随仓库提供。需要时请从 [华为开发者网站](https://developer.huawei.com/consumer/cn/design/resource/) 下载，阅读并接受许可协议后，把 `HarmonyOS_Sans_SC_Regular.ttf`、`HarmonyOS_Sans_SC_Medium.ttf`、`HarmonyOS_Sans_SC_Bold.ttf` 放入 `frontend/fonts-src/`（已被 Git 忽略），然后运行：

```powershell
Set-Location frontend
npm run fonts:build
```

脚本会把字体切成带 `unicode-range` 的 woff2 分片，输出到 `frontend/src/assets/fonts/harmonyos-sans/`，浏览器只下载页面实际用到的字符。没有生成分片时界面会回退到系统字体（苹方、微软雅黑等），`npm run build` 不受影响。

`fonts:build` 依赖 `cn-font-split` 的原生库，`npm` 安装时会自动下载。如果因网络原因下载失败，可以运行 `npx cn-font-split i default` 重试，或从 [cn-font-split Release](https://github.com/KonghaYao/cn-font-split/releases) 手动下载对应平台的库文件，并用环境变量 `CN_FONT_SPLIT_BIN` 指向它。

测试不会调用真实厂商 API。真实语音测试可能产生费用或消耗额度，请先确认账号权限和计费规则。

## 当前限制

- 项目主要面向单用户本地运行，不是多租户云服务。
- 厂商可能调整模型名称、接口、计费和权限要求。
- 克隆、设计和云端音色同步能力取决于厂商账号、地区、额度和模型权限。
- OpenAI 兼容网关覆盖常用语音接口，不保证覆盖 OpenAI 的全部字段。
- Windows 便携版目前未进行商业代码签名，SmartScreen 可能显示“未知发布者”。可使用 Release 中的 SHA256 文件校验下载完整性。

## 许可证

本项目基于 [MIT License](LICENSE) 开源。第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。\n
