<template>
  <div v-if="show" class="delete-confirm-overlay" @click="!loading && handleCancel()">
    <div class="delete-confirm-dialog" @click.stop>
      <div class="dialog-header">
        <h3>确认删除</h3>
        <CustomButton type="icon-only" icon="times" iconSize="medium" :disabled="loading" @click="handleCancel"
          title="关闭" />
      </div>

      <div class="dialog-content">
        <div class="warning-icon">
          <FAIcon name="exclamation-triangle" size="large" color="danger" />
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
        <CustomButton type="secondary" @click="handleCancel" :disabled="loading">
          取消
        </CustomButton>
        <CustomButton type="danger" @click="handleConfirm" :disabled="loading" :loading="loading">
          删除
        </CustomButton>
      </div>

      <!-- 错误信息显示 -->
      <div v-if="error" class="error-message">
        <FAIcon name="exclamation-circle" size="small" color="danger" />
        <span>{{ error }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import FAIcon from './FAIcon.vue'
import CustomButton from '../custom/CustomButton.vue'

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

// 处理取消
const handleCancel = () => {
  emit('close')
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

<style lang="scss" scoped>
.delete-confirm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: $z-modal;
  backdrop-filter: blur(4px);
}

.delete-confirm-dialog {
  background-color: $bg-secondary;
  border-radius: $border-radius-large;
  width: 90%;
  max-width: 480px;
  box-shadow: 0 20px 40px $overlay-dark;
  border: 1px solid $bg-tertiary;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $section-padding $section-padding $content-padding;
  border-bottom: 1px solid $bg-tertiary;
}

.dialog-header h3 {
  margin: 0;
  color: $text-primary;
  font-size: $font-size-lg;
  font-weight: $font-weight-bold;
}



.dialog-content {
  padding: $section-padding;
  display: flex;
  gap: $content-padding;
}

.warning-icon {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  background-color: $danger;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.song-info {
  flex: 1;
}

.confirm-text {
  margin: 0 0 $content-padding 0;
  color: $text-primary;
  font-size: $font-size-md;
  font-weight: $font-weight-medium;
}

.song-details {
  background-color: $bg-primary;
  border-radius: $border-radius-large;
  padding: $item-padding;
  margin-bottom: $content-padding;
  border: 1px solid $bg-tertiary;
}

.song-title {
  color: $text-primary;
  font-size: $font-size-base;
  font-weight: $font-weight-medium;
  margin-bottom: 4px;
}

.song-meta {
  color: $text-secondary;
  font-size: $font-size-sm;
  display: flex;
  align-items: center;
  gap: 6px;
}

.separator {
  color: $text-disabled;
}

.warning-text {
  margin: 0;
  color: $danger;
  font-size: $font-size-sm;
  line-height: $line-height-base;
}

.dialog-actions {
  display: flex;
  gap: $item-padding;
  padding: 0 $section-padding $section-padding;
  justify-content: flex-end;
}

.cancel-btn,
.delete-btn {
  padding: 10px 20px;
  border-radius: $border-radius;
  border: none;
  font-size: $font-size-base;
  font-weight: $font-weight-medium;
  cursor: pointer;
  transition: all $transition-base;
  min-width: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.cancel-btn {
  background-color: $bg-tertiary;
  color: $text-primary;
}

.cancel-btn:hover:not(:disabled) {
  background-color: $bg-tertiary-hover;
}

.delete-btn {
  background-color: $danger;
  color: white;
}

.delete-btn:hover:not(:disabled) {
  background-color: $danger-hover;
}

.cancel-btn:disabled,
.delete-btn:disabled {
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
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

.error-message {
  margin: 0 $section-padding $section-padding;
  padding: $item-padding;
  background: rgba($danger, 0.1);
  border: 1px solid $danger;
  border-radius: $border-radius;
  color: $danger;
  font-size: $font-size-sm;
  display: flex;
  align-items: center;
  gap: 8px;
}

// 响应式设计
@include respond-to("sm") {
  .delete-confirm-dialog {
    width: 95%;
    max-width: none;
    margin: $content-padding;
  }

  .dialog-header {
    padding: $content-padding;
  }

  .dialog-content {
    padding: $content-padding;
    flex-direction: column;
    gap: $item-padding;
  }

  .warning-icon {
    width: 40px;
    height: 40px;
    align-self: center;
  }

  .dialog-actions {
    padding: 0 $content-padding $content-padding;
    flex-direction: column;
    gap: calc($item-padding / 2);
  }

  .cancel-btn,
  .delete-btn {
    width: 100%;
  }
}
</style>
