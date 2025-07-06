<script setup>
import { computed, ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { usePlayerStore } from '../store/player';
import { usePlaylistStore } from '../store/playlist';

const props = defineProps({
  show: Boolean,
  x: Number,
  y: Number,
  song: Object,
  onClose: Function
});

const emit = defineEmits(['close', 'action']);

const playerStore = usePlayerStore();
const playlistStore = usePlaylistStore();

// 展开歌单子菜单状态
const showPlaylistSubmenu = ref(false);

// 本地存储歌单列表，避免依赖全局状态
const localPlaylists = ref([]);
const isLoadingPlaylists = ref(false);
const loadingError = ref(null);

// 计算菜单位置，确保不超出视口
const menuStyle = computed(() => {
  if (!props.x || !props.y) return { display: 'none' };

  let x = props.x;
  let y = props.y;

  // 在nextTick后检查菜单是否超出视口边界
  if (menuRef.value) {
    const rect = menuRef.value.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 检查右边界
    if (x + rect.width > viewportWidth) {
      x = viewportWidth - rect.width - 5;
    }

    // 检查下边界
    if (y + rect.height > viewportHeight) {
      y = viewportHeight - rect.height - 5;
    }
  }

  return {
    left: `${x}px`,
    top: `${y}px`
  };
});

const menuRef = ref(null);

// 当前歌曲是否在播放
const isCurrentSongPlaying = computed(() => {
  return playerStore.currentSong &&
    playerStore.currentSong.id === props.song?.id &&
    playerStore.playing;
});

// 处理菜单项点击
const handleMenuAction = (action, data = null) => {
  emit('action', { action, song: props.song, data });
  emit('close');
};

// 独立函数：加载歌单列表
async function fetchPlaylists() {
  if (isLoadingPlaylists.value) return;

  isLoadingPlaylists.value = true;
  loadingError.value = null;

  try {
    const result = await window.electronAPI.getPlaylists();
    if (result.success) {
      localPlaylists.value = result.playlists || [];
    } else {
      loadingError.value = result.error || "加载歌单失败";
    }
  } catch (error) {
    loadingError.value = error.message || "获取歌单出错";
  } finally {
    isLoadingPlaylists.value = false;
  }
}

// 切换子菜单显示状态
const togglePlaylistSubmenu = async () => {
  // 切换子菜单状态
  showPlaylistSubmenu.value = !showPlaylistSubmenu.value;

  // 每次打开子菜单时刷新歌单列表
  if (showPlaylistSubmenu.value) {
    await fetchPlaylists();
  }
};

// 处理添加到歌单
const handleAddToPlaylist = async (playlist) => {
  if (props.song && playlist) {
    try {
      const songIds = Array.isArray(props.song.id) ? props.song.id : [props.song.id];
      const result = await window.electronAPI.addSongsToPlaylist(
        playlist.id,
        songIds
      );

      if (result.success) {
        // 重新加载歌单列表以获取最新数据
        playlistStore.loadPlaylists();
      }
    } catch (error) {
      // 错误处理
    }
  }
  emit('close');
};

// 点击外部关闭菜单
const handleDocumentClick = (event) => {
  if (props.show && menuRef.value && !menuRef.value.contains(event.target)) {
    emit('close');
  }
};

// 创建新歌单并添加当前歌曲
const handleCreateNewPlaylist = () => {
  // 打开歌单创建对话框
  playlistStore.openCreatePlaylistDialog();

  // 关闭右键菜单
  emit('close');
};

// 监听菜单显示状态
watch(() => props.show, (newVal) => {
  if (newVal) {
    // 菜单显示时预加载歌单列表
    fetchPlaylists();
  } else {
    // 菜单关闭时重置子菜单状态
    showPlaylistSubmenu.value = false;
  }
});

// 挂载后添加全局点击事件监听
onMounted(async () => {
  document.addEventListener('click', handleDocumentClick);

  // 初始加载歌单列表
  await fetchPlaylists();
});

// 卸载前移除全局点击事件监听
onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick);
});

