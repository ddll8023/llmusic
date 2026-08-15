<script setup lang="ts">
/**
 * QQMusicPlaylistDetail
 * QQ 音乐歌单详情页面：展示歌单歌曲列表，支持搜索/播放全部/试听/下载/批量下载
 * 依赖组件：ContentHeader, BaseSongTable, FAIcon, LoadingSpinner
 */
import { ref, watch, computed } from 'vue';
import { useQqmusicStore } from '../../store/qqmusic';
import { usePlayerStore, PlayMode } from '../../store/player';
import { useNotificationStore } from '../../store/notification';
import type { OnlineSongInfo } from '../../store/player';
import type { OnlineSong, SongItem } from '@/types';
import ContentHeader from '../common/ContentHeader.vue';
import BaseSongTable from '../business/BaseSongTable.vue';
import BatchDownloadDialog from '../business/BatchDownloadDialog.vue';
import FAIcon from '../common/FAIcon.vue';
import LoadingSpinner from '../custom/LoadingSpinner.vue';
import CustomButton from '../custom/CustomButton.vue';

const qqmusicStore = useQqmusicStore();
const playerStore = usePlayerStore();
const notification = useNotificationStore();

const currentPlaylist = computed(() =>
  qqmusicStore.userPlaylists.find((p) => p.id === qqmusicStore.currentPlaylistId)
);

const searchTerm = ref('')
const filteredSongs = computed(() => {
  const term = searchTerm.value.trim().toLowerCase()
  if (!term) return qqmusicStore.currentPlaylistSongs
  return qqmusicStore.currentPlaylistSongs.filter((s) =>
    (s.songName || '').toLowerCase().includes(term) ||
    (s.singer || '').toLowerCase().includes(term)
  )
})

// 选中状态
const selectedSongs = ref<SongItem[]>([])

watch(() => qqmusicStore.currentPlaylistId, (newId) => {
  if (newId) {
    searchTerm.value = ''
    selectedSongs.value = []
    qqmusicStore.loadAllPlaylistSongs(newId);
  }
}, { immediate: true })

async function handleRefresh() {
  if (qqmusicStore.currentPlaylistId) {
    searchTerm.value = ''
    selectedSongs.value = []
    await qqmusicStore.refreshPlaylistSongs(qqmusicStore.currentPlaylistId)
  }
}

function buildQueue(songs: OnlineSong[]): OnlineSongInfo[] {
  return songs.map((s) => ({
    songMid: s.songMid || '',
    songName: s.songName,
    singer: s.singer,
    coverUrl: s.album?.albumCoverUrl || '',
    url: s.songUrl?.url || '',
    urlType: s.songUrl?.urlType || 'mp3',
  }))
}

function playSongWithContext(song: SongItem) {
  if (!song.songUrl?.url) return
  const songs = filteredSongs.value
  const index = songs.findIndex((s) => (s.songMid || s.songId) === (song.songMid || song.songId))
  const queue = buildQueue(songs)
  const startIndex = index >= 0 ? index : 0
  playerStore.playOnlineSong(queue[startIndex], { queue, startIndex })
}

function handlePlayAll() {
  const songs = filteredSongs.value.filter((s) => s.songUrl?.url)
  if (songs.length === 0) return
  const queue = buildQueue(songs)
  let startIndex = 0
  if (playerStore.playMode === PlayMode.RANDOM) {
    startIndex = Math.floor(Math.random() * queue.length)
  }
  playerStore.playOnlineSong(queue[startIndex], { queue, startIndex })
}

async function handleClickSong(song: SongItem) {
  playSongWithContext(song);
  playerStore.showLyricsDisplay();
}

function handlePlay(song: SongItem) {
  playSongWithContext(song);
}

/** 下载 IPC 返回结构（warning：元数据写入失败但已保存纯音频） */
type DownloadResult = IpcResult<{ filePath?: string; warning?: string }>

