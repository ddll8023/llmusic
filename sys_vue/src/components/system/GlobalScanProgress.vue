<template>
  <div v-if="mediaStore.scanning"
    class="fixed inset-0 bg-overlay-dark flex justify-center items-center z-[100] text-content-base animate-[fadeIn_0.15s_ease-out]">
    <div class="bg-surface-overlay px-10 py-5 rounded-2xl shadow-custom-hover w-[500px] max-w-[90vw] text-center border border-surface-elevated
                max-md:w-[90vw] max-md:max-w-[400px] max-md:px-4 max-md:py-4">
      <div class="mb-4 text-sm font-medium flex justify-between max-md:text-xs max-md:mb-3 max-md:flex-col max-md:gap-1 max-md:text-center">
        <span class="flex items-center gap-2" :class="isError ? 'text-accent-danger' : ''">
          <FAIcon v-if="isError" name="exclamation-circle" size="small" color="danger" />
          {{ mediaStore.scanProgress.message }}
        </span>
        <span v-if="mediaStore.scanProgress.total > 0">
          {{ mediaStore.scanProgress.processed }} / {{ mediaStore.scanProgress.total }}
        </span>
      </div>
      <ProgressBar :value="mediaStore.scanProgress.processed" :max="mediaStore.scanProgress.total" :show-label="false" height="8px" class="mb-5" />
      <CustomButton type="danger" size="medium" icon="times" @click="cancelScan">取消扫描</CustomButton>
    </div>
  </div>

  <!-- 扫描失败清单（扫描结束后展示，独立于扫描遮罩） -->
  <CustomModal :show="showFailedList" title="部分文件解析失败" confirm-text="知道了" width="560px"
    @close="showFailedList = false" @confirm="showFailedList = false" @cancel="showFailedList = false">
    <p class="text-content-secondary text-xs mb-3">
      以下 {{ mediaStore.lastScanFailedFiles.length }} 个文件未能扫描入库<template v-if="mediaStore.lastScanSkippedCount > 0">（另有 {{ mediaStore.lastScanSkippedCount }} 首未变更文件已跳过解析）</template>：
    </p>
    <div class="max-h-[300px] overflow-y-auto text-left text-xs space-y-2 pr-1">
      <div v-for="item in mediaStore.lastScanFailedFiles" :key="item.path"
        class="border border-line-base rounded p-2 bg-surface-base">
        <div class="text-content-base break-all">{{ item.path }}</div>
        <div class="text-accent-danger mt-1">{{ item.reason }}</div>
      </div>
    </div>
    <div class="mt-3 text-right">
      <CustomButton type="secondary" size="small" icon="copy" @click="copyFailedList">复制列表</CustomButton>
    </div>
  </CustomModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useMediaStore } from '../../store/media';
import { useNotificationStore } from '../../store/notification';
import FAIcon from '../common/FAIcon.vue';
import CustomButton from '../custom/CustomButton.vue';
import CustomModal from '../custom/CustomModal.vue';
import ProgressBar from '../custom/ProgressBar.vue';

const mediaStore = useMediaStore();
const notification = useNotificationStore();

const isError = computed(() => mediaStore.scanProgress.phase === 'error');
const showFailedList = ref(false);

// 扫描出错时 toast 一次（phase 进入 error 才触发，去重由 notification store 保证）
watch(
  () => mediaStore.scanProgress.phase,
  (phase) => {
    if (phase === 'error') {
      notification.error(`扫描失败: ${mediaStore.scanProgress.message || '未知错误'}`);
    }
  }
);

// 扫描结束：有失败文件时给出摘要并展示清单
watch(
  () => mediaStore.scanning,
  (scanning, prevScanning) => {
    if (!prevScanning || scanning) return;
    const failedCount = mediaStore.lastScanFailedFiles.length;
    if (failedCount > 0) {
      notification.warning(`扫描完成：${failedCount} 个文件解析失败`);
      showFailedList.value = true;
    } else if (mediaStore.lastScanSkippedCount > 0) {
      notification.info(`扫描完成：${mediaStore.lastScanSkippedCount} 首未变更文件已跳过`);
    }
  }
);

const copyFailedList = async () => {
  const text = mediaStore.lastScanFailedFiles.map((f) => `${f.path}\t${f.reason}`).join('\n');
  try {
    await window.electronAPI.copyToClipboard(text);
    notification.success('失败列表已复制');
  } catch {
    notification.error('复制失败');
  }
};

const cancelScan = () => { mediaStore.cancelScan(); };
</script>
