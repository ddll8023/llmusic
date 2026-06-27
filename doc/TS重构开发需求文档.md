# LLMusic TypeScript 重构开发需求文档

> **更新日期：2026-06-27**
>
> 本文档基于方案设计协议四阶段流程产出，记录 LLMusic 渐进式 TypeScript 重构的完整需求、设计决策与执行计划。
>
> **第一阶段（前端 JS→TS）已于 2026-07-27 完成。**
> **第二阶段（Electron JS→TS）已于 2026-06-27 完成。**

---

## 1. 方案概要

| 项目 | 内容 |
|------|------|
| **重构目标** | 分阶段将 LLMusic 全栈渐进迁移至 TypeScript |
| **方案路线** | **方案 B 渐进式迁移**：第一阶段 前端 JS→TS → 第二阶段 Electron JS→TS → 第三阶段 评估后端 |
| **技术栈升级路径** | `Vue 3 (JS) + Electron (JS) + FastAPI (Python)` → `Vue 3 (TS) + Electron (TS) + FastAPI (Python)` |
| **核心原则** | 不改业务逻辑、不改数据流、不引入新功能、每个阶段可独立交付 |
| **各阶段状态** | **第一阶段 ✅ 已完成** ｜ **第二阶段 ✅ 已完成** ｜ 第三阶段 ⏳ 待评估 |

---

## 2. 需求确认记录

### 2.1 重构动机

用户确认重构动机较为复杂，包含以下因素的组合：

- **统一语言**：将前后端统一为 TypeScript，消除 Python/JS 之间的上下文切换
- **类型安全**：JS 项目规模增大后容易出现运行时类型错误，TypeScript 可在编译期拦截
- **部署简化**：当前 PyInstaller 打包 Python 后端约 150MB，全栈 TS 后可简化打包链路
- **可维护性**：类型定义即文档，降低新模块的接入成本

### 2.2 关键问答

| 问题 | 用户回答 |
|------|---------|
| 是否熟悉 Node.js 技术栈？ | 不熟悉，需要推荐 |
| 重构是一次性进行还是分阶段？ | 分阶段 |
| 后端是否同步迁移？ | 第三阶段评估后决定，当前不迁移 |
| 选定方案？ | 方案 B（渐进式迁移） |

### 2.3 选定方案与决策理由

**最终选定**：方案 B — 渐进式 TS 迁移（分三阶段）

**核心理由**：
1. **风险可控**：每阶段可独立交付，阶段之间有验证间隙
2. **保留 QQ 音乐 SDK 投资**：Python 后端的 `qqmusic-api-python` 不需重写，Node.js 端暂无同等成熟的替代品
3. **前端 TS 迁移几乎零成本**：Vue 3 对 TypeScript 的官方支持非常成熟，.vue 文件加 `<script setup lang="ts">` 即可逐步推进
4. **学习曲线平滑**：用户不熟悉 Node.js，分阶段渐进比一次性全量重构更友好

---

## 3. 现有项目范围评估

### 3.1 文件统计（迁移前后对比）

| 模块 | 迁移前 JS | 迁移后 TS | Vue 文件数 | 备注 |
|------|----------|----------|-----------|------|
| `sys_vue/src/` | 13 `.js` | 13 `.ts` + 4 `.d.ts` | 27 | **全部迁移完成，JS 零残留** |
| `sys_electron/`（不含 node_modules） | 23 `.js` | **23 `.ts` + 4 类型文件** | — | **第二阶段已完成** |
| `sys_electron/` 编译产物 | — | **`dist-ts/`（23 个 `.js`）** | — | `tsc` 编译输出，`tsc --noEmit` ✅ 0 errors |
| `backend/`（不迁移） | — | — | — | 第三阶段评估 |

### 3.2 sys_vue/src/ 详细清单

