<template>
  <div v-if="show" class="delete-confirm-overlay" @click="handleOverlayClick">
    <div class="delete-confirm-dialog" @click.stop>
      <div class="dialog-header">
        <h3>确认删除</h3>
        <button class="close-btn" @click="handleCancel" :disabled="loading">
          <svg viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>

      <div class="dialog-content">
        <div class="warning-icon">
          <svg viewBox="0 0 24 24">
            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
          </svg>
        </div>
        
        <div class="song-info">
          <p class="confirm-text">您确定要删除这首歌曲吗？</p>
          <div class="song-details">
            <div class="song-title">{{ song?.title || '未知歌曲' }}</div>
            <div class="song-meta">
              <span class="artist">{{ song?.artist || '未知艺术家' }}</span>
              <span class="separator">•</span>
              <span class="album">{{ song?.album || '未知专辑' }}</span>
            </div>
          </div>
          <p class="warning-text">此操作将从音乐库中永久删除该歌曲记录，无法撤销。</p>
        </div>
      </div>

      <div class="dialog-actions">
        <button 
          class="cancel-btn" 
          @click="handleCancel" 
          :disabled="loading"
        >
          取消
        </button>
        <button 
          class="delete-btn" 
          @click="handleConfirm" 
          :disabled="loading"
        >
          <span v-if="loading" class="loading-spinner"></span>
          <span v-else>删除</span>
        </button>
      </div>

      <!-- 错误信息显示 -->
      <div v-if="error" class="error-message">
        <svg class="error-icon" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
        <span>{{ error }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  song: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'confirm'])

const loading = ref(false)
const error = ref('')

// 监听显示状态变化，重置状态
watch(() => props.show, (newShow) => {
  if (newShow) {
    loading.value = false
    error.value = ''
  }
})

// 处理覆盖层点击
const handleOverlayClick = () => {
  if (!loading.value) {
    handleCancel()
  }
}

// 处理取消
const handleCancel = () => {
  if (!loading.value) {
    emit('close')
  }
}

// 处理确认删除
const handleConfirm = async () => {
  if (!props.song || loading.value) return

  loading.value = true
  error.value = ''

  try {
    const result = await window.electronAPI.deleteSong(props.song.id)
    
    if (result.success) {
      emit('confirm', {
        success: true,
        deletedSong: result.deletedSong,
        message: result.message
      })
    } else {
      error.value = result.error || '删除失败'
    }
  } catch (err) {
    error.value = err.message || '删除过程中发生错误'
  } finally {
    loading.value = false
  }
}

// 键盘事件处理
const handleKeydown = (event) => {
  if (!props.show) return
  
  if (event.key === 'Escape' && !loading.value) {
    handleCancel()
  } else if (event.key === 'Enter' && !loading.value) {
    handleConfirm()
  }
}

// 添加键盘事件监听
watch(() => props.show, (newShow) => {
  if (newShow) {
    document.addEventListener('keydown', handleKeydown)
  } else {
    document.removeEventListener('keydown', handleKeydown)
  }
})
</script>

<style scoped>
.delete-confirm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.delete-confirm-dialog {
  background: #2a2a2a;
  border-radius: 12px;
  width: 90%;
  max-width: 480px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  border: 1px solid #404040;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid #404040;
}

.dialog-header h3 {
  margin: 0;
  color: #ffffff;
  font-size: 18px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.close-btn:hover:not(:disabled) {
  color: #ffffff;
  background: #404040;
}

.close-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.close-btn svg {
  width: 20px;
  height: 20px;
  fill: currentColor;
}

.dialog-content {
  padding: 24px;
  display: flex;
  gap: 16px;
}

.warning-icon {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  background: #ff6b6b;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.warning-icon svg {
  width: 24px;
  height: 24px;
  fill: white;
}

.song-info {
  flex: 1;
}

.confirm-text {
  margin: 0 0 16px 0;
  color: #ffffff;
  font-size: 16px;
  font-weight: 500;
}

.song-details {
  background: #1a1a1a;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
  border: 1px solid #333;
}

.song-title {
  color: #ffffff;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 4px;
}

.song-meta {
  color: #888;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.separator {
  color: #555;
}

.warning-text {
  margin: 0;
  color: #ff6b6b;
  font-size: 13px;
  line-height: 1.4;
}

.dialog-actions {
  display: flex;
  gap: 12px;
  padding: 0 24px 24px;
  justify-content: flex-end;
}

.cancel-btn, .delete-btn {
  padding: 10px 20px;
  border-radius: 6px;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.cancel-btn {
  background: #404040;
  color: #ffffff;
}

.cancel-btn:hover:not(:disabled) {
  background: #4a4a4a;
}

.delete-btn {
  background: #ff6b6b;
  color: white;
}

.delete-btn:hover:not(:disabled) {
  background: #ff5252;
}

.cancel-btn:disabled, .delete-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.loading-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-message {
  margin: 0 24px 24px;
  padding: 12px;
  background: rgba(255, 107, 107, 0.1);
  border: 1px solid #ff6b6b;
  border-radius: 6px;
  color: #ff6b6b;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.error-icon {
  width: 16px;
  height: 16px;
  fill: currentColor;
  flex-shrink: 0;
}
</style>
