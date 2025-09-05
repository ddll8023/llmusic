<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import SideBar from './components/system/SideBar.vue';
import MusicLibrary from './components/pages/MusicLibrary.vue';
import Settings from './components/pages/Settings.vue';
import MetadataManager from './components/pages/MetadataManager.vue';
import PlayerBar from './components/system/PlayerBar.vue';
import Playlist from './components/common/Playlist.vue';
import PlaylistContent from './components/pages/PlaylistContent.vue';
import TitleBar from './components/system/TitleBar.vue';
import GlobalScanProgress from './components/system/GlobalScanProgress.vue';
import LyricPage from './components/pages/LyricPage.vue';
import { useUiStore } from './store/ui';
import { usePlaylistStore } from './store/playlist';
import { usePlayerStore } from './store/player';
import { useMediaStore } from './store/media';
import { useSidebarResize } from './composables/useSidebarResize.js';

const uiStore = useUiStore();
const playlistStore = usePlaylistStore();
const playerStore = usePlayerStore();
const mediaStore = useMediaStore();

// 初始化窗口关闭行为
uiStore.initCloseBehavior();


// 存储IPC事件监听器的引用
let removeNavigateListener = null;
let removeFileOpenListener = null;

onMounted(async () => {
    // 初始化CSS变量
    updateLayoutVariables();

    // 清除可能存在的任何焦点，防止元素在启动时自动高亮
    setTimeout(() => {
        if (document.activeElement) {
            document.activeElement.blur();
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
    removeFileOpenListener = window.electronAPI.onOpenAudioFile(async (filePath) => {
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
playlistStore.$subscribe((mutation, state) => {
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
    onDragStart: null,
    onDragEnd: null
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
        <TitleBar class="title-bar" />

        <!-- 全局扫描进度 -->
        <GlobalScanProgress />

        <div class="main-layout" :class="layoutClasses">
            <div class="sidebar-container">
                <SideBar />
                <div class="resize-handle" @mousedown="startResize" @dblclick="handleResizeHandleDoubleClick"></div>
            </div>
            <div class="content-wrapper">
                <MusicLibrary v-if="uiStore.currentView === 'main'" />
                <MetadataManager v-else-if="uiStore.currentView === 'metadata'" />
                <Settings v-else-if="uiStore.currentView === 'settings'" />
                <PlaylistContent v-else-if="uiStore.currentView === 'playlist'"
                    :navigate-to-main="() => uiStore.setView('main')" />
            </div>
        </div>
        <div class="playlist-container" :class="{ 'is-visible': uiStore.isPlaylistVisible }">
            <Playlist />
        </div>
        <PlayerBar class="player-bar" />

        <!-- 歌词页面 -->
        <LyricPage />

    </div>
</template>

<style scoped lang="scss">
// 标题栏样式
.title-bar {
    flex-shrink: 0;
    z-index: $z-modal;
}

// 主布局样式
#app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
}

.main-layout {
    display: flex;
    height: calc(100vh - #{$title-bar-height} - #{$player-bar-height});
    overflow: hidden;
}

.sidebar-container {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    width: var(--sidebar-width, 250px);
    height: 100%;
}

.content-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
}

.resize-handle {
    width: 4px;
    background-color: transparent;
    cursor: col-resize;
    flex-shrink: 0;

    &:hover {
        background-color: rgba(255, 255, 255, 0.1);
    }
}

// 播放列表容器样式
.playlist-container {
    position: fixed;
    top: $title-bar-height;
    right: 0;
    bottom: $player-bar-height;
    width: 350px;
    z-index: $z-playlist;
    transform: translateX(100%);
    transition: transform $transition-base ease-out;

    &.is-visible {
        transform: translateX(0);
    }

    @include respond-to("md") {
        width: 320px;
    }

    @include respond-to("sm") {
        width: 100%;
        top: 0;
        bottom: $player-bar-height;
    }
}

// 播放器控制栏样式
.player-bar {
    flex-shrink: 0;
    z-index: $z-player;
}
</style>