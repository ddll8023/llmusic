# LLMusic - 本地音乐播放器

一个基于 Electron、Vue 3 和 Python 构建的桌面音乐播放器，专注于本地音乐文件管理与播放。

## 技术栈

- 桌面端：Electron
- 前端：Vue 3、Vite、Pinia、SCSS
- 后端：Python、Flask、Flask-CORS
- 本地数据：lowdb
- 音频处理：music-metadata、fluent-ffmpeg、ffmpeg-static

## 架构概述

项目已拆分为三端结构：

- `backend/`：Python 后端服务，提供 QQ 音乐搜索、封面和歌曲链接相关接口。
- `sys_vue/`：Vue 渲染进程，负责界面、播放器、歌单和本地音乐库交互。
- `sys_electron/`：Electron 主进程，负责窗口、托盘、IPC、本地文件、音频解析、扫描和播放转码。

## 项目结构

```text
llmusic/
├── backend/          # Python 后端服务
├── sys_vue/          # Vue 渲染进程
├── sys_electron/     # Electron 主进程
├── doc/              # 项目文档
├── 规范文档/         # 项目规范
├── start_backend.bat # 单独启动后端
├── start_electron.bat# 启动 Vite + Electron
└── package.json      # 根调度脚本
```

## 启动方式

后端单独启动：

```bash
start_backend.bat
```

前端 Vite 与 Electron 一起启动：

```bash
start_electron.bat
```

也可以通过根目录脚本启动桌面端：

```bash
npm run dev
```
