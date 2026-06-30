<script setup lang="ts">
/**
 * QQMusicPlaylistDetail
 * QQ 音乐歌单详情页面：展示歌单歌曲列表，支持试听/下载/详情页
 * 依赖组件：BaseSongTable, CustomButton, FAIcon, LoadingSpinner
 */
import { watch, computed } from 'vue';
import { useQqmusicStore } from '../../store/qqmusic';
import { usePlayerStore } from '../../store/player';
import { useLyricsStore } from '../../store/lyrics';
import { getSongDownloadBundle } from '../../api/qqmusic';
import BaseSongTable from '../business/BaseSongTable.vue';
import CustomButton from '../custom/CustomButton.vue';
import FAIcon from '../common/FAIcon.vue';
import LoadingSpinner from '../custom/LoadingSpinner.vue';

const qqmusicStore = useQqmusicStore();
const playerStore = usePlayerStore();

const currentPlaylist = computed(() =>
  qqmusicStore.userPlaylists.find((p) => p.id === qqmusicStore.currentPlaylistId)
);

watch(() => qqmusicStore.currentPlaylistId, (newId) => {
  if (newId) {
    qqmusicStore.loadPlaylistSongs(newId);
  }
}, { immediate: true })

async function handleClickSong(song: any) {
  handlePlay(song);
  const lyricsStore = useLyricsStore();
  lyricsStore.reset();
  try {
    const res = await getSongDownloadBundle(String(Date.now()), song.songMid);
    const data = res.data as any;
    if (data.lyrics) {
      lyricsStore.loadOnlineLyrics(data.lyrics);
    }
  } catch { /* 歌词加载失败不阻塞 */ }
  playerStore.showLyricsDisplay();
}

function handlePlay(song: any) {
  const playable = {
    songName: song.songName,
    singer: song.singer,
    coverUrl: song.album?.albumCoverUrl || '',
    url: song.songUrl?.url || '',
    urlType: song.songUrl?.urlType || 'mp3',
  };
  playerStore.playOnlineSong(playable);
}

async function handleDownload(song: any) {
  await qqmusicStore.downloadSong(song);
}

function handlePageChange(page: number) {
  if (qqmusicStore.currentPlaylistId) {
    qqmusicStore.loadPlaylistSongs(qqmusicStore.currentPlaylistId, page);
  }
}
</script>

<template>
  <div class="p-6 text-content-base h-full overflow-y-auto flex flex-col max-md:p-4">
    <!-- 标题 -->
    <div class="flex items-center gap-3 mb-6 shrink-0">
      <div>
        <h2 class="text-xl font-bold max-md:text-lg">{{ currentPlaylist?.title || '歌单详情' }}</h2>
        <span v-if="currentPlaylist" class="text-xs text-content-secondary">{{ currentPlaylist.songCount }} 首歌曲</span>
      </div>
    </div>

    <!-- 加载状态 -->
    <LoadingSpinner v-if="qqmusicStore.currentPlaylistLoading && qqmusicStore.currentPlaylistSongs.length === 0" text="加载中..." />

    <!-- 歌曲表格 -->
    <div v-else class="flex-1 min-h-0 flex flex-col">
      <BaseSongTable
        mode="online"
        :songs="qqmusicStore.currentPlaylistSongs as any"
        :loading="false"
        :start-index="(qqmusicStore.currentPlaylistPage - 1) * qqmusicStore.currentPlaylistPageSize + 1"
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

    <!-- 分页 -->
    <div
      v-if="qqmusicStore.currentPlaylistTotal > qqmusicStore.currentPlaylistPageSize"
      class="flex items-center justify-center gap-2 mt-6 shrink-0"
    >
      <CustomButton
        type="secondary" size="small"
        :disabled="qqmusicStore.currentPlaylistPage <= 1"
        @click="handlePageChange(qqmusicStore.currentPlaylistPage - 1)"
      >上一页</CustomButton>
      <span class="text-xs text-content-secondary">
        {{ qqmusicStore.currentPlaylistPage }} / {{ Math.ceil(qqmusicStore.currentPlaylistTotal / qqmusicStore.currentPlaylistPageSize) }}
      </span>
      <CustomButton
        type="secondary" size="small"
        :disabled="qqmusicStore.currentPlaylistPage * qqmusicStore.currentPlaylistPageSize >= qqmusicStore.currentPlaylistTotal"
        @click="handlePageChange(qqmusicStore.currentPlaylistPage + 1)"
      >下一页</CustomButton>
    </div>
  </div>
</template>
