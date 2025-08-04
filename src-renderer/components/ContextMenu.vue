<script setup>
import { computed, ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { usePlayerStore } from '../store/player';
import { usePlaylistStore } from '../store/playlist';
import FAIcon from './FAIcon.vue';

const props = defineProps({
  show: Boolean,
  x: Number,
  y: Number,
  song: Object
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

const menuRef = ref(null);

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
    const playerBarHeight = 90; // 播放器高度
    const availableHeight = viewportHeight - playerBarHeight; // 可用高度，排除播放器区域

    // 检查右边界
    if (x + rect.width > viewportWidth) {
      x = viewportWidth - rect.width - 5;
    }

    // 检查下边界，确保菜单不会延伸到播放器区域
    if (y + rect.height > availableHeight) {
      y = availableHeight - rect.height - 5;
    }
  }

  return {
    left: `${x}px`,
    top: `${y}px`
  };
});

// 当前歌曲是否在播放
const isCurrentSongPlaying = computed(() => {
  return playerStore.currentSong &&
    props.song && playerStore.currentSong.id === props.song.id &&
    playerStore.playing;
});

// 处理菜单项点击
const handleMenuAction = (action) => {
  emit('action', { action, song: props.song });
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

// 挂载后添加全局点击事件监听，加载歌单列表，并在需要时调整位置
onMounted(async () => {
  document.addEventListener('click', handleDocumentClick);

  // 初始加载歌单列表
  await fetchPlaylists();

  if (props.show && menuRef.value) {
    await nextTick();
    // 调整位置的逻辑已由menuStyle计算属性处理
  }
});

// 卸载前移除全局点击事件监听
onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick);
});
</script>

<template>
  <div v-if="show" ref="menuRef" class="context-menu" :style="menuStyle" @click.stop>
    <div class="menu-header" v-if="props.song">
      <div class="song-info">
        <div class="song-title">{{ props.song.title || '未知歌曲' }}</div>
        <div class="song-artist">{{ props.song.artist || '未知艺术家' }}</div>
      </div>
    </div>

    <div class="menu-items">
      <!-- 播放/暂停 -->
      <div class="menu-item" @click="handleMenuAction('play-toggle')">
        <FAIcon :name="isCurrentSongPlaying ? 'pause' : 'play'" size="medium" color="primary" class="menu-icon" />
        <span>{{ isCurrentSongPlaying ? '暂停' : '播放' }}</span>
      </div>

      <!-- 添加到播放列表 -->
      <div class="menu-item" @click="handleMenuAction('add-to-playlist')">
        <FAIcon name="plus-square-o" size="medium" color="primary" class="menu-icon" />
        <span>添加到播放列表</span>
      </div>

      <!-- 添加到歌单 - 折叠菜单 -->
      <div class="menu-section">
        <div class="menu-item toggle-submenu" @click="togglePlaylistSubmenu">
          <FAIcon name="plus" size="medium" color="primary" class="menu-icon" />
          <span>添加到歌单</span>
          <FAIcon :name="showPlaylistSubmenu ? 'chevron-up' : 'chevron-down'" size="small" color="secondary"
            class="submenu-icon" />
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
              <FAIcon name="music" size="small" color="primary" class="menu-icon small" />
              <span>{{ playlist.name }}</span>
            </div>
          </template>

          <!-- 创建新歌单 -->
          <div class="submenu-item create-new" @click.stop="handleCreateNewPlaylist">
            <FAIcon name="plus-circle" size="small" color="accent" class="menu-icon small" />
            <span>创建新歌单</span>
          </div>
        </div>
      </div>

      <!-- 显示歌词 -->
      <div class="menu-item" @click="handleMenuAction('show-lyrics')">
        <FAIcon name="file-text-o" size="medium" color="primary" class="menu-icon" />
        <span>显示歌词</span>
      </div>

      <!-- 编辑标签 -->
      <div class="menu-item" @click="handleMenuAction('edit-tags')">
        <FAIcon name="edit" size="medium" color="primary" class="menu-icon" />
        <span>编辑标签</span>
      </div>

      <!-- 歌曲信息 -->
      <div class="menu-item" @click="handleMenuAction('song-info')">
        <FAIcon name="info-circle" size="medium" color="primary" class="menu-icon" />
        <span>歌曲信息</span>
      </div>

      <!-- 显示文件位置 -->
      <div class="menu-item" @click="handleMenuAction('show-in-folder')">
        <FAIcon name="folder-open" size="medium" color="primary" class="menu-icon" />
        <span>显示文件位置</span>
      </div>

      <!-- 复制歌曲信息 -->
      <div class="menu-item" @click="handleMenuAction('copy-info')">
        <FAIcon name="copy" size="medium" color="primary" class="menu-icon" />
        <span>复制歌曲信息</span>
      </div>

      <!-- 从列表中删除 -->
      <div class="menu-item delete" @click="handleMenuAction('remove-from-list')">
        <FAIcon name="trash" size="medium" color="danger" class="menu-icon" />
        <span>从列表中删除</span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// 导入样式变量
