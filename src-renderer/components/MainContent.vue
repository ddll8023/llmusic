<script setup>
import { ref, onMounted, computed, reactive, onUnmounted, nextTick, toRefs, watch } from 'vue';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';
import { RecycleScroller } from 'vue-virtual-scroller';
import { useMediaStore } from '../store/media';
import { usePlayerStore } from '../store/player';
import ContextMenu from './ContextMenu.vue'; // 引入ContextMenu组件
import TagEditor from './TagEditor.vue'; // 引入TagEditor组件
import DeleteConfirmDialog from './DeleteConfirmDialog.vue'; // 引入删除确认对话框
import FAIcon from './FAIcon.vue'; // 引入FAIcon组件

const mediaStore = useMediaStore();
const playerStore = usePlayerStore();

const hoveredSongId = ref(null);
const scroller = ref(null);
const placeholderCover = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
// 添加isSyncing变量定义
const isSyncing = ref(false);

// 控制固定按钮的显示/隐藏
const showFixedButtons = ref(false);

const { sortBy, sortDirection } = toRefs(reactive({
  sortBy: ref('default'),
  sortDirection: ref('asc')
}));

// 当前列表的唯一ID
const currentListId = computed(() => {
  return `${sortBy.value}-${sortDirection.value}`;
});

// 歌曲封面缓存
const songCovers = reactive({});

// 排序后的歌曲
const sortedSongs = computed(() => {
  let songs = [...mediaStore.filteredSongs];

  if (sortBy.value !== 'default') {
    songs.sort((a, b) => {
      let aValue = a[sortBy.value] || '';
      let bValue = b[sortBy.value] || '';

      if (typeof aValue === 'string') {
        const result = aValue.localeCompare(bValue);
        return sortDirection.value === 'asc' ? result : -result;
      } else {
        const result = aValue - bValue;
        return sortDirection.value === 'asc' ? result : -result;
      }
    });
  }

  return songs;
});

// 歌曲索引映射（用于修复虚拟滚动序号显示问题）
const songIndexMap = computed(() => {
  const map = new Map();
  sortedSongs.value.forEach((song, index) => {
    map.set(song.id, index);
  });
  return map;
});

// 获取歌曲在排序列表中的真实索引
const getRealIndex = (song) => {
  const index = songIndexMap.value.get(song.id);
  if (index === undefined) {
    return -1;
  }
  return index;
};

// 右键菜单相关状态
const contextMenu = reactive({
  show: false,
  x: 0,
  y: 0,
  song: null
});

// 处理右键菜单打开
const handleContextMenu = (event, song) => {
  event.preventDefault();
  contextMenu.show = true;
  contextMenu.x = event.clientX;
  contextMenu.y = event.clientY;
  contextMenu.song = song;
};

// 关闭右键菜单
const closeContextMenu = () => {
  contextMenu.show = false;
};

// 处理右键菜单操作
const handleMenuAction = async ({ action, song }) => {
  if (!song) return;

  switch (action) {
    case 'play-toggle':
      if (playerStore.currentSong && playerStore.currentSong.id === song.id && playerStore.playing) {
        playerStore.togglePlay(); // 暂停
      } else {
        playFromSongList(song); // 播放
      }
      break;

    case 'add-to-playlist':
      playerStore.addToPlaylist(song.id);
      break;

    case 'show-lyrics':
      // 先播放歌曲
      playFromSongList(song);
      // 显示歌词页面
      playerStore.showLyricsDisplay();
      break;

    case 'edit-tags':
      // 打开标签编辑器
      if (tagEditorRef.value) {
        tagEditorRef.value.openEditor(song);
      }
      break;

    case 'song-info':
      // 使用更美观的自定义对话框而不是alert
      showSongInfoDialog(song);
      break;

    case 'show-in-folder':
      try {
        // 修正：使用filePath而不是path
        if (song.filePath) {
          const result = await window.electronAPI.showItemInFolder(song.filePath);
          if (!result.success) {
            console.error('无法显示文件位置:', result.error);
            // 显示错误提示
            alert(`无法显示文件位置: ${result.error}`);
          }
        } else {
          console.warn('歌曲没有有效的文件路径');
          alert('该歌曲无有效的文件路径信息');
        }
      } catch (error) {
        console.error('显示文件位置时出错:', error);
        alert(`操作失败: ${error.message || '未知错误'}`);
      }
      break;

    case 'copy-info':
      try {
        const info = `${song.title || '未知歌曲'} - ${song.artist || '未知艺术家'} - ${song.album || '未知专辑'}`;
        await window.electronAPI.copyToClipboard(info);
      } catch (error) {
        console.error('复制歌曲信息失败:', error);
        alert('复制歌曲信息失败');
      }
      break;

    case 'remove-from-list':
      // 显示删除确认对话框
      showDeleteConfirm(song);
      break;
  }
};