async function handleDownload(song: SongItem) {
  try {
    const result = (await qqmusicStore.downloadSong(song)) as DownloadResult | undefined;
    if (!result) return;
    if (result.success) {
      if (result.warning) {
        notification.warning(result.warning);
      } else {
        notification.success(result.filePath ? `已保存到 ${result.filePath}` : '下载完成');
      }
    } else if (!result.canceled) {
      notification.error(`下载失败: ${result.error || '未知错误'}`);
    }
  } catch (e) {
    notification.notifyError(e);
  }
}

function handleSelectionChange(songs: SongItem[]) {
  selectedSongs.value = songs
}

async function handleBatchDownload(songs: SongItem[]) {
  try {
    await qqmusicStore.batchDownload(songs)
  } catch (e) {
    notification.notifyError(e)
  }
}

function handleCloseBatchProgress() {
  qqmusicStore.batchProgress = {
    total: 0,
    completed: 0,
    succeeded: 0,
    failed: 0,
    items: [],
    active: false,
  }
}

async function handleRetryFailed() {
  try {
    await qqmusicStore.retryFailed()
  } catch (e) {
    notification.notifyError(e)
  }
}

const headerActions = computed(() => [
  {
    key: 'play-all',
    label: '播放全部',
    icon: 'play',
    type: 'primary' as const,
    disabled: filteredSongs.value.length === 0,
  },
  {
    key: 'refresh',
    label: qqmusicStore.isRefreshing ? '刷新中...' : '刷新',
    icon: 'refresh',
    type: 'secondary' as const,
    disabled: qqmusicStore.isRefreshing,
  },
])

function handleActionClick(key: string) {
  if (key === 'refresh') {
    handleRefresh()
  } else if (key === 'play-all') {
    handlePlayAll()
  }
}
</script>

<template>
  <div class="h-full flex flex-col bg-surface-base text-content-base overflow-hidden">
    <ContentHeader
      :title="currentPlaylist?.title || '歌单详情'"
      :meta-text="`${filteredSongs.length} / ${currentPlaylist?.songCount || 0} 首歌曲`"
      :show-search="true"
      :manual-search="true"
      :search-value="searchTerm"
      search-placeholder="筛选歌曲或歌手"
      :actions="headerActions"
      @search="searchTerm = $event"
      @action-click="handleActionClick"
    />

    <!-- 首次加载 -->
    <LoadingSpinner
      v-if="qqmusicStore.currentPlaylistLoading && qqmusicStore.currentPlaylistSongs.length === 0"
      text="加载中..."
    />

    <!-- 错误状态 -->
    <div v-else-if="qqmusicStore.loadingError && qqmusicStore.currentPlaylistSongs.length === 0"
      class="flex flex-col items-center justify-center flex-1 text-content-secondary gap-3">
      <FAIcon name="exclamation-circle" size="xl" color="danger" />
      <p>{{ qqmusicStore.loadingError }}</p>
      <button class="px-3 py-1.5 text-sm bg-surface-overlay rounded hover:bg-surface-elevated transition-colors" @click="handleRefresh">重试</button>
    </div>

    <!-- 歌曲表格 -->
    <div v-else class="flex-1 min-h-0 flex flex-col">
      <BaseSongTable
        mode="online"
        :songs="filteredSongs"
        :loading="qqmusicStore.currentPlaylistLoading && qqmusicStore.currentPlaylistSongs.length > 0"
        :downloading-ids="qqmusicStore.downloadingIds"
        :show-cover="true"
        :show-format="true"
        :show-action="true"
        :show-checkbox="true"
        empty-text="歌单暂无歌曲"
        @click-song="handleClickSong"
        @play="handlePlay"
        @download="handleDownload"
        @selection-change="handleSelectionChange"
        @batch-download="handleBatchDownload"
      />
    </div>

    <!-- 批量下载进度弹窗 -->
    <BatchDownloadDialog :progress="qqmusicStore.batchProgress"
      @close="handleCloseBatchProgress" @retry="handleRetryFailed" />
  </div>
</template>
