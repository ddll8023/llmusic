<template>
  <Teleport to="#main-content-modal-container">
    <Transition name="modal" appear>
      <div v-if="uiStore.isSearchModalVisible" class="search-modal-overlay" @click="closeModal">
        <Transition name="modal-content" appear>
          <div class="search-modal" @click.stop>
            <!-- 弹窗头部 -->
            <div class="modal-header">
              <h3>搜索音乐</h3>
              <CustomButton type="icon-only" :circle="true" icon="times" icon-size="medium" @click="closeModal" />
            </div>

            <!-- 搜索模式切换 -->
            <div class="search-mode-tabs">
              <CustomButton :type="searchMode === 'general' ? 'primary' : 'secondary'" size="small"
                custom-class="mode-tab" @click="setSearchMode('general')">
                普通搜索
              </CustomButton>
              <CustomButton :type="searchMode === 'link' ? 'primary' : 'secondary'" size="small" custom-class="mode-tab"
                @click="setSearchMode('link')">
                链接分析
              </CustomButton>
            </div>

            <!-- 普通搜索模式 -->
            <div v-if="searchMode === 'general'" class="search-content">
              <!-- 搜索输入框 -->
              <div class="search-input-container">
                <CustomInput ref="searchInput" v-model="searchTerm" type="text" placeholder="搜索歌曲、艺术家或专辑..."
                  prefix-icon="search" :clearable="true" @input="onSearchInput" @clear="discoverStore.clearSearch()" />
              </div>

              <!-- 搜索历史 -->
              <div v-if="!isSearching && discoverStore.searchHistory.length > 0" class="search-history">
                <div class="history-header">
                  <span>搜索历史</span>
                  <CustomButton type="secondary" size="small" custom-class="clear-history-btn"
                    @click="discoverStore.clearSearchHistory">
                    清空
                  </CustomButton>
                </div>
                <div class="history-tags">
                  <span v-for="keyword in discoverStore.searchHistory" :key="keyword" class="history-tag"
                    @click="searchTerm = keyword; discoverStore.search(keyword)">
                    {{ keyword }}
                    <FAIcon name="times" size="small" color="secondary" :clickable="true"
                      @click.stop="discoverStore.removeFromSearchHistory(keyword)" />
                  </span>
                </div>
              </div>

              <!-- 搜索结果 -->
              <div v-if="isSearching" class="search-results">
                <div v-if="discoverStore.loading" class="loading">
                  <FAIcon name="spinner" size="medium" color="secondary" />
                  搜索中...
                </div>

                <div v-else-if="discoverStore.hasSearchResults" class="results-container">
                  <!-- 歌曲结果 -->
                  <div v-if="discoverStore.searchResults.songs.length > 0" class="result-section">
                    <h4>歌曲</h4>
                    <div class="song-list">
                      <div v-for="song in discoverStore.searchResults.songs" :key="song.id" class="song-item"
                        @click="playSong(song)">
                        <img :src="song.cover" :alt="song.title" class="song-cover-small" />
                        <div class="song-details">
                          <div class="song-title">{{ song.title }}</div>
                          <div class="song-artist">{{ song.artist }} - {{ song.album }}</div>
                        </div>
                        <div class="song-platform">{{ song.platform }}</div>
                        <FAIcon name="play" size="medium" color="accent" />
                      </div>
                    </div>
                  </div>

                  <!-- 艺术家结果 -->
                  <div v-if="discoverStore.searchResults.artists.length > 0" class="result-section">
                    <h4>艺术家</h4>
                    <div class="artist-list">
                      <div v-for="artist in discoverStore.searchResults.artists" :key="artist.id" class="artist-item">
                        <img :src="artist.avatar" :alt="artist.name" class="artist-avatar" />
                        <div class="artist-info">
                          <div class="artist-name">{{ artist.name }}</div>
                          <div class="artist-stats">{{ artist.songCount }}首歌曲 · {{ formatPlayCount(artist.fanCount) }}粉丝
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- 歌单结果 -->
                  <div v-if="discoverStore.searchResults.playlists.length > 0" class="result-section">
                    <h4>歌单</h4>
                    <div class="playlist-list">
                      <div v-for="playlist in discoverStore.searchResults.playlists" :key="playlist.id"
                        class="playlist-item">
                        <img :src="playlist.cover" :alt="playlist.name" class="playlist-cover-small" />
                        <div class="playlist-details">
                          <div class="playlist-name">{{ playlist.name }}</div>
                          <div class="playlist-info">{{ playlist.songCount }}首 · {{ formatPlayCount(playlist.playCount)
                          }}次播放</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div v-else class="no-results">
                  <FAIcon name="search" size="xl" color="secondary" />
                  <p>没有找到相关结果</p>
                  <p class="no-results-tip">试试其他关键词吧</p>
                </div>
              </div>
            </div>

            <!-- 链接分析模式 -->
            <div v-if="searchMode === 'link'" class="link-analysis-content">
              <div class="link-input-container">
                <CustomInput v-model="linkInput" type="text" placeholder="请输入音乐平台链接..." />
                <CustomButton type="primary" :loading="discoverStore.linkAnalysisLoading"
                  :disabled="!canAnalyzeLink || discoverStore.linkAnalysisLoading" icon="search" icon-size="medium"
                  custom-class="analyze-btn" @click="canAnalyzeLink && discoverStore.analyzeLink(linkInput)">
                  {{ discoverStore.linkAnalysisLoading ? '分析中...' : '开始分析' }}
                </CustomButton>
              </div>

              <!-- 分析结果 -->
              <div v-if="linkAnalysisResult" class="analysis-result">
                <div class="analysis-steps">
                  <h4>分析步骤</h4>
                  <div class="steps-list">
                    <div v-for="(step, index) in linkAnalysisResult.steps" :key="index" class="step-item"
                      :class="step.status">
                      <div class="step-icon">
                        <FAIcon name="check" v-if="step.status === 'success'" size="small" color="primary" />
                        <FAIcon name="exclamation-triangle" v-else-if="step.status === 'warning'" size="small"
                          color="primary" />
                        <FAIcon name="times" v-else size="small" color="primary" />
                      </div>
                      <div class="step-content">
                        <div class="step-title">{{ step.step }}</div>
                        <div v-if="step.details" class="step-details">{{ step.details }}</div>
                        <div class="step-time">{{ step.timestamp }}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 解析结果 -->
                <div v-if="linkAnalysisResult.isValid && linkAnalysisResult.mockData" class="parsed-result">
                  <h4>解析结果</h4>
                  <div class="result-card">
                    <div class="result-info">
                      <div class="platform-badge" :style="{ backgroundColor: linkAnalysisResult.platform?.color }">
                        {{ linkAnalysisResult.platform?.name }}
                      </div>
                      <div class="content-type">{{ contentTypeText(linkAnalysisResult.type) }}</div>
                    </div>
                    <div class="mock-data">
                      <pre>{{ JSON.stringify(linkAnalysisResult.mockData, null, 2) }}</pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, nextTick, watch } from 'vue';
