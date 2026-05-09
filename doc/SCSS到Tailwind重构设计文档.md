# SCSS → Tailwind CSS 重构设计文档

## 概述

当前项目 LLMusic 前端（`sys_vue/`）存在两套样式体系并存的局面：

- **SCSS 变量体系**：`styles/` 目录下的 `_colors.scss`、`_typography.scss`、`_layout.scss` 等变量文件，以及大量 Vue 组件中 `<style lang="scss" scoped>` 块内使用这些变量。
- **Tailwind CSS v4**：已通过 `@tailwindcss/vite` 集成，`tailwind-entry.css` 定义了与 SCSS 变量对应的深色主题色板，但仅 `DiscoverMusic.vue` 等新组件全面使用。

本次重构目标：**将全部 Vue 组件中的 SCSS 样式迁移为 Tailwind CSS 原子类 + 少量 CSS 变量的方案**，彻底消除对 `sass` 编译器的依赖，统一为 Tailwind CSS 驱动的样式体系。

---

## 1. 现状分析

### 1.1 SCSS 资源清单

| 文件 | 用途 | 重构后归宿 |
|------|------|-----------|
| `styles/variables/_colors.scss` | 背景色、文本色、功能色、z-index 层级 | → Tailwind `@theme` 扩展 / CSS 变量 |
| `styles/variables/_typography.scss` | 字体族、字号、字重、行高、图标尺寸 | → Tailwind `@theme` 扩展 |
| `styles/variables/_layout.scss` | 间距、圆角、阴影、断点、响应式 mixin `respond-to`、动画时长 | → Tailwind 内置值 + `@theme` 扩展 |
| `styles/variables/_transitions.scss` | Vue `<Transition>` 类名、`@keyframes` 动画 | → Tailwind `animate-*` + 自定义 CSS（无法 Tailwind 覆盖的部分） |
| `styles/base/_global.scss` | CSS Reset、滚动条、`#app` 容器、通用交互过渡 | → Tailwind `@layer base` + 少量保留 CSS |
| `styles/variables.scss` | 变量入口（`@forward`） | → 删除 |
| `styles/main.scss` | 主入口，导入所有模块 + Element Plus CSS 变量覆盖 | → 删除 |
| `styles/tailwind-entry.css` | Tailwind v4 入口 + `@theme` 定义 | → 保留并增强 |

### 1.2 Vue 组件 SCSS 使用分类

按使用模式将组件分为三类：

**A 类 — 仅使用 SCSS 变量（颜色/字号/间距等）：**
`FAIcon.vue`、`CustomButton.vue`、`CustomInput.vue`、`CustomSelect.vue`、`ContentHeader.vue`、`DeleteConfirmDialog.vue`、`Playlist.vue`、`TagEditor.vue`、`PlayerBar.vue`、`TitleBar.vue`、`LyricPage.vue`、`PlaylistContent.vue`、`PlaylistManage.vue`、`MetadataManager.vue`、`MusicLibrary.vue`、`Settings.vue`、`GlobalScanProgress.vue`

**B 类 — 使用 SCSS 变量 + 响应式 mixin + 嵌套选择器：**
`SideBar.vue`、`SongTable.vue`、`App.vue`

**C 类 — 已完全使用 Tailwind（无需修改）：**
`DiscoverMusic.vue`、`OnlineSongTable.vue`

### 1.3 需要保留的 SCSS 能力

- **`@keyframes` 动画**（`_transitions.scss`）：`spin`、`pulse`、`slideIn`、`fadeInUp`、`playingPulse`、`modalFadeIn` — Tailwind 不覆盖所有，需保留为 CSS。
- **自定义滚动条**（`_global.scss`）：`::-webkit-scrollbar` 系列 — 无 Tailwind 等价物，需保留。
- **`prefers-reduced-motion` 媒体查询** — 用于无障碍，需保留。
- **Element Plus 主题变量覆盖**（`main.scss` 中 `:root` 块）— 虽然 Element Plus 计划禁用，但 `main.js` 仍在导入 `element-plus/dist/index.css`，需配合 Element Plus 移除计划。

