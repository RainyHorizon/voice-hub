# 使用 1Panel 部署 Voice Hub

本文适用于已经安装 Docker 和 1Panel 的 Linux 服务器。Voice Hub 的管理接口目前面向单用户设计，没有独立的公网登录系统，因此默认只绑定服务器本机 `127.0.0.1`。不要直接把 `8765` 端口开放到公网。

## 准备配置

项目提供了两份模板：

- `deploy/1panel/compose.yml`
- `deploy/1panel/.env.example`

在 1Panel 中进入 **容器 → Compose → 创建编排**，建立名为 `voice-hub` 的独立项目目录。把 `compose.yml` 内容粘贴到 Compose 编辑器，并根据 `.env.example` 创建环境变量文件。

至少需要填写：

```dotenv
VOICE_STUDIO_VERSION=1.7.0
VOICE_STUDIO_GATEWAY_KEY=请替换为随机长字符串
```

然后只填写实际使用的厂商 Key。`VOICE_STUDIO_GATEWAY_KEY` 是调用 Voice Hub 的网关凭据，不是任何厂商的 API Key。不要把 `.env` 上传到 GitHub、截图公开或粘贴到聊天中。

可以在服务器终端生成随机 Gateway Key：

```bash
openssl rand -hex 32
```

将命令输出填写到 1Panel 的 `.env` 中。不要把命令输出发送给其他人。

## 启动与检查

在 1Panel 保存并启动编排。容器应显示为 `healthy`。如果需要从服务器终端检查，可在 Compose 项目目录中依次运行：

```bash
docker compose ps
```

```bash
docker compose logs --tail=100 voice-hub
```

```bash
curl http://127.0.0.1:8765/api/summary
```

看到 `"application":"voice-hub"` 只说明服务已经启动。仍需使用一个已配置厂商完成短句合成，才能确认厂商 Key、账号权限和计费状态全部正常。

## 如何访问

最安全的个人使用方式是保持 `127.0.0.1:8765` 不变，然后选择以下一种入口：

1. 通过 Tailscale 或 SSH 隧道访问服务器本机端口。
2. 使用 Voice Hub 内置 MCP 和 Secure MCP Tunnel，让 ChatGPT 调用私有服务。
3. 确实需要浏览器公网访问时，在 1Panel 中配置域名、HTTPS 和额外身份认证后反向代理到 `127.0.0.1:8765`。

仅配置 HTTPS 不能代替登录认证。当前 `/api/*` 管理接口不适合直接暴露到互联网，因此不要把端口映射改成 `0.0.0.0:8765:8765`。

## 让 ChatGPT 连接 MCP

容器启动后，MCP 与 WebUI 共用端口，服务器本机目标地址是：

```text
http://127.0.0.1:8765/mcp
```

先在服务器上确认 MCP 初始化可达，再配置 Secure MCP Tunnel。不要把普通浏览器能否打开 `/mcp` 当作检查方式；它是 Streamable HTTP JSON-RPC 端点，需要 MCP 客户端发送初始化请求。

Voice Hub 内置 `voice-hub-tts` Skill。支持 Skills 扩展的客户端扫描该 MCP 后，可以导入模型/音色查询、生成语音和历史音频读取流程。升级容器后，如果 Skill 有变化，需要在客户端重新 Scan Tools。

当前 MCP 不包含独立 OAuth，不应直接通过 1Panel 网站反向代理公开。推荐结构是：

```text
ChatGPT -> Secure MCP Tunnel -> 服务器 127.0.0.1:8765/mcp -> Voice Hub -> 语音厂商
```

`create_speech` 会调用已配置的远程语音厂商并可能产生费用；其他查询工具不会调用厂商。默认单次 MCP 音频上限是 15 MB，超过后可使用 Voice Hub CLI 或 WebUI 下载任务文件。

## 更新到 GitHub 新版本

GitHub 中发布新的 `v*.*.*` 标签后，Actions 会构建对应 GHCR 镜像。例如 GitHub Release 为 `v1.8.0` 时，镜像标签是：

```text
ghcr.io/rainyhorizon/voice-hub:1.8.0
```

运行中的容器不会因为 GitHub 出现新版本而自动改变。推荐采用固定版本、手动升级：

1. 在 1Panel 中停止 Voice Hub 编排。
2. 备份名为 `voice-hub-data` 的 Docker 卷和编排目录中的 `.env`。
3. 把 `.env` 中的 `VOICE_STUDIO_VERSION` 改为新版本，例如 `1.8.0`。
4. 在 1Panel 中执行“拉取镜像”并重新创建或启动编排。
5. 确认容器为 `healthy`，再检查 `/api/summary` 和一条真实短句合成。
6. 如果 ChatGPT 已连接 MCP，重新扫描工具并确认 `get_voice_hub_status` 与 Skill 可见。

如果使用终端，在 Compose 项目目录中依次执行：

```bash
docker compose pull voice-hub
```

```bash
docker compose up -d --no-build voice-hub
```

```bash
docker compose ps
```

`voice-hub-data` 是持久化命名卷，正常拉取和重建容器不会删除它。不要使用 `docker compose down -v`，不要删除 `voice-hub-data` 卷，也不要在升级时删除编排目录。

如果当前 1Panel 版本没有卷备份入口，可以在已经停止编排的项目目录执行下面这条命令，把数据导出为当前目录中的压缩包：

```bash
docker run --rm -v voice-hub-data:/data -v "$PWD":/backup alpine tar -czf /backup/voice-hub-data-backup.tar.gz -C /data .
```

确认备份文件已经生成后再升级。该压缩包可能包含任务文字、音色信息和音频，不要公开上传。

## 回滚

如果新版本运行异常：

1. 停止编排。
2. 将 `VOICE_STUDIO_VERSION` 改回升级前的版本。
3. 重新拉取并启动旧镜像。
4. 如果新版本已经修改了数据且无法兼容，再停止容器并恢复升级前备份的 `voice-hub-data` 卷。

不要在 Voice Hub 仍在运行时直接覆盖 SQLite 文件；数据库可能同时存在 `voice_studio.db-wal` 和 `voice_studio.db-shm`。

## 是否使用 `latest`

`latest` 适合临时测试，不推荐用于长期运行。固定版本标签能够明确当前运行版本，并在出现问题时快速回滚。即使使用 `latest`，也仍然需要拉取镜像并重新创建容器，正在运行的容器不会自行替换。