import { useUiStore } from '../../store/ui.js';
import { useDiscoverStore } from '../../store/discover.js';
import { formatPlayCount } from '../../utils/mockDiscoverData.js';
import { isValidUrl, isMusicLink } from '../../utils/linkAnalyzer.js';
import FAIcon from './FAIcon.vue';
import CustomButton from '../custom/CustomButton.vue';
import CustomInput from '../custom/CustomInput.vue';

const uiStore = useUiStore();
const discoverStore = useDiscoverStore();

// 搜索相关状态
const searchInput = ref(null);
const searchTerm = ref('');
const searchMode = ref('general'); // 'general' 或 'link'
const linkInput = ref('');
let searchTimeout = null;

// 计算属性
const isSearching = computed(() => searchTerm.value.length > 0);
const canAnalyzeLink = computed(() => {
  return linkInput.value.length > 0 &&
    isValidUrl(linkInput.value) &&
    isMusicLink(linkInput.value);
});

// 链接分析结果缓存
const linkAnalysisResult = computed(() => discoverStore.linkAnalysisResult);

// 内容类型文本映射
const contentTypeText = computed(() => {
  const typeMap = {
    song: '歌曲',
    playlist: '歌单',
    album: '专辑',
    artist: '艺术家'
  };
  return (type) => typeMap[type] || type;
});

