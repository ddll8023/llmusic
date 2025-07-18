<script setup>
import { ref, computed, watch, onMounted, reactive, nextTick } from 'vue';
import { usePlaylistStore } from '../store/playlist';
import { usePlayerStore } from '../store/player';
import Icon from './Icon.vue';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';
import { RecycleScroller } from 'vue-virtual-scroller';
import ContextMenu from './ContextMenu.vue';

// 接收父组件传递的导航函数
const props = defineProps({
    navigateToMain: {
        type: Function,
        default: null
    }
});

const playlistStore = usePlaylistStore();
const playerStore = usePlayerStore();

// 歌曲索引映射（用于修复虚拟滚动序号显示问题）
const songIndexMap = computed(() => {
    const map = new Map();
    playlistStore.currentPlaylistSongs.forEach((song, index) => {
        map.set(song.id, index);
    });
    return map;
});

// 获取歌曲在播放列表中的真实索引
const getRealIndex = (song) => {
    const index = songIndexMap.value.get(song.id);
    if (index === undefined) {
        console.warn(`无法找到歌曲 ${song.title} (ID: ${song.id}) 的索引`);
        return -1;
    }
    return index;
};

// 加载状态
const isLoading = ref(false);

// 当前播放歌曲ID
const currentSongId = computed(() => playerStore.currentSong?.id || null);

// 当前播放状态
const isPlaying = computed(() => playerStore.playing);

// 获取当前歌单
const currentPlaylist = computed(() => playlistStore.currentPlaylist);

// 显示删除确认对话框
const showDeleteConfirm = ref(false);

// 鼠标悬停的歌曲ID
const hoveredSongId = ref(null);

// 占位符封面
const placeholderCover = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

// 歌曲封面缓存
const songCovers = reactive({});

// 滚动器引用
const scroller = ref(null);

// 显示固定按钮
const showFixedButtons = ref(false);

// 右键菜单相关状态
const contextMenu = reactive({
    show: false,
    x: 0,
    y: 0,
    song: null
});

// 歌曲信息对话框状态
const songInfoDialogVisible = ref(false);
const currentSongForInfo = ref(null);

// 处理右键菜单打开
const handleContextMenu = (event, song) => {
    event.preventDefault();
    contextMenu.show = true;
    contextMenu.x = event.clientX;
    contextMenu.y = event.clientY;
    contextMenu.song = song;
};

// 关闭右键菜单
const closeContextMenu = () => {
    contextMenu.show = false;
};

// 显示歌曲信息对话框
const showSongInfoDialog = (song) => {
    currentSongForInfo.value = song;
    songInfoDialogVisible.value = true;
};

// 关闭歌曲信息对话框
const closeSongInfoDialog = () => {
    songInfoDialogVisible.value = false;
};

