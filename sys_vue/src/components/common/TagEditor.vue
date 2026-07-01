<template>
  <Transition name="modal-overlay">
    <div v-if="showTagEditor"
      class="fixed inset-0 bg-overlay-dark flex items-center justify-center z-[250]" @click.self="closeEditor">
      <Transition name="modal-content">
        <div class="bg-surface-elevated rounded-2xl border border-line-base w-[90%] max-w-[600px] max-h-[90vh] overflow-hidden
                    shadow-custom flex flex-col font-sans">
          <div class="flex items-center justify-between px-5 py-5 border-b border-line-base bg-surface-base">
            <h3 class="m-0 text-lg font-bold text-content-base">编辑歌曲标签</h3>
            <CustomButton type="icon-only" icon="times" size="small" :circle="true" title="关闭" @click="closeEditor" />
          </div>

          <div class="flex-1 overflow-y-auto p-5 [&::-webkit-scrollbar]:w-[6px] [&::-webkit-scrollbar-track]:bg-surface-overlay [&::-webkit-scrollbar-track]:rounded
                       [&::-webkit-scrollbar-thumb]:bg-overlay-light [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb:hover]:bg-overlay-medium">
            <div class="mb-5 p-3 bg-surface-overlay rounded-xl border border-line-base transition-all duration-200 hover:bg-line-light">
              <div class="font-medium text-content-base text-sm mb-1 truncate leading-normal">{{ currentSong?.title || '未知歌曲' }}</div>
              <div class="text-2xs text-content-secondary font-mono break-all leading-relaxed">{{ currentSong?.filePath || '' }}</div>
            </div>

            <form @submit.prevent="saveTags" class="flex flex-col gap-4">
              <div class="flex gap-4 max-md:flex-col">
                <div class="flex-1 flex flex-col">
                  <CustomInput :model-value="editingTags.title" @update:model-value="(val: any) => editingTags.title = val"
                    type="text" label="标题 *" placeholder="请输入歌曲标题" :maxlength="255" :required="true"
                    :error="!!validationErrors.title" :error-message="validationErrors.title" />
                </div>
              </div>
              <div class="flex gap-4 max-md:flex-col">
                <div class="flex-1 flex flex-col">
                  <CustomInput :model-value="editingTags.artist" @update:model-value="(val: any) => editingTags.artist = val"
                    type="text" label="艺术家" placeholder="请输入艺术家" :maxlength="255" :error="!!validationErrors.artist"
                    :error-message="validationErrors.artist" />
                </div>
              </div>
              <div class="flex gap-4 max-md:flex-col">
                <div class="flex-1 flex flex-col">
                  <CustomInput :model-value="editingTags.album" @update:model-value="(val: any) => editingTags.album = val"
                    type="text" label="专辑" placeholder="请输入专辑名称" :maxlength="255" :error="!!validationErrors.album"
                    :error-message="validationErrors.album" />
                </div>
              </div>
              <div class="flex gap-4 max-md:flex-col">
                <div class="flex-1 flex flex-col">
                  <CustomInput :model-value="editingTags.year" @update:model-value="(val: any) => editingTags.year = val"
                    type="number" label="年份" placeholder="年份" :min="1900" :max="new Date().getFullYear() + 1"
                    :error="!!validationErrors.year" :error-message="validationErrors.year" />
                </div>
              </div>

              <div class="mt-5 p-4 bg-surface-overlay rounded-xl border border-line-base transition-all duration-200 hover:bg-line-light">
                <h4 class="m-0 mb-3 text-xs font-bold text-content-base leading-normal">技术信息</h4>
                <div class="grid grid-cols-2 gap-2 max-md:grid-cols-1">
                  <div class="flex justify-between items-center py-1">
                    <span class="text-2xs text-content-secondary font-medium leading-normal">格式:</span>
                    <span class="text-2xs text-content-base font-medium font-mono text-right leading-normal">{{ originalTags?.format || '-' }}</span>
                  </div>
                  <div class="flex justify-between items-center py-1">
                    <span class="text-2xs text-content-secondary font-medium leading-normal">时长:</span>
                    <span class="text-2xs text-content-base font-medium font-mono text-right leading-normal">{{ formatDuration(originalTags?.duration) }}</span>
                  </div>
                  <div class="flex justify-between items-center py-1">
                    <span class="text-2xs text-content-secondary font-medium leading-normal">比特率:</span>
                    <span class="text-2xs text-content-base font-medium font-mono text-right leading-normal">{{ originalTags?.bitrate ? `${originalTags.bitrate} kbps` : '-' }}</span>
                  </div>
                  <div class="flex justify-between items-center py-1">
                    <span class="text-2xs text-content-secondary font-medium leading-normal">采样率:</span>
                    <span class="text-2xs text-content-base font-medium font-mono text-right leading-normal">{{ originalTags?.sampleRate ? `${originalTags.sampleRate} Hz` : '-' }}</span>
                  </div>
                </div>
              </div>
            </form>
          </div>

          <div class="flex items-center justify-end gap-3 px-5 py-5 border-t border-line-base bg-surface-base max-md:flex-col-reverse max-md:gap-2">
            <CustomButton type="secondary" size="medium" @click="resetTags">重置</CustomButton>
            <CustomButton type="secondary" size="medium" @click="closeEditor">取消</CustomButton>
            <CustomButton type="primary" size="medium" :loading="loading" :disabled="loading || !isFormValid" @click="saveTags">
              保存
            </CustomButton>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { useMediaStore } from '../../store/media';
import FAIcon from './FAIcon.vue';
import CustomButton from '../custom/CustomButton.vue';
import CustomInput from '../custom/CustomInput.vue';
import { formatDuration } from '../../utils/timeUtils';

