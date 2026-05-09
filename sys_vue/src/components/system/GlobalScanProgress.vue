<template>
  <div v-if="mediaStore.scanning"
    class="fixed inset-0 bg-overlay-dark flex justify-center items-center z-[100] text-content-base animate-[fadeIn_0.15s_ease-out]">
    <div class="bg-surface-overlay px-10 py-5 rounded-2xl shadow-custom-hover w-[500px] max-w-[90vw] text-center border border-surface-elevated
                max-md:w-[90vw] max-md:max-w-[400px] max-md:px-4 max-md:py-4">
      <div class="mb-4 text-sm font-medium flex justify-between max-md:text-xs max-md:mb-3 max-md:flex-col max-md:gap-1 max-md:text-center">
        <span>{{ mediaStore.scanProgress.message }}</span>
        <span v-if="mediaStore.scanProgress.total > 0">
          {{ mediaStore.scanProgress.processed }} / {{ mediaStore.scanProgress.total }}
        </span>
      </div>
      <div class="bg-surface-elevated rounded overflow-hidden h-2 w-full mb-5 max-md:h-[6px] max-md:mb-4">
        <div class="bg-accent-green h-full transition-all duration-200 rounded" :style="{ width: progressBarWidth }"></div>
      </div>
      <CustomButton type="danger" size="medium" icon="times" @click="cancelScan">取消扫描</CustomButton>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useMediaStore } from '../../store/media';
import CustomButton from '../custom/CustomButton.vue';

const mediaStore = useMediaStore();

const progressBarWidth = computed(() => {
  if (mediaStore.scanProgress.total === 0) return '0%';
  return `${(mediaStore.scanProgress.processed / mediaStore.scanProgress.total) * 100}%`;
});

const cancelScan = () => { mediaStore.cancelScan(); };
</script>
