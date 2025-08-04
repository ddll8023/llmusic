<script setup>
import { ref, computed, onMounted } from 'vue';
import { useUiStore } from '../store/ui';
import { usePlaylistStore } from '../store/playlist';
import { useMediaStore } from '../store/media';
import FAIcon from './FAIcon.vue';

const uiStore = useUiStore();
const playlistStore = usePlaylistStore();
const mediaStore = useMediaStore();

const isCollapsed = computed(() => uiStore.isSidebarCollapsed);

// 加载歌单列表和音乐库
onMounted(async () => {
  await playlistStore.loadPlaylists();
  await mediaStore.loadLibraries();
});

const handleSetLibrary = (libraryId) => {
  mediaStore.setActiveLibrary(libraryId);
  uiStore.setView('main');
};
</script>

<template>
  <div class="sidebar" :class="{ 'sidebar--collapsed': isCollapsed }">
    <div class="sidebar__logo">
      <h1 v-if="!isCollapsed" class="sidebar__logo-title">LLMusic</h1>
      <div class="sidebar__controls">
        <button class="sidebar__collapse-btn" @click="uiStore.toggleSidebarCollapse()"
          :title="isCollapsed ? '展开侧边栏' : '收缩侧边栏'">
          {{ isCollapsed ? '→' : '←' }}
        </button>
      </div>
    </div>

    <div class="sidebar__section">
      <div class="sidebar__section-title"><span class="sidebar__text">在线音乐</span></div>
      <div class="sidebar__menu-item sidebar__menu-item--disabled">
        <FAIcon name="compass" size="medium" color="secondary" />
        <span class="sidebar__text">发现音乐</span>
      </div>
      <div class="sidebar__menu-item sidebar__menu-item--disabled">
        <FAIcon name="signal" size="medium" color="secondary" />
        <span class="sidebar__text">私人FM</span>
      </div>
    </div>

    <div class="sidebar__section">
      <div class="sidebar__section-title"><span class="sidebar__text">我的音乐</span></div>
      <div class="sidebar__menu-item"
        :class="{ 'is-active': uiStore.currentView === 'main' && mediaStore.activeLibraryId === null }"
        @click="handleSetLibrary(null)">
        <FAIcon name="folder" size="medium" color="primary" :clickable="true" />
        <span class="sidebar__text">所有音乐</span>
      </div>
      <div v-for="lib in mediaStore.libraries" :key="lib.id" class="sidebar__menu-item"
        :class="{ 'is-active': uiStore.currentView === 'main' && mediaStore.activeLibraryId === lib.id }"
        @click="handleSetLibrary(lib.id)">
        <FAIcon name="music" size="medium" color="primary" :clickable="true" />
        <span class="sidebar__text">{{ lib.name }}</span>
      </div>
      <div class="sidebar__menu-item sidebar__menu-item--disabled">
        <FAIcon name="clock-o" size="medium" color="secondary" />
        <span class="sidebar__text">最近播放</span>
      </div>
      <div class="sidebar__menu-item sidebar__menu-item--disabled">
        <FAIcon name="heart" size="medium" color="secondary" />
        <span class="sidebar__text">我的收藏</span>
      </div>
    </div>

    <div class="sidebar__section">
      <div class="sidebar__section-title">
        <span class="sidebar__text">创建的歌单</span>
        <button v-if="!isCollapsed" class="sidebar__add-btn" title="创建歌单"
          @click="playlistStore.openCreatePlaylistDialog()">
          +
        </button>
      </div>

      <!-- 歌单加载中 -->
      <div v-if="playlistStore.loading" class="sidebar__playlist-loading">
        <span v-if="!isCollapsed" class="sidebar__text">加载中...</span>
      </div>

      <!-- 歌单列表 -->
      <template v-else>
        <!-- 无歌单提示 -->
        <div v-if="playlistStore.playlists.length === 0" class="sidebar__no-playlists">
          <span v-if="!isCollapsed" class="sidebar__text">暂无歌单，点击"+"创建</span>
        </div>

        <!-- 歌单项目 -->
        <div v-for="playlist in playlistStore.playlists" :key="playlist.id"
          class="sidebar__menu-item sidebar__playlist-item"
          :class="{ 'is-active': playlistStore.currentPlaylistId === playlist.id }"
          @click="playlistStore.loadPlaylistById(playlist.id); uiStore.setView('playlist')">
          <FAIcon name="list" size="medium" color="primary" :clickable="true" />
          <span class="sidebar__playlist-name" :title="playlist.name">{{ playlist.name }}</span>
          <!-- 编辑按钮，只在鼠标悬浮时显示 -->
          <div class="sidebar__playlist-actions" v-if="!isCollapsed" @click.stop>
            <button class="sidebar__action-btn" title="编辑歌单" @click="playlistStore.openEditPlaylistDialog(playlist)">
              <FAIcon name="edit" size="small" color="secondary" :clickable="true" />
            </button>
            <button class="sidebar__action-btn" title="播放歌单" @click="playlistStore.playPlaylist(playlist.id)">
              <FAIcon name="play" size="small" color="secondary" :clickable="true" />
            </button>
          </div>
        </div>
      </template>
    </div>

    <div class="sidebar__spacer"></div>

    <!-- 元数据管理按钮 -->
    <div class="sidebar__menu-item sidebar__bottom-item" :class="{ 'is-active': uiStore.currentView === 'metadata' }"
      @click="uiStore.setView('metadata')">
      <FAIcon name="edit" size="medium" color="primary" :clickable="true" />
      <span class="sidebar__text">元数据管理</span>
    </div>

    <!-- 设置按钮 -->
    <div class="sidebar__menu-item sidebar__bottom-item" :class="{ 'is-active': uiStore.currentView === 'settings' }"
      @click="uiStore.setView('settings')">
      <FAIcon name="cog" size="medium" color="primary" :clickable="true" />
      <span class="sidebar__text">设置</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// 导入样式变量