// 完成挂载后检查位置并调整
onMounted(async () => {
  if (props.show && menuRef.value) {
    await nextTick();

    // 再次检查是否超出边界并调整
    const rect = menuRef.value.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = props.x;
    let adjustedY = props.y;

    if (props.x + rect.width > viewportWidth) {
      adjustedX = viewportWidth - rect.width - 5;
    }

    if (props.y + rect.height > viewportHeight) {
      adjustedY = viewportHeight - rect.height - 5;
    }

    // 直接应用调整后的位置
    if (menuRef.value) {
      menuRef.value.style.left = `${adjustedX}px`;
      menuRef.value.style.top = `${adjustedY}px`;
    }
  }
});
</script>

<template>
  <div v-if="show" ref="menuRef" class="context-menu" :style="menuStyle" @click.stop>
    <div class="menu-header" v-if="song">
      <div class="song-info">
        <div class="song-title">{{ song.title || '未知歌曲' }}</div>
        <div class="song-artist">{{ song.artist || '未知艺术家' }}</div>
      </div>
    </div>

    <div class="menu-items">
      <!-- 播放/暂停 -->
      <div class="menu-item" @click="handleMenuAction('play-toggle')">
        <svg class="menu-icon" viewBox="0 0 24 24">
          <path v-if="!isCurrentSongPlaying" d="M8 5v14l11-7z"></path>
          <path v-else d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path>
        </svg>
        <span>{{ isCurrentSongPlaying ? '暂停' : '播放' }}</span>
      </div>

      <!-- 添加到播放列表 -->
      <div class="menu-item" @click="handleMenuAction('add-to-playlist')">
        <svg class="menu-icon" viewBox="0 0 24 24">
          <path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm0 8H2v2h12v-2zm8-4h-6v2h6v-2z"></path>
        </svg>
        <span>添加到播放列表</span>
      </div>

      <!-- 添加到歌单 - 折叠菜单 -->
      <div class="menu-section">
        <div class="menu-item toggle-submenu" @click="togglePlaylistSubmenu">
          <svg class="menu-icon" viewBox="0 0 24 24">
            <path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z"></path>
          </svg>
          <span>添加到歌单</span>
          <svg class="submenu-icon" :class="{ 'rotated': showPlaylistSubmenu }" viewBox="0 0 24 24">
            <path d="M7 10l5 5 5-5z"></path>
          </svg>
        </div>

        <!-- 内联子菜单 -->
        <div v-if="showPlaylistSubmenu" class="inline-submenu">
          <!-- 加载中状态 -->
          <div v-if="isLoadingPlaylists" class="submenu-item loading">
            加载中...
          </div>

          <!-- 加载错误 -->
          <div v-else-if="loadingError" class="submenu-item error">
            <span>{{ loadingError }}</span>
          </div>

          <!-- 没有歌单提示 -->
          <div v-else-if="localPlaylists.length === 0" class="submenu-item no-playlists">
            <span>暂无歌单</span>
          </div>

          <!-- 歌单列表 -->
          <template v-else>
            <div v-for="playlist in localPlaylists" :key="playlist.id" class="submenu-item"
              @click.stop="handleAddToPlaylist(playlist)">
              <svg class="menu-icon small" viewBox="0 0 24 24">
                <path
                  d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z">
                </path>
              </svg>
              <span>{{ playlist.name }}</span>
            </div>
          </template>

          <!-- 创建新歌单 -->
          <div class="submenu-item create-new" @click.stop="handleCreateNewPlaylist">
            <svg class="menu-icon small" viewBox="0 0 24 24">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"></path>
            </svg>
            <span>创建新歌单</span>
          </div>
        </div>
      </div>

      <!-- 显示歌词 -->
      <div class="menu-item" @click="handleMenuAction('show-lyrics')">
        <svg class="menu-icon" viewBox="0 0 24 24">
          <path
            d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM5 10h14v2H5zm0-4h14v2H5zm0 8h7v2H5z">
          </path>
        </svg>
        <span>显示歌词</span>
      </div>

      <!-- 编辑标签 -->
      <div class="menu-item" @click="handleMenuAction('edit-tags')">
        <svg class="menu-icon" viewBox="0 0 24 24">
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z">
          </path>
        </svg>
        <span>编辑标签</span>
      </div>

      <!-- 歌曲信息 -->
      <div class="menu-item" @click="handleMenuAction('song-info')">
        <svg class="menu-icon" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z">
          </path>
        </svg>
        <span>歌曲信息</span>
      </div>

      <!-- 显示文件位置 -->
      <div class="menu-item" @click="handleMenuAction('show-in-folder')">
        <svg class="menu-icon" viewBox="0 0 24 24">
          <path
            d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z">
          </path>
        </svg>
        <span>显示文件位置</span>
      </div>

      <!-- 复制歌曲信息 -->
      <div class="menu-item" @click="handleMenuAction('copy-info')">
        <svg class="menu-icon" viewBox="0 0 24 24">
          <path
            d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z">
          </path>
        </svg>
        <span>复制歌曲信息</span>
      </div>

      <!-- 从列表中删除 -->
      <div class="menu-item delete" @click="handleMenuAction('remove-from-list')">
        <svg class="menu-icon" viewBox="0 0 24 24">
          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"></path>
        </svg>
        <span>从列表中删除</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.context-menu {
  position: fixed;
  z-index: 1000;
  min-width: 200px;
  max-width: 250px;
  background-color: #282828;
  border-radius: 4px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  animation: fadeIn 0.15s ease-out;
  user-select: none;
  border: 1px solid #444;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.menu-header {
  padding: 12px;
  background-color: #333;
  border-bottom: 1px solid #444;
}

