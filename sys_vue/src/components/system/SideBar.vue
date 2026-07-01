<script setup lang="ts">
/**
 * 侧边栏组件
 * 包含：在线音乐 → 平台导航（动态） → 本地音乐 → 底部功能项
 */
import { ref, computed, onMounted } from 'vue';
import { useUiStore } from '../../store/ui';
import { useQqmusicStore } from '../../store/qqmusic';
import { usePlaylistStore } from '../../store/playlist';
import { useMediaStore } from '../../store/media';
import { useAuthStore } from '../../store/auth';
import { musicPlatforms, PLATFORM_VISIBILITY_PREFIX } from '../../config/platforms';
import type { MusicPlatform } from '../../config/platforms';
import FAIcon from '../common/FAIcon.vue';
import CustomButton from '../custom/CustomButton.vue';

const uiStore = useUiStore();
const qqmusicStore = useQqmusicStore();
const playlistStore = usePlaylistStore();
const mediaStore = useMediaStore();
const authStore = useAuthStore();

const isCollapsed = computed(() => uiStore.isSidebarCollapsed);
const collapseIcon = computed(() => isCollapsed.value ? 'chevron-right' : 'chevron-left');

// 平台可见性（从 localStorage 读取）
const platformVisibility = ref<Record<string, boolean>>({});

function loadPlatformVisibility() {
  const map: Record<string, boolean> = {};
  for (const platform of musicPlatforms) {
    const stored = localStorage.getItem(`${PLATFORM_VISIBILITY_PREFIX}${platform.id}`);
    // 默认可见（未设置时视为 true）
    map[platform.id] = stored === null ? true : stored === 'true';
  }
  platformVisibility.value = map;
}

// 仅选中可见的平台
const visiblePlatforms = computed(() =>
  musicPlatforms.filter((p) => platformVisibility.value[p.id])
);

onMounted(async () => {
  await playlistStore.loadPlaylists();
  await mediaStore.loadLibraries();
  await authStore.initAuth();
  loadPlatformVisibility();

  // 监听平台可见性变化
  window.addEventListener('platform-visibility-change', loadPlatformVisibility);

  // 加载 QQ 音乐歌单
  if (authStore.isLoggedIn) {
    qqmusicStore.loadUserPlaylists();
  }
});

const handleSetLibrary = (libraryId: any) => {
  mediaStore.setActiveLibrary(libraryId);
  uiStore.setView('main');
};

const handlePlatformNav = (view: string) => {
  uiStore.setView(view);
};
</script>