@use "../styles/variables/_colors" as *;
@use "../styles/variables/_typography" as *;
@use "../styles/variables/_layout" as *;

.sidebar {
  width: 100%;
  background-color: $bg-secondary;
  color: $text-secondary;
  padding: ($content-padding * 1.5) ($content-padding * 1.25) ($content-padding * 1.5) ($content-padding * 1.5);
  display: flex;
  flex-direction: column;
  transition: width $transition-slow;
  overflow: hidden;
  flex-shrink: 0;
  box-sizing: border-box;
  height: 100%;
  font-family: $font-family-base;
  z-index: $z-sidebar;

  // 收缩状态
  &--collapsed {
    padding: ($content-padding * 1.5) ($content-padding * 0.5);
  }
}

// 收缩状态下的文字隐藏
.sidebar--collapsed {

  .sidebar__text,
  .sidebar__logo-title,
  .sidebar__section-title,
  .sidebar__playlist-name {
    display: none;
  }
}

// 为文字内容添加过渡效果
.sidebar {

  .sidebar__text,
  .sidebar__logo-title,
  .sidebar__section-title,
  .sidebar__playlist-name {
    transition: opacity $transition-base;
  }
}

// Logo 区域
.sidebar__logo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ($content-padding * 1.5);
}

.sidebar__logo-title {
  font-size: $font-size-xl;
  color: $text-primary;
  white-space: nowrap;
  overflow: hidden;
  font-weight: $font-weight-bold;
  font-family: $font-family-base;
  margin: 0;
  line-height: $line-height-base;
}

// 收缩/展开按钮
.sidebar__collapse-btn {
  background: none;
  border: none;
  color: $text-secondary;
  font-size: $font-size-base;
  font-family: $font-family-base;
  cursor: pointer;
  padding: ($content-padding * 0.25);
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all $transition-base;

  &:hover {
    color: $text-primary;
    background-color: $overlay-light;
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }

  &:focus {
    outline: 2px solid $accent-green;
    outline-offset: 2px;
  }

  @include respond-to("sm") {
    display: flex;
  }
}



// 菜单分区
.sidebar__section {
  margin-bottom: ($content-padding * 1.5);
}

.sidebar__section-title {
  font-size: $font-size-xs;
  font-weight: $font-weight-bold;
  font-family: $font-family-base;
  text-transform: uppercase;
  margin-bottom: ($content-padding * 0.5);
  white-space: nowrap;
  overflow: hidden;
  color: $text-primary;
  padding-left: ($content-padding * 0.5);
  display: flex;
  align-items: center;
  justify-content: space-between;
  letter-spacing: 0.5px;
  line-height: $line-height-base;
}

// 收缩状态下的分区标题
.sidebar--collapsed .sidebar__section-title {
  text-align: center;
  padding: 0;
  margin-bottom: ($content-padding * 0.75);

  &::after {
    content: '';
    display: block;
    width: 24px;
    height: 2px;
    background: linear-gradient(90deg, transparent, $text-secondary, transparent);
    margin: 0 auto;
    border-radius: $border-radius;
  }
}

// 菜单项基础样式
.sidebar__menu-item {
  display: flex;
  align-items: center;
  padding: ($content-padding * 0.625) ($content-padding * 0.5);
  border-radius: $border-radius;
  cursor: pointer;
  transition: all $transition-base;
  white-space: nowrap;
  overflow: hidden;
  font-size: $font-size-base;
  font-family: $font-family-base;
  position: relative;
  line-height: $line-height-base;

  // 收缩状态下的菜单项
  .sidebar--collapsed & {
    justify-content: center;
    padding: ($content-padding * 0.625) ($content-padding * 0.25);
  }

  // FAIcon 样式
  .fa {
    margin-right: $content-padding;
    flex-shrink: 0;

    .sidebar--collapsed & {
      margin-right: 0;
    }
  }

  // 交互状态
  &:hover {
    background-color: $bg-tertiary;
    color: $text-primary;
    box-shadow: $box-shadow-hover;
    transform: translateY(-1px);
  }

  &:active {
    transform: scale(0.98) translateY(0);
    box-shadow: none;
    background-color: $bg-tertiary-hover;
  }

  &:focus {
    outline: 2px solid $accent-green;
    outline-offset: 2px;
  }

  &.is-active {
    background-color: $bg-tertiary;
    color: $text-primary;

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 3px;
      height: 60%;
      background-color: $accent-green;
      border-radius: 0 $border-radius $border-radius 0;
    }
  }

  &--disabled {
    opacity: 0.6;
    cursor: not-allowed;

    &:hover {
      background-color: transparent;
      transform: none;
      box-shadow: none;
      color: $text-secondary;
    }
  }
}