---

## 2. 重构目标

### 2.1 最终状态

```
sys_vue/src/
├── styles/
│   ├── tailwind-entry.css    # Tailwind v4 入口 + @theme 定义（增强）
│   ├── base.css              # CSS Reset、滚动条、@keyframes、残差全局样式
│   └── (其余 .scss 文件全部删除)
├── main.js                   # 仅导入 tailwind-entry.css + base.css
├── vite.config.js            # 移除 scss preprocessorOptions.additionalData
└── components/               # 所有 <style> 块改为 Tailwind 原子类
    └── ...
```

### 2.2 详细任务拆解

#### 阶段一：基础设施整理

1. **扩充 `tailwind-entry.css` 的 `@theme`**，将 SCSS 变量体系完整映射为 Tailwind 自定义主题值。
2. **创建 `base.css`**，收纳全局 CSS Reset、滚动条样式、`#app` 容器、`@keyframes` 动画、`prefers-reduced-motion`。
3. **更新 `main.js`** 引入顺序：`tailwind-entry.css` → `base.css`。
4. **更新 `vite.config.js`** 删除 `css.preprocessorOptions.scss.additionalData`。
5. **删除** `styles/variables/`、`styles/base/`、`styles/variables.scss`、`styles/main.scss`。
6. **删除** `package.json` 中 `"sass"` 依赖。

#### 阶段二：组件样式迁移

按依赖关系自底向上迁移：

| 顺序 | 组件 | 要点 |
|------|------|------|
| 1 | `FAIcon.vue` | 用 Tailwind 类替代 SCSS 尺寸/颜色类映射 |
| 2 | `CustomButton.vue` | Tailwind 动态类名 + `@apply` 提取变体 |
| 3 | `CustomInput.vue` | Tailwind 表单样式 |
| 4 | `CustomSelect.vue` | Tailwind 表单样式 |
| 5 | `ContentHeader.vue` | Tailwind 布局类 |
| 6 | `DeleteConfirmDialog.vue` | Tailwind 模态框样式 |
| 7 | `TagEditor.vue` | Tailwind 标签样式 |
| 8 | `Playlist.vue` | Tailwind 弹出面板样式 |
| 9 | `GlobalScanProgress.vue` | Tailwind 进度指示样式 |
| 10 | `TitleBar.vue` | Tailwind 布局 + 拖拽区域 |
| 11 | `PlayerBar.vue` | Tailwind 底部固定栏样式 |
| 12 | `SideBar.vue` | **重点**：响应式侧边栏，需处理 BEM → Tailwind + 动态类 |
| 13 | `SongTable.vue` | **重点**：大表格组件，需处理条件类名较多的情况 |
| 14 | `ContextMenu.vue` | 右键菜单位置计算 + Tailwind 样式 |
| 15 | `MusicLibrary.vue` | 主页面样式 |
| 16 | `PlaylistContent.vue` | 歌单内容页 |
| 17 | `PlaylistManage.vue` | 歌单管理页 |
| 18 | `Settings.vue` | 设置页 |
| 19 | `MetadataManager.vue` | 元数据编辑页 |
| 20 | `LyricPage.vue` | 歌词页面 |
| 21 | `App.vue` | 根布局（含侧边栏/播放列表容器动画） |

---

## 3. 主题映射方案

将 SCSS 变量完整映射到 Tailwind `@theme`，确保组件迁移后视觉一致。

### 3.1 颜色映射

