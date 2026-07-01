<script setup lang="ts">
/**
 * QQMusicPlaylistDetail
 * QQ 音乐歌单详情页面：展示歌单歌曲列表，支持试听/下载/刷新/详情页
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
    qqmusicStore.loadAllPlaylistSongs(newId);
  }
}, { immediate: true })

async function handleRefresh() {
  if (qqmusicStore.currentPlaylistId) {
    await qqmusicStore.refreshPlaylistSongs(qqmusicStore.currentPlaylistId)
  }
}

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
  } catch (e) { console.warn('歌词加载失败:', e) }
  playerStore.showLyricsDisplay();
}

function handlePlay(song: any) {
  playerStore.playOnlineSong({
    songMid: song.songMid || '',
    songName: song.songName,
    singer: song.singer,
    coverUrl: song.album?.albumCoverUrl || '',
    url: song.songUrl?.url || '',
    urlType: song.songUrl?.urlType || 'mp3',
  });
}

async function handleDownload(song: any) {
  await qqmusicStore.downloadSong(song);
}
</script>

<template>
  <div class="p-6 text-content-base h-full overflow-y-auto flex flex-col max-md:p-4">
    <!-- 标题 -->
    <div class="flex items-center gap-3 mb-6 shrink-0">
      <div class="flex-1">
        <div class="flex items-center gap-2">
          <h2 class="text-xl font-bold max-md:text-lg">{{ currentPlaylist?.title || '歌单详情' }}</h2>
          <CustomButton
            type="icon-only" size="small" icon="refresh"
            :loading="qqmusicStore.isRefreshing"
            title="刷新歌单"
            @click="handleRefresh"
          />
        </div>
        <span v-if="currentPlaylist" class="text-xs text-content-secondary">
          {{ qqmusicStore.currentPlaylistSongs.length }} / {{ currentPlaylist.songCount }} 首歌曲
        </span>
      </div>
    </div>

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
      <CustomButton type="primary" size="small" @click="handleRefresh">重试</CustomButton>
    </div>

      <!-- 歌曲表格 -->
    <div v-else class="flex-1 min-h-0 flex flex-col">
      <BaseSongTable
        mode="online"
        :songs="qqmusicStore.currentPlaylistSongs as any"
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