// 侧边栏控制按钮容器
.sidebar__controls {
  display: flex;
  gap: ($content-padding * 0.25);
  align-items: center;
}

// 间距器
.sidebar__spacer {
  flex-grow: 1;
  min-height: ($content-padding * 1.25);
}

// 底部设置项
.sidebar__bottom-item {
  margin-top: ($content-padding * 0.5);
}

// 添加歌单按钮
.sidebar__add-btn {
  background: none;
  border: none;
  color: $text-secondary;
  font-size: $font-size-base;
  font-family: $font-family-base;
  cursor: pointer;
  padding: 0;
  width: 20px;
  height: 20px;
  line-height: 18px;
  text-align: center;
  border-radius: 50%;
  transition: all $transition-base;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background-color: $bg-tertiary;
    color: $text-primary;
    transform: scale(1.1);
  }

  &:active {
    transform: scale(0.95);
  }

  &:focus {
    outline: 2px solid $accent-green;
    outline-offset: 2px;
  }
}

// 歌单项目样式
.sidebar__playlist-item {
  position: relative;
  padding-right: ($content-padding * 1.875);
}

.sidebar__playlist-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: $font-family-base;
  line-height: $line-height-base;
}

.sidebar__playlist-actions {
  position: absolute;
  right: ($content-padding * 0.5);
  display: none;
  gap: ($content-padding * 0.25);
  align-items: center;
}

.sidebar__playlist-item:hover .sidebar__playlist-actions {
  display: flex;
}

.sidebar__action-btn {
  background: none;
  border: none;
  color: $text-disabled;
  padding: ($content-padding * 0.125);
  cursor: pointer;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all $transition-base;

  &:hover {
    background-color: $overlay-light;
    color: $text-primary;
    transform: scale(1.1);
  }

  &:active {
    transform: scale(0.9);
  }

  &:focus {
    outline: 2px solid $accent-green;
    outline-offset: 2px;
  }
}

// 加载中和无歌单提示
.sidebar__playlist-loading,
.sidebar__no-playlists {
  font-size: $font-size-sm;
  font-family: $font-family-base;
  padding: ($content-padding * 0.5);
  color: $text-disabled;
  text-align: center;
  font-style: italic;
  line-height: $line-height-base;
}

// 响应式适配
@include respond-to("md") {
  .sidebar {
    padding: ($content-padding * 1.25);

    .sidebar__menu-item {
      padding: ($content-padding * 0.5) ($content-padding * 0.375);
      font-size: $font-size-sm;
    }

    .sidebar__section {
      margin-bottom: $content-padding;
    }
  }
}

@include respond-to("sm") {
  .sidebar {
    padding: $content-padding;

    .sidebar__menu-item,
    .sidebar__bottom-item {
      padding: ($content-padding * 0.5) ($content-padding * 0.375);
      font-size: $font-size-sm;
    }

    .sidebar__logo {
      margin-bottom: $content-padding;
    }

    .sidebar__logo-title {
      font-size: $font-size-lg;
    }

    .sidebar__section-title {
      font-size: $font-size-xs;
      margin-bottom: ($content-padding * 0.375);
    }

    .sidebar__section {
      margin-bottom: $content-padding;
    }

    .sidebar__collapse-btn {
      width: 28px;
      height: 28px;
      font-size: $font-size-sm;
    }

    .sidebar__add-btn {
      width: 18px;
      height: 18px;
      font-size: $font-size-sm;
    }
  }
}

// 高对比度模式支持
@media (prefers-contrast: high) {
  .sidebar {
    border-right: 2px solid $text-primary;
  }

  .sidebar__menu-item {
    &.is-active {
      border: 1px solid $text-primary;

      &::before {
        width: 4px;
        background-color: $text-primary;
      }
    }

    &:focus {
      outline: 3px solid $text-primary;
      outline-offset: 1px;
    }
  }

  .sidebar__collapse-btn,
  .sidebar__add-btn,
  .sidebar__action-btn {
    &:focus {
      outline: 3px solid $text-primary;
      outline-offset: 1px;
    }
  }
}

// 减少动画模式支持
@media (prefers-reduced-motion: reduce) {

  .sidebar,
  .sidebar__menu-item,
  .sidebar__add-btn,
  .sidebar__action-btn,
  .sidebar__collapse-btn,
  .sidebar__text,
  .sidebar__logo-title,
  .sidebar__section-title,
  .sidebar__playlist-name {
    transition: none !important;
  }

  .sidebar__menu-item:hover,
  .sidebar__add-btn:hover,
  .sidebar__action-btn:hover,
  .sidebar__collapse-btn:hover {
    transform: none !important;
  }

  .fa.icon--clickable:active {
    transform: none !important;
  }
}
</style>