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

const isCollapsed = computed(() => uiStore.sidebarWidth < 100);

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
      <div class="section-title"><span>在线音乐</span></div>
      <div class="menu-item disabled">
        <Icon name="discovery" :size="isCollapsed ? '24px' : '20px'" />
        <span>发现音乐</span>
      </div>
      <div class="menu-item disabled">
        <Icon name="fm" :size="isCollapsed ? '24px' : '20px'" />
        <span>私人FM</span>
      </div>
    </div>

    <div class="menu-section">
      <div class="section-title"><span>我的音乐</span></div>
      <div class="menu-item" :class="{ active: uiStore.currentView === 'main' && mediaStore.activeLibraryId === null }"
        @click="handleSetLibrary(null)">
        <Icon name="local" :size="isCollapsed ? '24px' : '20px'" />
        <span>所有音乐</span>
      </div>
      <div v-for="lib in mediaStore.libraries" :key="lib.id" class="menu-item"
        :class="{ active: uiStore.currentView === 'main' && mediaStore.activeLibraryId === lib.id }"
        @click="handleSetLibrary(lib.id)">
        <Icon name="music" :size="isCollapsed ? '24px' : '20px'" />
        <span>{{ lib.name }}</span>
      </div>
      <div class="menu-item disabled">
        <Icon name="recent" :size="isCollapsed ? '24px' : '20px'" />
        <span>最近播放</span>
      </div>
      <div class="menu-item disabled">
        <Icon name="favorites" :size="isCollapsed ? '24px' : '20px'" />
        <span>我的收藏</span>
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
    <div class="sidebar-item" :class="{ active: uiStore.currentView === 'settings' }"
      @click="uiStore.setView('settings')">
      <Icon name="settings" :size="isCollapsed ? '24px' : '20px'" />
      <span>设置</span>
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
  /* 确保侧边栏占满整个高度 */
}

.sidebar.collapsed {
  width: 100%;
  padding: 24px 12px;
}

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

.close-sidebar-btn {
  background: none;
  border: none;
  color: #b3b3b3;
  font-size: 24px;
  cursor: pointer;
  display: none;
  /* Hidden on larger screens */
}

@media (max-width: 768px) {
  .close-sidebar-btn {
    display: block;
  }
}

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

.sidebar.collapsed .section-title span {
  display: none;
}

.sidebar.collapsed .section-title {
  text-align: center;
  padding-left: 0;
}

/* Add a separator when collapsed */
.sidebar.collapsed .section-title::after {
  content: '---';
  display: block;
  letter-spacing: -2px;
}

.menu-item {
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

.sidebar.collapsed .menu-item {
  justify-content: center;
  padding: 12px 0;
}

.menu-item .icon-wrapper {
  margin-right: 16px;
  flex-shrink: 0;
  font-size: 20px;
  color: inherit;
}

.sidebar.collapsed .menu-item .icon-wrapper {
  margin-right: 0;
  font-size: 24px;
  color: #fff;
}

.sidebar.collapsed .menu-item span {
  display: none;
}

.menu-item:hover {
  background-color: #282828;
  color: #fff;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  transform: translateY(-2px);
}

.menu-item:active {
  transform: scale(0.97) translateY(0);
  box-shadow: none;
  background-color: #333;
}

.menu-item.active {
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

.sidebar-spacer {
  flex-grow: 1;
  min-height: 20px;
  /* 添加最小高度确保有一些空间 */
}

.sidebar-item {
  display: flex;
  align-items: center;
  padding: 10px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;
  white-space: nowrap;
  overflow: hidden;
  font-size: 14px;
  margin-top: 8px;
}

.sidebar-item:hover,
.sidebar-item.active {
  background-color: #282828;
  color: #fff;
}

.sidebar-item .icon {
  margin-right: 16px;
  width: 20px;
  text-align: center;
  flex-shrink: 0;
}

.sidebar-item .icon-wrapper {
  margin-right: 16px;
  flex-shrink: 0;
  font-size: 20px;
  color: inherit;
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