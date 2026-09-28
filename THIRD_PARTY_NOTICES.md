# Third-party notices

Voice Hub 的 Windows 便携版包含以下第三方组件。Voice Hub 自身仍按照仓库根目录中的 MIT License 发布。

## FFmpeg

- Project: FFmpeg
- Website: https://ffmpeg.org/
- Windows build provider: https://www.gyan.dev/ffmpeg/builds/
- License: GNU General Public License version 3 or later（以便携包内 `third_party/ffmpeg/LICENSE` 为准）
- Source code: https://ffmpeg.org/download.html#get-sources

FFmpeg 与 Voice Hub 作为独立程序一同分发，Voice Hub 通过命令行调用 `ffmpeg.exe` 和 `ffprobe.exe`。

构建便携包时使用的 FFmpeg 版本和构建配置记录在 `third_party/ffmpeg/README.txt` 中。重新分发便携包时，请同时保留该目录中的许可证与说明文件。

## 前端字体

JetBrains Mono 默认随前端构建产物（`frontend/dist`）分发。HarmonyOS Sans SC 仅在维护者自行提供字体源文件并运行可选构建脚本后，才会进入发布产物。

### JetBrains Mono

- Project: JetBrains Mono（通过 npm 包 `@fontsource-variable/jetbrains-mono` 引入）
- Website: https://www.jetbrains.com/lp/mono/
- Copyright: Copyright 2020 The JetBrains Mono Project Authors
- License: SIL Open Font License 1.1（https://openfontlicense.org/）
- Source code: https://github.com/JetBrains/JetBrainsMono

### HarmonyOS Sans SC

- Project: HarmonyOS Sans
- Copyright: Huawei Device Co., Ltd.
- Website: https://developer.huawei.com/consumer/cn/design/resource/
- License: HarmonyOS Sans 字体许可协议（以随字体下载包提供的协议文本为准）

仓库和默认发布包均不包含 HarmonyOS Sans 的字体源文件或 woff2 分片。维护者可自行从华为开发者网站下载字体，阅读并接受许可协议后放入 `frontend/fonts-src/`，再运行 `npm run fonts:build` 生成 `frontend/src/assets/fonts/harmonyos-sans/` 下的 woff2 分片。分发包含这些分片的自定义构建产物前，请确认符合该许可协议的再分发条款。