@use "../styles/variables/_colors" as *;
@use "../styles/variables/_layout" as *;

.context-menu {
  position: fixed;
  z-index: $z-context-menu;
  min-width: 200px;
  max-width: 250px;
  background-color: $bg-tertiary;
  border-radius: $border-radius;
  box-shadow: $box-shadow-hover;
  overflow: hidden;
  animation: fadeIn $transition-fast ease-out;
  user-select: none;
  border: 1px solid $bg-tertiary;

  @include respond-to("sm") {
    min-width: 180px;
    max-width: 220px;
  }
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
  padding: $item-padding;
  background-color: $bg-secondary;
  border-bottom: 1px solid $bg-tertiary;
}

.song-info {
  overflow: hidden;
}

.song-title {
  font-weight: $font-weight-medium;
  font-size: $font-size-base;
  color: $text-primary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.song-artist {
  font-size: $font-size-sm;
  color: $text-secondary;
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
  padding: 10px $content-padding;
  cursor: pointer;
  font-size: $font-size-base;
  color: $text-primary;
  transition: all $transition-base;
  position: relative;

  &:hover {
    background-color: $overlay-light;
  }

  &:active {
    background-color: $overlay-medium;
  }
}

.menu-icon {
  margin-right: $item-padding;
  flex-shrink: 0;

  &.small {
    margin-right: 8px;
  }
}

.menu-item.delete {
  color: $danger;
  border-top: 1px solid $bg-tertiary;
  margin-top: 4px;
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
  margin-left: auto;
}

.inline-submenu {
  background-color: $bg-primary;
  border-top: 1px solid $bg-secondary;
  border-bottom: 1px solid $bg-secondary;
  animation: slideDown $transition-base ease-out;
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
  padding: 8px $content-padding 8px 32px;
  font-size: $font-size-sm;
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: background-color $transition-base;

  &:hover {
    background-color: $overlay-light;
  }

  &.loading,
  &.no-playlists,
  &.error {
    color: $text-disabled;
    font-style: italic;
    cursor: default;
    padding: 10px $content-padding 10px 32px;

    &:hover {
      background-color: transparent;
    }
  }

  &.error {
    color: $danger;
  }

  &.create-new {
    border-top: 1px solid $bg-tertiary;
    color: $accent-green;
  }
}

/* 响应式适配 */
@include respond-to("sm") {
  .context-menu {
    .menu-item {
      padding: 8px $content-padding;
      font-size: $font-size-sm;
    }

    .submenu-item {
      padding: 6px $content-padding 6px 28px;
      font-size: $font-size-xs;
    }

    .menu-header {
      padding: 8px;
    }

    .song-title {
      font-size: $font-size-sm;
    }

    .song-artist {
      font-size: $font-size-xs;
    }
  }
}
</style>