<template>
  <div
    :style="{ width: isCollapsed ? '60px' : '250px' }"
    class="bg-surface-elevated text-content-secondary flex flex-col overflow-hidden shrink-0 box-border min-h-0 h-full z-[50] font-sans transition-[width] duration-300 ease-out"
    :class="isCollapsed ? 'px-2 py-6' : 'px-5 py-6'"
  >
    <!-- Logo 区域 -->
    <div class="flex items-center justify-between mb-6">
      <h1
        v-if="!isCollapsed"
        class="text-xl text-content-base font-bold m-0 leading-normal whitespace-nowrap overflow-hidden"
      >
        LLMusic
      </h1>
      <div class="flex items-center gap-1">
        <CustomButton
          type="icon-only" size="small" :icon="collapseIcon"
          :title="isCollapsed ? '展开侧边栏' : '收缩侧边栏'" circle
          @click="uiStore.toggleSidebarCollapse()"
        />
      </div>
    </div>

    <!-- 在线音乐 -->
    <div
      class="mb-3 text-[10px] font-bold text-content-base uppercase tracking-wider leading-normal"
      :class="isCollapsed ? 'text-center mb-3 after:block after:w-6 after:h-0.5 after:mx-auto after:rounded after:bg-gradient-to-r after:from-transparent after:via-content-secondary after:to-transparent' : 'flex items-center justify-between pl-2'"
    >
      <span v-if="!isCollapsed">在线音乐</span>
    </div>

    <div
      v-for="item in [{ id: 'discover', label: '发现音乐', icon: 'compass', view: 'discover' }]"
      :key="item.id"
      @click="uiStore.setView(item.view)"
      :class="[
        'flex items-center rounded cursor-pointer whitespace-nowrap overflow-hidden text-sm leading-normal relative transition-[background-color,color] duration-150',
        isCollapsed ? 'justify-center px-1 py-2.5' : 'px-2 py-2.5',
        uiStore.currentView === item.view ? 'bg-surface-overlay text-content-base' : '',
        'hover:bg-surface-overlay hover:text-content-base'
      ]"
    >
      <FAIcon
        :name="item.icon" size="medium" color="primary" :clickable="true"
        :class="isCollapsed ? 'mr-0' : 'mr-4'"
      />
      <span v-if="!isCollapsed">{{ item.label }}</span>
    </div>

    <!-- 平台导航区（动态渲染） -->
    <template v-for="platform in visiblePlatforms" :key="platform.id">
      <div
        class="mt-4 mb-3 text-[10px] font-bold text-content-base uppercase tracking-wider leading-normal"
        :class="isCollapsed ? 'text-center mb-3' : 'flex items-center justify-between pl-2'"
      >
        <span v-if="!isCollapsed">{{ platform.name }}</span>
      </div>

      <div
        v-for="navItem in platform.navItems"
        :key="navItem.id"
        @click="handlePlatformNav(navItem.view)"
        :class="[
          'flex items-center rounded cursor-pointer whitespace-nowrap overflow-hidden text-sm leading-normal relative transition-[background-color,color] duration-150',
          isCollapsed ? 'justify-center px-1 py-2.5' : 'px-2 py-2.5',
          uiStore.currentView === navItem.view ? 'bg-surface-overlay text-content-base' : '',
          'hover:bg-surface-overlay hover:text-content-base'
        ]"
      >
        <FAIcon
          :name="navItem.icon" size="medium" color="primary" :clickable="true"
          :class="isCollapsed ? 'mr-0' : 'mr-4'"
        />
        <span v-if="!isCollapsed">{{ navItem.label }}</span>
      </div>
    </template>

    <!-- QQ 音乐歌单列表 -->
    <template v-if="qqmusicStore.userPlaylists.length > 0">
      <div
        v-for="playlist in qqmusicStore.userPlaylists" :key="playlist.id"
        @click="qqmusicStore.setCurrentPlaylistId(playlist.id); uiStore.setView('qq-playlist-detail')"
        class="group relative flex items-center cursor-pointer whitespace-nowrap overflow-hidden text-sm leading-normal rounded transition-[background-color,color] duration-150 hover:bg-surface-overlay hover:text-content-base"
        :class="[
          isCollapsed ? 'justify-center px-1 py-2.5' : 'px-2 py-2.5 pr-[30px]',
          qqmusicStore.currentPlaylistId === playlist.id ? 'bg-surface-overlay text-content-base' : ''
        ]"
      >
        <FAIcon
          :name="playlist.id === qqmusicStore.likedPlaylistId ? 'heart' : 'list'" size="medium" color="primary" :clickable="true"
          :class="isCollapsed ? 'mr-0' : 'mr-4'"
        />
        <span v-if="!isCollapsed" class="flex-1 truncate" :title="playlist.title">{{ playlist.title }}</span>
        <span v-if="!isCollapsed" class="text-[10px] text-content-tertiary shrink-0 ml-1">{{ playlist.songCount }}首</span>
        <div
          v-if="!isCollapsed"
          class="absolute right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-[opacity,transform] duration-150 translate-x-1 group-hover:translate-x-0"
          @click.stop
        >
          <CustomButton type="icon-only" size="small" icon="play" title="播放全部" circle @click="qqmusicStore.setCurrentPlaylistId(playlist.id); uiStore.setView('qq-playlist-detail')" />
        </div>
      </div>
    </template>
    <div v-else-if="!authStore.isLoggedIn && !isCollapsed" class="text-xs text-content-tertiary pl-2 py-2">
      登录后展示歌单
    </div>
    <div v-else-if="qqmusicStore.playlistsLoading && !isCollapsed" class="text-xs italic text-content-disabled pl-2 py-2">
      加载中...
    </div>

    <!-- 本地音乐 -->
    <div
      class="mt-4 mb-3 text-[10px] font-bold text-content-base uppercase tracking-wider leading-normal"
      :class="isCollapsed ? 'text-center mb-3' : 'flex items-center justify-between pl-2'"
    >
      <span v-if="!isCollapsed">本地音乐</span>
    </div>

    <div
      @click="handleSetLibrary(null)"
      :class="[
        'flex items-center rounded cursor-pointer whitespace-nowrap overflow-hidden text-sm leading-normal relative transition-[background-color,color] duration-150',
        isCollapsed ? 'justify-center px-1 py-2.5' : 'px-2 py-2.5',
        uiStore.currentView === 'main' && mediaStore.activeLibraryId === null ? 'bg-surface-overlay text-content-base' : '',
        'hover:bg-surface-overlay hover:text-content-base'
      ]"
    >
      <FAIcon
        name="folder" size="medium" color="primary" :clickable="true"
        :class="isCollapsed ? 'mr-0' : 'mr-4'"
      />
      <span v-if="!isCollapsed">所有音乐</span>
    </div>

    <div
      v-for="lib in mediaStore.libraries" :key="lib.id"
      @click="handleSetLibrary(lib.id)"
      :class="[
        'flex items-center rounded cursor-pointer whitespace-nowrap overflow-hidden text-sm leading-normal relative transition-[background-color,color] duration-150',
        isCollapsed ? 'justify-center px-1 py-2.5' : 'px-2 py-2.5',
        uiStore.currentView === 'main' && mediaStore.activeLibraryId === lib.id ? 'bg-surface-overlay text-content-base' : '',
        'hover:bg-surface-overlay hover:text-content-base'
      ]"
    >
      <FAIcon
        name="music" size="medium" color="primary" :clickable="true"
        :class="isCollapsed ? 'mr-0' : 'mr-4'"
      />
      <span v-if="!isCollapsed">{{ lib.name }}</span>
    </div>

    <!-- 本地播放列表 -->
    <div
      v-if="!isCollapsed && playlistStore.playlists.length > 0"
      class="mt-3 mb-1 pl-2 text-[9px] font-medium text-content-tertiary uppercase tracking-wider leading-normal"
    >
      播放列表
    </div>

    <template v-if="playlistStore.loading">
      <div class="text-xs text-center italic text-content-disabled py-2">
        <span v-if="!isCollapsed">加载中...</span>
      </div>
    </template>

    <template v-else>
      <div
        v-for="playlist in playlistStore.playlists" :key="playlist.id"
        @click="playlistStore.loadPlaylistById(playlist.id); uiStore.setView('playlist')"
        class="group relative flex items-center cursor-pointer whitespace-nowrap overflow-hidden text-sm leading-normal rounded transition-[background-color,color] duration-150 hover:bg-surface-overlay hover:text-content-base"
        :class="[
          isCollapsed ? 'justify-center px-1 py-2.5' : 'px-2 py-2.5 pr-[30px]',
          playlistStore.currentPlaylistId === playlist.id ? 'bg-surface-overlay text-content-base' : ''
        ]"
      >
        <FAIcon
          name="list" size="medium" color="primary" :clickable="true"
          :class="isCollapsed ? 'mr-0' : 'mr-4'"
        />
        <span v-if="!isCollapsed" class="flex-1 truncate" :title="playlist.name">{{ playlist.name }}</span>
        <div
          v-if="!isCollapsed"
          class="absolute right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-[opacity,transform] duration-150 translate-x-1 group-hover:translate-x-0"
          @click.stop
        >
          <CustomButton type="icon-only" size="small" icon="edit" title="编辑歌单" circle @click="playlistStore.openEditPlaylistDialog(playlist)" />
          <CustomButton type="icon-only" size="small" icon="play" title="播放歌单" circle @click="playlistStore.playPlaylist(playlist.id)" />
        </div>
      </div>
    </template>

    <div class="flex-grow min-h-5"></div>

    <!-- 底部功能 -->
    <div
      @click="uiStore.setView('metadata')"
      :class="[
        'flex items-center rounded cursor-pointer whitespace-nowrap overflow-hidden text-sm leading-normal transition-[background-color,color] duration-150',
        isCollapsed ? 'justify-center px-1 py-2.5' : 'px-2 py-2.5',
        uiStore.currentView === 'metadata' ? 'bg-surface-overlay text-content-base' : '',
        'hover:bg-surface-overlay hover:text-content-base'
      ]"
    >
      <FAIcon name="edit" size="medium" color="primary" :clickable="true" :class="isCollapsed ? 'mr-0' : 'mr-4'" />
      <span v-if="!isCollapsed">元数据管理</span>
    </div>

    <div
      @click="uiStore.setView('settings')"
      :class="[
        'flex items-center rounded cursor-pointer whitespace-nowrap overflow-hidden text-sm leading-normal transition-[background-color,color] duration-150',
        isCollapsed ? 'justify-center px-1 py-2.5' : 'px-2 py-2.5',
        uiStore.currentView === 'settings' ? 'bg-surface-overlay text-content-base' : '',
        'hover:bg-surface-overlay hover:text-content-base'
      ]"
    >
      <FAIcon name="cog" size="medium" color="primary" :clickable="true" :class="isCollapsed ? 'mr-0' : 'mr-4'" />
      <span v-if="!isCollapsed">设置</span>
    </div>
  </div>
</template>