| SCSS 变量 | Tailwind `@theme` 别名 | 值 |
|-----------|------------------------|-----|
| `$bg-primary` | `--color-surface-base` | `#121212` |
| `$bg-secondary` | `--color-surface-elevated` | `#181818` → `#1a1a1a` |
| `$bg-tertiary` | `--color-surface-overlay` | `#242424` |
| `—` (新增) | `--color-surface-sunken` | `#0a0a0a` |
| `$text-primary` | `--color-content-base` | `#ffffff` |
| `$text-secondary` | `--color-content-secondary` | `#b3b3b3` |
| `$text-disabled` | `--color-content-disabled` | `#535353` |
| `—` | `--color-content-tertiary` | `#737373` (已定义) |
| `$accent-green` | `--color-accent-green` | `#4caf50` |
| `$accent-hover` | `--color-accent-green-hover` | `#66bb6a` |
| `$danger` | `--color-accent-danger` | `#f44336` |
| `$warning` | `--color-accent-warning` | `#ff9800` |
| `$info` | `--color-accent-info` | `#2196f3` |
| `$bg-tertiary` (边框) | `--color-line-base` | `#282828` |
| `$bg-tertiary-hover` | `--color-line-light` | `#383838` |
| `$overlay-light` | 自定义 CSS 变量 | `rgba(255,255,255,0.1)` |
| `$overlay-medium` | 自定义 CSS 变量 | `rgba(255,255,255,0.2)` |
| `$overlay-dark` | 自定义 CSS 变量 | `rgba(0,0,0,0.3)` |

**使用形式**：`bg-surface-base`、`text-content-base`、`border-line-base`、`text-accent-green`、`bg-accent-danger/10`（透明度后缀）。

### 3.2 尺寸映射

| SCSS 变量 | Tailwind 方案 |
|-----------|--------------|
| `$font-size-xs: 10px` | `text-[10px]` 或 `@theme` 扩展 `--text-2xs` |
| `$font-size-sm: 12px` | `text-sm` |
| `$font-size-base: 14px` | `text-base` |
| `$font-size-md: 16px` | `text-base`(默认16px) 或 `text-[16px]` |
| `$font-size-lg: 18px` | `text-lg` |
| `$font-size-xl: 20px` | `text-xl` |
| `$font-size-2xl: 24px` | `text-2xl` |
| `$font-size-3xl: 32px` | `text-3xl` |
| `$font-family-base` | `font-sans` (或 `@theme` 扩展) |
| `$font-family-mono` | `font-mono` |
| `$font-weight-light: 300` | `font-light` |
| `$font-weight-normal: 400` | `font-normal` |
| `$font-weight-medium: 500` | `font-medium` |
| `$font-weight-bold: 600` | `font-semibold` |
| `$font-weight-black: 700` | `font-bold` |
| `$line-height-tight: 1.2` | `leading-tight` |
| `$line-height-base: 1.4` | `leading-normal` |
| `$line-height-relaxed: 1.6` | `leading-relaxed` |

### 3.3 间距映射

| SCSS 变量 | Tailwind |
|-----------|----------|
| `$content-padding: 16px` | `p-4` |
| `$section-padding: 24px` | `p-6` |
| `$card-padding: 16px` | `p-4` |
| `$item-padding: 12px` | `p-3` |

### 3.4 圆角映射

| SCSS 变量 | Tailwind |
|-----------|----------|
| `$border-radius: 4px` | `rounded` (默认4px) |
| `$border-radius-small: 2px` | `rounded-sm` |
| `$border-radius-large: 8px` | `rounded-lg` |

### 3.5 阴影映射

| SCSS 变量 | Tailwind |
|-----------|----------|
| `$box-shadow: 0 2px 8px rgba(0,0,0,0.15)` | `shadow-md` |
| `$box-shadow-hover: 0 4px 12px rgba(0,0,0,0.2)` | `shadow-lg` |
| `$box-shadow-active: 0 1px 4px rgba(0,0,0,0.1)` | `shadow-sm` |

### 3.6 z-index 映射