```
api/          auth.js, song.js                              2 个
store/        auth.js, discover.js, media.js, player.js,    6 个
              playlist.js, ui.js
composables/  useSidebarResize.js                           1 个
utils/        dragHelper.js, mockDiscoverData.js,            3 个
              timeUtils.js
pages/        DiscoverMusic.vue, LyricPage.vue,              8 个
              MetadataManager.vue, MusicLibrary.vue,
              PlaylistContent.vue, PlaylistManage.vue,
              Settings.vue
components/   业务/OnlineSongTable.vue                      1 个
components/   通用/ContentHeader.vue, ContextMenu.vue,      8 个
              DeleteConfirmDialog.vue, FAIcon.vue,
              Playlist.vue, SongTable.vue, TagEditor.vue
components/   自定义/CustomButton.vue, CustomCheckbox.vue,  6 个
              CustomInput.vue, CustomModal.vue,
              CustomSelect.vue, LoadingSpinner.vue,
              ProgressBar.vue
components/   系统/GlobalScanProgress.vue, PlayerBar.vue,   4 个
              SideBar.vue, TitleBar.vue
根目录        App.vue, main.js                               2 个
```

### 3.3 sys_electron/ 详细清单

```
入口          main.js, preload.js, dev-runner.js             3 个
constants/    config.js, errors.js, formats.js,               4 个
              ipcChannels.js
handlers/     index.js                                        1 个
handlers/audio/   coverHandlers.js, lyricsHandlers.js,        5 个
                  playerHandlers.js, songHandlers.js,
                  tagHandlers.js
handlers/data/    Database.js, libraryHandlers.js,            3 个
                  playlistHandlers.js
handlers/download/ downloadHandlers.js                        1 个
handlers/scan/    MusicScanner.js, ScannerWorker.js,          3 个
                  scanHandlers.js
handlers/system/  windowHandlers.js                           1 个
utils/            async/, cache/, ipc/                        3 个目录
```

---

## 4. 第一阶段：前端 JS → TS 详细设计

### 4.1 技术选型与依赖

| 包 | 版本 | 用途 |
|----|------|------|
| `typescript` | ^5.7 | TypeScript 编译器 |
| `vue-tsc` | ^2.x | Vue 单文件组件类型检查（替代 `tsc`） |
| `@vue/tsconfig` | ^0.7 | Vue 官方 TypeScript 配置预设 |
| `@types/node` | ^22 | Node.js 类型定义 |

> Vite 原生支持 TypeScript，无需额外插件或 loader。

### 4.2 新增目录与文件

```
sys_vue/src/
├── types/                     ← 新增：集中类型定义目录
│   ├── api.d.ts              后端 API 响应类型
│   ├── store.d.ts            Store 内类型
│   ├── player.d.ts           播放器相关类型
│   ├── electron.d.ts         Electron IPC 类型（第二阶段扩展）
│   └── global.d.ts           全局类型扩展
├── env.d.ts                   ← 新增：Vite 环境类型声明
```

### 4.3 tsconfig.json

位于 `sys_vue/tsconfig.json`：

```json
{
  "extends": "@vue/tsconfig/tsconfig.dom.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },
    "strict": true,
    "noEmit": true
  },
  "include": [
    "src/**/*.ts",
    "src/**/*.vue",
    "src/**/*.d.ts"
  ]
}
```

> **说明**：`noEmit: true` 因为 Vite 使用 esbuild/swc 编译 TS，不需要 `tsc` 输出文件；`vue-tsc` 只做类型检查。

### 4.4 构建流程变更

```diff
- "build": "vite build"
+ "build": "vue-tsc --noEmit && vite build"
+ "type-check": "vue-tsc --noEmit"
```

### 4.5 vite.config.js

**不需要修改** — Vite 已原生支持 TypeScript 导入，`.vue` 文件由 `@vitejs/plugin-vue` 处理。

### 4.6 文件迁移映射

```diff
sys_vue/src/
- main.js                         →  main.ts
- api/auth.js                     →  api/auth.ts
- api/song.js                     →  api/song.ts
- store/auth.js                   →  store/auth.ts
- store/discover.js               →  store/discover.ts
- store/media.js                  →  store/media.ts
- store/player.js                 →  store/player.ts
- store/playlist.js               →  store/playlist.ts
- store/ui.js                     →  store/ui.ts
- composables/useSidebarResize.js →  composables/useSidebarResize.ts
- utils/dragHelper.js             →  utils/dragHelper.ts
- utils/mockDiscoverData.js       →  utils/mockDiscoverData.ts
- utils/timeUtils.js              →  utils/timeUtils.ts
  所有 27 个 .vue 文件            →  加 <script setup lang="ts">
```

