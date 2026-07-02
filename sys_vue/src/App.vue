<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import SideBar from './components/system/SideBar.vue';
import MusicLibrary from './components/pages/MusicLibrary.vue';
import Settings from './components/pages/Settings.vue';
import MetadataManager from './components/pages/MetadataManager.vue';
import PlayerBar from './components/system/PlayerBar.vue';
import Playlist from './components/common/Playlist.vue';
import PlaylistContent from './components/pages/PlaylistContent.vue';
import PlaylistManage from './components/pages/PlaylistManage.vue';
import TitleBar from './components/system/TitleBar.vue';
import GlobalScanProgress from './components/system/GlobalScanProgress.vue';
import LyricPage from './components/pages/LyricPage.vue';
import DiscoverMusic from './components/pages/DiscoverMusic.vue';
import QQMusicPlaylistDetail from './components/pages/QQMusicPlaylistDetail.vue';
import { useUiStore } from './store/ui';
import { usePlaylistStore } from './store/playlist';
import { usePlayerStore } from './store/player';
import { useMediaStore } from './store/media';
import { useSidebarResize } from './composables/useSidebarResize';

const uiStore = useUiStore();
const playlistStore = usePlaylistStore();
const playerStore = usePlayerStore();
const mediaStore = useMediaStore();

// 初始化窗口关闭行为
uiStore.initCloseBehavior();


// 存储IPC事件监听器的引用
let removeNavigateListener: (() => void) | null = null;
let removeFileOpenListener: (() => void) | null = null;

onMounted(async () => {
    // 初始化CSS变量
    updateLayoutVariables();

    // 清除可能存在的任何焦点，防止元素在启动时自动高亮
    setTimeout(() => {
        if (document.activeElement) {
            (document.activeElement as HTMLElement).blur();
        }
    }, 200);

    // 初始化媒体库和歌曲数据
    try {
        // 加载音乐库列表
        await mediaStore.loadLibraries();

        // 如果有音乐库，加载歌曲数据
        if (mediaStore.libraries.length > 0 || mediaStore.activeLibraryId) {
            await mediaStore.loadSongs();
        }
    } catch (error) {
        console.error('初始化媒体库失败:', error);
    }

    // 监听主进程发送的导航事件
    removeNavigateListener = window.electronAPI.onNavigateToMain(() => {
        // 切换到主界面
        uiStore.setView('main');
        // 清除当前歌单
        if (playlistStore) {
            playlistStore.currentPlaylistId = null;
        }
    });

    // 监听文件打开事件
    removeFileOpenListener = window.electronAPI.onOpenAudioFile(async (filePath: string) => {
        try {
            // 解析文件信息
            const parseResult = await window.electronAPI.parseSongFromFile(filePath);

            if (parseResult.success && parseResult.song) {
                const song = parseResult.song;

                // 切换到主界面
                uiStore.setView('main');

                // 直接播放歌曲，不需要通过数据库
                // 清空当前播放列表，设置为单首歌曲
                playerStore.playlist = [song.id];
                playerStore.currentIndex = 0;
                playerStore.currentListId = 'temp-file-open';

                // 直接播放歌曲
                playerStore.playSong(song);

                // 显示主窗口并聚焦
                window.electronAPI.showWindow();
            }
        } catch (error) {
            console.error('处理文件打开失败:', error);
        }
    });
});


// 监听删除歌单事件并处理导航
playlistStore.$subscribe((mutation: any, state) => {
    // 检测是否歌单被删除
    if (mutation.type === 'deletePlaylist' &&
        mutation.events &&
        mutation.events.payload &&
        mutation.events.payload.success) {
        // 导航到主界面
        uiStore.setView('main');
    }
});

// 计算主布局CSS类
const layoutClasses = computed(() => {
    return {
        'sidebar-hidden': !uiStore.isSidebarVisible
    };
});