// TagEditor组件引用
const tagEditorRef = ref(null);

// 显示歌曲信息对话框
const songInfoDialogVisible = ref(false);
const currentSongForInfo = ref(null);

const showSongInfoDialog = (song) => {
  currentSongForInfo.value = song;
  songInfoDialogVisible.value = true;
};

const closeSongInfoDialog = () => {
  songInfoDialogVisible.value = false;
};

// 删除确认对话框状态
const deleteConfirmVisible = ref(false);
const songToDelete = ref(null);

const showDeleteConfirm = (song) => {
  songToDelete.value = song;
  deleteConfirmVisible.value = true;
};

const closeDeleteConfirm = () => {
  deleteConfirmVisible.value = false;
  songToDelete.value = null;
};

// 处理删除确认
const handleDeleteConfirm = async (result) => {
  closeDeleteConfirm();

  if (result.success) {
    // 如果删除的是当前播放的歌曲，需要先处理播放状态
    if (playerStore.currentSong && playerStore.currentSong.id === result.deletedSong.id) {
      // 清除当前歌曲和播放状态
      playerStore.clearCurrentSong();
    }

    // 刷新歌曲列表
    await mediaStore.loadSongs();

  } else {
    // 显示错误信息  
  }
};

// 格式化时长为 mm:ss 格式
const formatDuration = (seconds) => {
  if (!seconds) return '00:00';
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
};

// 格式化比特率，将bps转换为kbps
const formatBitrate = (bitrate) => {
  if (!bitrate) return '未知';
  // 转换为kbps并保留1位小数
  const kbps = (bitrate / 1000).toFixed(1);
  return `${kbps} kbps`;
};

// 格式化文件大小，转换为MB或KB
const formatFileSize = (bytes) => {
  if (!bytes) return '未知';

  if (bytes >= 1024 * 1024) {
    // 转换为MB并保留2位小数
    const mb = (bytes / (1024 * 1024)).toFixed(2);
    return `${mb} MB`;
  } else if (bytes >= 1024) {
    // 转换为KB并保留1位小数
    const kb = (bytes / 1024).toFixed(1);
    return `${kb} KB`;
  } else {
    return `${bytes} B`;
  }
};

// 格式化采样率
const formatSampleRate = (sampleRate) => {
  if (!sampleRate) return '未知';
  return `${sampleRate / 1000} kHz`;
};

// 加载歌曲封面
const loadSongCover = async (songId) => {
  if (!songId || songCovers[songId]) return;

  try {
    const result = await window.electronAPI.getSongCover(songId);

    if (result.success && result.cover) {
      const imageFormat = result.format || 'image/jpeg';
      songCovers[songId] = `data:${imageFormat};base64,${result.cover}`;
    }
  } catch (error) {
  }
};

// 播放歌曲
const playFromSongList = (song) => {
  const songIds = sortedSongs.value.map(s => s.id);
  playerStore.playSongFromList({
    listId: currentListId.value,
    songIds: songIds,
    songToPlayId: song.id,
  });
};