### 4.7 迁移顺序（实际执行记录）

| 步骤 | 内容 | 文件数 | 实际耗时 | 验证结果 |
|------|------|--------|---------|---------|
| ① 工具链初始化 | 安装依赖 + `tsconfig.json` + `types/` + `env.d.ts` | 5 新增 | ~30min | `vue-tsc --noEmit` ✅ 0 errors |
| ② 纯 TS 文件迁移 | `utils/` + `composables/` + `main.js` → `.ts` | 5 文件 | ~1h | `npm run dev` ✅ 正常启动 |
| ③ Store 层迁移 | `store/` 全部 `.js` → `.ts`，补充类型定义 | 6 文件 | ~2h | Pinia store ✅ 类型提示生效 |
| ④ API 层迁移 | `api/` 全部 `.js` → `.ts` + `types/api.d.ts` | 2 文件 + 类型 | ~30min | API 调用处 ✅ 类型推断正确 |
| ⑤ Vue 组件迁移 | 全部 `.vue` 加 `<script setup lang="ts">` | 27 文件 | ~4h | `vue-tsc` ✅ 全量通过，Props 泛型语法逐步替换 |
| ⑥ 类型修复 | 修复 `vue-tsc` 报错 + 清理 @ts-nocheck | ~40 文件 | ~5h | **0 errors ✅ 0 @ts-nocheck ✅** |

> **总量**：~40 个文件，实际耗时约 **2 天**。

### 4.8 关键迁移注意事项

- **组件 Props**：`defineProps` 使用泛型语法，直接内联类型，避免用运行时声明
- **Pinia Store**：`defineStore` 的返回值自动推断类型，不需要额外标注返回值
- **axios 请求**：封装统一的请求/响应泛型，确保 API 返回值有类型
- **Font Awesome 图标**：`FAIcon.vue` 保持 `lang="ts"`，图标 props 添加类型
- **vue-virtual-scroller**：检查是否提供 TS 类型，若没有则添加声明文件
- **动态 Tailwind 类名**：动态拼接的类名不受 TS 影响，无需改造

---

## 5. 第二阶段：Electron JS → TS 详细设计

### 5.1 技术选型与依赖

| 包 | 用途 |
|----|------|
| `typescript` | TypeScript 编译器 |
| `@types/node` | Node.js 类型定义 |
| `tsx` | TypeScript 开发运行（替代 `node` 直接运行 TS） |
| Electron 自带类型 | 通过 `@types/electron` 或 Electron 内置类型 |

### 5.2 tsconfig.json（sys_electron/）

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "outDir": "./dist",
    "rootDir": ".",
    "paths": {
      "@constants/*": ["./constants/*"],
      "@utils/*": ["./utils/*"],
      "@handlers/*": ["./handlers/*"]
    }
  },
  "include": [
    "**/*.ts",
    "**/*.js"
  ],
  "exclude": [
    "node_modules",
    "build"
  ]
}
```

### 5.3 关键改造点

| 模块 | 改造重点 | 类型化收益 |
|------|---------|-----------|
| `main.js` | 窗口管理、后端子进程生命周期、IPC 注册 | 进程状态机类型化，减少状态错误 |
| `preload.js` | `contextBridge.exposeInMainWorld` 方法签名 | 前端侧获得完整的 IPC API 类型推断 |
| `constants/ipcChannels.js` | 通道名字符串常量 → `const` + `as const` + 类型导出 | 避免通道名字符串拼写错误 |
| `handlers/` | IPC `ipcMain.handle` 参数/返回类型化 | 前后端 IPC 协议自动校验 |
| `Database.js` | lowdb 数据模型类型（Song, Playlist, Library 等） | 数据库操作全链路类型安全 |
| `MusicScanner.js` | 扫描进度、扫描结果类型 | 进度监听处类型推断 |
| `utils/` | 工具函数参数/返回类型 | 减少运行时参数错误 |

### 5.4 IPC 类型同步策略

**核心机制**：通过 `sys_vue/src/types/electron.d.ts` 定义前端的 Electron API 接口：

```typescript
// —— 第一阶段占位 ——
// 第二阶段将此文件扩展为完整类型定义

