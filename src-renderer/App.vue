<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import SideBar from './components/SideBar.vue';
import MainContent from './components/MainContent.vue';
import Settings from './components/Settings.vue';
import MetadataManager from './components/MetadataManager.vue';
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

// 存储IPC事件监听器的引用
let removeNavigateListener = null;
let removeFileOpenListener = null;

onMounted(() => {
    // 初始化CSS变量
    updateLayoutVariables();

    // 清除可能存在的任何焦点，防止元素在启动时自动高亮
    setTimeout(() => {
        if (document.activeElement) {
            document.activeElement.blur();
        }
    }, 200);

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

// 计算主布局CSS类
const layoutClasses = computed(() => {
    return {
        'sidebar-hidden': !uiStore.isSidebarVisible
    };
});

// 规范化CSS变量设置
const updateLayoutVariables = () => {
    if (typeof document !== 'undefined') {
        const root = document.documentElement;

        // 使用统一的CSS变量设置方法
        const setCSSVariable = (name, value) => {
            root.style.setProperty(name, value);
        };

        // 设置侧边栏宽度变量
        // 始终使用实际宽度，不根据可见性判断
        setCSSVariable('--sidebar-width', `${uiStore.sidebarWidth}px`);

        // 设置播放器高度变量（仅在必要时更新）
        if (!root.style.getPropertyValue('--player-bar-height')) {
            setCSSVariable('--player-bar-height', `${playerBarHeight}px`);
        }
    }
};

// 监听侧边栏状态变化
watch([() => uiStore.sidebarWidth, () => uiStore.isSidebarVisible], updateLayoutVariables, { immediate: true });

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

    // 移除拖拽状态类
    document.body.classList.remove('is-resizing');

    window.removeEventListener('mousemove', mouseMoveListener);
    window.removeEventListener('mouseup', mouseUpListener);
};

const startResize = (event) => {
    event.preventDefault();
    isResizing.value = true;

    // 添加拖拽状态类
    document.body.classList.add('is-resizing');

    window.addEventListener('mousemove', mouseMoveListener);
    window.addEventListener('mouseup', mouseUpListener);
};

// 处理拖拽手柄双击事件
const handleResizeHandleDoubleClick = () => {
    uiStore.toggleSidebarCollapse();
};

// 在组件卸载时清理所有事件监听器
onUnmounted(() => {
    // 清理DOM事件监听器
    if (window) {
        window.removeEventListener('mousemove', mouseMoveListener);
        window.removeEventListener('mouseup', mouseUpListener);
    }

    // 确保清理拖拽状态类（防止内存泄漏）
    if (document.body) {
        document.body.classList.remove('is-resizing');
    }

    // 清理IPC事件监听器
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
                <LocalMusicHeader v-if="uiStore.currentView === 'main'" />
                <MainContent v-if="uiStore.currentView === 'main'" />
                <MetadataManager v-else-if="uiStore.currentView === 'metadata'" />
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

<style lang="scss" scoped>
// 标题栏样式
.title-bar {
    flex-shrink: 0;
    z-index: $z-modal;
}

// 播放器控制栏样式
.player-bar {
    flex-shrink: 0;
    z-index: $z-player;
}
</style>