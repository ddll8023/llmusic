<script setup lang="ts">
import { ref, onMounted, computed, reactive, onUnmounted, nextTick, toRefs, watch } from 'vue';
import { useMediaStore } from '../../store/media';
import { usePlayerStore, PlayMode } from '../../store/player';
import SongTable from '../common/SongTable.vue'; // 引入新的SongTable组件
import TagEditor from '../common/TagEditor.vue'; // 引入TagEditor组件
import DeleteConfirmDialog from '../common/DeleteConfirmDialog.vue'; // 引入删除确认对话框
import ContentHeader from '../common/ContentHeader.vue'; // 直接使用 ContentHeader 组件

const mediaStore = useMediaStore();
const playerStore = usePlayerStore();

function handleSearch(value: string) {
  mediaStore.setSearchTerm(value);
}

// --- 从 LocalMusicHeader 迁移的头部操作功能 ---
// 头部操作按钮配置
const headerActions = computed(() => [
  {
    key: 'play-all',
    label: '播放全部',
    icon: 'play',
    type: 'primary' as const,
    disabled: !mediaStore.songs.length
  }
]);

// 处理头部操作按钮点击
const handleHeaderAction = (actionKey: any) => {
  if (actionKey === 'play-all') {
    playAllSongs();
  }
};

// 播放全部歌曲
const playAllSongs = () => {
  if (!mediaStore.songs.length) {
    return;
  }

  // activeLibraryId 为 null 代表"所有音乐"，这是有效的选择

  // 根据当前播放模式确定起始歌曲
  let songToPlayId;

  if (playerStore.playMode === PlayMode.RANDOM) {
    // 随机播放模式：随机选择一首歌曲
    const randomIndex = Math.floor(Math.random() * mediaStore.songs.length);
    songToPlayId = mediaStore.songs[randomIndex].id;
  } else {
    // 顺序播放和单曲循环模式：从第一首开始
    songToPlayId = mediaStore.songs[0].id;
  }

  // 播放全部歌曲
  playerStore.playSongFromList({
    listId: mediaStore.activeLibraryId ? `library-${mediaStore.activeLibraryId}` : 'library-all',
    songIds: mediaStore.songs.map(song => song.id),
    songToPlayId: songToPlayId
  });
};

// 排序状态
const { sortBy, sortDirection } = toRefs(reactive({
  sortBy: ref('modifiedAt'),
  sortDirection: ref('desc')
}));

// 当前列表的唯一ID
const currentListId = computed(() => {
  return `${sortBy.value}-${sortDirection.value}`;
});

