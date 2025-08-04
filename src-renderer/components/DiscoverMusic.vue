<template>
  <div class="discover-music">
    <!-- 头部导航 -->
    <div class="discover-header">
      <h2 class="page-title">发现音乐</h2>
      <div class="header-actions">
        <button class="search-btn btn btn--primary" @click="openSearchModal">
          <FAIcon name="search" size="medium" color="primary" />
          搜索音乐
        </button>
      </div>
    </div>

    <!-- 推荐内容 -->
    <div class="recommend-content">
      <div class="section">
        <div class="section-header">
          <h3>推荐歌曲</h3>
          <button class="refresh-btn btn btn--secondary" @click="discoverStore.refreshRecommendations"
            :disabled="discoverStore.loading">
            <FAIcon name="refresh" size="small" color="secondary" :class="{ spinning: discoverStore.loading }" />
            刷新
          </button>
        </div>
        <div class="song-grid">
          <div v-for="song in discoverStore.recommendedSongs" :key="song.id"
            class="song-card card interactive hover-lift" @click="playSong(song)">
            <div class="song-cover">
              <img :src="song.cover" :alt="song.title" />
              <div class="play-overlay">
                <FAIcon name="play" size="large" color="primary" />
              </div>
            </div>
            <div class="song-info">
              <div class="song-title">{{ song.title }}</div>
              <div class="song-artist">{{ song.artist }}</div>
              <div class="song-meta">
                <span class="platform">{{ song.platform }}</span>
                <span class="play-count">{{ formatPlayCount(song.playCount) }}次播放</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="section">
        <h3>热门歌单</h3>
        <div class="playlist-grid">
          <div v-for="playlist in discoverStore.hotPlaylists" :key="playlist.id"
            class="playlist-card card interactive hover-lift">
            <div class="playlist-cover">
              <img :src="playlist.cover" :alt="playlist.name" />
              <div class="playlist-info-overlay">
                <FAIcon name="list" size="small" color="primary" />
                <span>{{ playlist.songCount }}首</span>
              </div>
            </div>
            <div class="playlist-info">
              <div class="playlist-name">{{ playlist.name }}</div>
              <div class="playlist-creator">by {{ playlist.creator }}</div>
              <div class="playlist-play-count">{{ formatPlayCount(playlist.playCount) }}次播放</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useDiscoverStore } from '../store/discover.js';
import { useUiStore } from '../store/ui.js';
import { formatPlayCount } from '../utils/mockDiscoverData.js';
import FAIcon from './FAIcon.vue';

const discoverStore = useDiscoverStore();
const uiStore = useUiStore();

// 打开搜索弹窗
const openSearchModal = () => {
  uiStore.openSearchModal();
};

// 播放歌曲（模拟）
const playSong = (song) => {
  console.log('播放歌曲:', song);
  alert(`模拟播放: ${song.title} - ${song.artist}`);
};
</script>

<style lang="scss" scoped>
@use "../styles/variables" as *;

.discover-music {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: $bg-primary;
  color: $text-primary;
}

.discover-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: $content-padding;
  border-bottom: 1px solid $bg-tertiary;

  @include respond-to("sm") {
    padding: $content-padding / 2;
    flex-direction: column;
    gap: $item-padding;
    align-items: stretch;
  }
}

.page-title {
  font-size: $font-size-xl;
  font-weight: $font-weight-medium;
  margin: 0;
  color: $text-primary;

  @include respond-to("sm") {
    font-size: $font-size-lg;
    text-align: center;
  }
}

.header-actions {
  display: flex;
  gap: $item-padding;

  @include respond-to("sm") {
    justify-content: center;
  }
}

.search-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px $content-padding;
  background-color: $accent-green;
  color: $text-primary;
  border: none;
  border-radius: 20px;
  cursor: pointer;
  font-weight: $font-weight-medium;
  transition: all $transition-base;
  font-size: $font-size-base;

  &:hover:not(:disabled) {
    background-color: $accent-hover;
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }

  :deep(svg) {
    width: 16px;
    height: 16px;
  }

  @include respond-to("sm") {
    padding: 8px $content-padding;
    font-size: $font-size-sm;

    :deep(svg) {
      width: 14px;
      height: 14px;
    }
  }
}

/* 推荐内容样式 */
.recommend-content {
  flex: 1;
  overflow-y: auto;
  padding: $content-padding;

  @include respond-to("sm") {
    padding: $content-padding / 2;
  }
}

.section {
  margin-bottom: $content-padding * 2;

  &:last-child {
    margin-bottom: 0;
  }

  @include respond-to("sm") {
    margin-bottom: $content-padding;
  }
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: $content-padding;

  @include respond-to("sm") {
    flex-direction: column;
    gap: $item-padding;
    align-items: stretch;
  }
}

