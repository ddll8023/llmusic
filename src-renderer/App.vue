<script setup>
import { computed, onMounted, onUnmounted, ref, nextTick } from 'vue';
import SideBar from './components/SideBar.vue';
import MainContent from './components/MainContent.vue';
import Settings from './components/Settings.vue';
import PlayerBar from './components/PlayerBar.vue';
import LocalMusicHeader from './components/LocalMusicHeader.vue';
import Playlist from './components/Playlist.vue';
import LyricPage from './components/LyricPage.vue';
import PlaylistManage from './components/PlaylistManage.vue';
import PlaylistContent from './components/PlaylistContent.vue';
import TitleBar from './components/TitleBar.vue';
import GlobalScanProgress from './components/GlobalScanProgress.vue';
import { useUiStore } from './store/ui';
import { usePlaylistStore } from './store/playlist';
import { usePlayerStore } from './store/player';

const uiStore = useUiStore();
const playlistStore = usePlaylistStore();
const playerStore = usePlayerStore();

// 初始化窗口关闭行为
uiStore.initCloseBehavior();

// 播放器控制栏的高度，单位为px
const playerBarHeight = 90; // 这个值应该与PlayerBar.vue中的height值一致

onMounted(() => {
    // 清除可能存在的任何焦点，防止元素在启动时自动高亮
    setTimeout(() => {
        if (document.activeElement) {
            document.activeElement.blur();
        }
    }, 200);

    // 监听主进程发送的导航事件
    const removeNavigateListener = window.electronAPI.onNavigateToMain(() => {
        // 切换到主界面
        uiStore.setView('main');
        // 清除当前歌单
        if (playlistStore) {
            playlistStore.currentPlaylistId = null;
        }
    });

    // 监听文件打开事件
    const removeFileOpenListener = window.electronAPI.onOpenAudioFile(async (filePath) => {
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

    onUnmounted(() => {
        // 移除事件监听器
        if (removeNavigateListener) {
            removeNavigateListener();
        }
        if (removeFileOpenListener) {
            removeFileOpenListener();
        }
    });
});

// 修正PlaylistContent组件内的导航问题
// 设置一个函数使得PlaylistContent可以通过props调用
const navigateToMain = () => {
    uiStore.setView('main');
};

// 监听删除歌单事件并处理导航
playlistStore.$subscribe((mutation, state) => {
    // 检测是否歌单被删除
    if (mutation.type === 'deletePlaylist' &&
        mutation.events &&
        mutation.events.payload &&
        mutation.events.payload.success) {
        // 导航到主界面
        navigateToMain();
    }
});

const layoutStyle = computed(() => {
    let columns = '1fr';
    if (uiStore.isSidebarVisible) {
        columns = `${uiStore.sidebarWidth}px 1fr`;
    }

    return {
        gridTemplateColumns: columns,
    };
});

const isResizing = ref(false);

// 用于存储添加的事件监听器函数
const mouseMoveListener = (event) => {
    if (isResizing.value) {
        event.preventDefault();
        const newWidth = uiStore.sidebarWidth + event.movementX;
        uiStore.setSidebarWidth(newWidth);
    }
};

const mouseUpListener = () => {
    isResizing.value = false;

    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    window.removeEventListener('mousemove', mouseMoveListener);
    window.removeEventListener('mouseup', mouseUpListener);
};

const startResize = (event) => {
    event.preventDefault();
    isResizing.value = true;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    window.addEventListener('mousemove', mouseMoveListener);
    window.addEventListener('mouseup', mouseUpListener);
};

// 在组件卸载时清理所有可能的事件监听器
onUnmounted(() => {
    if (window) {
        window.removeEventListener('mousemove', mouseMoveListener);
        window.removeEventListener('mouseup', mouseUpListener);
    }
});
</script>

<template>
    <div id="app-container" :style="{ '--player-bar-height': playerBarHeight + 'px' }">
        <!-- 自定义标题栏 -->
        <TitleBar class="title-bar" />
        
        <!-- 全局扫描进度 -->
        <GlobalScanProgress />

        <div class="main-layout" :style="layoutStyle" :class="{ 'sidebar-hidden': !uiStore.isSidebarVisible }">
            <div class="sidebar-container" style="grid-column: 1; position: relative;" v-if="uiStore.isSidebarVisible">
                <SideBar />
                <div class="resize-handle" @mousedown="startResize"></div>
            </div>
            <div class="content-wrapper" style="grid-column: 2;">
                <LocalMusicHeader v-if="uiStore.currentView === 'main'" />
                <MainContent v-if="uiStore.currentView === 'main'" />
                <Settings v-else-if="uiStore.currentView === 'settings'" />
                <PlaylistContent v-else-if="uiStore.currentView === 'playlist'" :navigate-to-main="navigateToMain" />
            </div>
        </div>
        <div class="playlist-container" :class="{ 'is-visible': uiStore.isPlaylistVisible }">
            <Playlist />
        </div>
        <PlayerBar class="player-bar" />

        <!-- 歌词页面 -->
        <LyricPage />

        <!-- 歌单管理对话框 -->
        <PlaylistManage />
    </div>
</template>

<style>
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body,
html {
    height: 100%;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    cursor: default;
}

#app {
    height: 100vh;
    width: 100vw;
}

#app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    background-color: #121212;
    --player-bar-height: 90px;
    /* 默认值，会被动态覆盖 */
    --title-bar-height: 32px;
    /* 标题栏高度 */
}

