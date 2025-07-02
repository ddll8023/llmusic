<script setup>
import { ref, computed, onMounted } from 'vue';
import { usePlayerStore } from '../store/player';
import { useUiStore } from '../store/ui';
import { usePlaylistStore } from '../store/playlist';
import { useMediaStore } from '../store/media';
import Icon from './Icon.vue';

const playerStore = usePlayerStore();
const uiStore = useUiStore();
const playlistStore = usePlaylistStore();
const mediaStore = useMediaStore();

const isCollapsed = computed(() => uiStore.sidebarWidth <= 130);

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
  <div class="sidebar" :class="{ collapsed: isCollapsed }">
    <div class="logo">
      <h1 v-if="!isCollapsed">LLMusic</h1>
      <button class="close-sidebar-btn" @click="uiStore.hideSidebar()">×</button>
    </div>

    <div class="menu-section">
      <div class="section-title"><span class="text-content">在线音乐</span></div>
      <div class="menu-item disabled">
        <Icon name="discovery" :size="isCollapsed ? '24px' : '20px'" />
        <span class="text-content">发现音乐</span>
      </div>
      <div class="menu-item disabled">
        <Icon name="fm" :size="isCollapsed ? '24px' : '20px'" />
        <span class="text-content">私人FM</span>
      </div>
    </div>

    <div class="menu-section">
      <div class="section-title"><span class="text-content">我的音乐</span></div>
      <div class="menu-item" :class="{ active: uiStore.currentView === 'main' && mediaStore.activeLibraryId === null }"
        @click="handleSetLibrary(null)">
        <Icon name="local" :size="isCollapsed ? '24px' : '20px'" />
        <span class="text-content">所有音乐</span>
      </div>
      <div v-for="lib in mediaStore.libraries" :key="lib.id" class="menu-item"
        :class="{ active: uiStore.currentView === 'main' && mediaStore.activeLibraryId === lib.id }"
        @click="handleSetLibrary(lib.id)">
        <Icon name="music" :size="isCollapsed ? '24px' : '20px'" />
        <span class="text-content">{{ lib.name }}</span>
      </div>
      <div class="menu-item disabled">
        <Icon name="recent" :size="isCollapsed ? '24px' : '20px'" />
        <span class="text-content">最近播放</span>
      </div>
      <div class="menu-item disabled">
        <Icon name="favorites" :size="isCollapsed ? '24px' : '20px'" />
        <span class="text-content">我的收藏</span>
      </div>
    </div>

    <div class="menu-section">
      <div class="section-title">
        <span>创建的歌单</span>
        <button v-if="!isCollapsed" class="add-playlist-btn" title="创建歌单"
          @click="playlistStore.openCreatePlaylistDialog()">
          +
        </button>
      </div>

      <!-- 歌单加载中 -->
      <div v-if="playlistStore.loading" class="playlist-loading">
        <span v-if="!isCollapsed">加载中...</span>
      </div>

      <!-- 歌单列表 -->
      <template v-else>
        <!-- 无歌单提示 -->
        <div v-if="playlistStore.playlists.length === 0" class="no-playlists">
          <span v-if="!isCollapsed">暂无歌单，点击"+"创建</span>
        </div>

        <!-- 歌单项目 -->
        <div v-for="playlist in playlistStore.playlists" :key="playlist.id" class="menu-item playlist-item"
          :class="{ active: playlistStore.currentPlaylistId === playlist.id }"
          @click="playlistStore.loadPlaylistById(playlist.id); uiStore.setView('playlist')">
          <Icon name="playlist" :size="isCollapsed ? '24px' : '20px'" />
          <span class="playlist-name" :title="playlist.name">{{ playlist.name }}</span>
          <!-- 编辑按钮，只在鼠标悬浮时显示 -->
          <div class="playlist-actions" v-if="!isCollapsed" @click.stop>
            <button class="edit-btn" title="编辑歌单" @click="playlistStore.openEditPlaylistDialog(playlist)">
              <Icon name="edit" :size="14" />
            </button>
            <button class="play-btn" title="播放歌单" @click="playlistStore.playPlaylist(playlist.id)">
              <Icon name="play" :size="14" />
            </button>
          </div>
        </div>
      </template>
    </div>

    <div class="sidebar-spacer"></div>

    <!-- 设置按钮 -->
    <div class="menu-item sidebar-item" :class="{ active: uiStore.currentView === 'settings' }"
      @click="uiStore.setView('settings')">
      <Icon name="settings" :size="isCollapsed ? '24px' : '20px'" />
      <span class="text-content">设置</span>
    </div>
  </div>
</template>

<style scoped>
.sidebar {
  width: 100%;
  background-color: #181818;
  color: #b3b3b3;
  padding: 24px 20px 24px 24px;
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;
  overflow: hidden;
  flex-shrink: 0;
  box-sizing: border-box;
  height: 100%;
}

/* 收缩状态 */
.sidebar.collapsed {
  padding: 24px 8px;  /* 进一步减少内边距，为图标提供更紧凑的空间 */
}