// 处理右键菜单操作
const handleMenuAction = async ({ action, song }) => {
    if (!song) return;

    switch (action) {
        case 'play-toggle':
            if (playerStore.currentSong && playerStore.currentSong.id === song.id && playerStore.playing) {
                playerStore.togglePlay(); // 暂停
            } else {
                playSong(song); // 播放
            }
            break;

        case 'add-to-playlist':
            playerStore.addToPlaylist(song.id);
            break;

        case 'show-lyrics':
            // 先播放歌曲
            playSong(song);
            // 显示歌词页面
            playerStore.showLyricsDisplay();
            break;

        case 'song-info':
            // 使用更美观的自定义对话框而不是alert
            showSongInfoDialog(song);
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

// 播放歌曲
function playSong(song, index) {
    // 创建一个播放列表，包含所有歌单中的歌曲
    playerStore.playSongFromList({
        listId: playlistStore.currentPlaylistId,
        songIds: playlistStore.currentPlaylistSongs.map(s => s.id),
        songToPlayId: song.id
    });
}

// 从歌单中移除歌曲
async function removeSongFromPlaylist(songId, index, event) {
    // 阻止事件冒泡，避免触发行点击事件
    if (event) {
        event.stopPropagation();
    }

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

// 格式化时长
function formatDuration(seconds) {
    if (!seconds) return '0:00';

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// 格式化比特率，将bps转换为kbps
const formatBitrate = (bitrate) => {
    if (!bitrate) return '未知';
    // 转换为kbps并保留1位小数
    const kbps = (bitrate / 1000).toFixed(1);
    return `${kbps} kbps`;
};

// 格式化文件大小，转换为MB或KB
const formatFileSize = (bytes) => {
    if (!bytes) return '未知';

    if (bytes >= 1024 * 1024) {
        // 转换为MB并保留2位小数
        const mb = (bytes / (1024 * 1024)).toFixed(2);
        return `${mb} MB`;
    } else if (bytes >= 1024) {
        // 转换为KB并保留1位小数
        const kb = (bytes / 1024).toFixed(1);
        return `${kb} KB`;
    } else {
        return `${bytes} B`;
    }
};

// 格式化采样率
const formatSampleRate = (sampleRate) => {
    if (!sampleRate) return '未知';
    return `${sampleRate / 1000} kHz`;
};

// 加载歌曲封面
const loadSongCover = async (songId) => {
    if (!songId || songCovers[songId]) return;

    try {
        const result = await window.electronAPI.getSongCover(songId);

        if (result.success && result.cover) {
            const imageFormat = result.format || 'image/jpeg';
            songCovers[songId] = `data:${imageFormat};base64,${result.cover}`;
        } else {
            console.warn(`歌曲 ${songId} 封面加载失败:`, result.error || "未知错误");
        }
    } catch (error) {
        console.error('加载封面失败:', error);
    }
};

// 处理滚动事件
const handleScroll = (event) => {
    // 获取滚动位置
    const scrollTop = event?.target?.scrollTop || 0;

    // 当滚动位置大于0且歌词页面未显示时显示按钮，否则隐藏
    showFixedButtons.value = scrollTop > 0 && !playerStore.showLyrics;
};

// 滚动到顶部
const scrollToTop = async () => {
    if (!scroller.value || playlistStore.currentPlaylistSongs.length === 0) return;

    // 先等待下一个tick，确保Vue已完成更新
    await nextTick();

    // 短暂延时以确保scroller组件完全初始化
    setTimeout(() => {
        scroller.value.scrollToItem(0);
    }, 50);
};

// 滚动到当前播放歌曲位置
const scrollToCurrentSong = async () => {
    if (!playerStore.currentSong || !scroller.value) return;

    const currentSongId = playerStore.currentSong.id;
    const index = playlistStore.currentPlaylistSongs.findIndex(song => song.id === currentSongId);

    if (index !== -1) {
        // 先等待下一个tick，确保Vue已完成更新
        await nextTick();

        // 短暂延时以确保scroller组件完全初始化
        setTimeout(() => {
            scroller.value.scrollToItem(index);

            // 添加"定位完成"的视觉反馈
            const currentPlaying = document.querySelector('.song-row.playing');
            if (currentPlaying) {
                currentPlaying.classList.add('highlighted');
                setTimeout(() => {
                    currentPlaying.classList.remove('highlighted');
                }, 1500);
            }
        }, 50);
    }
};

// 更新可见歌曲的封面
const onUpdate = (startIndex, endIndex) => {
    if (playlistStore.currentPlaylistSongs.length === 0) return;
    for (let i = startIndex; i <= endIndex; i++) {
        // 添加安全检查，确保在索引范围内且歌曲对象存在
        if (i >= 0 && i < playlistStore.currentPlaylistSongs.length && playlistStore.currentPlaylistSongs[i]) {
            loadSongCover(playlistStore.currentPlaylistSongs[i].id);
        }
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

// 监听歌词页面显示状态变化
watch(
    () => playerStore.showLyrics,
    (newValue) => {
        // 当歌词页面状态改变时，重新计算按钮显示状态
        if (scroller.value) {
            const scrollTop = scroller.value.$el?.scrollTop || 0;
            showFixedButtons.value = scrollTop > 0 && !newValue;
        }
    }
);

// 组件挂载时加载歌单
onMounted(() => {
    if (playlistStore.currentPlaylistId) {
        isLoading.value = true;
        playlistStore.loadPlaylistById(playlistStore.currentPlaylistId).finally(() => {
            isLoading.value = false;
        });
    }

    // 初始状态下按钮应该是隐藏的
    showFixedButtons.value = false;
});
</script>

<template>
    <div class="playlist-content">
        <!-- 歌单头部 -->
        <div class="playlist-header" v-if="currentPlaylist">
            <div class="playlist-info">
                <div class="playlist-title">{{ currentPlaylist.name }}</div>
                <div class="playlist-description" v-if="currentPlaylist.description">
                    {{ currentPlaylist.description }}
                </div>
                <div class="playlist-meta">
                    {{ playlistStore.currentPlaylistSongs.length }} 首歌曲
                </div>
            </div>
            <div class="playlist-actions">
                <button @click="playEntirePlaylist" class="action-button play-button"
                    :disabled="playlistStore.currentPlaylistSongs.length === 0">
                    <Icon name="play" :size="20" />
                    <span>播放全部</span>
                </button>
                <button @click="editPlaylist" class="action-button edit-button">
                    <Icon name="edit" :size="16" />
                    <span>编辑</span>
                </button>
                <button @click="showDeleteConfirm = true" class="action-button delete-button">
                    <Icon name="delete" :size="16" />
                    <span>删除</span>
                </button>
            </div>
        </div>

        <!-- 加载状态 -->
        <div v-if="isLoading" class="loading-state">
            <div class="loader"></div>
            <p>加载中...</p>
        </div>

        <!-- 歌单为空 -->
        <div v-else-if="playlistStore.currentPlaylistSongs.length === 0" class="empty-playlist">
            <Icon name="playlist" :size="64" />
            <p>歌单为空</p>
            <button @click="editPlaylist" class="action-button">编辑歌单</button>
        </div>

        <!-- 歌曲列表 -->
        <div v-else class="songs-container">
            <!-- 表头 -->
            <div class="song-list-header">
                <div class="header-col" style="width: 40px; flex-shrink: 0;">#</div>
                <div class="header-col" style="width: 60px; flex-shrink: 0;"></div>
                <div class="header-col" style="width: 35%;">歌曲名</div>
                <div class="header-col" style="width: 20%;">歌手</div>
                <div class="header-col" style="width: 25%;">专辑</div>
                <div class="header-col" style="width: 10%;">时长</div>
                <div class="header-col-fixed"></div>
            </div>

            <!-- 虚拟滚动列表 -->
            <RecycleScroller ref="scroller" class="song-scroller" :items="playlistStore.currentPlaylistSongs"
                :item-size="60" key-field="id" :emit-update="true" v-slot="{ item: song, index }" @update="onUpdate"
                @scroll="handleScroll">
                <div class="song-row" @dblclick="playSong(song, index)"
                    :class="{ 'playing': currentSongId === song.id }" @mouseenter="hoveredSongId = song.id"
                    @mouseleave="hoveredSongId = null" @contextmenu="handleContextMenu($event, song)">
                    <div class="song-col song-index" style="width: 40px; flex-shrink: 0;">{{ getRealIndex(song) + 1 }}</div>
                    <div class="song-col" style="width: 60px; flex-shrink: 0;">
                        <div class="song-cover-container">
                            <img :src="songCovers[song.id] || placeholderCover" alt="封面" class="song-cover" />
                            <transition name="fade">
                                <div v-if="hoveredSongId === song.id" class="play-icon-overlay"
                                    @click="playSong(song, index)">
                                    <svg viewBox="0 0 24 24" class="play-icon">
                                        <path d="M8 5v14l11-7z"></path>
                                    </svg>
                                </div>
                            </transition>
                        </div>
                    </div>
                    <div class="song-col" style="width: 35%;">{{ song.title || '未知歌曲' }}</div>
                    <div class="song-col" style="width: 20%;">{{ song.artist || '未知艺术家' }}</div>
                    <div class="song-col" style="width: 25%;">{{ song.album || '未知专辑' }}</div>
                    <div class="song-col" style="width: 10%;">{{ formatDuration(song.duration) }}</div>
                    <div class="song-col action-column">
                        <button v-show="hoveredSongId === song.id" class="remove-button"
                            @click="removeSongFromPlaylist(song.id, index, $event)" title="从歌单移除">
                            <Icon name="delete" :size="14" />
                        </button>
                    </div>
                </div>
            </RecycleScroller>

            <!-- 固定在右下角的两个图标按钮 -->
            <transition name="slide-fade">
                <div id="fixed-buttons" v-if="showFixedButtons">
                    <!-- 定位当前播放歌曲按钮 - 卡片式设计 -->
                    <div class="fixed-button locate-button" @click="scrollToCurrentSong" title="定位当前播放歌曲">
                        <svg width="24" height="24" viewBox="0 0 24 24">
                            <path fill="#FFFFFF"
                                d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z">
                            </path>
                        </svg>
                    </div>

                    <!-- 回到顶部按钮 - 卡片式设计 -->
                    <div class="fixed-button top-button" @click="scrollToTop" title="回到顶部">
                        <svg width="24" height="24" viewBox="0 0 24 24">
                            <path fill="#FFFFFF" d="M8 11h3v10h2V11h3l-4-4-4 4zM4 3v2h16V3H4z"></path>
                        </svg>
                    </div>
                </div>
            </transition>
        </div>

        <!-- 删除确认对话框 -->
        <div v-if="showDeleteConfirm" class="delete-confirm-dialog">
            <div class="dialog-content">
                <h3>删除歌单</h3>
                <p>确定要删除歌单"{{ currentPlaylist?.name }}"吗？此操作不可撤销。</p>
                <div class="dialog-buttons">
                    <button @click="showDeleteConfirm = false" class="cancel-btn">取消</button>
                    <button @click="deletePlaylist" class="delete-btn">确认删除</button>
                </div>
            </div>
        </div>

        <!-- 右键菜单组件 -->
        <ContextMenu :show="contextMenu.show" :x="contextMenu.x" :y="contextMenu.y" :song="contextMenu.song"
            @close="closeContextMenu" @action="handleMenuAction" />

        <!-- 歌曲信息对话框组件 -->
        <div v-if="songInfoDialogVisible" class="song-info-dialog">
            <div class="dialog-content">
                <h2>歌曲信息</h2>
                <div class="info-grid">
                    <div class="info-section">
                        <h3>基本信息</h3>
                        <div class="info-item">
                            <span class="info-label">标题:</span>
                            <span class="info-value">{{ currentSongForInfo.title || '未知标题' }}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">艺术家:</span>
                            <span class="info-value">{{ currentSongForInfo.artist || '未知艺术家' }}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">专辑:</span>
                            <span class="info-value">{{ currentSongForInfo.album || '未知专辑' }}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">时长:</span>
                            <span class="info-value">{{ formatDuration(currentSongForInfo.duration) }}</span>
                        </div>
                    </div>

                    <div class="info-section">
                        <h3>技术信息</h3>
                        <div class="info-item">
                            <span class="info-label">比特率:</span>
                            <span class="info-value">{{ formatBitrate(currentSongForInfo.bitrate) }}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">文件大小:</span>
                            <span class="info-value">{{ formatFileSize(currentSongForInfo.fileSize) }}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">格式:</span>
                            <span class="info-value">{{ currentSongForInfo.format || '未知格式' }}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">采样率:</span>
                            <span class="info-value">{{ formatSampleRate(currentSongForInfo.sampleRate) }}</span>
                        </div>
                    </div>
                </div>

                <div class="info-path">
                    <span class="info-label">文件路径:</span>
                    <span class="info-value path">{{ currentSongForInfo.filePath || '未知路径' }}</span>
                </div>

                <button @click="closeSongInfoDialog">关闭</button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.playlist-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    background-color: #121212;
    color: #fff;
}

.playlist-header {
    padding: 24px;
    background: linear-gradient(to bottom, #333333, #121212);
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
}

.playlist-title {
    font-size: 28px;
    font-weight: 700;
    color: #fff;
    margin-bottom: 8px;
}

.playlist-description {
    font-size: 14px;
    color: #b3b3b3;
    margin-bottom: 12px;
}

.playlist-meta {
    font-size: 13px;
    color: #b3b3b3;
}

.playlist-actions {
    display: flex;
    gap: 12px;
    align-items: center;
}

.action-button {
    display: flex;
    align-items: center;
    padding: 8px 16px;
    border-radius: 20px;
    border: none;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
}

.action-button .icon-wrapper {
    margin-right: 8px;
}

.play-button {
    background-color: #1db954;
    color: #fff;
}

.play-button:hover {
    background-color: #1ed760;
    transform: scale(1.05);
}

.edit-button {
    background-color: transparent;
    color: #fff;
    border: 1px solid #666;
}

.edit-button:hover {
    border-color: #fff;
    background-color: rgba(255, 255, 255, 0.1);
}

.delete-button {
    background-color: transparent;
    color: #ff6b6b;
    border: 1px solid #ff6b6b;
}

.delete-button:hover {
    background-color: rgba(255, 107, 107, 0.1);
}

.loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: #b3b3b3;
}

.loader {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top-color: #1db954;
    animation: spin 1s linear infinite;
    margin-bottom: 16px;
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }

    100% {
        transform: rotate(360deg);
    }
}

.empty-playlist {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: #b3b3b3;
}

.empty-playlist .icon-wrapper {
    color: #444;
    margin-bottom: 16px;
}

.empty-playlist p {
    font-size: 16px;
    margin-bottom: 24px;
}

.songs-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    height: 100%;
    position: relative;
}

.song-list-header {
    display: flex;
    align-items: center;
    background-color: #1a1a1a;
    color: #b3b3b3;
    padding: 0 10px;
    height: 40px;
    border-bottom: 1px solid #282828;
    flex-shrink: 0;
    position: sticky;
    top: 0;
    z-index: 1;
}

.header-col {
    padding: 8px;
    font-weight: 600;
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;
}

.header-col-fixed {
    flex-shrink: 0;
    padding: 0 8px;
    display: flex;
    align-items: center;
}

.song-scroller {
    height: 100%;
    width: 100%;
    overflow-y: auto;
}

.song-row {
    display: flex;
    align-items: center;
    height: 60px;
    padding: 0 10px;
    border-bottom: 1px solid #222;
    transition: background-color 0.2s;
}

.song-row:hover {
    background-color: #282828;
}

.song-row.playing {
    color: #1ed760;
    background-color: #1a2a21;
}

.song-row.playing.highlighted {
    animation: pulse 1.5s ease;
}

@keyframes pulse {
    0% {
        background-color: #1a2a21;
        box-shadow: 0 0 0 rgba(29, 185, 84, 0);
    }

    25% {
        background-color: #1e382a;
        box-shadow: 0 0 10px rgba(29, 185, 84, 0.5);
    }

    50% {
        background-color: #1a2a21;
        box-shadow: 0 0 10px rgba(29, 185, 84, 0.3);
    }

    100% {
        background-color: #1a2a21;
        box-shadow: 0 0 0 rgba(29, 185, 84, 0);
    }
}

.song-col {
    padding: 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;
}

.song-index {
    justify-content: center;
    font-weight: 500;
    color: #b3b3b3;
}

.song-cover-container {
    position: relative;
    width: 48px;
    height: 48px;
    border-radius: 4px;
    overflow: hidden;
}

.song-cover {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 4px;
    background-color: #333;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    transition: transform 0.2s ease-in-out;
}

.song-row:hover .song-cover {
    transform: scale(1.1);
}

.play-icon-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}

.play-icon {
    fill: white;
    width: 20px;
    height: 20px;
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

.remove-button {
    background: none;
    border: none;
    color: #b3b3b3;
    cursor: pointer;
    padding: 4px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
}

.remove-button:hover {
    color: #ff6b6b;
    background-color: rgba(255, 107, 107, 0.1);
}

/* 删除确认对话框 */
.delete-confirm-dialog {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.dialog-content {
    background-color: #282828;
    border-radius: 8px;
    padding: 24px;
    width: 400px;
    max-width: 90%;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.dialog-content h3 {
    margin-top: 0;
    margin-bottom: 16px;
    color: #fff;
    font-size: 18px;
}

.dialog-content p {
    margin-bottom: 24px;
    color: #b3b3b3;
    font-size: 14px;
}

.dialog-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
}

.cancel-btn,
.delete-btn {
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    border: none;
}

.cancel-btn {
    background-color: transparent;
    color: #b3b3b3;
    border: 1px solid #444;
}

.cancel-btn:hover {
    background-color: #333;
}

.delete-btn {
    background-color: #ff6b6b;
    color: #fff;
}

.delete-btn:hover {
    background-color: #ff5252;
}

/* 固定在右下角的按钮 */
#fixed-buttons {
    position: fixed;
    right: 20px;
    bottom: 110px;
    /* 留出底部播放器的空间 */
    display: flex;
    flex-direction: column;
    gap: 10px;
    z-index: 1000;
    /* 确保按钮在最上层 */
}

/* 按钮过渡动画 */
.slide-fade-enter-active {
    transition: all 0.3s ease;
}

.slide-fade-leave-active {
    transition: all 0.3s ease;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
    transform: translateY(20px);
    opacity: 0;
}

.fixed-button {
    width: 44px;
    height: 44px;
    border-radius: 8px;
    /* 从50%改为8px，实现方形卡片带圆角 */
    background-color: #333333;
    /* 改为深色背景色，符合卡片式设计 */
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    /* 调整阴影效果 */
    transition: transform 0.2s, background-color 0.2s;
    user-select: none;
}

.fixed-button:hover {
    transform: scale(1.05);
    /* 略微调小放大效果 */
    background-color: #505050;
    /* 悬停时变为较亮的灰色 */
}

.fixed-button:active {
    transform: scale(0.95);
}

/* 歌曲信息对话框样式 */
.song-info-dialog {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1100;
    animation: fadeIn 0.2s ease-out;
}

.song-info-dialog .dialog-content {
    background-color: #1a1a1a;
    padding: 24px;
    border-radius: 8px;
    width: 90%;
    max-width: 500px;
    border: 1px solid #333;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
}

.song-info-dialog h2 {
    margin-top: 0;
    margin-bottom: 20px;
    color: #1DB954;
    border-bottom: 1px solid #333;
    padding-bottom: 10px;
}

.song-info-dialog h3 {
    font-size: 16px;
    margin: 10px 0;
    color: #b3b3b3;
}

.info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
}

.info-section {
    padding: 10px;
    background-color: #222;
    border-radius: 4px;
}

.info-item {
    margin: 8px 0;
    display: flex;
    align-items: flex-start;
}

.info-label {
    color: #b3b3b3;
    width: 70px;
    flex-shrink: 0;
}

.info-value {
    color: #fff;
    word-break: break-word;
}

.info-path {
    margin-top: 16px;
    padding: 10px;
    background-color: #222;
    border-radius: 4px;
    display: flex;
}

.info-path .info-label {
    width: 70px;
    flex-shrink: 0;
}

.info-path .path {
    overflow-wrap: break-word;
    word-break: break-all;
}

.song-info-dialog button {
    background-color: #1DB954;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 4px;
    cursor: pointer;
    margin-top: 20px;
    font-weight: bold;
    width: 100%;
    transition: background-color 0.2s;
}

.song-info-dialog button:hover {
    background-color: #1ED760;
}

@keyframes fadeIn {
    from {
        opacity: 0;
    }

    to {
        opacity: 1;
    }
}
</style>