| SCSS 变量 | 值 | Tailwind |
|-----------|-----|----------|
| `$z-dropdown: 100` | 100 | `z-[100]` |
| `$z-base: 1` | 1 | `z-[1]` |
| `$z-sidebar: 50` | 50 | `z-[50]` |
| `$z-lyrics: 90` | 90 | `z-[90]` |
| `$z-modal: 100` | 100 | `z-[100]` |
| `$z-playlist: 150` | 150 | `z-[150]` |
| `$z-player: 200` | 200 | `z-[200]` |
| `$z-context-menu: 250` | 250 | `z-[250]` |
| `$z-tooltip: 300` | 300 | `z-[300]` |

### 3.7 动画时长映射

| SCSS 变量 | Tailwind |
|-----------|----------|
| `$transition-fast: 0.15s` | `duration-150` |
| `$transition-base: 0.25s` | `duration-200` 或 `duration-[250]` |
| `$transition-slow: 0.3s` | `duration-300` |
| 缓动函数 `cubic-bezier(0.4,0,0.2,1)` | `ease-[cubic-bezier(0.4,0,0.2,1)]` |

### 3.8 响应式断点映射

| SCSS `respond-to` | Tailwind 等价 |
|-------------------|---------------|
| `xs: 480px` | 无内置，使用 `max-[480px]:` |
| `sm: 768px` | `max-md:` 或 `max-[768px]:` |
| `md: 1024px` | `max-lg:` |
| `lg: 1200px` | `max-xl:` |
| `xl: 1440px` | `max-2xl:` 或 `max-[1440px]:` |

---

## 4. 迁移策略与模式

### 4.1 SCSS 变量 → Tailwind 原子类（简单替换）

**迁移前（FAIcon.vue）**：
```vue
<style lang="scss" scoped>
.icon--small { font-size: 12px; }
.icon--medium { font-size: 16px; }
.icon--primary { color: $text-primary; }
.icon--clickable { cursor: pointer; &:hover { color: $accent-hover; } }
</style>
```

**迁移后**：
```vue
<script setup>
const iconClasses = computed(() => [
  'inline-flex items-center justify-center shrink-0',
  sizeMap.value,
  colorMap.value,
  props.clickable ? 'cursor-pointer transition-colors duration-200 hover:text-accent-green-hover active:scale-95' : ''
]);
</script>
<template>
  <i :class="iconClasses" aria-hidden="true"></i>
</template>
<style scoped>
/* 不需要任何 SCSS 块，移除 lang="scss" */
</style>
```

### 4.2 响应式 mixin → Tailwind 响应式前缀

**迁移前**：
```scss
@include respond-to("sm") {
  width: 320px;
}
```

**迁移后**：
```html
<div class="max-md:w-[320px] w-full">
```

### 4.3 BEM 选择器 → Tailwind 原子类 + 动态计算

**迁移前（SideBar.vue）**：
```html
<div class="sidebar" :class="{ 'sidebar--collapsed': isCollapsed }">
  <div class="sidebar__logo">
    <h1 class="sidebar__logo-title">LLMusic</h1>
  </div>
</div>
```

**迁移后**：
```html
<div :class="[
  'flex flex-col h-full bg-surface-base border-r border-line-base transition-all duration-250 z-[50]',
  isCollapsed ? 'w-[60px]' : 'w-[240px]'
]">
  <div class="flex items-center justify-between h-12 px-3 border-b border-line-base">
    <h1 v-if="!isCollapsed" class="text-base font-semibold text-content-base">LLMusic</h1>
  </div>
</div>
```

### 4.4 CSS 动画保留策略

`_transitions.scss` 中的 `@keyframes` 动画（如 `modalFadeIn`、`playingPulse`）无法用 Tailwind 直接替代，它们将保留在 `base.css` 的 `@layer utilities` 中：

```css
/* base.css — @keyframes 残差 */
@keyframes modalFadeIn {
  0% { opacity: 0; transform: scale(0.9) translateY(-20px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}

.animate-modal-fade-in {
  animation: modalFadeIn 0.3s ease-out;
}
```