// 监听弹窗显示状态，自动聚焦搜索框
watch(() => uiStore.isSearchModalVisible, async (visible) => {
  if (visible) {
    await nextTick();
    if (searchInput.value) {
      searchInput.value.focus();
    }
  } else {
    // 清空搜索状态
    searchTerm.value = '';
    discoverStore.clearSearch();
    discoverStore.clearLinkAnalysis();
  }
});

// 方法
const closeModal = () => {
  uiStore.closeSearchModal();
};

const setSearchMode = (mode) => {
  searchMode.value = mode;
  if (mode === 'general') {
    discoverStore.clearLinkAnalysis();
  } else {
    searchTerm.value = '';
    discoverStore.clearSearch();
  }
};

// 搜索输入处理（防抖）
const onSearchInput = () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    if (searchTerm.value.trim()) {
      discoverStore.search(searchTerm.value.trim());
    } else {
      discoverStore.clearSearch();
    }
  }, 300);
};

// 播放歌曲（模拟）
const playSong = (song) => {
  console.log('播放歌曲:', song);
  alert(`模拟播放: ${song.title} - ${song.artist}`);
  closeModal(); // 播放后关闭弹窗
};
</script>

<style lang="scss" scoped>
// 样式变量已通过Vite自动注入，无需手动导入

// 弹窗遮罩层动画
.modal-enter-active,
.modal-leave-active {
  transition: opacity $transition-base;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

// 弹窗内容动画
.modal-content-enter-active,
.modal-content-leave-active {
  transition: all $transition-base cubic-bezier(0.25, 0.8, 0.25, 1);
}

.modal-content-enter-from,
.modal-content-leave-to {
  opacity: 0;
  transform: scale(0.8) translateY(-20px);
}

// 弹窗遮罩层
.search-modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: $overlay-dark;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: ($content-padding * 5);
  z-index: $z-modal;
  padding: ($content-padding * 1.25) ($content-padding * 1.25) ($content-padding * 2.5) ($content-padding * 1.25);

  @include respond-to("sm") {
    padding: $content-padding;
    padding-top: ($content-padding * 3.75);
  }
}

// 弹窗主体
.search-modal {
  background-color: $bg-secondary;
  border-radius: $border-radius-large;
  width: 100%;
  max-width: 800px;
  max-height: 80vh;
  overflow: hidden;
  box-shadow: $box-shadow-hover;
  display: flex;
  flex-direction: column;
  border: 1px solid $bg-tertiary;

  @include respond-to("sm") {
    max-height: 90vh;
    border-radius: $border-radius;
  }
}

// 弹窗头部
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ($content-padding * 1.25) ($content-padding * 1.5);
  border-bottom: 1px solid $bg-tertiary;
  background-color: $bg-primary;

  @include respond-to("sm") {
    padding: $content-padding (
      $content-padding * 1.25
    );
}

h3 {
  margin: 0;
  color: $text-primary;
  font-size: $font-size-lg;
  font-weight: $font-weight-bold;

  @include respond-to("sm") {
    font-size: $font-size-base;
  }
}
}



// 搜索模式切换
.search-mode-tabs {
  display: flex;
  padding: 0 ($content-padding * 1.5);
  background-color: $bg-primary;
  border-bottom: 1px solid $bg-tertiary;

  @include respond-to("sm") {
    padding: 0 ($content-padding * 1.25);
  }
}

.mode-tab {
  border-bottom: 2px solid transparent;
  border-radius: 0;

  &.custom-button--primary {
    border-bottom-color: $accent-green;
  }
}

