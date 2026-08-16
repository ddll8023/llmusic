# LLMusic - 本地音乐播放器 🎵

一个基于 Electron + Vue 3 + FastAPI 的桌面音乐播放器，支持本地音乐管理与 QQ 音乐在线搜索下载。

## 技术栈

- **桌面端**：Electron
- **前端**：Vue 3、Vite、Pinia、Tailwind CSS v4、TypeScript
- **后端**：Python、FastAPI、Uvicorn、Pydantic
- **本地数据**：SQLite（better-sqlite3，统一存储在 Electron userData）
- **在线音乐**：QQ Music SDK（搜索、获取链接、二维码登录）
- **音频处理**：music-metadata、fluent-ffmpeg、ffmpeg-static、ffprobe-static

## 功能特性

- 🎶 **本地音乐管理** — 扫描本地音乐文件，管理歌单，播放本地音频
- 🌐 **QQ 音乐在线资源** — 搜索、在线播放、下载 QQ 音乐曲库
- 📃 **歌词提取与滚动** — 本地音乐文件歌词提取，沉浸式自动滚动展示
- 🎨 **沉浸式歌词页** — 全屏歌词舞台展示，走马灯式滚动
- 💾 **本地数据持久化** — 歌单、设置、收藏等数据本地存储
- 📦 **一键打包分发** — 前端 Vite 构建 → 后端 PyInstaller 打包 → Electron Builder 分发

## 架构概述

项目由三端以多进程方式协同：

| 端侧             | 目录              | 职责                                                                                                          |
| ---------------- | ----------------- | ------------------------------------------------------------------------------------------------------------- |
| **后端**   | `backend/`      | FastAPI 服务，提供 QQ 音乐搜索、歌曲链接、封面、二维码登录等 API                                              |
| **前端**   | `sys_vue/`      | Vue 3 渲染进程，负责界面、播放器、歌单、本地音乐库、在线发现和歌词展示                                        |
| **主进程** | `sys_electron/` | Electron 主进程，负责窗口管理、IPC 桥接、本地文件扫描与音频解析、歌词提取、播放转码以及后端子进程生命周期管理 |

## 本地数据与开发/打包路径

开发模式和打包模式统一使用 Electron `userData` 作为数据根目录：

```text
<userData>/
├── llmusic.db
├── credential/credential.json
├── logs/operation.log
└── transcode-cache/
```

首次启动时会探测旧版 lowdb `db.json`（包括旧 Electron userData 和开发目录候选路径），在 SQLite 事务迁移并逐表校验成功后删除旧文件；迁移失败会保留原文件并停止继续启动。开发模式遗留的凭证和日志在目标文件不存在时移动到统一目录，不覆盖已有数据。

## 项目结构

```text
llmusic/
├── backend/          # FastAPI 后端服务（QQ 音乐 API）
├── sys_vue/          # Vue 3 渲染进程（UI 界面）
├── sys_electron/     # Electron 主进程（窗口、IPC、本地处理）
├── 规范文档/         # 开发规范文档
├── doc/              # 项目说明文档
├── img/              # 图片资源
├── release/          # 打包产物输出
├── start-dev.bat     # 一键全栈开发启动
├── build.bat         # 一键打包脚本
├── CLAUDE.md         # AI 开发指南
├── README.md
└── package.json      # 根调度脚本
```

## 启动方式

### 安装依赖

项目为多包结构，根目录仅做调度，实际依赖分布在 `sys_vue/`（前端）和 `sys_electron/`（Electron 主进程）中，需分别安装：

```bash
# 安装前端依赖
npm --prefix sys_vue install

# 安装 Electron 主进程依赖
npm --prefix sys_electron install

# （可选）安装 Python 后端依赖，不跑后端可跳过
uv sync --directory backend
```

> 如果遇到 Electron 下载慢的问题，可以设置镜像源：
>
> ```bash
> export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
> ```

### 一键全栈开发（推荐）

```bash
start-dev.bat
```

或

```bash
npm run dev
```

后端独立调试（开发 API 时使用）：

```bash
npm run dev:backend
```

仅前端 + Electron（后端已外部启动时使用）：

```bash
npm run dev:electron
```

## 端口约定

| 服务         | 端口 | 地址                      |
| ------------ | ---- | ------------------------- |
| Vite 前端    | 9753 | `http://127.0.0.1:9753` |
| FastAPI 后端 | 9752 | `http://127.0.0.1:9752` |

## 打包构建

先安装两端 Node 依赖和后端构建依赖：

```bash
npm ci --prefix sys_vue
npm ci --prefix sys_electron
uv sync --directory backend --group build
```

在目标平台执行原生构建，避免把错误架构的 PyInstaller 后端带入安装包：

```bash
# 当前 macOS 架构（本机为 arm64）
npm run dist:mac

# Windows x64（在 Windows x64 runner 或本机执行）
npm run dist:win
```

`build.bat` 等价于 `npm run dist:win`。macOS x64 应在 x64 runner 上执行：

```bash
npm --prefix sys_electron run dist:mac -- --x64
```

产物输出到 `release/`：

| 平台 | 架构 | 产物 |
|---|---|---|
| macOS | arm64 / x64 | DMG、ZIP |
| Windows | x64 | NSIS 安装包、ZIP |

打包默认不上传 Release，也不启用签名或公证。仓库提供 `.github/workflows/release.yml`，推送 `v*` 标签后由 macOS/Windows 原生 runner 构建并创建 GitHub Release；签名凭据需通过 CI Secrets 单独配置。

### 自动更新

Electron 主进程使用 `electron-updater` 检查 GitHub Release，设置页可手动检查、下载并重启安装。发布新版本时需同步更新根目录和 `sys_electron/package.json` 的版本号，并推送同名 `v<version>` 标签；CI 会生成 Windows `latest.yml` 和合并后的 macOS `latest-mac.yml` 更新元数据。正式启用自动更新前应配置 macOS Developer ID/公证和 Windows 代码签名。
