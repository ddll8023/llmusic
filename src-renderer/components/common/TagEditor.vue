<template>
  <div v-if="showTagEditor" class="tag-editor__overlay" @click.self="closeEditor">
    <div class="tag-editor__modal">
      <div class="tag-editor__header">
        <h3>编辑歌曲标签</h3>
        <button class="tag-editor__button tag-editor__button--close" @click="closeEditor">
          <FAIcon name="times" size="small" color="secondary" :clickable="true" />
        </button>
      </div>

      <div class="tag-editor__content">
        <!-- 歌曲信息显示 -->
        <div class="song-info">
          <div class="song-title">{{ currentSong?.title || '未知歌曲' }}</div>
          <div class="song-path">{{ currentSong?.filePath || '' }}</div>
        </div>

        <!-- 标签编辑表单 -->
        <form @submit.prevent="saveTags" class="tag-form">
          <div class="form-row">
            <div class="form-group">
              <label for="title">标题 *</label>
              <input id="title" v-model="editingTags.title" type="text" class="form-input"
                :class="{ 'is-error': validationErrors.title }" placeholder="请输入歌曲标题" maxlength="255" required />
              <div v-if="validationErrors.title" class="error-message">
                {{ validationErrors.title }}
              </div>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="artist">艺术家</label>
              <input id="artist" v-model="editingTags.artist" type="text" class="form-input"
                :class="{ 'is-error': validationErrors.artist }" placeholder="请输入艺术家" maxlength="255" />
              <div v-if="validationErrors.artist" class="error-message">
                {{ validationErrors.artist }}
              </div>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="album">专辑</label>
              <input id="album" v-model="editingTags.album" type="text" class="form-input"
                :class="{ 'is-error': validationErrors.album }" placeholder="请输入专辑名称" maxlength="255" />
              <div v-if="validationErrors.album" class="error-message">
                {{ validationErrors.album }}
              </div>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="year">年份</label>
              <input id="year" v-model="editingTags.year" type="number" class="form-input"
                :class="{ 'is-error': validationErrors.year }" placeholder="年份" min="1900"
                :max="new Date().getFullYear() + 1" />
              <div v-if="validationErrors.year" class="error-message">
                {{ validationErrors.year }}
              </div>
            </div>
          </div>

          <!-- 技术信息 (只读) -->
          <div class="technical-info">
            <h4>技术信息</h4>
            <div class="info-grid">
              <div class="info-item">
                <span class="info-label">格式:</span>
                <span class="info-value">{{ originalTags?.format || '-' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">时长:</span>
                <span class="info-value">{{ formatDuration(originalTags?.duration) }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">比特率:</span>
                <span class="info-value">{{ originalTags?.bitrate ? `${originalTags.bitrate} kbps` : '-' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">采样率:</span>
                <span class="info-value">{{ originalTags?.sampleRate ? `${originalTags.sampleRate} Hz` : '-' }}</span>
              </div>
            </div>
          </div>
        </form>
      </div>

      <div class="tag-editor__footer">
        <button type="button" class="tag-editor__button tag-editor__button--secondary" @click="resetTags">
          重置
        </button>
        <button type="button" class="tag-editor__button tag-editor__button--secondary" @click="closeEditor">
          取消
        </button>
        <button type="button" class="tag-editor__button tag-editor__button--primary" @click="saveTags"
          :disabled="loading || !isFormValid" :class="{ 'is-loading': loading }">
          <span v-if="loading">保存中...</span>
          <span v-else>保存</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue';
import { useMediaStore } from '../../store/media';
import FAIcon from './FAIcon.vue';

const mediaStore = useMediaStore();

// 响应式数据
const showTagEditor = ref(false);
const loading = ref(false);
const currentSong = ref(null);
const originalTags = ref(null);
const editingTags = reactive({
  title: '',
  artist: '',
  album: '',
  year: ''
});

// 验证错误
const validationErrors = reactive({});

// 计算属性
const isFormValid = computed(() => {
  return editingTags.title && editingTags.title.trim() !== '' &&
    Object.keys(validationErrors).length === 0;
});

// 监听标签变化，实时验证
watch(editingTags, async (newTags) => {
  // 只在编辑器显示且标题不为空时进行验证
  if (showTagEditor.value && newTags.title && newTags.title.trim() !== '') {
    try {
      await validateTags(newTags);
    } catch (error) {
      console.error('标签验证过程中发生错误:', error);
    }
  }
}, { deep: true });

// 方法
const openEditor = async (song) => {
  if (!song || !song.id) {
    console.error('无效的歌曲对象');
    return;
  }

  currentSong.value = song;
  loading.value = true;
  showTagEditor.value = true;

  try {
    // 获取歌曲标签
    console.log('正在获取歌曲标签，歌曲ID:', song.id);
    const result = await window.electronAPI.getSongTags(song.id);
    console.log('获取标签结果:', result);

    if (result.success) {
      originalTags.value = result.tags;
      console.log('原始标签数据:', result.tags);

      // 复制标签到编辑对象
      const newTags = {
        title: result.tags.title || '',
        artist: result.tags.artist || '',
        album: result.tags.album || '',
        year: result.tags.year ? String(result.tags.year) : ''
      };
      console.log('准备设置的编辑标签:', newTags);

      // 逐个设置属性以确保响应式更新
      editingTags.title = newTags.title;
      editingTags.artist = newTags.artist;
      editingTags.album = newTags.album;
      editingTags.year = newTags.year;

      console.log('设置后的编辑标签:', editingTags);
    } else {
      console.error('获取歌曲标签失败:', result.error);
      // 使用歌曲数据库中的信息作为备选
      const fallbackTags = {
        title: song.title || '',
        artist: song.artist || '',
        album: song.album || '',
        year: song.year ? String(song.year) : ''
      };
      console.log('使用备选标签:', fallbackTags);
      // 逐个设置属性以确保响应式更新
      editingTags.title = fallbackTags.title;
      editingTags.artist = fallbackTags.artist;
      editingTags.album = fallbackTags.album;
      editingTags.year = fallbackTags.year;
    }
  } catch (error) {
    console.error('获取歌曲标签异常:', error);
  } finally {
    loading.value = false;
  }
};

const closeEditor = () => {
  showTagEditor.value = false;
  currentSong.value = null;
  originalTags.value = null;
  Object.keys(editingTags).forEach(key => {
    editingTags[key] = '';
  });
  Object.keys(validationErrors).forEach(key => {
    delete validationErrors[key];
  });
};

const resetTags = () => {
  if (originalTags.value) {
    // 逐个设置属性以确保响应式更新
    editingTags.title = originalTags.value.title || '';
    editingTags.artist = originalTags.value.artist || '';
    editingTags.album = originalTags.value.album || '';
    editingTags.year = originalTags.value.year ? String(originalTags.value.year) : '';
  }
};

const validateTags = async (tags) => {
  try {
    // 将响应式对象转换为普通对象以避免序列化错误
    const plainTags = {
      title: tags.title,
      artist: tags.artist,
      album: tags.album,
      year: tags.year
    };

    const result = await window.electronAPI.validateTagChanges(plainTags);
    if (result.success && result.validation) {
      // 清除之前的错误
      Object.keys(validationErrors).forEach(key => {
        delete validationErrors[key];
      });

      // 设置新的错误
      if (result.validation.errors && result.validation.errors.length > 0) {
        result.validation.errors.forEach(error => {
          // 简单的错误映射，实际项目中可能需要更复杂的映射逻辑
          if (error.includes('标题')) validationErrors.title = error;
          else if (error.includes('年份')) validationErrors.year = error;
          else if (error.includes('音轨号')) validationErrors.track = error;
          else if (error.includes('总音轨数')) validationErrors.totalTracks = error;
        });
      }
    }
  } catch (error) {
    console.error('验证标签失败:', error);
  }
};

const saveTags = async () => {
  if (!isFormValid.value || !currentSong.value) {
    return;
  }

  loading.value = true;

  try {
    // 将响应式对象转换为普通对象以避免序列化错误
    const plainTags = {
      title: editingTags.title,
      artist: editingTags.artist,
      album: editingTags.album,
      year: editingTags.year
    };

    const result = await window.electronAPI.updateSongTags(currentSong.value.id, plainTags);
    if (result.success) {
      // 更新成功，刷新歌曲列表
      await mediaStore.loadSongs();
      closeEditor();
    } else {
      console.error('更新标签失败:', result.error);
      // 显示错误信息
      alert(`更新标签失败: ${result.error}`);
    }
  } catch (error) {
    console.error('更新标签异常:', error);
    alert(`更新标签异常: ${error.message}`);
  } finally {
    loading.value = false;
  }
};

const formatDuration = (seconds) => {
  if (!seconds) return '-';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

// 暴露方法给父组件
defineExpose({
  openEditor
});
</script>

<style lang="scss" scoped>
// 导入样式变量
@use "../../styles/variables/_colors" as *;
@use "../../styles/variables/_typography" as *;
@use "../../styles/variables/_layout" as *;

// 弹窗进入/退出动画
@keyframes fadeIn {
  0% {
    opacity: 0;
    transform: scale(0.9) translateY(-20px);
    filter: blur(2px);
  }

  50% {
    opacity: 0.8;
    transform: scale(0.95) translateY(-10px);
    filter: blur(1px);
  }

  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
    filter: blur(0);
  }
}

@keyframes fadeOut {
  0% {
    opacity: 1;
    transform: scale(1) translateY(0);
    filter: blur(0);
  }

  100% {
    opacity: 0;
    transform: scale(0.9) translateY(-10px);
    filter: blur(2px);
  }
}

.tag-editor__overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: $overlay-dark;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: $z-modal;
}

.tag-editor__modal {
  background: $bg-secondary;
  border-radius: ($border-radius * 2);
  border: 1px solid $bg-tertiary;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow: hidden;
  box-shadow: $box-shadow;
  display: flex;
  flex-direction: column;
  animation: fadeIn $transition-slow ease-out;
  font-family: $font-family-base;
}

.tag-editor__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ($content-padding * 1.25);
  border-bottom: 1px solid $bg-tertiary;
  background-color: $bg-primary;

  h3 {
    margin: 0;
    color: $text-primary;
    font-size: $font-size-lg;
    font-weight: $font-weight-bold;
    font-family: $font-family-base;
  }
}

.tag-editor__content {
  flex: 1;
  overflow-y: auto;
  padding: ($content-padding * 1.25);

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

.song-info {
  margin-bottom: ($content-padding * 1.25);
  padding: ($content-padding * 0.75);
  background: $bg-tertiary;
  border-radius: ($border-radius * 1.5);
  border: 1px solid $bg-tertiary;
  transition: all $transition-base;

  &:hover {
    background: $bg-tertiary-hover;
  }
}

.song-title {
  font-weight: $font-weight-medium;
  color: $text-primary;
  font-size: $font-size-base;
  font-family: $font-family-base;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: $line-height-base;
}

.song-path {
  font-size: $font-size-xs;
  color: $text-secondary;
  font-family: $font-family-mono;
  word-break: break-all;
  line-height: $line-height-relaxed;
}

.tag-form {
  display: flex;
  flex-direction: column;
  gap: $content-padding;
}

.form-row {
  display: flex;
  gap: $content-padding;
}

.form-row.two-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: $content-padding;
}

.form-group {
  flex: 1;
  display: flex;
  flex-direction: column;

  label {
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    font-family: $font-family-base;
    color: $text-primary;
    margin-bottom: ($content-padding * 0.375);
    line-height: $line-height-base;
    transition: color $transition-base;

    &:hover {
      color: $accent-green;
    }
  }
}

.form-input,
.form-textarea {
  background: $bg-primary;
  border: 2px solid $bg-tertiary;
  border-radius: $border-radius;
  padding: ($content-padding * 0.5) ($content-padding * 0.75);
  color: $text-primary;
  font-size: $font-size-base;
  font-family: $font-family-base;
  transition: all $transition-base;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: $accent-green;
    box-shadow: 0 0 0 2px rgba($accent-green, 0.2);
  }

  &:hover:not(:focus) {
    border-color: $bg-tertiary-hover;
  }

  &::placeholder {
    color: $text-disabled;
  }

  &.is-error {
    border-color: $danger;
    box-shadow: 0 0 0 2px rgba($danger, 0.2);
  }

  &:disabled {
    background: $bg-tertiary;
    color: $text-disabled;
    cursor: not-allowed;
    opacity: 0.6;
  }
}

.form-textarea {
  resize: vertical;
  min-height: 60px;
  line-height: 1.5;
}

.error-message {
  font-size: $font-size-xs;
  color: $danger;
  margin-top: 4px;
  font-weight: $font-weight-medium;
  font-family: $font-family-base;
  line-height: $line-height-base;
  transition: color $transition-base;

  &:hover {
    color: $danger-hover;
  }
}

.technical-info {
  margin-top: ($content-padding * 1.25);
  padding: $content-padding;
  background: $bg-tertiary;
  border-radius: ($border-radius * 1.5);
  border: 1px solid $bg-tertiary;
  transition: all $transition-base;

  &:hover {
    background: $bg-tertiary-hover;
  }

  h4 {
    margin: 0 0 ($content-padding * 0.75) 0;
    font-size: $font-size-sm;
    font-weight: $font-weight-bold;
    font-family: $font-family-base;
    color: $text-primary;
    line-height: $line-height-base;
  }
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ($content-padding * 0.5);
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ($content-padding * 0.25) 0;
}

.info-label {
  font-size: $font-size-xs;
  color: $text-secondary;
  font-weight: $font-weight-medium;
  font-family: $font-family-base;
  line-height: $line-height-base;
}

.info-value {
  font-size: $font-size-xs;
  color: $text-primary;
  font-weight: $font-weight-medium;
  font-family: $font-family-mono;
  text-align: right;
  line-height: $line-height-base;
}

.tag-editor__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: ($content-padding * 0.75);
  padding: ($content-padding * 1.25);
  border-top: 1px solid $bg-tertiary;
  background-color: $bg-primary;
}

.tag-editor__button {
  padding: ($content-padding * 0.5) ($content-padding * 1.25);
  border-radius: $border-radius;
  border: none;
  font-size: $font-size-base;
  font-weight: $font-weight-medium;
  font-family: $font-family-base;
  cursor: pointer;
  transition: all $transition-base;
  white-space: nowrap;
  min-height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;

    &:hover {
      transform: none;
    }
  }

  &:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &.is-loading {
    opacity: 0.7;
    cursor: wait;
  }

  &--close {
    background: none;
    border: none;
    color: $text-secondary;
    cursor: pointer;
    padding: ($content-padding * 0.5);
    border-radius: 50%;
    transition: all $transition-base;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    min-height: 32px;

    &:hover {
      background-color: $overlay-light;
      color: $text-primary;
      transform: scale(1.05);
    }

    &:active {
      transform: scale(0.95);
    }
  }

  &--secondary {
    background: $bg-tertiary;
    color: $text-primary;
    border: 1px solid $bg-tertiary;

    &:hover:not(:disabled) {
      background: $overlay-light;
      border-color: $overlay-light;
    }
  }

  &--primary {
    background: $accent-green;
    color: $text-primary;
    font-weight: $font-weight-bold;

    &:hover:not(:disabled) {
      background: $accent-hover;
    }
  }
}

