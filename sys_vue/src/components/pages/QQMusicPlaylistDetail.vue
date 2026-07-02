<script setup lang="ts">
/**
 * QQMusicPlaylistDetail
 * QQ 音乐歌单详情页面：展示歌单歌曲列表，支持搜索/播放全部/试听/下载/详情页
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

watch(() => qqmusicStore.currentPlaylistId, (newId) => {
  if (newId) {
    searchTerm.value = ''
    qqmusicStore.loadAllPlaylistSongs(newId);
  }
}, { immediate: true })

async function handleRefresh() {
  if (qqmusicStore.currentPlaylistId) {
    searchTerm.value = ''
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
        :show-checkbox="false"
        empty-text="歌单暂无歌曲"
        @click-song="handleClickSong"
        @play="handlePlay"
        @download="handleDownload"
      />
    </div>
  </div>
</template>