.song-info {
  overflow: hidden;
}

.song-title {
  font-weight: 600;
  font-size: 14px;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.song-artist {
  font-size: 12px;
  color: #b3b3b3;
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.menu-items {
  padding: 4px 0;
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  cursor: pointer;
  font-size: 14px;
  color: #e0e0e0;
  transition: background-color 0.2s;
  position: relative;
}

.menu-item:hover {
  background-color: #3E3E3E;
}

.menu-item:active {
  background-color: #505050;
}

.menu-icon {
  width: 18px;
  height: 18px;
  margin-right: 12px;
  fill: currentColor;
  flex-shrink: 0;
}

.menu-icon.small {
  width: 14px;
  height: 14px;
  margin-right: 8px;
}

.menu-item.delete {
  color: #ff6b6b;
  border-top: 1px solid #444;
  margin-top: 4px;
}

.menu-item.delete .menu-icon {
  fill: #ff6b6b;
}

/* 内联子菜单样式 */
.menu-section {
  border-bottom: none;
}

.toggle-submenu {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.submenu-icon {
  width: 16px;
  height: 16px;
  fill: currentColor;
  margin-left: auto;
  transition: transform 0.3s;
}

.submenu-icon.rotated {
  transform: rotate(180deg);
}

.inline-submenu {
  background-color: #202020;
  border-top: 1px solid #333;
  border-bottom: 1px solid #333;
  animation: slideDown 0.2s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.submenu-item {
  padding: 8px 14px 8px 32px;
  font-size: 13px;
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: background-color 0.2s;
}

.submenu-item:hover {
  background-color: #3E3E3E;
}

.submenu-item.loading,
.submenu-item.no-playlists,
.submenu-item.error {
  color: #888;
  font-style: italic;
  cursor: default;
  padding: 10px 14px 10px 32px;
}

.submenu-item.error {
  color: #ff6b6b;
}

.submenu-item.no-playlists:hover,
.submenu-item.error:hover,
.submenu-item.loading:hover {
  background-color: transparent;
}

.submenu-item.create-new {
  border-top: 1px solid #444;
  color: #1db954;
}

.submenu-item.create-new .menu-icon {
  fill: #1db954;
}
</style>