// 切换排序方式
const toggleSort = (field) => {
  if (sortBy.value === field) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortBy.value = field;
    sortDirection.value = 'asc';
  }
};

// 处理滚动事件
const handleScroll = (event) => {
  // 获取滚动位置
  const scrollTop = event?.target?.scrollTop || 0;

  // 当滚动位置大于0且歌词页面未显示时显示按钮，否则隐藏
  showFixedButtons.value = scrollTop > 0 && !playerStore.showLyrics;
};

// 在组件挂载后加载歌曲
onMounted(async () => {
  await mediaStore.loadSongs();

  // 初始状态下按钮应该是隐藏的
  showFixedButtons.value = false;

  // 获取歌曲封面
  fetchSongCovers();

  // 监听媒体库中歌曲播放次数更新事件
  watch(
    () => mediaStore.lastUpdatedSong,
    (newValue, oldValue) => {
      if (newValue && (!oldValue || newValue.timestamp !== oldValue?.timestamp)) {
        const { id: songId, playCount } = newValue;

        // 找到对应的行并高亮显示
        nextTick(() => {
          const songRow = document.querySelector(`[data-song-id="${songId}"]`);
          if (songRow) {
            songRow.classList.add('updated');
            setTimeout(() => {
              songRow.classList.remove('updated');
            }, 1500);
          }
        });
      }
    },
    { deep: true }
  );

  // 监听歌词页面显示状态变化
  watch(
    () => playerStore.showLyrics,
    (newValue) => {
      // 当歌词页面状态改变时，重新计算按钮显示状态
      if (scroller.value) {
        const scrollTop = scroller.value.$el?.scrollTop || 0;
        showFixedButtons.value = scrollTop > 0 && !newValue;
      }
    }
  );

  // 监听滚动事件，控制固定按钮的显示/隐藏
  window.addEventListener('scroll', handleScroll);

  // 初始化时检查是否需要显示固定按钮
  handleScroll();
});

const onUpdate = (startIndex, endIndex) => {
  if (sortedSongs.value.length === 0) return;
  for (let i = startIndex; i <= endIndex; i++) {
    // 添加安全检查，确保在索引范围内且歌曲对象存在
    if (i >= 0 && i < sortedSongs.value.length && sortedSongs.value[i]) {
      loadSongCover(sortedSongs.value[i].id);
    }
  }
};

// 滚动到当前播放歌曲位置
const scrollToCurrentSong = async () => {
  if (!playerStore.currentSong || !scroller.value) return;

  const currentSongId = playerStore.currentSong.id;
  const index = sortedSongs.value.findIndex(song => song.id === currentSongId);

  if (index !== -1) {
    // 先等待下一个tick，确保Vue已完成更新
    await nextTick();

    // 短暂延时以确保scroller组件完全初始化
    setTimeout(() => {
      scroller.value.scrollToItem(index);

      // 添加"定位完成"的视觉反馈
      const currentPlaying = document.querySelector('.song-row.playing');
      if (currentPlaying) {
        currentPlaying.classList.add('highlighted');
        setTimeout(() => {
          currentPlaying.classList.remove('highlighted');
        }, 1500);
      }
    }, 50);
  }
};

// 滚动到顶部
const scrollToTop = async () => {
  if (!scroller.value || sortedSongs.value.length === 0) return;

  // 先等待下一个tick，确保Vue已完成更新
  await nextTick();

  // 短暂延时以确保scroller组件完全初始化
  setTimeout(() => {
    scroller.value.scrollToItem(0);
  }, 50);
};

// 组件卸载前清理
onUnmounted(() => {
  // 清理工作（如果需要）
  window.removeEventListener('scroll', handleScroll);
});

// 监听当前播放歌曲的变化，如果播放次数发生变化，则刷新列表
watch(
  () => playerStore.currentSong?.playCount,
  (newCount, oldCount) => {
    if (newCount !== oldCount && typeof newCount === 'number') {
      // 强制刷新表格
      forceRefreshTable();
    }
  }
);