/* 响应式设计 */
@include respond-to("sm") {
  .tag-editor__modal {
    width: 95%;
    max-height: 95vh;
    border-radius: $border-radius;
  }

  .tag-editor__header {
    padding: $content-padding;

    h3 {
      font-size: $font-size-base;
    }
  }

  .tag-editor__content {
    padding: $content-padding;
  }

  .form-row.two-columns {
    grid-template-columns: 1fr;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }

  .tag-editor__footer {
    padding: $content-padding;
    gap: ($content-padding * 0.5);
    flex-direction: column-reverse;

    .tag-editor__button {
      width: 100%;
      font-size: $font-size-sm;
    }
  }

  .tag-editor__button--close {
    min-width: 28px;
    min-height: 28px;
  }
}

// 高对比度模式支持
@media (prefers-contrast: high) {
  .tag-editor__modal {
    border: 2px solid $text-primary;
  }

  .form-input,
  .form-textarea {
    border-width: 2px;
  }

  .tag-editor__button {
    border-width: 2px;
  }
}

// 减少动画模式支持
@media (prefers-reduced-motion: reduce) {
  .tag-editor__modal {
    animation: none;
  }

  .tag-editor__button,
  .form-input,
  .form-textarea,
  .song-info,
  .technical-info,
  .form-group label,
  .error-message {
    transition: none !important;
  }

  .tag-editor__button:hover,
  .tag-editor__button--close:hover,
  .tag-editor__button--close:active,
  .song-info:hover,
  .technical-info:hover,
  .form-group label:hover,
  .error-message:hover {
    transform: none !important;
  }
}
</style>
