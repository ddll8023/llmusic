<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { usePlaylistStore } from '../../store/playlist';
import { usePlayerStore } from '../../store/player';
import ContentHeader from '../common/ContentHeader.vue';
import SongTable from '../common/SongTable.vue';
import CustomButton from '../custom/CustomButton.vue';

// 接收父组件传递的导航函数
const props = defineProps({
    navigateToMain: {
        type: Function,
        default: null
    }
});

const playlistStore = usePlaylistStore();
const playerStore = usePlayerStore();

// 加载状态
const isLoading = ref(false);

// 显示删除确认对话框
const showDeleteConfirm = ref(false);

// SongTable组件引用
const songTableRef = ref(null);

// 获取当前歌单
const currentPlaylist = computed(() => playlistStore.currentPlaylist);

// 当前歌单ID作为列表ID
const currentListId = computed(() => playlistStore.currentPlaylistId || 'playlist');

// 处理SongTable的播放事件
const handlePlaySong = ({ song }) => {
    // 创建一个播放列表，包含所有歌单中的歌曲
    playerStore.playSongFromList({
        listId: playlistStore.currentPlaylistId,
        songIds: playlistStore.currentPlaylistSongs.map(s => s.id),
        songToPlayId: song.id
    });
};

// 处理SongTable的操作按钮点击
const handleActionClick = ({ action, song }) => {
    if (action === 'remove') {
        removeSongFromPlaylist(song.id);
    }
};

// 处理右键菜单操作
const handleContextMenuAction = async ({ action, song }) => {
    if (!song) return;

    switch (action) {
        case 'play-toggle':
            if (playerStore.currentSong && playerStore.currentSong.id === song.id && playerStore.playing) {
                playerStore.togglePlay(); // 暂停
            } else {
                handlePlaySong({ song }); // 播放
            }
            break;

        case 'add-to-playlist':
            playerStore.addToPlaylist(song.id);
            break;

        case 'show-lyrics':
            // 先播放歌曲
            handlePlaySong({ song });
            // 显示歌词页面
            playerStore.showLyricsDisplay();
            break;

        case 'show-in-folder':
            try {
                // 使用filePath而不是path
                if (song.filePath) {
                    const result = await window.electronAPI.showItemInFolder(song.filePath);
                    if (!result.success) {
                        console.error('无法显示文件位置:', result.error);
                        // 显示错误提示
                        alert(`无法显示文件位置: ${result.error}`);
                    }
                } else {
                    console.warn('歌曲没有有效的文件路径');
                    alert('该歌曲无有效的文件路径信息');
                }
            } catch (error) {
                console.error('显示文件位置时出错:', error);
                alert(`操作失败: ${error.message || '未知错误'}`);
            }
            break;

        case 'copy-info':
            try {
                const info = `${song.title || '未知歌曲'} - ${song.artist || '未知艺术家'} - ${song.album || '未知专辑'}`;
                await window.electronAPI.copyToClipboard(info);
            } catch (error) {
                console.error('复制歌曲信息失败:', error);
                alert('复制歌曲信息失败');
            }
            break;

        case 'remove-from-list':
            // 从歌单中移除歌曲
            removeSongFromPlaylist(song.id);
            break;
    }
};

// 从歌单中移除歌曲
async function removeSongFromPlaylist(songId) {
    if (!playlistStore.currentPlaylistId) return;

    const result = await playlistStore.removeSongsFromPlaylist(
        playlistStore.currentPlaylistId,
        songId
    );

    if (!result.success) {
        console.error('从歌单移除歌曲失败:', result.error);
    }
}

// 播放整个歌单
function playEntirePlaylist() {
    if (playlistStore.currentPlaylistSongs.length > 0) {
        playerStore.playSongFromList({
            listId: playlistStore.currentPlaylistId,
            songIds: playlistStore.currentPlaylistSongs.map(s => s.id),
            songToPlayId: playlistStore.currentPlaylistSongs[0].id
        });
    }
}

// 删除当前歌单
async function deletePlaylist() {
    if (!playlistStore.currentPlaylistId) return;

    showDeleteConfirm.value = false;
    const result = await playlistStore.deletePlaylist(playlistStore.currentPlaylistId);

    if (result.success) {
        // 返回到主界面
        if (props.navigateToMain) {
            props.navigateToMain();
        }
    } else {
        console.error('删除歌单失败:', result.error);
    }
}

// 编辑当前歌单
function editPlaylist() {
    if (currentPlaylist.value) {
        playlistStore.openEditPlaylistDialog(currentPlaylist.value);
    }
}

// 头部操作按钮配置
const headerActions = computed(() => [
    {
        key: 'play-all',
        label: '播放全部',
        icon: 'play',
        type: 'primary',
        disabled: playlistStore.currentPlaylistSongs.length === 0
    },
    {
        key: 'edit',
        label: '编辑',
        icon: 'edit',
        type: 'secondary'
    },
    {
        key: 'delete',
        label: '删除',
        icon: 'trash',
        type: 'danger'
    }
]);

