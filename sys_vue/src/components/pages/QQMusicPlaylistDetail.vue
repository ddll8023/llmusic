<script setup lang="ts">
/**
 * QQMusicPlaylistDetail
 * QQ 音乐歌单详情页面：展示歌单歌曲列表，支持搜索/播放全部/试听/下载/批量下载
 * 依赖组件：ContentHeader, BaseSongTable, FAIcon, LoadingSpinner
 */
import { ref, watch, computed } from 'vue';
import { useQqmusicStore } from '../../store/qqmusic';
import { usePlayerStore, PlayMode } from '../../store/player';
import type { OnlineSongInfo } from '../../store/player';
import ContentHeader from '../common/ContentHeader.vue';
import BaseSongTable from '../business/BaseSongTable.vue';
import FAIcon from '../common/FAIcon.vue';
import LoadingSpinner from '../custom/LoadingSpinner.vue';
import CustomButton from '../custom/CustomButton.vue';

const qqmusicStore = useQqmusicStore();
const playerStore = usePlayerStore();

const currentPlaylist = computed(() =>
  qqmusicStore.userPlaylists.find((p) => p.id === qqmusicStore.currentPlaylistId)
);

const searchTerm = ref('')
const filteredSongs = computed(() => {
  const term = searchTerm.value.trim().toLowerCase()
  if (!term) return qqmusicStore.currentPlaylistSongs
  return qqmusicStore.currentPlaylistSongs.filter((s: any) =>
    (s.songName || '').toLowerCase().includes(term) ||
    (s.singer || '').toLowerCase().includes(term)
  )
})

// 选中状态
const selectedSongs = ref<any[]>([])

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

function buildQueue(songs: any[]): OnlineSongInfo[] {
  return songs.map((s: any) => ({
    songMid: s.songMid || '',
    songName: s.songName,
    singer: s.singer,
    coverUrl: s.album?.albumCoverUrl || '',
    url: s.songUrl?.url || '',
    urlType: s.songUrl?.urlType || 'mp3',
  }))
}

function playSongWithContext(song: any) {
  if (!song.songUrl?.url) return
  const songs = filteredSongs.value
  const index = songs.findIndex((s: any) => (s.songMid || s.songId) === (song.songMid || song.songId))
  const queue = buildQueue(songs)
  const startIndex = index >= 0 ? index : 0
  playerStore.playOnlineSong(queue[startIndex], { queue, startIndex })
}

function handlePlayAll() {
  const songs = filteredSongs.value.filter((s: any) => s.songUrl?.url)
  if (songs.length === 0) return
  const queue = buildQueue(songs)
  let startIndex = 0
  if (playerStore.playMode === PlayMode.RANDOM) {
    startIndex = Math.floor(Math.random() * queue.length)
  }
  playerStore.playOnlineSong(queue[startIndex], { queue, startIndex })
}

async function handleClickSong(song: any) {
  playSongWithContext(song);
  playerStore.showLyricsDisplay();
}

function handlePlay(song: any) {
  playSongWithContext(song);
}

async function handleDownload(song: any) {
  await qqmusicStore.downloadSong(song);
}

function handleSelectionChange(songs: any[]) {
  selectedSongs.value = songs
}

async function handleBatchDownload(songs: any[]) {
  await qqmusicStore.batchDownload(songs)
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

const headerActions = computed(() => [
  {
    key: 'play-all',
    label: '播放全部',
    icon: 'play',
    type: 'primary' as const,
    disabled: filteredSongs.value.length === 0,
  },
])
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
      @action-click="handlePlayAll"
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
        :songs="filteredSongs as any"
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
    <transition name="fade">
      <div v-if="qqmusicStore.batchProgress.active || qqmusicStore.batchProgress.completed > 0"
        class="fixed inset-0 bg-overlay-dark flex items-center justify-center z-[300]"
        @click.self="handleCloseBatchProgress">
        <div class="bg-surface-elevated border border-line-base rounded-lg p-5 w-[420px] max-h-[70vh] flex flex-col shadow-[0_10px_25px_rgba(0,0,0,0.5)]">
          <h3 class="text-base font-medium text-content-base mb-3 flex items-center gap-2">
            <FAIcon name="download" size="small" color="primary" />
            批量下载
          </h3>

          <!-- 进度条 -->
          <div class="mb-3">
            <div class="flex justify-between text-xs text-content-secondary mb-1">
              <span>进度 {{ qqmusicStore.batchProgress.completed }}/{{ qqmusicStore.batchProgress.total }}</span>
              <span>成功 {{ qqmusicStore.batchProgress.succeeded }} / 失败 {{ qqmusicStore.batchProgress.failed }}</span>
            </div>
            <div class="w-full h-2 bg-surface-overlay rounded-full overflow-hidden">
              <div class="h-full rounded-full transition-all duration-300"
                :class="qqmusicStore.batchProgress.active ? 'bg-accent-green animate-pulse' : 'bg-accent-green'"
                :style="{ width: qqmusicStore.batchProgress.total > 0 ? (qqmusicStore.batchProgress.completed / qqmusicStore.batchProgress.total) * 100 + '%' : '0%' }">
              </div>
            </div>
          </div>

          <!-- 歌曲列表 -->
          <div class="flex-1 overflow-y-auto max-h-[300px] space-y-1">
            <div v-for="(item, idx) in qqmusicStore.batchProgress.items" :key="idx"
              class="flex items-center gap-2 px-2 py-1.5 rounded text-xs"
              :class="item.status === 'success' ? 'bg-accent-green/5' : item.status === 'failed' ? 'bg-accent-danger/5' : item.status === 'downloading' ? 'bg-accent-blue/5' : ''">
              <FAIcon v-if="item.status === 'pending'" name="circle-o" size="small" color="disabled" />
              <FAIcon v-else-if="item.status === 'downloading'" name="spinner" size="small" color="primary" class="animate-spin" />
              <FAIcon v-else-if="item.status === 'success'" name="check-circle" size="small" color="primary" />
              <FAIcon v-else-if="item.status === 'failed'" name="times-circle" size="small" color="danger" />
              <span class="truncate flex-1" :class="item.status === 'success' ? 'text-content-base' : item.status === 'failed' ? 'text-accent-danger' : 'text-content-secondary'">
                {{ item.songName }} - {{ item.singer }}
              </span>
              <span v-if="item.status === 'failed' && item.error" class="text-accent-danger shrink-0 font-bold" :title="item.error">!</span>
            </div>
          </div>

          <!-- 关闭按钮 -->
          <div v-if="!qqmusicStore.batchProgress.active" class="mt-3 flex justify-end">
            <CustomButton type="primary" size="small" @click="handleCloseBatchProgress">关闭</CustomButton>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>
