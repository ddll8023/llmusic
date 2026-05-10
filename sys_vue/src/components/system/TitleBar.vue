<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import FAIcon from '../common/FAIcon.vue';
import CustomButton from '../custom/CustomButton.vue';
import { useUiStore } from '../../store/ui';

const isMaximized = ref(false);
let removeListener = null;

onMounted(async () => {
  isMaximized.value = await window.electronAPI.isWindowMaximized();
  removeListener = window.electronAPI.onWindowMaximizedChange((maximized) => { isMaximized.value = maximized; });
});

onUnmounted(() => { if (removeListener) removeListener(); });

const minimizeWindow = () => window.electronAPI.windowMinimize();
const maximizeRestoreWindow = () => isMaximized.value ? window.electronAPI.windowRestore() : window.electronAPI.windowMaximize();
const closeWindow = () => window.electronAPI.windowClose();

const uiStore = useUiStore();
</script>

<template>
  <div class="w-full h-[32px] bg-surface-base text-content-base flex flex-row items-center relative z-[200] border-b border-line-base select-none">
    <div class="w-full h-full flex justify-between items-center" style="-webkit-app-region: drag">
      <div class="flex items-center pl-3 gap-2 flex-1 min-w-0 max-md:pl-2 max-md:gap-1.5">
        <div class="flex items-center justify-center text-accent-green shrink-0 transition-colors duration-200 hover:text-accent-green-hover">
          <FAIcon name="music" size="medium" color="accent" />
        </div>
        <span class="text-xs font-medium leading-normal text-content-base truncate transition-colors duration-200 max-md:text-2xs">LLMusic</span>
      </div>

      <div class="flex shrink-0" style="-webkit-app-region: no-drag">
        <CustomButton v-if="!uiStore.isSidebarVisible" type="icon-only" size="small" icon="bars" icon-size="small"
          customClass="title-bar__button"
          @click="uiStore.showSidebar()" title="显示侧边栏" />
        <CustomButton type="icon-only" size="small" icon="minus" icon-size="small"
          customClass="title-bar__button" @click="minimizeWindow" />
        <CustomButton type="icon-only" size="small" :icon="isMaximized ? 'window-restore' : 'square-o'"
          icon-size="small" customClass="title-bar__button" @click="maximizeRestoreWindow" />
        <CustomButton type="icon-only" size="small" icon="times" icon-size="small"
          customClass="hover:!bg-accent-danger hover:!text-content-base" @click="closeWindow" />
      </div>
    </div>
  </div>
</template>