### 4.5 自定义滚动条保留

```css
/* base.css — @layer base */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); border-radius: 2px; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 2px; }
```

### 4.6 prefers-reduced-motion 保留

```css
/* base.css */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 5. 关键注意事项

### 5.1 `<style lang="scss">` → 移除 lang 属性

迁移完成后，所有 `<style>` 块不再需要 `lang="scss"`。若组件完全使用 Tailwind 原子类（无额外 CSS），可直接删除 `<style>` 块。

### 5.2 @apply 的使用边界

按前端规范，`@apply` 仅用于提取**高频复用的类名组合**（如按钮变体），不应滥用为"写 SCSS 的替代品"。一个组件中 `@apply` 提取不应超过 3-5 组。

### 5.3 动态类名 safelist

Tailwind v4 使用 JIT 引擎，动态拼接的类名需要在源代码中出现完整字符串，否则会被 tree-shake 掉。对策：

- 使用完整类名字符串的对象/映射表（推荐）
- 或通过 `@theme` 引用 + 变量拼接

```vue
<!-- ✅ 推荐：完整字符串映射 -->
const sizeClasses = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2 text-base' }
```

### 5.4 Element Plus 依赖状态

目前 `main.js` 仍在导入 `element-plus` 及 `main.scss` 中的 Element Plus CSS 变量覆盖。本次重构范围**不包含移除 Element Plus**（属独立任务），但 Element Plus 相关的 CSS 变量覆盖需要暂时保留在 `base.css` 中，直到 Element Plus 被完全移除。

### 5.5 视觉回归测试

每个组件迁移后，需人工检查：

- 颜色是否与迁移前一致（特别是 hover/active/disabled 状态）
- 间距、字号、圆角是否一致
- 响应式断点行为是否一致
- 动画/过渡效果是否一致
- 与相邻组件的布局关系是否破坏

---

## 6. 最终效果收益

| 指标 | 迁移前 | 迁移后 |
|------|--------|--------|
| 构建依赖 | `sass` + `node-sass` 间接依赖 | 仅 Tailwind CSS |
| 样式的 `lang` 声明 | 16 个文件含 `lang="scss"` | 0（全部移除或删除 `<style>`） |
| 样式文件数量 | 7 个 SCSS + 1 个 CSS | 2 个 CSS（tailwind-entry + base） |
| 构建体积 | CSS 含 2 套主题体系 | 仅 Tailwind 生成的按需 CSS |
| 开发体验 | 需同时掌握 SCSS 变量和 Tailwind | 统一的 Tailwind 原子化开发 |
| 样式维护 | 变量定义在两个系统中可能有漂移 | 单一 `@theme` 源 |

---

## 7. 附录

### 7.1 文件变更清单总览

**删除：**
- `src/styles/variables/`（整个目录）
- `src/styles/base/`（整个目录）
- `src/styles/variables.scss`
- `src/styles/main.scss`
- 所有 `<style lang="scss" scoped>` 块（逐步移除）

**创建：**
- `src/styles/base.css`（含 CSS Reset + 滚动条 + @keyframes + 残差样式）

**修改：**
- `src/styles/tailwind-entry.css`（增强 `@theme` 定义）
- `src/main.js`（样式引入顺序）
- `vite.config.js`（删除 SCSS additionalData）

**每个 Vue 组件**：SCSS → Tailwind 迁移

### 7.2 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 迁移后颜色不一致 | 严格按照"主题映射方案"章节的映射表执行，逐组件对比截图 |
| 响应式布局破坏 | 迁移期间保留旧文件，每个组件迁移后对比响应式断点行为 |
| 动态类名被 tree-shake | 使用完整类名字符串映射 + 迁移后构建验证 |
| 动画效果丢失 | `@keyframes` 全部保留在 `base.css` 中 |
| 迁移范围蔓延导致进度失控 | 按"阶段二"的顺序逐组件执行，不跨组件同时修改 |
