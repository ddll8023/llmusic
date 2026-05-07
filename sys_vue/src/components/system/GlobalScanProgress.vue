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
      <CustomButton
        type="danger"
        size="medium"
        icon="times"
        @click="cancelScan"
      >
        取消扫描
      </CustomButton>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useMediaStore } from '../../store/media';
import FAIcon from '../common/FAIcon.vue';
import CustomButton from '../custom/CustomButton.vue';

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

<style lang="scss" scoped>

.scan-progress-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: $overlay-dark;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: $z-modal;
  color: $text-primary;
  animation: fadeIn $transition-fast ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.progress-content {
  background-color: $bg-tertiary;
  padding: $content-padding * 1.25 $content-padding * 2.5;
  border-radius: $border-radius * 2;
  box-shadow: $box-shadow-hover;
  width: 500px;
  max-width: 90vw;
  text-align: center;
  border: 1px solid $bg-secondary;

  @include respond-to("sm") {
    width: 90vw;
    max-width: 400px;
    padding: $content-padding $content-padding * 1.5;
  }
}

.progress-text {
  margin-bottom: $content-padding;
  font-size: $font-size-base;
  display: flex;
  justify-content: space-between;
  font-weight: $font-weight-medium;

  @include respond-to("sm") {
    font-size: $font-size-sm;
    margin-bottom: $content-padding * 0.75;
    flex-direction: column;
    gap: 4px;
    text-align: center;
  }
}

.progress-bar-container {
  background-color: $bg-secondary;
  border-radius: $border-radius;
  overflow: hidden;
  height: 8px;
  width: 100%;
  margin-bottom: $content-padding * 1.25;

  @include respond-to("sm") {
    height: 6px;
    margin-bottom: $content-padding;
  }
}

.progress-bar {
  background-color: $accent-green;
  height: 100%;
  transition: width $transition-base;
  border-radius: $border-radius;
}

</style>