.main-layout {
    display: grid;
    flex: 1;
    overflow: hidden;
    position: relative;
    transition: grid-template-columns 0s;
    gap: 0;
    height: calc(100vh - var(--player-bar-height) - var(--title-bar-height));
}

.sidebar-container {
    position: relative;
    height: 100%;
    overflow: hidden;
    padding: 0;
    margin: 0;
    box-sizing: border-box;
}

.resize-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    width: 1px;
    cursor: col-resize;
    background-color: #282828;
    z-index: 50;
    transition: background-color 0.2s, width 0.2s;
}

.resize-handle:hover {
    width: 3px;
    background-color: #4CAF50;
}

.content-wrapper {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
    position: relative;
    background-color: #121212;
}

.playlist-container {
    position: fixed;
    bottom: var(--player-bar-height);
    right: 0;
    width: 300px;
    /* or your desired width */
    height: calc(100vh - var(--player-bar-height) - var(--title-bar-height));
    background-color: #181818;
    border-left: 1px solid #282828;
    transform: translateX(100%);
    transition: transform 0.3s ease-in-out;
    z-index: 150;
    display: flex;
    flex-direction: column;
}

.playlist-container.is-visible {
    transform: translateX(0);
}

/* 播放器控制栏样式，增加z-index确保始终在顶层 */
.player-bar {
    position: relative;
    z-index: 200;
}

/* 修改歌词页面的容器样式，不影响其内部样式 */
.lyric-page {
    height: calc(100% - var(--player-bar-height) - var(--title-bar-height)) !important;
    bottom: var(--player-bar-height) !important;
    top: var(--title-bar-height) !important;
}

/* 确保歌词页面的动画样式不会覆盖底部控制栏 */
.lyric-page--slide.lyric-page--show {
    transform: translateY(0) !important;
    max-height: calc(100% - var(--player-bar-height) - var(--title-bar-height)) !important;
}

/* Responsive logic for small screens */
@media (max-width: 768px) {
    .main-layout {
        grid-template-columns: 1fr;
    }

    .main-layout .sidebar {
        position: absolute;
        z-index: 100;
        height: 100%;
        transform: translateX(-100%);
        transition: transform 0.3s ease;
    }

    /* When sidebar is visible on small screen, it slides in */
    .main-layout:not(.sidebar-hidden) .sidebar {
        transform: translateX(0);
    }

    /* Collapsed state on small screen doesn't change anything, it's always full width when shown */
    .main-layout.sidebar-collapsed {
        grid-template-columns: 1fr;
    }

    /* 标题栏在移动设备上调整 */
    .title-bar {
        padding: 0 5px;
    }

    .title-bar .app-title {
        font-size: 12px;
    }

    .title-bar-button {
        width: 40px;
    }
}

/* Add a global transition for interactive elements */
button,
.menu-item,
.song-table tbody tr {
    transition: all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1);
}

/* Custom scrollbar styles remain the same */
::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}

::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 4px;
}

::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    transition: background-color 0.3s;
}

::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
}

::-webkit-scrollbar-corner {
    background: transparent;
}
</style>