// 更新CSS变量
const updateLayoutVariables = () => {
    if (typeof document !== 'undefined') {
        const root = document.documentElement;
        const currentWidth = uiStore.isDraggingSidebar ? uiStore.tempSidebarWidth : uiStore.sidebarWidth;
        root.style.setProperty('--sidebar-width', `${currentWidth}px`);
    }
};

// 使用侧边栏拖拽组合式函数
const { startResize, handleDoubleClick: handleResizeHandleDoubleClick } = useSidebarResize({
    minWidth: 60,
    maxWidth: 300,
    onDragStart: undefined,
    onDragEnd: undefined
});

// 监听侧边栏状态变化
watch([
    () => uiStore.sidebarWidth,
    () => uiStore.tempSidebarWidth,
    () => uiStore.isDraggingSidebar,
    () => uiStore.isSidebarVisible
], updateLayoutVariables, { immediate: true });

// 在组件卸载时清理事件监听器
onUnmounted(() => {
    if (removeNavigateListener) {
        removeNavigateListener();
    }
    if (removeFileOpenListener) {
        removeFileOpenListener();
    }
});
</script>

<template>
    <div id="app-container">

        <!-- 自定义标题栏 -->
        <TitleBar />

        <!-- 全局扫描进度 -->
        <GlobalScanProgress />

        <div class="flex flex-1 overflow-hidden" :class="layoutClasses">
            <div class="sidebar-container">
                <SideBar />
                <div class="w-1 bg-line-base cursor-col-resize shrink-0 hover:bg-overlay-light" @mousedown="startResize" @dblclick="handleResizeHandleDoubleClick"></div>
            </div>
            <div class="flex-1 flex flex-col overflow-hidden min-w-0">
                <MusicLibrary v-if="uiStore.currentView === 'main'" />
                <DiscoverMusic v-else-if="uiStore.currentView === 'discover'" />
                <MetadataManager v-else-if="uiStore.currentView === 'metadata'" />
                <Settings v-else-if="uiStore.currentView === 'settings'" />
                <PlaylistContent v-else-if="uiStore.currentView === 'playlist'"
                    :navigate-to-main="() => uiStore.setView('main')" />
                <QQMusicPlaylistDetail v-else-if="uiStore.currentView === 'qq-playlist-detail'" />
            </div>
        </div>
        <div class="playlist-container" :class="{ 'is-visible': uiStore.isPlaylistVisible, 'playerbar-collapsed': uiStore.playerBarCollapsed }">
            <Playlist />
        </div>
        <PlayerBar />

        <!-- 歌词页面 -->
        <LyricPage />

        <!-- 播放列表管理对话框 -->
        <PlaylistManage />

    </div>
</template>

<style scoped>
/* 侧边栏容器 — CSS 变量驱动宽度 + transition */
.sidebar-container {
    display: flex;
    flex-direction: row;
    flex-shrink: 0;
    width: var(--sidebar-width, 250px);
    height: 100%;
    overflow: hidden;
    transition: width 0.15s ease-out, opacity 0.2s ease-out;
}

.sidebar-hidden .sidebar-container {
    width: 0;
    opacity: 0;
}

/* 播放列表面板 — transform 动画 */
.playlist-container {
    position: fixed;
    top: 32px;
    right: 0;
    bottom: 130px;
    width: 350px;
    z-index: 150;
    transform: translateX(100%);
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.playlist-container.is-visible {
    transform: translateX(0);
}

.playlist-container.playerbar-collapsed {
    bottom: 90px;
}

@media (max-width: 1024px) {
    .playlist-container { width: 320px; }
}

@media (max-width: 768px) {
    .playlist-container { width: 100%; top: 0; }
}

@media (prefers-reduced-motion: reduce) {
    .sidebar-container { transition: none !important; }
    .sidebar-hidden .sidebar-container { transform: none !important; }
    .playlist-container { transition: none !important; }
}
</style>