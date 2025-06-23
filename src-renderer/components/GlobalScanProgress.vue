<template>
  <div class="scan-progress-overlay" v-if="mediaStore.scanning">
    <div class="progress-content">
      <div class="progress-text">
        <span>{{ mediaStore.scanProgress.message }}</span>
        <span v-if="mediaStore.scanProgress.total > 0">
          {{ mediaStore.scanProgress.processed }} / {{ mediaStore.scanProgress.total }}
        </span>
      </div>
      <div class="progress-bar-container">
        <div class="progress-bar" :style="{ width: progressBarWidth }"></div>
      </div>
      <button class="cancel-scan-button" @click="cancelScan">取消扫描</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useMediaStore } from '../store/media';

const mediaStore = useMediaStore();

const progressBarWidth = computed(() => {
  if (mediaStore.scanProgress.total === 0) {
    return '0%';
  }
  const percentage = (mediaStore.scanProgress.processed / mediaStore.scanProgress.total) * 100;
  return `${percentage}%`;
});

const cancelScan = () => {
  mediaStore.cancelScan();
};
</script>

<style scoped>
.scan-progress-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  color: #fff;
}

.progress-content {
  background-color: #282828;
  padding: 20px 40px;
  border-radius: 8px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
  width: 500px;
  text-align: center;
}

.progress-text {
  margin-bottom: 15px;
  font-size: 16px;
  display: flex;
  justify-content: space-between;
}

.progress-bar-container {
  background-color: #535353;
  border-radius: 4px;
  overflow: hidden;
  height: 8px;
  width: 100%;
}

.progress-bar {
  background-color: #1db954;
  height: 100%;
  transition: width 0.2s ease-in-out;
}

.cancel-scan-button {
  margin-top: 20px;
  background-color: #535353;
  color: #fff;
  border: none;
  padding: 10px 20px;
  border-radius: 20px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.cancel-scan-button:hover {
  background-color: #737373;
}
</style> 