.section h3 {
  font-size: $font-size-lg;
  font-weight: $font-weight-medium;
  margin: 0;
  color: $text-primary;

  @include respond-to("sm") {
    font-size: $font-size-base;
    text-align: center;
  }
}

.refresh-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px $content-padding;
  background: transparent;
  border: 1px solid $bg-tertiary;
  border-radius: 20px;
  color: $text-secondary;
  cursor: pointer;
  transition: all $transition-base;
  font-size: $font-size-sm;

  &:hover:not(:disabled) {
    border-color: $accent-green;
    color: $text-primary;
    background-color: $overlay-light;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @include respond-to("sm") {
    padding: 6px $item-padding;
    font-size: $font-size-xs;
  }
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.song-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: $content-padding;

  @include respond-to("sm") {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: $item-padding;
  }
}

.song-card {
  background-color: $bg-secondary;
  border-radius: $border-radius;
  padding: $content-padding;
  cursor: pointer;
  transition: all $transition-base;
  border: 1px solid transparent;

  &:hover {
    background-color: $bg-tertiary;
    border-color: $overlay-light;
    box-shadow: $box-shadow-hover;
  }

  &:active {
    transform: scale(0.98);
  }

  @include respond-to("sm") {
    padding: $item-padding;
  }
}

.song-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border-radius: $border-radius;
  overflow: hidden;
  margin-bottom: $item-padding;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform $transition-base;
  }
}

.play-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: $overlay-dark;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity $transition-base;

  :deep(svg) {
    width: 32px;
    height: 32px;
    fill: $text-primary;

    @include respond-to("sm") {
      width: 24px;
      height: 24px;
    }
  }
}

.song-card:hover {
  .play-overlay {
    opacity: 1;
  }

  .song-cover img {
    transform: scale(1.05);
  }
}

.song-info {
  text-align: left;
}

.song-title {
  font-weight: $font-weight-medium;
  font-size: $font-size-base;
  color: $text-primary;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  @include respond-to("sm") {
    font-size: $font-size-sm;
  }
}

.song-artist {
  color: $text-secondary;
  font-size: $font-size-sm;
  margin-bottom: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  @include respond-to("sm") {
    font-size: $font-size-xs;
    margin-bottom: 6px;
  }
}

.song-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: $font-size-xs;
  color: $text-disabled;

  @include respond-to("sm") {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }
}

.platform {
  background-color: $accent-green;
  color: $text-primary;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: $font-weight-medium;
}

.playlist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: $content-padding;

  @include respond-to("sm") {
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: $item-padding;
  }
}

.playlist-card {
  background-color: $bg-secondary;
  border-radius: $border-radius;
  padding: $content-padding;
  cursor: pointer;
  transition: all $transition-base;
  border: 1px solid transparent;

  &:hover {
    background-color: $bg-tertiary;
    border-color: $overlay-light;
    box-shadow: $box-shadow-hover;
  }

  &:active {
    transform: scale(0.98);
  }

  @include respond-to("sm") {
    padding: $item-padding;
  }
}

.playlist-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border-radius: $border-radius;
  overflow: hidden;
  margin-bottom: $item-padding;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform $transition-base;
  }
}

.playlist-info-overlay {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background-color: $overlay-dark;
  color: $text-primary;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: $font-size-xs;
  font-weight: $font-weight-medium;
  display: flex;
  align-items: center;
  gap: 4px;

  :deep(svg) {
    width: 12px;
    height: 12px;
    fill: currentColor;
  }
}

.playlist-card:hover .playlist-cover img {
  transform: scale(1.05);
}

.playlist-info {
  text-align: left;
}

.playlist-name {
  font-weight: $font-weight-medium;
  font-size: $font-size-base;
  color: $text-primary;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  @include respond-to("sm") {
    font-size: $font-size-sm;
  }
}

.playlist-creator {
  color: $text-secondary;
  font-size: $font-size-sm;
  margin-bottom: 4px;

  @include respond-to("sm") {
    font-size: $font-size-xs;
  }
}

.playlist-play-count {
  color: $text-disabled;
  font-size: $font-size-xs;
}

/* 加载状态优化 */
@keyframes pulse {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.5;
  }
}

.loading-shimmer {
  animation: pulse 1.5s ease-in-out infinite;
}

/* 空状态样式 */
.empty-state {
  text-align: center;
  padding: $content-padding * 2;
  color: $text-secondary;

  .empty-icon {
    font-size: 48px;
    margin-bottom: $content-padding;
    color: $text-disabled;
  }

  .empty-text {
    font-size: $font-size-lg;
    margin-bottom: $item-padding;
  }

  .empty-subtitle {
    font-size: $font-size-sm;
    color: $text-disabled;
  }
}
</style>
