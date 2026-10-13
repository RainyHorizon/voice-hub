# Voice Hub Desktop（Tauri 2）

这个目录提供 Windows 桌面外壳，在独立 WebView 窗口中使用现有 React 页面与 FastAPI 后端。代码已包含在主仓库；桌面构建独立于常规 Release 流程，是否有可下载安装包以实际发布资产为准。

## 环境要求

- Windows、Node.js 22.12+ 与 Rust 稳定版，`cargo` 可通过 PATH 调用。
- Visual Studio C++ Build Tools，包括 MSVC 和 Windows SDK。
- WebView2 Runtime。
- 开发运行需要主项目的 Python 环境、后端依赖、FFmpeg/FFprobe。

## 开发运行

先按 [主项目 README](../README.md#从源码运行) 准备后端运行环境。在仓库根目录安装前端和桌面依赖：

```powershell
cd frontend
npm ci
cd ..\desktop
npm ci
```

然后运行：

```powershell
npm run dev
```

Tauri 会先构建前端，再加载 `http://127.0.0.1:8765`。若该端口已有 Voice Hub，复用其后端和数据；否则启动后端。关闭窗口只停止外壳自行启动的后端，不停止复用的服务。

开发模式使用源码实例的数据目录；打包模式自行启动后端时通过 `VOICE_HUB_DESKTOP_ROOT` 使用独立应用数据目录，不覆盖仓库的 `data`。对比两个运行实例时须注意端口和后端复用行为。

## Windows 构建

GitHub Actions 的 `Tauri 2 Desktop Experiment` 工作流支持手动 `workflow_dispatch`；自动 push 触发器仍配置为 `experiment/tauri2-desktop`，不会由 `main` 普通推送触发。它先构建便携版后端，再将运行目录放入 `desktop/src-tauri/backend-runtime`，生成 NSIS 安装包并上传为 Actions Artifact，不创建正式 Release。

本地打包也需先将完整便携版运行目录放入 `desktop/src-tauri/backend-runtime`，包含 `VoiceHub.exe`、前端构建、工具和依赖；具体暂存步骤见工作流 [.github/workflows/desktop-experiment.yml](../.github/workflows/desktop-experiment.yml)。在 `desktop` 目录运行 `npm run build`，NSIS 产物位于 `src-tauri/target/release/bundle/nsis/`。缺少 MSVC 的 `link.exe` 时需要补齐构建环境，不能仅靠 Node.js 打包。