// 排序后的歌曲
const sortedSongs = computed(() => {
  let songs = [...mediaStore.filteredSongs];

  if (sortBy.value !== 'default') {
    songs.sort((a, b) => {
      let aValue = (a as any)[sortBy.value] || '';
      let bValue = (b as any)[sortBy.value] || '';

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

// TagEditor组件引用
const tagEditorRef = ref<any>(null);

// 删除确认对话框状态
const deleteConfirmVisible = ref(false);
const songToDelete = ref<any>(null);

// SongTable组件引用
const songTableRef = ref<any>(null);

const showDeleteConfirm = (song: any) => {
  songToDelete.value = song;
  deleteConfirmVisible.value = true;
};

const closeDeleteConfirm = () => {
  deleteConfirmVisible.value = false;
  songToDelete.value = null;
};

// 处理删除确认
const handleDeleteConfirm = async (song: any) => {
  closeDeleteConfirm();
  if (!song?.id) return;

  const result = await window.electronAPI.deleteSong(song.id)
  if (result.success) {
    if (playerStore.currentSong?.id === song.id) {
      playerStore.currentSong = null
      playerStore.playing = false
    }
    await mediaStore.loadSongs()
    if (result.warning) {
      console.warn(result.warning)
    }
  }
};

// 处理SongTable的播放事件
const handlePlaySong = ({ song, listId, songIds }: { song: any; listId: any; songIds: any }) => {
  playerStore.playSongFromList({
    listId: listId,
    songIds: songIds,
    songToPlayId: song.id,
  });
};

// 处理排序变化
const handleSortChange = ({ sortBy: newSortBy, sortDirection: newSortDirection }: { sortBy: any; sortDirection: any }) => {
  sortBy.value = newSortBy;
  sortDirection.value = newSortDirection;
};

// 处理右键菜单操作
const handleContextMenuAction = async ({ action, song }: { action: any; song: any }) => {
  if (!song) return;

  switch (action) {
    case 'play-toggle':
      if (playerStore.currentSong && playerStore.currentSong.id === song.id && playerStore.playing) {
        playerStore.togglePlay(); // 暂停
      } else {
        handlePlaySong({ song, listId: currentListId.value, songIds: sortedSongs.value.map(s => s.id) }); // 播放
      }
      break;

    case 'add-to-playlist':
      playerStore.addToPlaylist(song.id);
      break;

    case 'show-lyrics':
      // 先播放歌曲
      handlePlaySong({ song, listId: currentListId.value, songIds: sortedSongs.value.map(s => s.id) });
      // 显示歌词页面
      playerStore.showLyricsDisplay();
      break;

    case 'edit-tags':
      // 打开标签编辑器
      if (tagEditorRef.value) {
        tagEditorRef.value.openEditor(song);
      }
      break;

    case 'show-in-folder':
      try {
        if (song.filePath) {
          const result = await window.electronAPI.showItemInFolder(song.filePath);
          if (!result.success) {
            console.error('无法显示文件位置:', result.error);
            alert(`无法显示文件位置: ${result.error}`);
          }
        } else {
          console.warn('歌曲没有有效的文件路径');
          alert('该歌曲无有效的文件路径信息');
        }
      } catch (error: any) {
        console.error('显示文件位置时出错:', error);
        alert(`操作失败: ${error.message || '未知错误'}`);
      }
      break;

    case 'copy-info':
      try {
        const info = `${song.title || '未知歌曲'} - ${song.artist || '未知艺术家'} - ${song.album || '未知专辑'}`;
        await window.electronAPI.copyToClipboard(info);
      } catch (error: any) {
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

// 在组件挂载后加载歌曲
onMounted(async () => {
  // 使用setTimeout确保DOM完全加载后再清除焦点
  setTimeout(() => {
    if (document.activeElement) {
      (document.activeElement as HTMLElement)?.blur();
    }
  }, 100);

  await mediaStore.loadSongs();

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
            songRow.classList.add('highlight-update');
            setTimeout(() => {
              songRow.classList.remove('highlight-update');
            }, 1500);
          }
        });
      }
    },
    { deep: true }
  );
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
      songRow.classList.add('highlight-update');
      setTimeout(() => {
        songRow.classList.remove('highlight-update');
      }, 1500);
    }
  });
};
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden">
    <ContentHeader title="本地音乐" :show-search="true" :manual-search="true" :search-value="mediaStore.searchTerm"
      search-placeholder="筛选歌曲、专辑或艺术家" :actions="headerActions" @search="handleSearch"
      @action-click="handleHeaderAction" />
    <SongTable ref="songTableRef" :songs="sortedSongs" :loading="mediaStore.loading" :show-sortable="true"
      :show-play-count="true" :show-action-column="false" :context-menu-type="'main'" :current-list-id="currentListId"
      :empty-text="'暂无歌曲'" :empty-icon="'music'" @play-song="handlePlaySong" @sort-change="handleSortChange"
      @context-menu-action="handleContextMenuAction" />

    <!-- 标签编辑器组件 -->
    <TagEditor ref="tagEditorRef" />

    <!-- 删除确认对话框 -->
    <DeleteConfirmDialog :show="deleteConfirmVisible" :song="songToDelete" @close="closeDeleteConfirm"
      @confirm="handleDeleteConfirm" />
  </div>
</template>