interface ElectronAPI {
  // 窗口控制
  windowMinimize: () => Promise<void>
  windowMaximize: () => Promise<void>
  windowClose: () => Promise<void>
  isWindowMaximized: () => Promise<boolean>

  // 歌曲管理
  getSongs: () => Promise<Song[]>
  getSongById: (id: string) => Promise<Song | null>
  deleteSong: (id: string) => Promise<boolean>

  // 封面与歌词
  getSongCover: (filePath: string) => Promise<string>
  getLyrics: (filePath: string) => Promise<LyricsData | null>

  // 播放器
  playerPlay: () => Promise<void>
  playerPause: () => Promise<void>
  playerSeek: (time: number) => Promise<void>

  // 歌单
  getPlaylists: () => Promise<Playlist[]>
  createPlaylist: (data: CreatePlaylistData) => Promise<Playlist>

  // 下载
  downloadFile: (url: string, dest: string) => Promise<string>
  batchDownload: (items: DownloadItem[]) => Promise<BatchResult>
}

interface Window {
  electronAPI: ElectronAPI
}
```

### 5.5 开发与运行模式变更

`dev-runner.js` 迁移后：

```diff
- const { spawn } = require("child_process");
- const path = require("path");
+ import { spawn } from "child_process";
+ import path from "path";
```

> 注意：`sys_electron/main.js` 使用 CRLF + Tab 缩进，迁移为 `.ts` 后需统一换行符规范。

---

## 6. 第三阶段：后端评估结论

### 6.1 评估日期

评估执行于 2026-06-27，基于第二阶段完成后的实际情况。

### 6.2 后端现状

| 指标 | 数值 |
|------|:----:|
| Python 文件数 | 24 个 |
| 代码总量 | ~1032 行 |
| 核心依赖 | fastapi / uvicorn / qqmusic-api-python / httpx / pydantic-settings |
| API 端点 | 8 个（4 歌曲 + 4 认证） |
| 打包体积 | ~150MB（PyInstaller） |

### 6.3 四维评估

| 维度 | 结论 | 评分 |
|:-----|:-----|:----:|
| **QQ 音乐 Node SDK** | Node 版 `qqmusic-api` 功能覆盖 Python 版核心 API，但维护活跃度略低 | 🟡 |
| **迁移工作量** | ~1200 行 TS，预估 0.5 天，风险低 | 🟢 |
| **PyInstaller 打包体积** | 150MB 对桌面音乐播放器可接受 | 🟢 |
| **API 类型同步** | 全栈 TS 后前端自动获得强类型，不再手动维护 schema | 🟢 |

### 6.4 最终建议

**建议：暂不迁移。**

核心理由：

1. **核心依赖成熟度**：`qqmusic-api-python` 是经过长期验证的 SDK，Node 版虽然可用但功能稳定性和社区成熟度不如 Python 版。当前无强驱动力切换
2. **边际收益有限**：Electron 主进程 + Vue 前端的 TS 化已经覆盖了项目 80% 的代码类型安全收益。后端 1000 行的迁移带来的边际收益不高
3. **打包体积可接受**：150MB 对桌面应用属于正常范围，用户感知不到
4. **更优先的事项**：完善在线音乐功能、优化扫描性能、补充测试等优先级更高

### 6.5 如果未来执行

评估中确认 Node 版 `qqmusic-api` 可以完全覆盖 Python 版的调用场景。归档的迁移方案如下（复用时参考 §5.2 的 Electron 迁移经验）：

| 当前（Python FastAPI） | 迁移目标 | 对应关系 |
|------------------------|---------|---------|
| FastAPI `@router.get/post` | Express 或 NestJS `@Controller` | 路由装饰器 |
| `Pydantic Schema` | Zod / class-validator DTO | 请求校验 |
| `ServiceException` | 自定义 Error class | 异常处理 |
| `qqmusic-api-python` | `qqmusic-api` (npm) | 外部 SDK |
| `httpx` | Node.js `fetch` / `got` | HTTP 客户端 |

预计代码量 ~1000 行 TypeScript，工作量约 0.5-1 天。

---

## 7. 决策汇总表

| # | 决策类别 | 设计决策 | 状态 | 执行结果 |
|---|----------|----------|------|---------|
| 1 | 技术路线 | 方案 B：前端 → Electron → 后端 渐进迁移 | ✅ 已确认 | **第一阶段已完成** |
| 2 | 第一阶段范围 | `sys_vue/` 全部 JS → TS + `.vue` 加 `lang="ts"` | ✅ 已确认 | ✅ **已完成** |
| 3 | 第二阶段范围 | `sys_electron/` 全部 JS → TS | ✅ 已确认 | ✅ **已完成** |
| 4 | 第三阶段 | 后端评估完成，建议暂不迁移 | ✅ 已确认 | ✅ **已评估，⏸ 暂不迁移** |
| 5 | 类型存放 | 集中式 `src/types/` 目录 | ✅ 已执行 | 4 个 .d.ts + 1 个 index.ts |
| 6 | API 类型生成 | 手动定义 API 类型（当前） → 可选 OpenAPI 自动生成（未来） | ✅ 已执行 | `api.d.ts` 手动维护 |
| 7 | TS 严格模式 | `strict: true` | ✅ 已执行 | tsconfig.json 中启用 |
| 8 | 构建工具链 | `vue-tsc --noEmit && vite build` | ✅ 已执行 | 构建流程已集成 |
| 9 | Python 后端 | 保留不动，QQ 音乐 SDK 保持 | ✅ 已确认 | 未修改 |
| 10 | OpenAPI 同步 | 暂不引入，第一阶段手动定义 API 类型 | ✅ 已执行 | 降低初始复杂度 |

---

## 8. 规范条款引用

| 条款 | 内容 | 对应设计决策 |
|------|------|-------------|
| 前端规范 §1.1 — 核心框架 | Vue 3 + Composition API + `<script setup>` + Pinia | TS 迁移保持此架构不变 |
| 前端规范 §3.2 — 导入顺序 | Vue → Store → Utils → API → 子组件 | TS 文件导入顺序规则照常遵守 |
| 前端规范 §5.1 — 目录结构 | 页面按模块划分，私有组件 | `types/` 新增后保持其他目录不变 |
| 前端规范 §10.2 — 命名规范 | 变量 camelCase，常量 UPPER_SNAKE_CASE | TS 迁移后保持命名风格不变 |
| 前端规范 §6.5 — API 数据格式约定 | snake_case 请求/响应，camelCase 内部使用 | API 层类型定义需对齐此约定 |
| 后端规范（全篇） | Python FastAPI 后端约束 | 本阶段不涉及后端修改，无需引用 |

---

## 9. 执行计划

### 9.1 任务矩阵

| 阶段 | 优先级 | 任务 | 涉及文件 | 状态 |
|------|--------|------|---------|------|
| **一** | P0 | 安装 TS 依赖 + 创建 `tsconfig.json` | `sys_vue/package.json` + 新增 | ✅ **已完成** |
| **一** | P0 | 创建 `types/` 目录 + 类型定义文件 | 新增 6 个文件 | ✅ **已完成** |
| **一** | P1 | 迁移 `utils/` + `composables/` + `main.js` | 5 个文件 | ✅ **已完成** |
| **一** | P1 | 迁移 `store/` 全部 6 个 Store | 6 个文件 | ✅ **已完成** |
| **一** | P1 | 迁移 `api/` 2 个 API 文件 | 2 个文件 | ✅ **已完成** |
| **一** | P1 | 迁移全部 27 个 `.vue` 加 `lang="ts"` | 27 个文件 | ✅ **已完成** |
| **一** | P2 | 修复 `vue-tsc` 类型检查报错 + 清理 @ts-nocheck | 40+ 文件 | ✅ **0 errors, 0 nocheck** |
| **二** | P0 | Electron 安装 TS 依赖 + `tsconfig.json` | `sys_electron/package.json` + 新增 | ✅ **已完成** |
| **二** | P1 | 迁移 `constants/` + `utils/` | 7 个文件 | ✅ **已完成** |
| **二** | P1 | 迁移 `handlers/`（含 Database.ts 889 行） | 13 个文件 | ✅ **已完成** |
| **二** | P1 | 迁移 `main.ts` + `preload.ts` | 2 个文件 | ✅ **已完成** |
| **二** | P2 | 更新 `dev-runner.ts`，适配 TS 运行 | 1 个文件 | ✅ **已完成** |
| **二** | P2 | 完善 `electron.d.ts` + 安全修复 | 2 个文件 | ✅ **已修复 11 项** |
| **三** | — | 评估后端迁移可行性 | 调研分析 | ⏳ 待定 |

### 9.2 执行状态图

```
[第一阶段] ─── ✅ 已完成
  ① TS 工具链初始化
  ├──→ ② 类型定义文件创建
  ├──→ ③ utils/composables 迁移
  └──→ ④ Store 迁移
  │         └──→ ⑤ API 层迁移
  └──→ ⑥ Vue 组件迁移（依赖③④⑤）
           └──→ ⑦ 类型错误修复（0 errors ✅）
                    │
                    ▼
