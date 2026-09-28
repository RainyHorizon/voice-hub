# Voice Hub Desktop（Tauri 2 试验分支）

这个目录是 Windows 桌面外壳试验，不改变现有浏览器版、CLI 或 MCP。

## 开发运行

先在仓库根目录执行一次前端构建依赖安装：

```powershell
cd frontend
npm install
cd ..\desktop
npm install
```

然后运行：

```powershell
$env:PATH = "C:\Users\Administrator\.cargo\bin;" + $env:PATH
npm run dev
```

Tauri 会打开独立窗口，窗口内加载本地 FastAPI 提供的现有 React 页面，并自动启动后端。关闭窗口时会停止由桌面外壳启动的后端进程。安装包使用独立的应用数据目录，不会覆盖仓库里的 `data`。

## Windows 试验包

GitHub Actions 的 `Tauri 2 Desktop Experiment` 工作流只在本试验分支上运行。它会先构建现有便携版后端，再把便携版运行目录放入 Tauri 资源目录，最后生成 NSIS 安装包并作为 Actions Artifact 提供下载。

本机直接运行 `npm run build` 需要 Visual Studio C++ Build Tools（包含 MSVC、Windows SDK）和 WebView2。GitHub Windows Runner 已提供这些编译组件；当前电脑如果缺少 `link.exe`，只能先完成配置检查，无法在本机编译 Windows EXE。