// 搜索内容区域
.search-content,
.link-analysis-content {
  flex: 1;
  overflow-y: auto;
  padding: ($content-padding * 1.5);

  @include respond-to("sm") {
    padding: ($content-padding * 1.25);
  }
}

// 搜索输入框
.search-input-container {
  position: relative;
  margin-bottom: ($content-padding * 1.5);
}





// 搜索历史
.search-history {
  margin-bottom: ($content-padding * 1.5);
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ($content-padding * 0.75);

  span {
    font-weight: $font-weight-bold;
    color: $text-secondary;
    font-size: $font-size-sm;
  }
}



.history-tags {
  display: flex;
  flex-wrap: wrap;
  gap: ($content-padding * 0.5);
}

.history-tag {
  display: flex;
  align-items: center;
  gap: ($content-padding * 0.375);
  padding: ($content-padding * 0.375) ($content-padding * 0.75);
  background-color: $bg-tertiary;
  border-radius: $border-radius;
  color: $text-secondary;
  cursor: pointer;
  font-size: $font-size-sm;
  transition: all $transition-base;

  &:hover {
    background-color: $overlay-light;
    color: $text-primary;
  }
}

// 移除历史记录图标样式已由FAIcon组件处理

// 搜索结果
.search-results {
  margin-top: ($content-padding * 1.25);
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ($content-padding * 0.75);
  padding: ($content-padding * 2.5);
  color: $text-secondary;
  font-size: $font-size-base;
}

// 旋转动画已由FAIcon组件内置处理

.results-container {
  max-height: ($content-padding * 25);
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: $bg-tertiary;
    border-radius: $border-radius;
  }

  &::-webkit-scrollbar-thumb {
    background: $overlay-light;
    border-radius: $border-radius;

    &:hover {
      background: $overlay-medium;
    }
  }
}

.result-section {
  margin-bottom: ($content-padding * 1.5);

  &:last-child {
    margin-bottom: 0;
  }

  h4 {
    font-size: $font-size-base;
    margin-bottom: ($content-padding * 0.75);
    color: $text-primary;
    font-weight: $font-weight-bold;
  }
}

.song-list,
.artist-list,
.playlist-list {
  display: flex;
  flex-direction: column;
  gap: ($content-padding * 0.5);
}

.song-item,
.artist-item,
.playlist-item {
  display: flex;
  align-items: center;
  gap: ($content-padding * 0.75);
  padding: ($content-padding * 0.75);
  background-color: $bg-primary;
  border-radius: $border-radius;
  cursor: pointer;
  transition: all $transition-base;

  &:hover {
    background-color: $overlay-light;
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }
}

.song-cover-small,
.artist-avatar,
.playlist-cover-small {
  width: 48px;
  height: 48px;
  border-radius: $border-radius;
  object-fit: cover;
  flex-shrink: 0;

  @include respond-to("sm") {
    width: 40px;
    height: 40px;
  }
}

.artist-avatar {
  border-radius: 50%;
}

.song-details,
.artist-info,
.playlist-details {
  flex: 1;
  min-width: 0;
}

.song-details .song-title,
.artist-name,
.playlist-details .playlist-name {
  font-weight: $font-weight-medium;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: $text-primary;
  font-size: $font-size-base;

  @include respond-to("sm") {
    font-size: $font-size-sm;
  }
}

.song-details .song-artist,
.artist-stats,
.playlist-details .playlist-info {
  color: $text-secondary;
  font-size: $font-size-sm;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  @include respond-to("sm") {
    font-size: $font-size-xs;
  }
}

.song-platform {
  color: $accent-green;
  font-size: $font-size-xs;
  font-weight: $font-weight-bold;
  flex-shrink: 0;
}

// 播放图标悬停效果
.song-item {
  .fa-icon {
    opacity: 0;
    transition: opacity $transition-base;
  }

  &:hover .fa-icon {
    opacity: 1;
  }
}

