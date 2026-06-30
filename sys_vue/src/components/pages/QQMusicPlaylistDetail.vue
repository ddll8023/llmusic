<script setup lang="ts">
/**
 * QQ 音乐歌单详情页面
 * 展示歌单内的歌曲列表，支持试听
 */
import { onMounted, computed } from 'vue';
import { useQqmusicStore } from '../../store/qqmusic';
import { usePlayerStore } from '../../store/player';
import { useUiStore } from '../../store/ui';
import FAIcon from '../common/FAIcon.vue';
import CustomButton from '../custom/CustomButton.vue';
import LoadingSpinner from '../custom/LoadingSpinner.vue';

const qqmusicStore = useQqmusicStore();
const playerStore = usePlayerStore();
const uiStore = useUiStore();

const currentPlaylist = computed(() =>
  qqmusicStore.userPlaylists.find((p) => p.id === qqmusicStore.currentPlaylistId)
);

onMounted(() => {
  if (qqmusicStore.currentPlaylistId && qqmusicStore.currentPlaylistSongs.length === 0) {
    qqmusicStore.loadPlaylistSongs(qqmusicStore.currentPlaylistId);
  }
});

const handlePlay = (song: any) => {
  const playable = {
    songName: song.songName,
    singer: song.singer,
    coverUrl: song.album?.albumCoverUrl || '',
    url: song.songUrl?.url || '',
    urlType: song.songUrl?.urlType || 'mp3',
  };
  playerStore.playOnlineSong(playable);
};

const handleBack = () => {
  qqmusicStore.clearCurrentPlaylist();
  uiStore.setView('qq-playlists');
};

const handlePageChange = (page: number) => {
  if (qqmusicStore.currentPlaylistId) {
    qqmusicStore.loadPlaylistSongs(qqmusicStore.currentPlaylistId, page);
  }
};
</script>

<template>
  <div class="p-6 text-content-base h-full overflow-y-auto max-md:p-4">
    <!-- 返回按钮 + 标题 -->
    <div class="flex items-center gap-3 mb-6">
      <CustomButton
        type="icon-only" size="small" icon="arrow-left" circle
        @click="handleBack"
        title="返回歌单列表"
      />
      <div>
        <h2 class="text-xl font-bold max-md:text-lg">{{ currentPlaylist?.title || '歌单详情' }}</h2>
        <span v-if="currentPlaylist" class="text-xs text-content-secondary">{{ currentPlaylist.songCount }} 首歌曲</span>
      </div>
    </div>

    <LoadingSpinner v-if="qqmusicStore.currentPlaylistLoading" text="加载中..." />

    <div v-else-if="qqmusicStore.currentPlaylistSongs.length === 0" class="flex flex-col items-center justify-center py-16 text-content-secondary">
      <FAIcon name="music" size="3x" color="secondary" />
      <p class="mt-4 text-sm">歌单暂无歌曲</p>
    </div>

    <template v-else>
      <!-- 歌曲列表 -->
      <div class="grid gap-2">
        <div class="grid grid-cols-[40px_1fr_1fr_1fr_80px_100px] gap-2 px-4 py-2 bg-surface-overlay border-b border-line-base text-xs font-medium text-content-tertiary uppercase tracking-wider select-none rounded-t-lg max-md:grid-cols-[40px_1fr_80px]">
          <div class="flex items-center justify-center">#</div>
          <div class="flex items-center">歌名</div>
          <div class="flex items-center max-md:hidden">歌手</div>
          <div class="flex items-center max-md:hidden">专辑</div>
          <div class="flex items-center">时长</div>
          <div class="flex items-center justify-center">操作</div>
        </div>

        <div
          v-for="(song, index) in qqmusicStore.currentPlaylistSongs" :key="song.songMid || index"
          class="grid grid-cols-[40px_1fr_1fr_1fr_80px_100px] gap-2 px-4 py-2 rounded-lg transition-[background-color] duration-150 hover:bg-surface-overlay items-center text-sm max-md:grid-cols-[40px_1fr_80px]"
        >
          <div class="flex items-center justify-center text-content-tertiary text-xs">{{ index + 1 }}</div>
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-9 h-9 rounded bg-surface-overlay shrink-0 overflow-hidden">
              <img
                v-if="song.album?.albumCoverUrl"
                :src="song.album.albumCoverUrl"
                class="w-full h-full object-cover"
                alt=""
              />
              <FAIcon v-else name="music" size="small" color="secondary" class="!w-full !h-full flex items-center justify-center" />
            </div>
            <span class="truncate font-medium text-content-base">{{ song.songName }}</span>
          </div>
          <div class="truncate text-content-secondary max-md:hidden">{{ song.singer }}</div>
          <div class="truncate text-content-secondary text-xs max-md:hidden">{{ song.album?.albumName || '-' }}</div>
          <div class="text-content-tertiary text-xs">{{ song.duration }}</div>
          <div class="flex items-center justify-center gap-1">
            <CustomButton
              type="icon-only" size="small" icon="play" circle
              :disabled="!song.songUrl?.url"
              @click="handlePlay(song)"
              title="试听"
            />
          </div>
        </div>
      </div>

      <div v-if="qqmusicStore.currentPlaylistTotal > qqmusicStore.currentPlaylistPageSize" class="flex items-center justify-center gap-2 mt-6">
        <CustomButton
          type="secondary" size="small"
          :disabled="qqmusicStore.currentPlaylistPage <= 1"
          @click="handlePageChange(qqmusicStore.currentPlaylistPage - 1)"
        >
          上一页
        </CustomButton>
        <span class="text-xs text-content-secondary">
          {{ qqmusicStore.currentPlaylistPage }} / {{ Math.ceil(qqmusicStore.currentPlaylistTotal / qqmusicStore.currentPlaylistPageSize) }}
        </span>
        <CustomButton
          type="secondary" size="small"
          :disabled="qqmusicStore.currentPlaylistPage * qqmusicStore.currentPlaylistPageSize >= qqmusicStore.currentPlaylistTotal"
          @click="handlePageChange(qqmusicStore.currentPlaylistPage + 1)"
        >
          下一页
        </CustomButton>
      </div>
    </template>
  </div>
</template>
