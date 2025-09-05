<template>
  <div v-if="showTagEditor" class="tag-editor__overlay" @click.self="closeEditor">
    <div class="tag-editor__modal">
      <div class="tag-editor__header">
        <h3>编辑歌曲标签</h3>
        <CustomButton type="icon-only" icon="times" size="small" :circle="true" title="关闭" @click="closeEditor" />
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
              <CustomInput :model-value="editingTags.title" @update:model-value="val => editingTags.title = val"
                type="text" label="标题 *" placeholder="请输入歌曲标题" :maxlength="255" :required="true"
                :error="!!validationErrors.title" :error-message="validationErrors.title" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <CustomInput :model-value="editingTags.artist" @update:model-value="val => editingTags.artist = val"
                type="text" label="艺术家" placeholder="请输入艺术家" :maxlength="255" :error="!!validationErrors.artist"
                :error-message="validationErrors.artist" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <CustomInput :model-value="editingTags.album" @update:model-value="val => editingTags.album = val"
                type="text" label="专辑" placeholder="请输入专辑名称" :maxlength="255" :error="!!validationErrors.album"
                :error-message="validationErrors.album" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <CustomInput :model-value="editingTags.year" @update:model-value="val => editingTags.year = val"
                type="number" label="年份" placeholder="年份" :min="1900" :max="new Date().getFullYear() + 1"
                :error="!!validationErrors.year" :error-message="validationErrors.year" />
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
        <CustomButton type="secondary" size="medium" @click="resetTags">重置</CustomButton>
        <CustomButton type="secondary" size="medium" @click="closeEditor">取消</CustomButton>
        <CustomButton type="primary" size="medium" :loading="loading" :disabled="loading || !isFormValid"
          @click="saveTags">
          保存
        </CustomButton>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue';
import { useMediaStore } from '../../store/media';
import FAIcon from './FAIcon.vue';
import CustomButton from '../custom/CustomButton.vue';
import CustomInput from '../custom/CustomInput.vue';
import { formatDuration } from '../../utils/timeUtils';

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

// 辅助函数
const setEditingTagsFromObject = (tagsObject) => {
  editingTags.title = tagsObject.title || '';
  editingTags.artist = tagsObject.artist || '';
  editingTags.album = tagsObject.album || '';
  editingTags.year = tagsObject.year ? String(tagsObject.year) : '';
};

const convertReactiveToPlain = (reactiveObj) => {
  return {
    title: reactiveObj.title,
    artist: reactiveObj.artist,
    album: reactiveObj.album,
    year: reactiveObj.year
  };
};

const clearObjectProperties = (obj) => {
  Object.keys(obj).forEach(key => {
    if (typeof obj[key] === 'string') {
      obj[key] = '';
    } else {
      delete obj[key];
    }
  });
};

const handleTagOperationError = (error, operation) => {
  console.error(`${operation}过程中发生错误:`, error);
  if (operation.includes('验证')) {
    // 验证错误通常不需要用户提示
    return;
  }
  alert(`${operation}异常: ${error.message}`);
};

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

      // 使用统一函数设置标签
      setEditingTagsFromObject(newTags);

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
      // 使用统一函数设置标签
      setEditingTagsFromObject(fallbackTags);
    }
  } catch (error) {
    handleTagOperationError(error, '获取歌曲标签');
  } finally {
    loading.value = false;
  }
};

const closeEditor = () => {
  showTagEditor.value = false;
  currentSong.value = null;
  originalTags.value = null;
  clearObjectProperties(editingTags);
  clearObjectProperties(validationErrors);
};

const resetTags = () => {
  if (originalTags.value) {
    // 使用统一函数设置标签
    setEditingTagsFromObject(originalTags.value);
  }
};

const validateTags = async (tags) => {
  try {
    // 将响应式对象转换为普通对象以避免序列化错误
    const plainTags = convertReactiveToPlain(tags);

    const result = await window.electronAPI.validateTagChanges(plainTags);
    if (result.success && result.validation) {
      // 清除之前的错误
      clearObjectProperties(validationErrors);

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
    handleTagOperationError(error, '验证标签');
  }
};

const saveTags = async () => {
  if (!isFormValid.value || !currentSong.value) {
    return;
  }

  loading.value = true;

  try {
    // 将响应式对象转换为普通对象以避免序列化错误
    const plainTags = convertReactiveToPlain(editingTags);

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
    handleTagOperationError(error, '更新标签');
  } finally {
    loading.value = false;
  }
};


// 暴露方法给父组件
defineExpose({
  openEditor
});
</script>

<style lang="scss" scoped>
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
  animation: modalFadeIn $transition-slow ease-out;
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
  }
}

// 高对比度模式支持
@media (prefers-contrast: high) {
  .tag-editor__modal {
    border: 2px solid $text-primary;
  }
}

// 减少动画模式支持
@media (prefers-reduced-motion: reduce) {
  .tag-editor__modal {
    animation: none;
  }

  %no-transition {
    transition: none !important;
  }

  %no-transform {
    transform: none !important;
  }

  .song-info,
  .technical-info,
  .form-group label {
    @extend %no-transition;
  }

  .song-info:hover,
  .technical-info:hover,
  .form-group label:hover {
    @extend %no-transform;
  }
}
</style>
