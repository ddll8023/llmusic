<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useUiStore } from '../../store/ui';
import { usePlaylistStore } from '../../store/playlist';
import { useMediaStore } from '../../store/media';
import FAIcon from '../common/FAIcon.vue';
import CustomButton from '../custom/CustomButton.vue';

const uiStore = useUiStore();
const playlistStore = usePlaylistStore();
const mediaStore = useMediaStore();

const isCollapsed = computed(() => uiStore.isSidebarCollapsed);
const collapseIcon = computed(() => isCollapsed.value ? 'chevron-right' : 'chevron-left');

onMounted(async () => {
    await playlistStore.loadPlaylists();
    await mediaStore.loadLibraries();
});

const handleSetLibrary = (libraryId: any) => {
    mediaStore.setActiveLibrary(libraryId);
    uiStore.setView('main');
};
</script>

<template>
    <div :style="{ width: isCollapsed ? '60px' : '250px' }"
        class="bg-surface-elevated text-content-secondary flex flex-col overflow-hidden shrink-0 box-border min-h-0 h-full z-[50] font-sans
               transition-[width] duration-300 ease-out"
        :class="isCollapsed ? 'px-2 py-6' : 'px-5 py-6'">

        <!-- Logo 区域 -->
        <div class="flex items-center justify-between mb-6">
            <h1 v-if="!isCollapsed"
                class="text-xl text-content-base font-bold m-0 leading-normal whitespace-nowrap overflow-hidden">
                LLMusic</h1>
            <div class="flex items-center gap-1">
                <CustomButton type="icon-only" size="small" :icon="collapseIcon"
                    :title="isCollapsed ? '展开侧边栏' : '收缩侧边栏'" circle @click="uiStore.toggleSidebarCollapse()" />
            </div>
        </div>

        <!-- 在线音乐 -->
        <div class="mb-6 text-[10px] font-bold text-content-base uppercase tracking-wider leading-normal"
            :class="isCollapsed ? 'text-center mb-3 after:block after:w-6 after:h-0.5 after:mx-auto after:rounded after:bg-gradient-to-r after:from-transparent after:via-content-secondary after:to-transparent' : 'flex items-center justify-between pl-2'">
            <span v-if="!isCollapsed">在线音乐</span>
        </div>

        <div @click="uiStore.setView('discover')"
            :class="[
                'flex items-center rounded cursor-pointer whitespace-nowrap overflow-hidden text-sm leading-normal relative transition-[background-color,color] duration-150',
                isCollapsed ? 'justify-center px-1 py-2.5' : 'px-2 py-2.5',
                uiStore.currentView === 'discover' ? 'bg-surface-overlay text-content-base' : '',
                'hover:bg-surface-overlay hover:text-content-base'
            ]">
            <FAIcon name="compass" size="medium" color="primary" :clickable="true"
                :class="isCollapsed ? 'mr-0' : 'mr-4'" />
            <span v-if="!isCollapsed">发现音乐</span>
        </div>

        <div class="flex items-center rounded cursor-pointer whitespace-nowrap overflow-hidden text-sm leading-normal opacity-60 cursor-not-allowed"
            :class="isCollapsed ? 'justify-center px-1 py-2.5' : 'px-2 py-2.5'">
            <FAIcon name="signal" size="medium" color="secondary" :class="isCollapsed ? 'mr-0' : 'mr-4'" />
            <span v-if="!isCollapsed">私人FM</span>
        </div>

        <!-- 我的音乐 -->
        <div class="mb-6 text-[10px] font-bold text-content-base uppercase tracking-wider leading-normal"
            :class="isCollapsed ? 'text-center mb-3' : 'flex items-center justify-between pl-2'">
            <span v-if="!isCollapsed">我的音乐</span>
        </div>

        <div @click="handleSetLibrary(null)"
            :class="[
                'flex items-center rounded cursor-pointer whitespace-nowrap overflow-hidden text-sm leading-normal relative transition-[background-color,color] duration-150',
                isCollapsed ? 'justify-center px-1 py-2.5' : 'px-2 py-2.5',
                uiStore.currentView === 'main' && mediaStore.activeLibraryId === null ? 'bg-surface-overlay text-content-base' : '',
                'hover:bg-surface-overlay hover:text-content-base'
            ]">
            <FAIcon name="folder" size="medium" color="primary" :clickable="true"
                :class="isCollapsed ? 'mr-0' : 'mr-4'" />
            <span v-if="!isCollapsed">所有音乐</span>
        </div>

        <div v-for="lib in mediaStore.libraries" :key="lib.id" @click="handleSetLibrary(lib.id)"
            :class="[
                'flex items-center rounded cursor-pointer whitespace-nowrap overflow-hidden text-sm leading-normal relative transition-[background-color,color] duration-150',
                isCollapsed ? 'justify-center px-1 py-2.5' : 'px-2 py-2.5',
                uiStore.currentView === 'main' && mediaStore.activeLibraryId === lib.id ? 'bg-surface-overlay text-content-base' : '',
                'hover:bg-surface-overlay hover:text-content-base'
            ]">
            <FAIcon name="music" size="medium" color="primary" :clickable="true"
                :class="isCollapsed ? 'mr-0' : 'mr-4'" />
            <span v-if="!isCollapsed">{{ lib.name }}</span>
        </div>

        <div class="flex items-center rounded cursor-pointer whitespace-nowrap overflow-hidden opacity-60 cursor-not-allowed text-sm leading-normal"
            :class="isCollapsed ? 'justify-center px-1 py-2.5' : 'px-2 py-2.5'">
            <FAIcon name="clock-o" size="medium" color="secondary" :class="isCollapsed ? 'mr-0' : 'mr-4'" />
            <span v-if="!isCollapsed">最近播放</span>
        </div>

        <div class="flex items-center rounded cursor-pointer whitespace-nowrap overflow-hidden opacity-60 cursor-not-allowed text-sm leading-normal"
            :class="isCollapsed ? 'justify-center px-1 py-2.5' : 'px-2 py-2.5'">
            <FAIcon name="heart" size="medium" color="secondary" :class="isCollapsed ? 'mr-0' : 'mr-4'" />
            <span v-if="!isCollapsed">我的收藏</span>
        </div>

        <!-- 创建的歌单 -->
        <div class="mb-6 text-[10px] font-bold text-content-base uppercase tracking-wider leading-normal"
            :class="isCollapsed ? 'text-center mb-3' : 'flex items-center justify-between pl-2'">
            <span v-if="!isCollapsed">创建的歌单</span>
            <CustomButton v-if="!isCollapsed" type="icon-only" size="small" icon="plus" title="创建歌单" circle
                @click="playlistStore.openCreatePlaylistDialog()" />
        </div>

        <div v-if="playlistStore.loading" class="text-xs text-center italic text-content-disabled py-2">
            <span v-if="!isCollapsed">加载中...</span>
        </div>

        <template v-else>
            <div v-if="playlistStore.playlists.length === 0" class="text-xs text-center italic text-content-disabled py-2">
                <span v-if="!isCollapsed">暂无歌单，点击"+"创建</span>
            </div>

            <div v-for="playlist in playlistStore.playlists" :key="playlist.id"
                @click="playlistStore.loadPlaylistById(playlist.id); uiStore.setView('playlist')"
                class="group relative flex items-center cursor-pointer whitespace-nowrap overflow-hidden text-sm leading-normal rounded transition-[background-color,color] duration-150 hover:bg-surface-overlay hover:text-content-base"
                :class="[
                    isCollapsed ? 'justify-center px-1 py-2.5' : 'px-2 py-2.5 pr-[30px]',
                    playlistStore.currentPlaylistId === playlist.id ? 'bg-surface-overlay text-content-base' : ''
                ]">
                <FAIcon name="list" size="medium" color="primary" :clickable="true"
                    :class="isCollapsed ? 'mr-0' : 'mr-4'" />
                <span v-if="!isCollapsed" class="flex-1 truncate" :title="playlist.name">{{ playlist.name }}</span>
                <!-- 编辑按钮，鼠标悬浮显示 -->
                <div v-if="!isCollapsed"
                    class="absolute right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-[opacity,transform] duration-150 translate-x-1 group-hover:translate-x-0"
                    @click.stop>
                    <CustomButton type="icon-only" size="small" icon="edit" title="编辑歌单" circle
                        @click="playlistStore.openEditPlaylistDialog(playlist)" />
                    <CustomButton type="icon-only" size="small" icon="play" title="播放歌单" circle
                        @click="playlistStore.playPlaylist(playlist.id)" />
                </div>
            </div>
        </template>

        <div class="flex-grow min-h-5"></div>

        <!-- 元数据管理 -->
        <div @click="uiStore.setView('metadata')"
            :class="[
                'flex items-center rounded cursor-pointer whitespace-nowrap overflow-hidden text-sm leading-normal mt-2 transition-[background-color,color] duration-150',
                isCollapsed ? 'justify-center px-1 py-2.5' : 'px-2 py-2.5',
                uiStore.currentView === 'metadata' ? 'bg-surface-overlay text-content-base' : '',
                'hover:bg-surface-overlay hover:text-content-base'
            ]">
            <FAIcon name="edit" size="medium" color="primary" :clickable="true"
                :class="isCollapsed ? 'mr-0' : 'mr-4'" />
            <span v-if="!isCollapsed">元数据管理</span>
        </div>

        <!-- 设置 -->
        <div @click="uiStore.setView('settings')"
            :class="[
                'flex items-center rounded cursor-pointer whitespace-nowrap overflow-hidden text-sm leading-normal transition-[background-color,color] duration-150',
                isCollapsed ? 'justify-center px-1 py-2.5' : 'px-2 py-2.5',
                uiStore.currentView === 'settings' ? 'bg-surface-overlay text-content-base' : '',
                'hover:bg-surface-overlay hover:text-content-base'
            ]">
            <FAIcon name="cog" size="medium" color="primary" :clickable="true"
                :class="isCollapsed ? 'mr-0' : 'mr-4'" />
            <span v-if="!isCollapsed">设置</span>
        </div>
    </div>
</template>
