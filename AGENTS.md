# Voice Hub Agent 指南

本文件是 Voice Hub 仓库的长期项目上下文和协作规则。它不是面向最终用户的使用手册；用户安装、配置和 API 使用说明请看 `README.md`，系统设计请看 `docs/ARCHITECTURE.md`，接口细节请看 `docs/API.md`。

## 项目定位

- Voice Hub 是单机优先的多厂商云端语音工作台，通过远程 API 调用语音厂商，不加载或运行本地语音模型，同时提供 OpenAI 兼容 API 网关。
- 前端是 React + TypeScript + Vite，后端是 FastAPI + Python，数据层是 SQLite 和 `data/` 文件。
- 当前厂商适配器包括通义千问、火山引擎、MiniMax 和小米 MiMo。
- 浏览器只访问本机后端；厂商密钥应留在系统密钥环或 Docker Secret/环境变量中，不进入前端代码、SQLite 或日志。
- 项目主要面向单用户本地运行，不要未经明确要求把设计改成多租户云服务或公网开放服务。

## 开始工作前

1. 先运行 `git status --short`，保留用户已有改动，不要用 `git reset --hard` 或 `git checkout --` 覆盖它们。
2. 根据任务阅读 `README.md`、`docs/ARCHITECTURE.md` 和 `docs/API.md`；涉及某个模块时再读取对应源码和测试。
3. 检查是否有真实运行数据：`data/voice_studio.db`、`data/audio/`、`data/logs/`。除非用户明确要求，禁止删除、重建或提交这些内容。
4. 不要读取、输出或提交 `.env`、真实 API Key、Gateway Key、系统凭据或音频隐私内容；`.env.example` 可以作为配置结构参考。

## 目录边界

| 路径 | 责任 | 修改提示 |
| --- | --- | --- |
| `frontend/src/App.tsx` | 应用外壳、导航和页面实例保留 | 跨页面状态行为先看 `StudioContext` |
| `frontend/src/context/StudioContext.tsx` | 模型、音色、任务、网关和合成共享状态 | 改动后补前端测试或手工验证核心流程 |
| `frontend/src/pages/` | 合成、音色、克隆、设计、网关、历史、设置页面 | 页面文案和状态要与 API 合约一致 |
| `frontend/src/components/` | 可复用 UI 组件 | 优先复用现有组件和样式约定 |
| `frontend/src/styles.css` | 全局布局、响应式和焦点样式 | 保持键盘可访问性和窄屏布局 |
| `backend/app/main.py` | FastAPI 装配、中间件、异常处理和静态文件服务 | 不要在路由中泄露密钥或完整上游响应 |
| `backend/app/routers/` | 管理、任务、音色、网关、存储和系统接口 | 新接口同步更新 API 文档和测试 |
| `backend/app/services.py` | 模型解析、适配器选择、音频转换和共享业务逻辑 | 避免把厂商特例散落到路由层 |
| `backend/app/providers/` | 各厂商 TTS、流式、克隆和设计适配器 | 统一转换为 `ProviderError` |
| `backend/app/credentials.py` | 系统密钥环和 Docker 环境变量凭据 | 永远不把完整凭据写入 DB、前端或日志 |
| `backend/app/database.py` | SQLite schema、迁移和初始数据 | 修改 schema 必须考虑旧数据迁移 |
| `backend/app/storage.py` | 音频存储、容量统计和自动清理 | 保证路径始终位于 `data/audio` 内 |
| `backend/tests/` | 后端测试和外网访问隔离 | 必须从 `backend` 目录运行 pytest |
| `data/` | 本机运行数据 | 默认只读检查，不纳入代码改动 |

## 常用命令

PowerShell 源码启动：

```powershell
.\start.ps1
```

指定端口并打开浏览器：

```powershell
.\start.ps1 -Port 8766 -OpenBrowser
```

前端检查（从 `frontend` 目录执行）：

```powershell
npm ci
npm run lint
npm test
npm run build
```

后端测试（从 `backend` 目录执行）：