const mediaStore = useMediaStore();

const showTagEditor = ref(false);
const loading = ref(false);
const currentSong = ref<any>(null);
const originalTags = ref<any>(null);
const editingTags = reactive({ title: '', artist: '', album: '', year: '' });
const validationErrors = reactive<Record<string, string>>({});

const isFormValid = computed(() => {
  return editingTags.title && editingTags.title.trim() !== '' &&
    Object.keys(validationErrors).length === 0;
});

watch(editingTags, async (newTags) => {
  if (showTagEditor.value && newTags.title && newTags.title.trim() !== '') {
    try { await validateTags(newTags); } catch (error) { console.error('标签验证过程中发生错误:', error); }
  }
}, { deep: true });

const setEditingTagsFromObject = (tagsObject: any) => {
  editingTags.title = tagsObject.title || '';
  editingTags.artist = tagsObject.artist || '';
  editingTags.album = tagsObject.album || '';
  editingTags.year = tagsObject.year ? String(tagsObject.year) : '';
};

const convertReactiveToPlain = (reactiveObj: any) => ({ title: reactiveObj.title, artist: reactiveObj.artist, album: reactiveObj.album, year: reactiveObj.year });

const clearObjectProperties = (obj: any) => { Object.keys(obj).forEach(key => { if (typeof obj[key] === 'string') obj[key] = ''; else delete obj[key]; }); };

const handleTagOperationError = (error: any, operation: any) => {
  console.error(`${operation}过程中发生错误:`, error);
  if (!operation.includes('验证')) alert(`${operation}异常: ${error.message}`);
};

const openEditor = async (song: any) => {
  if (!song || !song.id) return;
  currentSong.value = song;
  loading.value = true;
  showTagEditor.value = true;
  try {
    const result = await window.electronAPI.getSongTags(song.id);
    if (result.success) {
      originalTags.value = result.tags;
      setEditingTagsFromObject(result.tags);
    } else {
      setEditingTagsFromObject({ title: song.title, artist: song.artist, album: song.album, year: song.year });
    }
  } catch (error) { handleTagOperationError(error, '获取歌曲标签'); }
  finally { loading.value = false; }
};

const openEditorForFile = async (song: any) => {
  if (!song || !song.filePath) return;
  currentSong.value = song;
  loading.value = true;
  showTagEditor.value = true;
  try {
    const result = await window.electronAPI.getTagsFromFile(song.filePath);
    if (result.success) {
      originalTags.value = result.tags;
      setEditingTagsFromObject(result.tags);
    } else {
      setEditingTagsFromObject({ title: song.title, artist: song.artist, album: song.album, year: song.year });
    }
  } catch (error) { handleTagOperationError(error, '获取歌曲标签'); }
  finally { loading.value = false; }
};

const closeEditor = () => {
  showTagEditor.value = false;
  currentSong.value = null;
  originalTags.value = null;
  clearObjectProperties(editingTags);
  clearObjectProperties(validationErrors);
};

const resetTags = () => { if (originalTags.value) setEditingTagsFromObject(originalTags.value); };

const validateTags = async (tags: any) => {
  try {
    const plainTags = convertReactiveToPlain(tags);
    const result: any = await (window.electronAPI as any).validateTagChanges(plainTags);
    if (result.success && result.validation) {
      clearObjectProperties(validationErrors);
      if (result.validation.errors && result.validation.errors.length > 0) {
        result.validation.errors.forEach((error: any) => {
          if (error.includes('标题')) validationErrors.title = error;
          else if (error.includes('年份')) validationErrors.year = error;
          else if (error.includes('音轨号')) validationErrors.track = error;
          else if (error.includes('总音轨数')) validationErrors.totalTracks = error;
        });
      }
    }
  } catch (error) { handleTagOperationError(error, '验证标签'); }
};

const saveTags = async () => {
  if (!isFormValid.value || !currentSong.value) return;
  loading.value = true;
  try {
    const plainTags = convertReactiveToPlain(editingTags);
    let result: any;
    if (currentSong.value.filePath && !currentSong.value.id) {
      result = await (window.electronAPI as any).updateTagsToFile(currentSong.value.filePath, plainTags);
    } else {
      result = await (window.electronAPI as any).updateSongTags(currentSong.value.id, plainTags);
    }
    if (result.success) {
      if (!(currentSong.value.filePath && !currentSong.value.id)) await mediaStore.loadSongs();
      alert('标签保存成功！');
      closeEditor();
    } else {
      alert(`保存失败: ${result.error}`);
    }
  } catch (error) { handleTagOperationError(error, '保存标签'); }
  finally { loading.value = false; }
};

defineExpose({ openEditor, openEditorForFile });
</script>

<style scoped>
.modal-overlay-enter-active,
.modal-overlay-leave-active {
  transition: opacity var(--duration-base) cubic-bezier(.16,1,.3,1);
}
.modal-overlay-enter-from,
.modal-overlay-leave-to {
  opacity: 0;
}

.modal-content-enter-active,
.modal-content-leave-active {
  transition: opacity var(--duration-base) cubic-bezier(.16,1,.3,1),
              transform var(--duration-base) cubic-bezier(.16,1,.3,1);
}
.modal-content-enter-from,
.modal-content-leave-to {
  opacity: 0;
  transform: scale(0.9) translateY(-10px);
}
.modal-content-enter-to,
.modal-content-leave-from {
  opacity: 1;
  transform: scale(1) translateY(0);
}

.modal-overlay-enter-active > div,
.modal-overlay-leave-active > div,
.modal-content-enter-active,
.modal-content-leave-active {
  will-change: transform, opacity;
}
</style>
