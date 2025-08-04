<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import FAIcon from './FAIcon.vue';
import { useUiStore } from '../store/ui';

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

const uiStore = useUiStore();
</script>

<template>
  <div class="title-bar">
    <div class="title-bar__drag-region">
      <div class="title-bar__left">
        <div class="title-bar__app-icon">
          <FAIcon name="music" size="medium" color="accent" />
        </div>
        <div class="title-bar__app-title">LLMusic</div>
      </div>
      <div class="title-bar__right">
        <!-- 显示侧边栏按钮 -->
        <button v-if="!uiStore.isSidebarVisible" class="title-bar__button title-bar__button--show-sidebar"
          @click="uiStore.showSidebar()" title="显示侧边栏">
          <FAIcon name="bars" size="small" :clickable="true" />
        </button>

        <button class="title-bar__button" @click="minimizeWindow">
          <FAIcon name="minus" size="small" :clickable="true" />
        </button>
        <button class="title-bar__button" @click="maximizeRestoreWindow">
          <FAIcon v-if="isMaximized" name="window-restore" size="small" :clickable="true" />
          <FAIcon v-else name="square-o" size="small" :clickable="true" />
        </button>
        <button class="title-bar__button title-bar__button--close" @click="closeWindow">
          <FAIcon name="times" size="small" color="danger" :clickable="true" />
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// 标题栏主容器
.title-bar {
  width: 100%;
  height: $title-bar-height;
  background-color: $bg-primary;
  color: $text-primary;
  display: flex;
  flex-direction: row;
  align-items: center;
  position: relative;
  z-index: $z-player;
  border-bottom: 1px solid $bg-tertiary;
  user-select: none;
}

// 可拖拽区域
.title-bar__drag-region {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  -webkit-app-region: drag;
}

// 左侧区域
.title-bar__left {
  display: flex;
  align-items: center;
  padding-left: ($content-padding * 0.75);
  gap: ($content-padding * 0.5);
  flex: 1;
  min-width: 0;

  @include respond-to("sm") {
    padding-left: ($content-padding * 0.5);
    gap: ($content-padding * 0.375);
  }
}

// 应用图标
.title-bar__app-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: $accent-green;
  flex-shrink: 0;
  transition: color $transition-base;

  &:hover {
    color: $accent-hover;
  }
}

// 应用标题
.title-bar__app-title {
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  font-family: $font-family-base;
  line-height: $line-height-base;
  color: $text-primary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color $transition-base;

  @include respond-to("sm") {
    font-size: $font-size-xs;
  }
}

// 右侧按钮区域
.title-bar__right {
  display: flex;
  -webkit-app-region: no-drag;
  flex-shrink: 0;
}

// 标题栏按钮
.title-bar__button {
  width: ($title-bar-height + 14px);
  height: $title-bar-height;
  background-color: transparent;
  border: none;
  outline: none;
  color: $text-secondary;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: all $transition-base;
  position: relative;

  &:hover {
    background-color: $overlay-light;
    color: $text-primary;
  }

  &:active {
    background-color: $overlay-medium;
    transform: scale(0.95);
  }

  // 关闭按钮特殊样式
  &--close {
    &:hover {
      background-color: $danger;
      color: $text-primary;
    }

    &:active {
      background-color: $danger-hover;
    }
  }

  // 图标样式
  svg {
    transition: transform $transition-base;
  }

  &:hover svg {
    transform: scale(1.1);
  }

  &:active svg {
    transform: scale(0.9);
  }

  @include respond-to("sm") {
    width: ($title-bar-height + 8px);
  }
}

// 高对比度模式支持
@media (prefers-contrast: high) {
  .title-bar {
    border-bottom-width: 2px;
  }

  .title-bar__button {
    border: 1px solid transparent;

    &:hover {
      border-color: $text-primary;
    }

    &--close:hover {
      border-color: $danger;
    }
  }
}

// 减少动画模式支持
@media (prefers-reduced-motion: reduce) {

  .title-bar__app-icon,
  .title-bar__app-title,
  .title-bar__button,
  .title-bar__button svg {
    transition: none !important;
  }

  .title-bar__button:hover svg,
  .title-bar__button:active svg,
  .title-bar__button:active {
    transform: none !important;
  }
}
</style>