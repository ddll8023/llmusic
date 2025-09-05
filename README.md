# LLMusic - 本地音乐播放器

一个基于 Electron、Vue.js 和 Python 构建的桌面音乐播放器，专注于本地音乐文件的管理与播放。

## 技术栈

- **主框架**: Electron, Vue.js 3
- **后端服务**: Python (Flask)
- **状态管理**: Pinia
- **UI**: Vite, SCSS
- **数据库**: lowdb (JSON-based)
- **音频处理**: music-metadata, fluent-ffmpeg

## 架构概述

项目采用混合架构，各部分职责分明：

- **渲染进程 (`src-renderer/`)**: 基于 Vue.js 构建的用户界面，负责所有视觉展示和用户交互。
- **主进程 (`src-main/`)**: Electron 的核心，作为应用程序的入口，管理窗口、生命周期，并作为渲染进程与后端服务的桥梁。它处理文件系统访问、IPC 通信和系统级操作。
- **Python 后端 (`python/`)**: 一个独立的 Flask 应用，提供 API 接口，处理凭证等后端逻辑。

## 核心功能

- **多音乐库管理**: 支持添加、切换和扫描多个独立的本地音乐库。
- **本地音乐播放**: 全功能的播放控制（播放、暂停、切换、进度条），支持多种播放模式（顺序、随机、单曲循环）。
- **音频元数据**: 自动解析和显示歌曲信息及专辑封面。
- **歌词同步显示**: 支持 `.lrc` 格式歌词，并与播放进度同步滚动。
- **高效列表渲染**: 使用虚拟滚动技术，流畅展示海量歌曲。
- **状态持久化**: 自动保存播放列表、音量、播放模式等状态。
- **系统集成**: 支持最小化到系统托盘。

## 项目结构

```
/
├── python/             # Python 后端服务 (Flask)
├── src-main/           # Electron 主进程
│   ├── handlers/       # IPC 事件处理器
│   └── services/       # 核心业务逻辑
├── src-renderer/       # Electron 渲染进程 (Vue.js)
│   ├── components/     # Vue 组件
│   ├── store/          # Pinia 状态管理
│   └── assets/         # 静态资源
├── package.json        # 项目依赖与配置
└── vite.config.js      # Vite 构建配置
```

## 快速开始

1.  **安装依赖**:
    ```bash
    npm install
    ```

2.  **启动开发环境**:
    ```bash
    npm run dev
    ```
