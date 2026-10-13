# Voice Hub 语音插件接口 v1

插件以独立 HTTP 服务提供语音，核心不导入插件 Python 代码或安装其依赖。第一版支持模型、音色与合成；暂不支持插件克隆、语音设计、自定义前端脚本或自动更新。

## 示例服务

本次核心仓库提交不附带具体厂商或 Edge TTS 服务。示例服务可以作为独立目录放在本机，先运行服务，再把对应清单放入 `data/plugins/<目录>/` 并在“左侧插件”刷新。服务依赖、联网要求和上游错误由插件自身负责，核心只校验协议和音频响应。

## 开发者接入

将清单放在 `data/plugins/<目录>/voice-hub.plugin.json`，运行你自己的适配服务，再刷新插件页。核心不执行清单里的启动命令，也不会把插件依赖安装进核心环境。

清单字段见 `PLUGIN_MANIFEST.example.json`。要求：

- id 唯一，2–40 个小写字母、数字、点、下划线或连字符，模型和音色进入 `plugin-<id>` 命名空间。
- version 为 `x.y.z`，api_version 为 `1`，runtime 为 `external_http`。
- capabilities 为 `["synthesis", "voices"]`。
- endpoint 为带端口的数字环回 HTTP 地址，例如 `http://127.0.0.1:8790`，可有路径前缀；禁止凭据、查询参数、片段和重定向。云厂商适配器也在本机运行，由它连接上游。
- settings 是声明式配置数组，最多 30 项，支持 string、integer、boolean、voice。每项有 key、label、description、type、default；整数可提供 minimum 和 maximum。endpoint 为保留字段。

示例配置项：

```json
{"key":"pitch","label":"音调","description":"以 Hz 调整音调","type":"integer","default":0,"minimum":-50,"maximum":50}
```

核心根据声明渲染统一齿轮弹窗，校验并保存配置。插件可扩展配置项，但不能修改核心页面或加载任意前端脚本。

## HTTP 协议

服务须实现以下路径：

| 方法与路径 | 响应 |
| --- | --- |
| GET /health | `{"id":"example-tts","api_version":"1"}` |
| GET /models | `{"models":[{"id":"basic","name":"基础语音","languages":["zh-CN"]}]}` |
| GET /voices | `{"voices":[{"id":"xiaoxiao","name":"晓晓","model":"basic","languages":["zh-CN"]}]}` |
| POST /speech | 原始 PCM WAV，16-bit，1–2 声道，最多 50 MB，必须包含有效时长与完整采样 |

POST /speech 请求示例：

```json
{"model":"basic","voice":"xiaoxiao","text":"你好","speed":1.0,"config":{"pitch":0}}
```

模型 ID 最长 64 字符，音色 ID 最长 100 字符，只含字母、数字、点、下划线和连字符。模型 ID 不重复，音色 ID 在各模型内唯一，每个模型须有音色。目录最多 100 模型、5000 音色，各单独响应最多 2 MB。合成失败返回非 2xx 状态；禁止返回路径、凭据或完整上游错误。

模型公开 ID 为 `plugin-example-tts/basic`；音色公开 ID 为 `plugin-example-tts:basic:xiaoxiao`。网关、CLI 与 MCP 沿用现有模型/音色查询接口，支持合成、格式转换和已有的非原生流式回退。不要声明原生流式或其他尚未实现的能力。

## 生命周期与数据

- 安装只注册插件；启用会检查服务身份并校验、缓存模型和音色目录。未通过检查不会写入启用状态。
- 同步按钮更新目录；默认音色必须存在。检查连接不会自动保存或启用。
- 配置保存在 `data/plugin-state.json`，不要在声明式字段保存密钥。厂商凭据应由独立服务安全管理。
- 停用移除可用模型和预置音色，保留配置、目录缓存、任务历史和音频。
- 卸载移除注册与配置，插件注册目录移到同一目录的 `.removed-<目录>` 备份，保留服务文件和已有音频。独立进程须由用户自行停止；再次卸载前如有同名备份，需要先处理备份。
- 旧版只存布尔值的状态会按停用读取，需要重新启用以验证连接。损坏状态文件不被覆盖。

## 市场边界

当前“插件市场”只展示本机可用的可选示例，“插件来源”显示当前来源；尚未建立公共 GitHub 目录、自动投稿、第三方下载或自动更新。后续公共市场应独立建立目录仓库及提交检查流程，避免将插件依赖打包进本体。

插件隔离了依赖和运行进程，但**不是操作系统安全沙箱**；只运行可信来源的服务。插件不应访问核心数据库、其他插件凭据或私人音频。