// 强制刷新表格的方法
const forceRefreshTable = () => {
  // 使用更平滑的方式更新表格
  if (!playerStore.currentSong || !playerStore.currentSong.id) {
    return;
  }

  const songId = playerStore.currentSong.id;
  const playCount = playerStore.currentSong.playCount;

  if (typeof playCount !== 'number') {
    return;
  }

  // 1. 首先尝试通过media store更新
  if (mediaStore && typeof mediaStore.updateSongPlayCount === 'function') {
    const updateResult = mediaStore.updateSongPlayCount(songId, playCount);
    if (updateResult) {
      return; // 更新成功，不需要进一步处理
    }
  }

  // 2. 如果media store更新失败，尝试手动更新DOM
  nextTick(() => {
    const songRow = document.querySelector(`[data-song-id="${songId}"]`);
    if (songRow) {
      // 找到播放次数的列并更新
      const playCountCol = songRow.querySelector('.song-col:nth-child(6)');
      if (playCountCol) {
        playCountCol.textContent = playCount.toString();
      }

      // 添加高亮效果
      songRow.classList.add('updated');
      setTimeout(() => {
        songRow.classList.remove('updated');
      }, 1500);
    }
  });
};

const fetchSongCovers = () => {
  // 手动触发一次初始封面加载
  // 假设一屏能显示大约15首歌，我们加载前30首以防万一
  const initialEndIndex = Math.min(30, sortedSongs.value.length - 1);
  if (initialEndIndex >= 0) {
    onUpdate(0, initialEndIndex);
  }
};
</script>