```powershell
python -m pytest -q tests
```

测试使用临时根目录、清理真实凭据环境变量并阻止非本机网络，不应调用真实厂商 API 或产生计费。若依赖尚未安装，先按 README 安装，不要把虚拟环境或 `node_modules` 提交到 Git。

Docker 相关操作必须遵守工作区的 Docker 规则；本项目源码位于 `E:\Projects\voice-hub`，但按工作区约定，实际 Docker/Compose 部署应放在 `E:\Containers` 的独立项目目录，并先阅读 `E:\Containers\agent.md` 与 `E:\Containers\memory.md`。本项目的 Compose 文件是 `compose.yml`，数据目录 `./data` 和 `.env` 必须保留；修改 Docker、端口或服务生命周期前，先确认用户确实需要该操作。

## 典型改动规则

- 新增厂商：在 `backend/app/providers/` 实现适配器，在 `config.py`/`services.py` 注册模型和能力，并为同步、克隆、设计或流式能力补测试；同时更新前端显示和文档。
- 新增或修改 API：同步检查认证、错误映射、流式行为、日志脱敏、路径校验和 `docs/API.md`。
- 修改凭据、更新器、启动脚本或安装包：先阅读相关脚本和 README 的部署章节，再做最小改动；验证成功、失败和回滚/保留数据路径。
- 修改异步路由时，避免直接在事件循环中执行 SQLite、文件系统和 FFmpeg 阻塞操作；沿用现有线程池/服务层模式。
- 不要为了修复一个局部问题顺手重命名环境变量、迁移数据文件或改变默认监听地址；这类兼容性变化必须明确记录并覆盖测试。

## 完成标准

- 代码改动有与风险匹配的测试或可复现手工验证；至少运行受影响的 lint、单元测试或构建命令。
- 如果改了用户可见行为、API、配置或部署流程，更新相应文档。
- 报告实际验证结果和未验证项，不把“进程启动”或 HTTP 200 单独当作功能完成证明。
- 最后再次运行 `git status --short`，确认没有把 `.env`、数据库、音频、日志、缓存或构建产物纳入改动。

## 已验证的项目事实（2026-09-26）

- 前端锁定 React 19、TypeScript 5.9、Vite 8、Vitest 5；可用命令是 `npm run lint`、`npm test` 和 `npm run build`，均从 `frontend` 目录执行。
- 后端依赖锁定 FastAPI 0.141、Uvicorn 0.35、Pydantic 2.13；`backend/app/main.py` 统一装配 `system`、`accounts`、`voices`、`gateway`、`jobs`、`storage` 六组路由，并在存在 `frontend/dist` 时提供 SPA 静态文件。
- FastAPI lifespan 启动时创建运行目录、初始化 SQLite、执行一次到期存储清理，并启动每小时清理任务；`backend/app/runtime.py` 会把已知旧日志迁移到 `data/logs/` 且不覆盖同名文件。
- Docker 镜像采用 Node 22 构建前端、Python 3.12 运行后端，以非 root `voice` 用户、只读根文件系统、256 MB `/tmp`、丢弃全部 capabilities 和 `no-new-privileges` 运行；健康检查为 `GET /api/summary`。
- CI 在 Ubuntu、macOS、Windows 上执行前后端检查，并额外验证系统密钥环；Docker job 会构建镜像并运行 `docker compose config --quiet`。不要把本地 Windows 环境的单次通过误写成跨平台运行保证。
- 当前基线验证结果：后端 `69 passed`；前端 `2` 个测试文件、`9 passed`，lint 和 production build 均通过。测试会使用临时 `VOICE_STUDIO_ROOT` 并阻止外网访问。
- 发布 `v*.*.*` 标签会分别触发 `.github/workflows/release.yml` 和 `.github/workflows/docker-publish.yml`：前者构建 Windows、Linux、macOS 发布包并创建 GitHub Release，后者发布 `linux/amd64`、`linux/arm64` 的 GHCR 镜像。