// 处理头部操作按钮点击
const handleHeaderAction = (actionKey) => {
    switch (actionKey) {
        case 'play-all':
            playEntirePlaylist();
            break;
        case 'edit':
            editPlaylist();
            break;
        case 'delete':
            showDeleteConfirm.value = true;
            break;
    }
};

// 监听当前歌单ID变化
watch(() => playlistStore.currentPlaylistId, (newId) => {
    if (newId) {
        isLoading.value = true;
        playlistStore.loadPlaylistById(newId).finally(() => {
            isLoading.value = false;
        });
    }
});

// 组件挂载时加载歌单
onMounted(() => {
    if (playlistStore.currentPlaylistId) {
        isLoading.value = true;
        playlistStore.loadPlaylistById(playlistStore.currentPlaylistId).finally(() => {
            isLoading.value = false;
        });
    }
});
</script>

<template>
    <div class="playlist-content">
        <!-- 歌单头部 -->
        <ContentHeader v-if="currentPlaylist" :title="currentPlaylist.name" :subtitle="currentPlaylist.description"
            :meta-text="`${playlistStore.currentPlaylistSongs.length} 首歌曲`" :actions="headerActions"
            @action-click="handleHeaderAction" />

        <!-- 歌曲表格 -->
        <SongTable ref="songTableRef" :songs="playlistStore.currentPlaylistSongs" :loading="isLoading"
            :show-sortable="false" :show-play-count="false" :show-action-column="true" :action-column-type="'remove'"
            :context-menu-type="'playlist'" :current-list-id="currentListId" :empty-text="'歌单为空'" :empty-icon="'list'"
            @play-song="handlePlaySong" @action-click="handleActionClick"
            @context-menu-action="handleContextMenuAction" />

        <!-- 删除确认对话框 -->
        <div v-if="showDeleteConfirm" class="delete-confirm-dialog">
            <div class="dialog-content">
                <h3>删除歌单</h3>
                <p>确定要删除歌单"{{ currentPlaylist?.name }}"吗？此操作不可撤销。</p>
                <div class="dialog-buttons">
                    <CustomButton type="secondary" @click="showDeleteConfirm = false">取消</CustomButton>
                    <CustomButton type="danger" @click="deletePlaylist">确认删除</CustomButton>
                </div>
            </div>
        </div>
    </div>
</template>

<style lang="scss" scoped>
@use "sass:color";

.playlist-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    background-color: #121212;
    color: #ffffff;
}
/* comment */
.delete-confirm-dialog {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    animation: fadeIn 0.15s cubic-bezier(0.4, 0, 0.2, 1) ease-out;
}

.dialog-content {
    background-color: #181818;
    border-radius: (4px * 2);
    padding: (16px * 1.5);
    width: 400px;
    max-width: 90%;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15)-hover;
    border: 1px solid #282828;
    animation: slideUp 0.25s cubic-bezier(0.4, 0, 0.2, 1) ease-out;

    h3 {
        margin-top: 0;
        margin-bottom: 16px;
        color: #ffffff;
        font-size: 18px;
        font-weight: 550;
    }

    p {
        margin-bottom: (16px * 1.5);
        color: #b3b3b3;
        font-size: 14px;
        line-height: 1.5;
    }

    @media (max-width: 768px) {
        padding: 16px;

        h3 {
            font-size: 14px;
        }

        p {
            font-size: 12px;
        }
    }
}

@keyframes slideUp {
    from {
        opacity: 0;
        transform: translateY(20px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.dialog-buttons {
    display: flex;
    justify-content: flex-end;
    gap: (16px * 0.75);

    @media (max-width: 768px) {
        gap: (16px * 0.5);
    }
}

.cancel-btn,
.delete-btn {
    padding: (16px * 0.5) 16px;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    min-width: 80px;

    @media (max-width: 768px) {
        padding: (16px * 0.375) (16px * 0.75);
        font-size: 12px;
        min-width: 70px;
    }
}

.cancel-btn {
    background-color: transparent;
    color: #b3b3b3;
    border: 1px solid #282828;

    &:hover {
        background-color: rgba(255,255,255,0.1);
        color: #ffffff;
        border-color: #b3b3b3;
    }
}

.delete-btn {
    background-color: #f44336;
    color: #ffffff;

    &:hover {
        background-color: color.adjust(#f44336, $lightness: -10%);
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }

    &:active {
        transform: translateY(0);
    }
}

@keyframes fadeIn {
    from {
        opacity: 0;
    }

    to {
        opacity: 1;
    }
}
/* comment */
@media (prefers-contrast: high) {
    .playlist-content {
        border: 2px solid #ffffff;
    }

    .cancel-btn,
    .delete-btn {
        border: 2px solid currentColor;
    }
}
/* comment */
@media (prefers-reduced-motion: reduce) {

    *,
    *::before,
    *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
    }

    .cancel-btn,
    .delete-btn {

        &:hover,
        &:active {
            transform: none;
        }
    }
}
</style>