# LLMusic - 本地音乐播放器

一个基于 Electron + Vue 3 + FastAPI 的桌面音乐播放器，支持本地音乐管理与 QQ 音乐在线搜索下载。

## 技术栈

- 桌面端：Electron
- 前端：Vue 3、Vite、Pinia、Tailwind CSS v4
- 后端：Python、FastAPI、Uvicorn、Pydantic
- 本地数据：lowdb（JSON 文件数据库）
- 在线音乐：QQ Music SDK（搜索、下载、二维码登录）
- 音频处理：music-metadata、fluent-ffmpeg、ffmpeg-static

## 架构概述

项目由三端以多进程方式协同：

- `backend/`：FastAPI 后端服务，提供 QQ 音乐搜索、封面、歌曲链接、二维码登录认证等接口。
- `sys_vue/`：Vue 渲染进程，负责界面、播放器、歌单、本地音乐库和在线音乐发现交互。
- `sys_electron/`：Electron 主进程，负责窗口、托盘、IPC 桥接、本地文件、音频解析、扫描和播放转码，以及后端子进程生命周期管理。

## 项目结构

```text
llmusic/
├── backend/          # FastAPI 后端服务
├── sys_vue/          # Vue 3 渲染进程
├── sys_electron/     # Electron 主进程
├── 规范文档/         # 开发规范文档
├── doc/              # 项目说明文档
├── img/              # 图片资源
├── start-dev.bat     # 一键全栈开发启动
├── build.bat         # 一键打包脚本
├── CLAUDE.md         # AI 开发指南
├── README.md
└── package.json      # 根调度脚本
```

## 启动方式

一键全栈开发（推荐）：

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

| 服务 | 端口 | 地址 |
|------|------|------|
| Vite 前端 | 9753 | `http://127.0.0.1:9753` |
| FastAPI 后端 | 9752 | `http://127.0.0.1:9752` |

## 打包构建

```bash
build.bat
```

执行流水线：前端 Vite 构建 → 后端 PyInstaller 打包 → Electron Builder 打包，产物输出到 `release/` 目录。