<template>
  <div class="main-content">
    <div class="song-list-header">
      <div class="header-col" style="width: 40px; flex-shrink: 0;">#</div>
      <div class="header-col" style="width: 60px; flex-shrink: 0;"></div>
      <div class="header-col sortable" style="width: 30%;" @click="toggleSort('title')">
        歌曲名
        <span v-if="sortBy === 'title'" class="sort-icon">
          {{ sortDirection === 'asc' ? '↑' : '↓' }}
        </span>
      </div>
      <div class="header-col sortable" style="width: 15%;" @click="toggleSort('artist')">
        歌手
        <span v-if="sortBy === 'artist'" class="sort-icon">
          {{ sortDirection === 'asc' ? '↑' : '↓' }}
        </span>
      </div>
      <div class="header-col sortable" style="width: 20%;" @click="toggleSort('album')">
        专辑
        <span v-if="sortBy === 'album'" class="sort-icon">
          {{ sortDirection === 'asc' ? '↑' : '↓' }}
        </span>
      </div>
      <div class="header-col sortable" style="width: 10%;" @click="toggleSort('playCount')">
        播放次数
        <span v-if="sortBy === 'playCount'" class="sort-icon">
          {{ sortDirection === 'asc' ? '↑' : '↓' }}
        </span>
      </div>
      <div class="header-col sortable" style="width: 10%;" @click="toggleSort('duration')">
        时长
        <span v-if="sortBy === 'duration'" class="sort-icon">
          {{ sortDirection === 'asc' ? '↑' : '↓' }}
        </span>
      </div>
    </div>

    <RecycleScroller ref="scroller" class="song-scroller" :items="sortedSongs" :item-size="60" key-field="id"
      :emit-update="true" v-slot="{ item: song, index }" @update="onUpdate" @scroll="handleScroll">
      <div class="song-row" @dblclick="playFromSongList(song)" @contextmenu="handleContextMenu($event, song)"
        :class="{ 'playing': playerStore.currentSong && playerStore.currentSong.id === song.id }"
        @mouseenter="hoveredSongId = song.id" @mouseleave="hoveredSongId = null" :data-song-id="song.id">
        <div class="song-col song-index" style="width: 40px; flex-shrink: 0;">{{ getRealIndex(song) + 1 }}</div>
        <div class="song-col" style="width: 60px; flex-shrink: 0;">
          <div class="song-cover-container">
            <img :src="songCovers[song.id] || placeholderCover" alt="封面" class="song-cover" />
            <transition name="fade">
              <div v-if="hoveredSongId === song.id" class="play-icon-overlay" @click="playFromSongList(song)">
                <FAIcon name="play" size="medium" color="primary" />
              </div>
            </transition>
          </div>
        </div>
        <div class="song-col" style="width: 30%;">{{ song.title || '未知歌曲' }}</div>
        <div class="song-col" style="width: 15%;">{{ song.artist || '未知艺术家' }}</div>
        <div class="song-col" style="width: 20%;">{{ song.album || '未知专辑' }}</div>
        <div class="song-col" style="width: 10%;">{{ song.playCount || 0 }}</div>
        <div class="song-col" style="width: 10%;">{{ formatDuration(song.duration) }}</div>
      </div>
    </RecycleScroller>

    <!-- 固定在右下角的两个图标按钮 -->
    <transition name="slide-fade">
      <div id="fixed-buttons" v-if="showFixedButtons">
        <!-- 定位当前播放歌曲按钮 - 卡片式设计 -->
        <div class="fixed-button locate-button" @click="scrollToCurrentSong" title="定位当前播放歌曲">
          <FAIcon name="crosshairs" size="medium" color="primary" />
        </div>

        <!-- 回到顶部按钮 - 卡片式设计 -->
        <div class="fixed-button top-button" @click="scrollToTop" title="回到顶部">
          <FAIcon name="arrow-up" size="medium" color="primary" />
        </div>
      </div>
    </transition>

    <!-- 右键菜单组件 -->
    <ContextMenu :show="contextMenu.show" :x="contextMenu.x" :y="contextMenu.y" :song="contextMenu.song"
      @close="closeContextMenu" @action="handleMenuAction" />

    <!-- 歌曲信息对话框组件 -->
    <div v-if="songInfoDialogVisible" class="song-info-dialog">
      <div class="dialog-content">
        <h2>歌曲信息</h2>
        <div class="info-grid">
          <div class="info-section">
            <h3>基本信息</h3>
            <div class="info-item">
              <span class="info-label">标题:</span>
              <span class="info-value">{{ currentSongForInfo.title || '未知标题' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">艺术家:</span>
              <span class="info-value">{{ currentSongForInfo.artist || '未知艺术家' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">专辑:</span>
              <span class="info-value">{{ currentSongForInfo.album || '未知专辑' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">时长:</span>
              <span class="info-value">{{ formatDuration(currentSongForInfo.duration) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">播放次数:</span>
              <span class="info-value">{{ currentSongForInfo.playCount || 0 }}</span>
            </div>
          </div>

          <div class="info-section">
            <h3>技术信息</h3>
            <div class="info-item">
              <span class="info-label">比特率:</span>
              <span class="info-value">{{ formatBitrate(currentSongForInfo.bitrate) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">文件大小:</span>
              <span class="info-value">{{ formatFileSize(currentSongForInfo.fileSize) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">格式:</span>
              <span class="info-value">{{ currentSongForInfo.format || '未知格式' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">采样率:</span>
              <span class="info-value">{{ formatSampleRate(currentSongForInfo.sampleRate) }}</span>
            </div>
          </div>
        </div>

        <div class="info-path">
          <span class="info-label">文件路径:</span>
          <span class="info-value path">{{ currentSongForInfo.filePath || '未知路径' }}</span>
        </div>

        <button @click="closeSongInfoDialog">关闭</button>
      </div>
    </div>

    <!-- 标签编辑器组件 -->
    <TagEditor ref="tagEditorRef" />

    <!-- 删除确认对话框 -->
    <DeleteConfirmDialog :show="deleteConfirmVisible" :song="songToDelete" @close="closeDeleteConfirm"
      @confirm="handleDeleteConfirm" />
  </div>
</template>

<style lang="scss" scoped>
@use "../styles/variables/_colors" as *;
@use "../styles/variables/_layout" as *;
@use "sass:color";

.main-content {
  flex-grow: 1;
  background-color: $bg-primary;
  color: $text-primary;
  padding: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}

.song-list-header {
  display: flex;
  align-items: center;
  background-color: $bg-secondary;
  color: $text-secondary;
  padding: 0 $content-padding * 0.625;
  height: 40px;
  border-bottom: 1px solid $bg-tertiary;
  flex-shrink: 0;

  @include respond-to("sm") {
    padding: 0 $content-padding * 0.5;
    height: 36px;
  }
}

.header-col {
  padding: $content-padding * 0.5;
  font-weight: $font-weight-medium;
  font-size: $font-size-base;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;

  @include respond-to("sm") {
    font-size: $font-size-sm;
    padding: $content-padding * 0.375;
  }
}

.header-col.sortable {
  cursor: pointer;
  transition: color $transition-base;

  &:hover {
    color: $text-primary;
  }
}

.header-col-fixed {
  flex-shrink: 0;
  padding: 0 $content-padding * 0.5;
  display: flex;
  align-items: center;
}

.sort-icon {
  margin-left: $content-padding * 0.3125;
}

.song-scroller {
  height: 100%;
  width: 100%;
  overflow-y: auto;
}

.song-row {
  display: flex;
  align-items: center;
  height: 60px;
  padding: 0 $content-padding * 0.625;
  border-bottom: 1px solid $bg-tertiary;
  transition: background-color $transition-base;
  border-radius: $border-radius;
  margin: 2px 0;

  &:hover {
    background-color: $bg-tertiary;
  }

  &.playing {
    color: $accent-green;
    background-color: rgba(76, 175, 80, 0.1);

    &.highlighted {
      animation: pulse 1.5s ease;
    }
  }

  @include respond-to("sm") {
    height: 50px;
    padding: 0 $content-padding * 0.5;
  }
}

@keyframes pulse {
  0% {
    background-color: rgba(76, 175, 80, 0.1);
    box-shadow: 0 0 0 rgba(76, 175, 80, 0);
  }

  25% {
    background-color: rgba(76, 175, 80, 0.2);
    box-shadow: 0 0 10px rgba(76, 175, 80, 0.5);
  }

  50% {
    background-color: rgba(76, 175, 80, 0.1);
    box-shadow: 0 0 10px rgba(76, 175, 80, 0.3);
  }

  100% {
    background-color: rgba(76, 175, 80, 0.1);
    box-shadow: 0 0 0 rgba(76, 175, 80, 0);
  }
}

.song-col {
  padding: $content-padding * 0.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;

  @include respond-to("sm") {
    padding: $content-padding * 0.375;
    font-size: $font-size-sm;
  }
}

.song-index {
  justify-content: center;
  font-weight: $font-weight-medium;
  color: $text-secondary;
}

.song-cover-container {
  position: relative;
  width: 48px;
  height: 48px;
  border-radius: $border-radius;
  overflow: hidden;

  @include respond-to("sm") {
    width: 40px;
    height: 40px;
  }
}

.song-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: $border-radius;
  background-color: $bg-tertiary;
  box-shadow: $box-shadow;
  transition: transform $transition-base;
}

.song-row:hover .song-cover {
  transform: scale(1.1);
}

.play-icon-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: $overlay-dark;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}



.fade-enter-active,
.fade-leave-active {
  transition: opacity $transition-base;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.control-buttons {
  display: flex;
  padding: $content-padding * 0.5;
  background-color: $bg-tertiary;
  border-bottom: 1px solid $bg-tertiary;
  align-items: center;
  justify-content: center;
}

.control-btn {
  padding: $content-padding * 0.5 $content-padding;
  margin: 0 $content-padding * 0.5;
  background-color: $accent-green;
  color: $text-primary;
  border: none;
  border-radius: $border-radius;
  cursor: pointer;
  font-weight: $font-weight-bold;
  transition: all $transition-base;

  &:hover {
    background-color: $accent-hover;
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }
}

#fixed-buttons {
  position: fixed;
  right: $content-padding * 1.25;
  bottom: 110px;
  display: flex;
  flex-direction: column;
  gap: $content-padding * 0.625;
  z-index: $z-player;

  @include respond-to("sm") {
    right: $content-padding;
    bottom: 100px;
    gap: $content-padding * 0.5;
  }
}

.slide-fade-enter-active {
  transition: all $transition-slow;
}

.slide-fade-leave-active {
  transition: all $transition-slow;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(20px);
  opacity: 0;
}

.fixed-button {
  width: 44px;
  height: 44px;
  border-radius: $border-radius * 2;
  background-color: $bg-tertiary;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: $box-shadow-hover;
  transition: transform $transition-base, background-color $transition-base;
  user-select: none;

  &:hover {
    transform: scale(1.05);
    background-color: color.adjust($bg-tertiary, $lightness: 10%);
  }

  &:active {
    transform: scale(0.95);
  }

  @include respond-to("sm") {
    width: 40px;
    height: 40px;
  }
}

.song-info-dialog {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: $overlay-dark;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: $z-modal;
  animation: fadeIn $transition-fast ease-out;
}

.dialog-content {
  background-color: $bg-secondary;
  padding: $content-padding * 1.5;
  border-radius: $border-radius * 2;
  width: 90%;
  max-width: 500px;
  border: 1px solid $bg-tertiary;
  box-shadow: $box-shadow-hover;

  h2 {
    margin-top: 0;
    margin-bottom: $content-padding * 1.25;
    color: $accent-green;
    border-bottom: 1px solid $bg-tertiary;
    padding-bottom: $content-padding * 0.625;
    font-size: $font-size-lg;
  }

  h3 {
    font-size: $font-size-base;
    margin: $content-padding * 0.625 0;
    color: $text-secondary;
  }

  button {
    background-color: $accent-green;
    color: $text-primary;
    border: none;
    padding: $content-padding * 0.625 $content-padding * 1.25;
    border-radius: $border-radius;
    cursor: pointer;
    margin-top: $content-padding * 1.25;
    font-weight: $font-weight-bold;
    width: 100%;
    transition: background-color $transition-base;

    &:hover {
      background-color: $accent-hover;
    }
  }

  @include respond-to("sm") {
    padding: $content-padding;
    width: 95%;
    max-width: 400px;

    h2 {
      font-size: $font-size-base;
      margin-bottom: $content-padding;
    }

    h3 {
      font-size: $font-size-sm;
    }
  }
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: $content-padding * 0.625;

  @include respond-to("sm") {
    grid-template-columns: 1fr;
    gap: $content-padding * 0.5;
  }
}

.info-section {
  padding: $content-padding * 0.625;
  background-color: $bg-primary;
  border-radius: $border-radius;
}

.info-item {
  margin: $content-padding * 0.5 0;
  display: flex;
  align-items: flex-start;
}

.info-label {
  color: $text-secondary;
  width: 70px;
  flex-shrink: 0;
  font-size: $font-size-sm;

  @include respond-to("sm") {
    width: 60px;
    font-size: $font-size-xs;
  }
}

.info-value {
  color: $text-primary;
  word-break: break-word;
  font-size: $font-size-sm;

  @include respond-to("sm") {
    font-size: $font-size-xs;
  }
}

.info-path {
  margin-top: $content-padding;
  padding: $content-padding * 0.625;
  background-color: $bg-primary;
  border-radius: $border-radius;
  display: flex;

  .info-label {
    width: 70px;
    flex-shrink: 0;
  }

  .path {
    overflow-wrap: break-word;
    word-break: break-all;
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

@keyframes highlight-update {
  0% {
    background-color: rgba(76, 175, 80, 0.4);
  }

  50% {
    background-color: rgba(76, 175, 80, 0.2);
  }

  100% {
    background-color: transparent;
  }
}

.song-row.updated {
  animation: highlight-update 1.5s ease-out;
}
</style>