<script setup lang="ts">
/**
 * QQ 音乐"创建的歌单"页面
 * 展示用户创建的 QQ 歌单列表，点击进入歌单详情
 */
import { onMounted } from 'vue';
import { useQqmusicStore } from '../../store/qqmusic';
import { useUiStore } from '../../store/ui';
import FAIcon from '../common/FAIcon.vue';
import LoadingSpinner from '../custom/LoadingSpinner.vue';

const qqmusicStore = useQqmusicStore();
const uiStore = useUiStore();

onMounted(async () => {
  if (qqmusicStore.userPlaylists.length === 0) {
    await qqmusicStore.loadUserPlaylists();
  }
});

const handlePlaylistClick = (playlistId: number) => {
  qqmusicStore.setCurrentPlaylistId(playlistId);
  uiStore.setView('qq-playlist-detail');
};
</script>

<template>
  <div class="p-6 text-content-base h-full overflow-y-auto max-md:p-4">
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-xl font-bold max-md:text-lg">创建的歌单</h2>
    </div>

    <LoadingSpinner v-if="qqmusicStore.playlistsLoading" text="加载中..." />

    <div v-else-if="qqmusicStore.userPlaylists.length === 0" class="flex flex-col items-center justify-center py-16 text-content-secondary">
      <FAIcon name="list" size="3x" color="secondary" />
      <p class="mt-4 text-sm">暂无创建的歌单</p>
      <p class="mt-1 text-xs">登录 QQ 音乐后，创建的歌单将显示在这里</p>
    </div>

    <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5 max-md:grid-cols-2 max-md:gap-3">
      <div
        v-for="playlist in qqmusicStore.userPlaylists" :key="playlist.id"
        @click="handlePlaylistClick(playlist.id)"
        class="group bg-surface-overlay rounded-lg overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
      >
        <!-- 封面图 -->
        <div class="aspect-square bg-surface-elevated relative overflow-hidden">
          <img
            v-if="playlist.coverUrl"
            :src="playlist.coverUrl"
            :alt="playlist.title"
            class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <div v-else class="w-full h-full flex items-center justify-center">
            <FAIcon name="music" size="3x" color="secondary" />
          </div>
          <!-- 遮罩播放按钮 -->
          <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <FAIcon name="play-circle" size="2x" color="primary" class="text-white/90!" />
          </div>
        </div>

        <!-- 信息区 -->
        <div class="p-3">
          <span class="text-sm font-medium text-content-base block truncate" :title="playlist.title">{{ playlist.title }}</span>
          <span class="text-[10px] text-content-secondary mt-1 block">{{ playlist.songCount }} 首歌曲</span>
        </div>
      </div>
    </div>
  </div>
</template>
