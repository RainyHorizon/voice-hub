# Voice Hub Windows 便携版

## 使用方法

1. 将压缩包完整解压到普通文件夹，不要直接在压缩包预览窗口中运行。
2. 双击 `启动 Voice Hub.bat`。
3. 等待浏览器自动打开 Voice Hub。
4. 使用期间不要关闭启动窗口；也可以双击 `停止 Voice Hub.bat` 停止服务。

首次打开页面后创建 WebUI 管理密码，在 **设置 → 厂商账号** 配置凭据，再选择相应模型和音色生成语音。合成会向所选厂商发送必要的文本或参考音频，可能产生费用。

## 更新

1. 先关闭正在运行的 Voice Hub。
2. 双击 `更新 Voice Hub.bat`。
3. 确认显示的当前版本和 GitHub 最新正式版本，输入 `Y` 开始更新。
4. 更新完成后可直接选择重新启动。

更新器会自动识别当前的 Windows 安装方式。便携版只从 `RainyHorizon/voice-hub` 的 GitHub Releases 下载 Windows Portable 版本，并在替换程序前验证 SHA256。`data` 文件夹、Windows Credential Manager 中的厂商密钥以及目录内其他非程序文件不会被删除。

首次获得更新器之前安装的旧版本，仍需手动下载一次包含更新器的新便携版；以后即可使用这个入口更新。

便携版已包含 Python 运行时、后端依赖、前端文件、FFmpeg 和 FFprobe，不需要另外安装 Python、Node.js 或 FFmpeg。

## 命令行工具

先启动 Voice Hub，然后在便携版目录打开 PowerShell：

```powershell
.\voicehub.cmd doctor
.\voicehub.cmd models
.\voicehub.cmd speak "你好" --model mimo/mimo-v2.5-tts --voice mimo-default --output .\voice.mp3
```

上述示例需要先配置 MiMo，并在当前终端设置 `VOICE_HUB_API_KEY` 为 Gateway Key。运行 `.\voicehub.cmd --help` 查看参数。启用 WebUI 密码后自动读取 Key 受管理会话保护；CLI 当前没有网页登录，音色、历史查询及下载还受会话限制，可改用 WebUI 或私有 MCP。非默认端口需设置 `VOICE_HUB_BASE_URL` 为实际地址。

## MCP

启动便携版后，同一端口会提供 MCP：

```text
http://127.0.0.1:8765/mcp
```

如果程序自动改用了其他端口，请把 URL 中的 `8765` 换成启动窗口显示的实际端口。使用客户端支持的 Skill 导入方式；具体资源是否随包提供以该 Release 为准，技能文件也可从仓库获取。MCP 没有独立身份认证，WebUI 密码不保护它，只适合本机或受控私有通道，不要把该端口直接开放到公网。

## 数据位置

数据库、生成音频、WebUI 密码哈希、网关和插件配置保存在程序目录的 `data` 文件夹。自动更新会保留它，手动升级时也请保留。备份时先停止服务，再完整复制 `data`；删除程序目录会删除这些数据。

厂商 API Key、火山引擎 AK/SK 仍保存在当前 Windows 用户的 Credential Manager 中，不会写入程序目录。

## 常见问题

- 如果 Windows 提示来源未知，请先确认文件来自本项目的 GitHub Releases 页面。当前版本尚未进行商业代码签名。
- 如果程序目录不可写，请将整个文件夹移动到桌面、文档或其他普通目录，不要放在 `Program Files` 中。
- 如果默认端口 `8765` 被占用，程序会自动尝试 `8766` 至 `8790`。
- 需要查看完整诊断时，在 PowerShell 中运行 `.\VoiceHub.exe --check`。

完整文档见 [项目主页](https://github.com/RainyHorizon/voice-hub) 和 [使用指南](https://github.com/RainyHorizon/voice-hub/blob/main/docs/USAGE.md)。当前源码说明可能与已安装 Release 有差异，以该版本发布说明为准。