/* 收缩状态下的文字隐藏 */
.sidebar.collapsed .text-content,
.sidebar.collapsed .logo h1,
.sidebar.collapsed .section-title span,
.sidebar.collapsed .menu-item span,
.sidebar.collapsed .sidebar-item span,
.sidebar.collapsed .playlist-name {
  display: none;
}

/* 为文字内容添加过渡效果 */
.sidebar .text-content,
.sidebar .logo h1,
.sidebar .section-title span,
.sidebar .menu-item span,
.sidebar .sidebar-item span,
.sidebar .playlist-name {
  transition: opacity 0.2s ease;
}

/* Logo 区域 */
.logo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.logo h1 {
  font-size: 24px;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
}

/* 关闭按钮 */
.close-sidebar-btn {
  background: none;
  border: none;
  color: #b3b3b3;
  font-size: 24px;
  cursor: pointer;
  display: none;
  transition: color 0.2s ease;
}

.close-sidebar-btn:hover {
  color: #fff;
}

@media (max-width: 768px) {
  .close-sidebar-btn {
    display: block;
  }
}

/* 菜单分区 */
.menu-section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 12px;
  font-weight: bold;
  text-transform: uppercase;
  margin-bottom: 8px;
  white-space: nowrap;
  overflow: hidden;
  color: #fff;
  padding-left: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* 收缩状态下的分区标题 */
.sidebar.collapsed .section-title {
  text-align: center;
  padding: 0;
  margin-bottom: 12px;
}

/* 改进的分隔线样式 */
.sidebar.collapsed .section-title::after {
  content: '';
  display: block;
  width: 24px;
  height: 2px;
  background: linear-gradient(90deg, transparent, #b3b3b3, transparent);
  margin: 0 auto;
  border-radius: 1px;
}

/* 菜单项基础样式 */
.menu-item,
.sidebar-item {
  display: flex;
  align-items: center;
  padding: 10px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s, box-shadow 0.25s cubic-bezier(0.25, 0.8, 0.25, 1), transform 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
  white-space: nowrap;
  overflow: hidden;
  font-size: 14px;
}

/* 收缩状态下的菜单项 */
.sidebar.collapsed .menu-item,
.sidebar.collapsed .sidebar-item {
  justify-content: center;
  padding: 10px 4px;  /* 调整内边距，使图标更紧凑 */
}

/* 图标样式统一 */
.menu-item .icon-wrapper,
.sidebar-item .icon-wrapper {
  margin-right: 16px;
  flex-shrink: 0;
  font-size: 20px;
  color: inherit;
}

/* 收缩状态下的图标 */
.sidebar.collapsed .menu-item .icon-wrapper,
.sidebar.collapsed .sidebar-item .icon-wrapper {
  margin-right: 0;
  font-size: 24px;
  color: #fff;
}

/* 菜单项交互状态 */
.menu-item:hover,
.sidebar-item:hover {
  background-color: #282828;
  color: #fff;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  transform: translateY(-2px);
}

.menu-item:active,
.sidebar-item:active {
  transform: scale(0.97) translateY(0);
  box-shadow: none;
  background-color: #333;
}

.menu-item.active,
.sidebar-item.active {
  background-color: #282828;
  color: #fff;
}

.menu-item.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.menu-item.disabled:hover {
  background-color: transparent;
  transform: none;
  box-shadow: none;
}

/* 间距器 */
.sidebar-spacer {
  flex-grow: 1;
  min-height: 20px;
}

/* 底部设置项 */
.sidebar-item {
  margin-top: 8px;
}

.sidebar-item .icon {
  margin-right: 16px;
  width: 20px;
  text-align: center;
  flex-shrink: 0;
}

/* 添加歌单按钮 */
.add-playlist-btn {
  background: none;
  border: none;
  color: #b3b3b3;
  font-size: 16px;
  cursor: pointer;
  padding: 0;
  width: 20px;
  height: 20px;
  line-height: 18px;
  text-align: center;
  border-radius: 50%;
  transition: all 0.2s;
}

.add-playlist-btn:hover {
  background-color: #282828;
  color: #fff;
  transform: scale(1.1);
}

/* 歌单项目样式 */
.playlist-item {
  position: relative;
  padding-right: 30px;
  /* 为操作按钮留出空间 */
}

.playlist-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.playlist-actions {
  position: absolute;
  right: 8px;
  display: none;
  /* 默认隐藏 */
  gap: 4px;
}

.playlist-item:hover .playlist-actions {
  display: flex;
  /* 鼠标悬停时显示 */
}

.edit-btn,
.play-btn {
  background: none;
  border: none;
  color: #888;
  padding: 2px;
  cursor: pointer;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.edit-btn:hover,
.play-btn:hover {
  background-color: #333;
  color: #fff;
}

/* 加载中和无歌单提示 */
.playlist-loading,
.no-playlists {
  font-size: 12px;
  padding: 8px;
  color: #888;
  text-align: center;
}
</style>