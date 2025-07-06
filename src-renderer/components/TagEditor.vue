<template>
  <div v-if="showTagEditor" class="tag-editor-overlay" @click.self="closeEditor">
    <div class="tag-editor-modal">
      <div class="tag-editor-header">
        <h3>编辑歌曲标签</h3>
        <button class="close-btn" @click="closeEditor">
          <Icon name="close" size="16px" />
        </button>
      </div>

      <div class="tag-editor-content">
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
              <input
                id="title"
                v-model="editingTags.title"
                type="text"
                class="form-input"
                :class="{ 'error': validationErrors.title }"
                placeholder="请输入歌曲标题"
                maxlength="255"
                required
              />
              <div v-if="validationErrors.title" class="error-message">
                {{ validationErrors.title }}
              </div>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="artist">艺术家</label>
              <input
                id="artist"
                v-model="editingTags.artist"
                type="text"
                class="form-input"
                :class="{ 'error': validationErrors.artist }"
                placeholder="请输入艺术家"
                maxlength="255"
              />
              <div v-if="validationErrors.artist" class="error-message">
                {{ validationErrors.artist }}
              </div>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="album">专辑</label>
              <input
                id="album"
                v-model="editingTags.album"
                type="text"
                class="form-input"
                :class="{ 'error': validationErrors.album }"
                placeholder="请输入专辑名称"
                maxlength="255"
              />
              <div v-if="validationErrors.album" class="error-message">
                {{ validationErrors.album }}
              </div>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="year">年份</label>
              <input
                id="year"
                v-model="editingTags.year"
                type="number"
                class="form-input"
                :class="{ 'error': validationErrors.year }"
                placeholder="年份"
                min="1900"
                :max="new Date().getFullYear() + 1"
              />
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

      <div class="tag-editor-footer">
        <button type="button" class="btn btn-secondary" @click="resetTags">
          重置
        </button>
        <button type="button" class="btn btn-secondary" @click="closeEditor">
          取消
        </button>
        <button 
          type="button" 
          class="btn btn-primary" 
          @click="saveTags"
          :disabled="loading || !isFormValid"
        >
          <span v-if="loading">保存中...</span>
          <span v-else>保存</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue';
import { useMediaStore } from '../store/media';
import Icon from './Icon.vue';

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
  if (showTagEditor.value) {
    await validateTags(newTags);
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
    const result = await window.electronAPI.validateTagChanges(tags);
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
    const result = await window.electronAPI.updateSongTags(currentSong.value.id, editingTags);
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

<style scoped>
.tag-editor-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.tag-editor-modal {
  background: #181818;
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
}

.tag-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
  border-bottom: 1px solid #535353;
}

.tag-editor-header h3 {
  margin: 0;
  color: #ffffff;
  font-size: 18px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  color: #b3b3b3;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: #282828;
  color: #ffffff;
}

.tag-editor-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.song-info {
  margin-bottom: 20px;
  padding: 12px;
  background: #282828;
  border-radius: 6px;
}

.song-title {
  font-weight: 600;
  color: #ffffff;
  margin-bottom: 4px;
}

.song-path {
  font-size: 12px;
  color: #b3b3b3;
  word-break: break-all;
}

.tag-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-row {
  display: flex;
  gap: 16px;
}

.form-row.two-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.form-group {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.form-group label {
  font-size: 14px;
  font-weight: 500;
  color: #ffffff;
  margin-bottom: 6px;
}

.form-input,
.form-textarea {
  background: #121212;
  border: 1px solid #535353;
  border-radius: 4px;
  padding: 8px 12px;
  color: #ffffff;
  font-size: 14px;
  transition: border-color 0.2s ease;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: #1db954;
}

.form-input.error,
.form-textarea.error {
  border-color: #ff4757;
}

.form-textarea {
  resize: vertical;
  min-height: 60px;
}

.error-message {
  font-size: 12px;
  color: #ff4757;
  margin-top: 4px;
}

.technical-info {
  margin-top: 20px;
  padding: 16px;
  background: #282828;
  border-radius: 6px;
}

.technical-info h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-label {
  font-size: 12px;
  color: #b3b3b3;
}

.info-value {
  font-size: 12px;
  color: #ffffff;
  font-weight: 500;
}

.tag-editor-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px;
  border-top: 1px solid #535353;
}

.btn {
  padding: 8px 16px;
  border-radius: 4px;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: #282828;
  color: #ffffff;
}

.btn-secondary:hover:not(:disabled) {
  background: #535353;
}

.btn-primary {
  background: #1db954;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #1ed760;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .tag-editor-modal {
    width: 95%;
    max-height: 95vh;
  }

  .form-row.two-columns {
    grid-template-columns: 1fr;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }
}
</style>