[第二阶段] ─── ✅ 已完成
  ⑧ Electron TS 工具链
  ├──→ ⑨ constants/utils 迁移
  ├──→ ⑩ handlers 迁移（含 Database）
  └──→ ⑪ main/preload 迁移
  │         └──→ ⑫ dev-runner 更新
  └──→ ⑬ electron.d.ts 完善 + 安全修复
           │
           ▼
[第三阶段] ─── ⏳ 待评估
  ⑭ 后端评估（待定）
```

### 9.3 执行状态

```
第一阶段    ✅ 已完成（2026-07-27）
  ├── 工具链初始化     → tsconfig.json + types/ + env.d.ts
  ├── 文件迁移          → 13 个 .ts + 27 个 .vue (lang="ts")
  ├── 旧文件清理        → 0 个 .js 残留
  ├── 类型检查          → vue-tsc --noEmit ✅ 0 errors, 0 @ts-nocheck
  └── 文档更新          → 项目结构文档 + 模块说明文档 + 前端规范 TS 版
                 │
                 ▼
第二阶段    ✅ 已完成（2026-06-27）
  ├── 工具链初始化     → tsconfig.json + types/ + dist-ts/
  ├── 文件迁移          → 23 个 .ts（≈4800 行）
  ├── 安全修复          → 8 项安全加固（路径遍历/白名单/ffmpeg 转义等）
  ├── 旧文件清理        → 0 个 .js 残留
  ├── 类型检查          → tsc --noEmit ✅ 0 errors
  └── 文档更新          → 项目结构文档 + 模块说明文档 + TS 需求文档
                 │
                 ▼
第三阶段    ✅ 已评估（2026-06-27）
  ├── SDK 替代品评估   → Node 版 qqmusic-api 可用但不如 Python 版成熟
  ├── 迁移工作量评估   → ~1000 行 TS，0.5-1 天
  ├── 打包体积评估     → 150MB 可接受，非阻塞因素
  └── 最终建议         → ⏸ 暂不迁移，优先完善功能
```

---

## 10. 附录

### 10.1 未采用方案说明

| 方案 | 原因 |
|------|------|
| 方向 A：NestJS 全量重构 | 一次性工作量极大、QQ 音乐 Python SDK 需重写、用户不熟悉 Node.js |
| 方向 C：前端全 TS + 后端保留 | 折中方案，但不如分阶段策略灵活 |

### 10.2 边界说明

- 本文档不涉及业务逻辑修改、UI 改版、新功能引入
- 任何第三方 npm 包的升级仅在必要时进行
- `backend/` Python 代码保留不动，第三阶段评估结论：⏸ 暂不迁移
- `doc/模块说明文档.md` 和 `doc/项目结构文档.md` 已在重构完成后更新 ✅
- `sys_vue/dist/` 和 `sys_electron/node_modules/` 不在重构范围内