.no-results {
  text-align: center;
  padding: ($content-padding * 3.75) ($content-padding * 1.25);
  color: $text-secondary;

  svg {
    width: 64px;
    height: 64px;
    fill: $text-disabled;
    margin-bottom: $content-padding;
  }

  p {
    margin: ($content-padding * 0.5) 0;
    font-size: $font-size-base;

    &:first-of-type {
      color: $text-primary;
      font-weight: $font-weight-medium;
    }
  }

  .no-results-tip {
    font-size: $font-size-sm;
    color: $text-disabled;
  }
}

// 链接分析样式
.link-input-container {
  display: flex;
  gap: ($content-padding * 0.75);
  margin-bottom: ($content-padding * 1.5);

  @include respond-to("sm") {
    flex-direction: column;
    gap: ($content-padding * 0.5);
  }
}





.analysis-result {
  margin-top: ($content-padding * 1.5);
}

.analysis-steps {
  margin-bottom: ($content-padding * 1.5);

  h4 {
    font-size: $font-size-base;
    margin-bottom: ($content-padding * 0.75);
    color: $text-primary;
    font-weight: $font-weight-bold;
  }
}

.steps-list {
  background-color: $bg-primary;
  border-radius: $border-radius;
  padding: $content-padding;
  border: 1px solid $bg-tertiary;
}

.step-item {
  display: flex;
  gap: ($content-padding * 0.75);
  padding: ($content-padding * 0.75) 0;
  border-bottom: 1px solid $bg-tertiary;

  &:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  &:first-child {
    padding-top: 0;
  }
}

.step-icon {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  svg {
    width: 14px;
    height: 14px;
    fill: $text-primary;
  }
}

.step-item.success .step-icon {
  background-color: $accent-green;
}

.step-item.warning .step-icon {
  background-color: $warning;
}

.step-item.error .step-icon {
  background-color: $danger;
}

.step-content {
  flex: 1;
  min-width: 0;
}

.step-title {
  font-weight: $font-weight-bold;
  margin-bottom: 4px;
  color: $text-primary;
  font-size: $font-size-sm;
}

.step-details {
  color: $text-secondary;
  font-size: $font-size-sm;
  margin-bottom: 4px;
}

.step-time {
  color: $text-disabled;
  font-size: $font-size-xs;
}

.parsed-result {
  h4 {
    font-size: $font-size-base;
    margin-bottom: ($content-padding * 0.75);
    color: $text-primary;
    font-weight: $font-weight-bold;
  }
}

.result-card {
  background-color: $bg-primary;
  border-radius: $border-radius;
  padding: $content-padding;
  border: 1px solid $bg-tertiary;
}

.result-info {
  display: flex;
  align-items: center;
  gap: ($content-padding * 0.75);
  margin-bottom: $content-padding;
}

.platform-badge {
  padding: ($content-padding * 0.25) ($content-padding * 0.75);
  border-radius: $border-radius;
  color: $text-primary;
  font-size: $font-size-xs;
  font-weight: $font-weight-bold;
}

.content-type {
  color: $text-secondary;
  font-size: $font-size-sm;
}

.mock-data {
  background-color: $bg-secondary;
  border-radius: $border-radius;
  padding: $content-padding;
  overflow-x: auto;
  border: 1px solid $bg-tertiary;

  pre {
    margin: 0;
    color: $text-primary;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: $font-size-sm;
    line-height: 1.5;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
}

// 高对比度模式支持
@media (prefers-contrast: high) {
  .search-modal {
    border: 2px solid $text-primary;
  }

  .analyze-btn {
    border-width: 2px;
    border-color: transparent;
  }
}

// 减少动画模式支持
@media (prefers-reduced-motion: reduce) {

  .modal-enter-active,
  .modal-leave-active,
  .modal-content-enter-active,
  .modal-content-leave-active,
  .history-tag,
  .song-item,
  .artist-item,
  .playlist-item {
    animation: none;
    transition: none;
  }

  .song-item:hover,
  .artist-item:hover,
  .playlist-item:hover {
    transform: none;
  }

  // 旋转动画已由FAIcon组件处理
}
</style>
