<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import Icon from './Icon.vue';

// 最大化状态
const isMaximized = ref(false);
// 提前声明removeListener变量
let removeListener = null;

// 组件卸载时移除事件监听
onUnmounted(() => {
  if (removeListener) {
    removeListener();
  }
});

// 组件挂载时获取窗口当前状态
onMounted(async () => {
  // 获取当前窗口是否最大化
  isMaximized.value = await window.electronAPI.isWindowMaximized();

  // 监听窗口最大化状态变化
  removeListener = window.electronAPI.onWindowMaximizedChange((maximized) => {
    isMaximized.value = maximized;
  });
});

// 窗口控制函数
const minimizeWindow = () => {
  window.electronAPI.windowMinimize();
};

const maximizeRestoreWindow = () => {
  if (isMaximized.value) {
    window.electronAPI.windowRestore();
  } else {
    window.electronAPI.windowMaximize();
  }
};

const closeWindow = () => {
  window.electronAPI.windowClose();
};
</script>

<template>
  <div class="title-bar">
    <div class="title-bar-drag-region">
      <div class="title-bar-left">
        <div class="app-icon">
          <Icon name="music" :size="18" />
        </div>
        <div class="app-title">LLMusic</div>
      </div>
      <div class="title-bar-right">
        <button class="title-bar-button" @click="minimizeWindow">
          <Icon name="minimize" :size="12" />
        </button>
        <button class="title-bar-button" @click="maximizeRestoreWindow">
          <Icon v-if="isMaximized" name="restore" :size="12" />
          <Icon v-else name="maximize" :size="12" />
        </button>
        <button class="title-bar-button close-button" @click="closeWindow">
          <Icon name="close" :size="12" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.title-bar {
  width: 100%;
  height: 32px;
  background-color: #1a1a1a;
  color: #ffffff;
  display: flex;
  flex-direction: row;
  align-items: center;
  position: relative;
  z-index: 1000;
  border-bottom: 1px solid #303030;
}

.title-bar-drag-region {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  -webkit-app-region: drag;
  /* 使区域可拖动窗口 */
}

.title-bar-left {
  display: flex;
  align-items: center;
  padding-left: 12px;
  gap: 8px;
}

.app-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4CAF50;
}

.app-title {
  font-size: 14px;
  font-weight: 500;
  user-select: none;
}

.title-bar-right {
  display: flex;
  -webkit-app-region: no-drag;
  /* 按钮区域不可拖动 */
}

.title-bar-button {
  width: 46px;
  height: 32px;
  background-color: transparent;
  border: none;
  outline: none;
  color: #999;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  -webkit-app-region: no-drag;
  /* 确保按钮不可拖动 */
  transition: background-color 0.2s;
}

.title-bar-button:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.title-bar-button.close-button:hover {
  background-color: #e81123;
  color: white;
}
</style>