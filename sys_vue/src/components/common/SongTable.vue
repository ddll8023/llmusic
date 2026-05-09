<script setup>
import { ref, computed, reactive, nextTick, onMounted, watch } from 'vue';
import { RecycleScroller } from 'vue-virtual-scroller';
import { usePlayerStore } from '../../store/player';
import ContextMenu from './ContextMenu.vue';
import FAIcon from './FAIcon.vue';
import CustomButton from '../custom/CustomButton.vue';
import { formatDuration } from '../../utils/timeUtils';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';

// Props 定义
const props = defineProps({
    // 歌曲数据
    songs: {
        type: Array,
        default: () => []
    },
    // 加载状态
    loading: {
        type: Boolean,
        default: false
    },
    // 是否显示排序功能
    showSortable: {
        type: Boolean,
        default: false
    },
    // 是否显示播放次数列
    showPlayCount: {
        type: Boolean,
        default: false
    },
    // 是否显示操作列
    showActionColumn: {
        type: Boolean,
        default: false
    },
    // 操作列内容类型
    actionColumnType: {
        type: String,
        default: 'none', // 'edit', 'metadata', 'remove', 'none'
        validator: (value) => ['edit', 'metadata', 'remove', 'none'].includes(value)
    },
    // 是否显示选择框
    showSelection: {
        type: Boolean,
        default: false
    },
    // 选中的歌曲ID数组
    selectedSongIds: {
        type: Array,
        default: () => []
    },
    // 右键菜单类型
    contextMenuType: {
        type: String,
        default: 'main', // 'main', 'playlist', 'metadata'
        validator: (value) => ['main', 'playlist', 'metadata'].includes(value)
    },
    // 当前列表ID（用于播放队列）
    currentListId: {
        type: String,
        default: 'default'
    },
    // 空状态文本
    emptyText: {
        type: String,
        default: '暂无歌曲'
    },
    // 空状态图标
    emptyIcon: {
        type: String,
        default: 'music'
    },
    // 表格高度（用于固定按钮定位）
    containerHeight: {
        type: String,
        default: '100%'
    },
    // 外部封面缓存（用于MetadataManager等独立场景）
    externalCoverCache: {
        type: Object,
        default: null
    }
});

// Events 定义
const emit = defineEmits([
    'play-song',
    'sort-change',
    'action-click',
    'context-menu-action',
    'scroll',
    'song-info',
    'selection-change'
]);

const playerStore = usePlayerStore();

// 内部状态
const hoveredSongId = ref(null);
const scroller = ref(null);
const showFixedButtons = ref(false);
const placeholderCover = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

// 歌曲封面缓存
const songCovers = reactive({});

// 排序状态
const sortBy = ref('default');
const sortDirection = ref('asc');

// 右键菜单状态
const contextMenu = reactive({
    show: false,
    x: 0,
    y: 0,
    song: null
});

// 歌曲信息对话框状态
const songInfoDialogVisible = ref(false);
const currentSongForInfo = ref(null);

// 计算属性
const currentSongId = computed(() => playerStore.currentSong?.id || null);
const isPlaying = computed(() => playerStore.playing);

// 歌曲索引映射
const songIndexMap = computed(() => {
    const map = new Map();
    props.songs.forEach((song, index) => {
        map.set(song.id, index);
    });
    return map;
});

// 获取歌曲真实索引
const getRealIndex = (song) => {
    const index = songIndexMap.value.get(song.id);
    return index !== undefined ? index : -1;
};

// 表头配置
const tableHeaders = computed(() => {
    const headers = [];

    // 添加选择框列
    if (props.showSelection) {
        headers.push({
            key: 'selection',
            label: '',
            width: '40px',
            sortable: false
        });
    }

    headers.push(
        { key: 'index', label: '#', width: '40px', sortable: false },
        { key: 'cover', label: '', width: '60px', sortable: false },
        { key: 'title', label: '歌曲名', width: props.showPlayCount ? '30%' : '35%', sortable: props.showSortable },
        { key: 'artist', label: '歌手', width: props.showPlayCount ? '15%' : '20%', sortable: props.showSortable },
        { key: 'album', label: '专辑', width: props.showPlayCount ? '20%' : '25%', sortable: props.showSortable }
    );

    // 添加播放次数列
    if (props.showPlayCount) {
        headers.push({
            key: 'playCount',
            label: '播放次数',
            width: '10%',
            sortable: props.showSortable
        });
    }

    // 添加时长列
    headers.push({
        key: 'duration',
        label: '时长',
        width: '10%',
        sortable: props.showSortable
    });

    return headers;
});


// 获取歌曲封面URL
const getSongCoverUrl = (song) => {
    // 如果提供了外部封面缓存，优先使用
    if (props.externalCoverCache && props.externalCoverCache[song.id]) {
        return props.externalCoverCache[song.id];
    }
    // 否则使用内部缓存
    return songCovers[song.id] || placeholderCover;
};

// 封面加载
const loadSongCover = async (songId) => {
    if (!songId || songCovers[songId]) return;

    // 如果使用外部封面缓存，跳过内部封面加载
    if (props.externalCoverCache) return;

    try {
        const result = await window.electronAPI.getSongCover(songId);
        if (result.success && result.cover) {
            const imageFormat = result.format || 'image/jpeg';
            songCovers[songId] = `data:${imageFormat};base64,${result.cover}`;
        }
    } catch (error) {
        console.error('加载封面失败:', error);
    }
};

// 事件处理
const handleSongPlay = (song) => {
    emit('play-song', {
        song,
        listId: props.currentListId,
        songIds: props.songs.map(s => s.id)
    });
};

const handleSort = (field) => {
    if (!props.showSortable) return;

    if (sortBy.value === field) {
        sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
    } else {
        sortBy.value = field;
        sortDirection.value = 'asc';
    }

    emit('sort-change', {
        sortBy: sortBy.value,
        sortDirection: sortDirection.value
    });
};

const handleActionClick = (action, song, event) => {
    if (event) {
        event.stopPropagation();
    }
    emit('action-click', { action, song });
};

// 选择处理
const handleSongSelection = (song, event) => {
    if (event) {
        event.stopPropagation();
    }

    const isSelected = props.selectedSongIds.includes(song.id);
    const newSelectedIds = isSelected
        ? props.selectedSongIds.filter(id => id !== song.id)
        : [...props.selectedSongIds, song.id];

    emit('selection-change', {
        song,
        selected: !isSelected,
        selectedIds: newSelectedIds
    });
};

const handleContextMenu = (event, song) => {
    event.preventDefault();
    contextMenu.show = true;
    contextMenu.x = event.clientX;
    contextMenu.y = event.clientY;
    contextMenu.song = song;
};

const closeContextMenu = () => {
    contextMenu.show = false;
};

const handleMenuAction = (actionData) => {
    if (actionData.action === 'song-info') {
        showSongInfoDialog(actionData.song);
    } else {
        emit('context-menu-action', actionData);
    }
};

const showSongInfoDialog = (song) => {
    currentSongForInfo.value = song;
    songInfoDialogVisible.value = true;
    emit('song-info', song);
};

const closeSongInfoDialog = () => {
    songInfoDialogVisible.value = false;
};

// 滚动处理
const handleScroll = (event) => {
    const scrollTop = event?.target?.scrollTop || 0;
    showFixedButtons.value = scrollTop > 0 && !playerStore.showLyrics;
    emit('scroll', event);
};

const scrollToTop = async () => {
    if (!scroller.value || props.songs.length === 0) return;

    await nextTick();
    setTimeout(() => {
        scroller.value.scrollToItem(0);
    }, 50);
};

const scrollToCurrentSong = async () => {
    if (!playerStore.currentSong || !scroller.value) return;

    const currentSongId = playerStore.currentSong.id;
    const index = props.songs.findIndex(song => song.id === currentSongId);

    if (index !== -1) {
        await nextTick();
        setTimeout(() => {
            scroller.value.scrollToItem(index);

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

// 虚拟滚动更新
const onUpdate = (startIndex, endIndex) => {
    if (props.songs.length === 0) return;
    for (let i = startIndex; i <= endIndex; i++) {
        if (i >= 0 && i < props.songs.length && props.songs[i]) {
            loadSongCover(props.songs[i].id);
        }
    }
};

// 监听歌词页面状态变化
watch(
    () => playerStore.showLyrics,
    (newValue) => {
        if (scroller.value) {
            const scrollTop = scroller.value.$el?.scrollTop || 0;
            showFixedButtons.value = scrollTop > 0 && !newValue;
        }
    }
);

// 组件挂载
onMounted(() => {
    showFixedButtons.value = false;
});

// 暴露方法给父组件
defineExpose({
    scrollToTop,
    scrollToCurrentSong,
    scrollToItem: (index) => {
        if (scroller.value) {
            scroller.value.scrollToItem(index);
        }
    }
});
</script>

<template>
    <div class="song-table" :style="{ height: containerHeight }">
        <!-- 加载状态 -->
        <div v-if="loading" class="loading-state">
            <div class="loader"></div>
            <p>加载中...</p>
        </div>

        <!-- 空状态 -->
        <div v-else-if="songs.length === 0" class="empty-state">
            <FAIcon :name="emptyIcon" size="xl" color="secondary" />
            <p>{{ emptyText }}</p>
        </div>

        <!-- 歌曲表格 -->
        <div v-else class="table-container">
            <!-- 表头 -->
            <div class="song-list-header">
                <div v-for="header in tableHeaders" :key="header.key" class="header-col"
                    :class="{ sortable: header.sortable }"
                    :style="{ width: header.width, flexShrink: header.key === 'index' || header.key === 'cover' ? 0 : undefined }"
                    @click="header.sortable ? handleSort(header.key) : null">
                    {{ header.label }}
                    <span v-if="header.sortable && sortBy === header.key" class="sort-icon">
                        {{ sortDirection === 'asc' ? '↑' : '↓' }}
                    </span>
                </div>
                <div v-if="showActionColumn" class="header-col-fixed"></div>
            </div>

            <!-- 虚拟滚动列表 -->
            <RecycleScroller ref="scroller" class="song-scroller" :items="songs" :item-size="60" key-field="id"
                :emit-update="true" v-slot="{ item: song, index }" @update="onUpdate" @scroll="handleScroll">
                <div class="song-row" @dblclick="handleSongPlay(song)"
                    :class="{ 'playing': currentSongId === song.id, 'selected': showSelection && selectedSongIds.includes(song.id) }"
                    @mouseenter="hoveredSongId = song.id" @mouseleave="hoveredSongId = null"
                    @contextmenu="handleContextMenu($event, song)" :data-song-id="song.id">

                    <!-- 选择框 -->
                    <div v-if="showSelection" class="song-col selection-col" style="width: 40px; flex-shrink: 0;">
                        <input type="checkbox" :checked="selectedSongIds.includes(song.id)"
                            @change="handleSongSelection(song, $event)" class="song-checkbox" />
                    </div>

                    <!-- 序号 -->
                    <div class="song-col song-index" style="width: 40px; flex-shrink: 0;">
                        {{ getRealIndex(song) + 1 }}
                    </div>

                    <!-- 封面 -->
                    <div class="song-col" style="width: 60px; flex-shrink: 0;">
                        <div class="song-cover-container">
                            <img :src="getSongCoverUrl(song)" alt="封面" class="song-cover" />
                            <transition name="fade">
                                <div v-if="hoveredSongId === song.id" class="play-icon-overlay"
                                    @click="handleSongPlay(song)">
                                    <svg viewBox="0 0 24 24" class="play-icon">
                                        <path d="M8 5v14l11-7z"></path>
                                    </svg>
                                </div>
                            </transition>
                        </div>
                    </div>

                    <!-- 歌曲名 -->
                    <div class="song-col" :style="{ width: showPlayCount ? '30%' : '35%' }">
                        {{ song.title || '未知歌曲' }}
                    </div>

                    <!-- 歌手 -->
                    <div class="song-col" :style="{ width: showPlayCount ? '15%' : '20%' }">
                        {{ song.artist || '未知艺术家' }}
                    </div>

                    <!-- 专辑 -->
                    <div class="song-col" :style="{ width: showPlayCount ? '20%' : '25%' }">
                        {{ song.album || '未知专辑' }}
                    </div>

                    <!-- 播放次数 -->
                    <div v-if="showPlayCount" class="song-col" style="width: 10%;">
                        {{ song.playCount || 0 }}
                    </div>

                    <!-- 时长 -->
                    <div class="song-col" style="width: 10%;">
                        {{ formatDuration(song.duration) }}
                    </div>

                    <!-- 操作列 -->
                    <div v-if="showActionColumn" class="song-col action-column">
                        <template v-if="actionColumnType === 'metadata'">
                            <CustomButton type="icon-only" icon="edit" size="small" :circle="true" title="编辑元数据"
                                @click="handleActionClick('edit', song, $event)" />
                            <CustomButton type="icon-only" icon="search" size="small" :circle="true" title="搜索在线元数据"
                                @click="handleActionClick('search-online', song, $event)" />
                        </template>
                    </div>
                </div>
            </RecycleScroller>

            <!-- 固定按钮 -->
            <transition name="slide-fade">
                <div v-if="showFixedButtons" class="fixed-buttons">
                    <div class="fixed-button locate-button" @click="scrollToCurrentSong" title="定位当前播放歌曲">
                        <svg width="24" height="24" viewBox="0 0 24 24">
                            <path fill="#FFFFFF"
                                d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z">
                            </path>
                        </svg>
                    </div>

                    <div class="fixed-button top-button" @click="scrollToTop" title="回到顶部">
                        <svg width="24" height="24" viewBox="0 0 24 24">
                            <path fill="#FFFFFF" d="M8 11h3v10h2V11h3l-4-4-4 4zM4 3v2h16V3H4z"></path>
                        </svg>
                    </div>
                </div>
            </transition>
        </div>

        <!-- 右键菜单 -->
        <ContextMenu :show="contextMenu.show" :x="contextMenu.x" :y="contextMenu.y" :song="contextMenu.song"
            :menu-type="contextMenuType" @close="closeContextMenu" @action="handleMenuAction" />

        <!-- 歌曲信息对话框 -->
        <div v-if="songInfoDialogVisible" class="song-info-dialog fade-in">
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
                        <div v-if="showPlayCount" class="info-item">
                            <span class="info-label">播放次数:</span>
                            <span class="info-value">{{ currentSongForInfo.playCount || 0 }}</span>
                        </div>
                    </div>

                    <div class="info-section">
                        <h3>技术信息</h3>
                        <div class="info-item">
                            <span class="info-label">比特率:</span>
                            <span class="info-value">{{ currentSongForInfo.bitrate ? `${(currentSongForInfo.bitrate /
                                1000).toFixed(1)} kbps` : '未知' }}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">文件大小:</span>
                            <span class="info-value">{{
                                currentSongForInfo.fileSize
                                    ? currentSongForInfo.fileSize >= 1024 * 1024
                                        ? `${(currentSongForInfo.fileSize / (1024 * 1024)).toFixed(2)} MB`
                                        : currentSongForInfo.fileSize >= 1024
                                            ? `${(currentSongForInfo.fileSize / 1024).toFixed(1)} KB`
                                            : `${currentSongForInfo.fileSize} B`
                                    : '未知'
                            }}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">格式:</span>
                            <span class="info-value">{{ currentSongForInfo.format || '未知格式' }}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">采样率:</span>
                            <span class="info-value">{{ currentSongForInfo.sampleRate ? `${currentSongForInfo.sampleRate
                                / 1000}
                                kHz` : '未知' }}</span>
                        </div>
                    </div>
                </div>

                <div class="info-path">
                    <span class="info-label">文件路径:</span>
                    <span class="info-value path">{{ currentSongForInfo.filePath || '未知路径' }}</span>
                </div>

                <CustomButton type="primary" @click="closeSongInfoDialog">关闭</CustomButton>
            </div>
        </div>
    </div>
</template>

<style scoped>
.song-table {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    background-color: #121212;
    color: #ffffff;
}
/* comment */
.loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: #b3b3b3;
    padding: (16px * 2);

    @media (max-width: 768px) {
        padding: 16px;
    }
}

.loader {
    width: 40px;
    height: 40px;
    border: 3px solid #282828;
    border-radius: 50%;
    border-top-color: #4caf50;
    animation: spin 1s linear infinite;
    margin-bottom: 16px;

    @media (max-width: 768px) {
        width: 32px;
        height: 32px;
        border-width: 2px;
        margin-bottom: (16px * 0.75);
    }
}
/* comment */
.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: #b3b3b3;
    padding: (16px * 2);

    .icon-wrapper {
        color: #535353;
        margin-bottom: 16px;
        opacity: 0.6;
    }

    p {
        font-size: 18px;
        margin-bottom: (16px * 1.5);
        font-weight: 500;

        @media (max-width: 768px) {
            font-size: 14px;
            margin-bottom: 16px;
        }
    }

    @media (max-width: 768px) {
        padding: 16px;
    }
}
/* comment */
.table-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    height: calc(100% - 40px);
    min-height: 0;
    position: relative;
    overflow: hidden;
}

.song-list-header {
    display: flex;
    align-items: center;
    background-color: #181818;
    color: #b3b3b3;
    padding: 0 (16px * 0.625);
    height: 40px;
    border-bottom: 1px solid #282828;
    flex-shrink: 0;
    position: sticky;
    top: 0;
    z-index: 1;

    @media (max-width: 768px) {
        height: 36px;
        padding: 0 (16px * 0.5);
    }
}

.header-col {
    padding: (16px * 0.5);
    font-weight: 550;
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;

    &.sortable {
        cursor: pointer;
        transition: color 0.25s cubic-bezier(0.4, 0, 0.2, 1);

        &:hover {
            color: #ffffff;
        }
    }

    @media (max-width: 768px) {
        font-size: 12px;
        padding: (16px * 0.375);
    }
}

.header-col-fixed {
    flex-shrink: 0;
    padding: 0 (16px * 0.5);
    display: flex;
    align-items: center;

    @media (max-width: 768px) {
        padding: 0 (16px * 0.375);
    }
}

.sort-icon {
    margin-left: (16px * 0.3125);
}
/* comment */
.song-scroller {
    flex: 1;
    min-height: 0;
    width: 100%;
    overflow-y: auto;

    &::-webkit-scrollbar {
        width: 8px;
    }

    &::-webkit-scrollbar-track {
        background: #121212;
    }

    &::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.2);
        border-radius: (4px);
        transition: background-color 0.25s cubic-bezier(0.4, 0, 0.2, 1);

        &:hover {
            background: rgba(255,255,255,0.1);
        }
    }

    @media (max-width: 768px) {
        &::-webkit-scrollbar {
            width: 6px;
        }
    }
}
/* comment */
.song-row {
    display: flex;
    align-items: center;
    height: 60px;
    padding: 0 (16px * 0.625);
    border-bottom: 1px solid #121212;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: pointer;

    &:hover {
        background-color: rgba(255,255,255,0.1);

        .song-cover {
            transform: scale(1.1);
        }
    }

    &:active {
        background-color: rgba(255,255,255,0.2);
        transform: scale(0.98);
    }

    &.playing {
        color: #4caf50;
        background-color: rgba(#4caf50, 0.1);
        border-left: 3px solid #4caf50;
        padding-left: calc(#{16px * 0.625} - 3px);

        .song-index {
            color: #4caf50;
            font-weight: 550;
        }

        &.highlighted {
            animation: playingPulse 1.5s ease;
        }
    }

    @media (max-width: 768px) {
        height: 52px;
        padding: 0 (16px * 0.5);

        &.playing {
            padding-left: calc(#{16px * 0.5} - 3px);
        }
    }
}


.song-col {
    padding: (16px * 0.5);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;

    @media (max-width: 768px) {
        padding: (16px * 0.375);
    }
}

.song-index {
    justify-content: center;
    font-weight: 500;
    color: #b3b3b3;
    font-size: 12px;

    @media (max-width: 768px) {
        font-size: 10px;
    }
}
/* comment */
.song-cover-container {
    position: relative;
    width: 48px;
    height: 48px;
    border-radius: 4px;
    overflow: hidden;
    flex-shrink: 0;

    @media (max-width: 768px) {
        width: 40px;
        height: 40px;
    }
}

.song-cover {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 4px;
    background-color: #282828;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.play-icon-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 4px;
}

.play-icon {
    fill: #ffffff;
    width: 20px;
    height: 20px;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));

    @media (max-width: 768px) {
        width: 16px;
        height: 16px;
    }
}
/* comment */
.action-column {
    flex-shrink: 0;
    justify-content: center;
    gap: 2px;

    @media (max-width: 768px) {
        gap: 1px;
    }
}
/* comment */
.selection-col {
    justify-content: center;
}

.song-checkbox {
    width: 16px;
    height: 16px;
    border-radius: 3px;
    border: 2px solid #b3b3b3;
    background-color: transparent;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);

    &:checked {
        background-color: #4caf50;
        border-color: #4caf50;
    }

    &:hover {
        border-color: #4caf50;
    }
}
/* comment */
.song-row.selected {
    background-color: rgba(#4caf50, 0.05);
    border-left: 2px solid #4caf50;
    padding-left: calc(#{16px * 0.625} - 2px);

    @media (max-width: 768px) {
        padding-left: calc(#{16px * 0.5} - 2px);
    }
}
/* comment */
.fixed-buttons {
    position: fixed;
    right: (16px * 1.25);
    bottom: 110px;
    display: flex;
    flex-direction: column;
    gap: (16px * 0.625);
    z-index: 100;

    @media (max-width: 768px) {
        right: 16px;
        bottom: 100px;
        gap: (16px * 0.5);
    }
}


.fixed-button {
    width: 44px;
    height: 44px;
    border-radius: 4px;
    background-color: #282828;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15)-hover;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    user-select: none;
    border: 1px solid #282828;

    &:hover {
        transform: scale(1.05);
        background-color: #282828-hover;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    &:active {
        transform: scale(0.95);
    }

    svg {
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
    }

    @media (max-width: 768px) {
        width: 40px;
        height: 40px;

        svg {
            width: 20px;
            height: 20px;
        }
    }
}
/* comment */
.song-info-dialog {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 300;

    .dialog-content {
        background-color: #181818;
        padding: (16px * 1.5);
        border-radius: (4px * 2);
        width: 90%;
        max-width: 500px;
        border: 1px solid #282828;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
        max-height: 80vh;
        overflow-y: auto;

        &::-webkit-scrollbar {
            width: 6px;
        }

        &::-webkit-scrollbar-track {
            background: #121212;
        }

        &::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,0.2);
            border-radius: (4px * 0.5);
        }

        @media (max-width: 768px) {
            padding: 16px;
            max-height: 90vh;
        }
    }

    h2 {
        margin-top: 0;
        margin-bottom: (16px * 1.25);
        color: #4caf50;
        border-bottom: 1px solid #282828;
        padding-bottom: (16px * 0.625);
        font-size: 18px;
        font-weight: 550;

        @media (max-width: 768px) {
            font-size: 14px;
            margin-bottom: 16px;
        }
    }

    h3 {
        font-size: 14px;
        margin: (16px * 0.625) 0;
        color: #b3b3b3;
        font-weight: 500;

        @media (max-width: 768px) {
            font-size: 12px;
            margin: (16px * 0.5) 0;
        }
    }

    .custom-button {
        margin-top: (16px * 1.25);
        width: 100%;

        @media (max-width: 768px) {
            margin-top: 16px;
        }
    }
}

.info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: (16px * 0.625);
    margin-bottom: 16px;

    @media (max-width: 768px) {
        grid-template-columns: 1fr;
        gap: (16px * 0.5);
    }
}

.info-section {
    padding: (16px * 0.625);
    background-color: #121212;
    border-radius: 4px;
    border: 1px solid #282828;

    @media (max-width: 768px) {
        padding: (16px * 0.5);
    }
}

.info-item {
    margin: (16px * 0.5) 0;
    display: flex;
    align-items: flex-start;
    gap: (16px * 0.5);

    @media (max-width: 768px) {
        margin: (16px * 0.375) 0;
        gap: (16px * 0.375);
    }
}

.info-label {
    color: #b3b3b3;
    width: 70px;
    flex-shrink: 0;
    font-weight: 500;
    font-size: 12px;

    @media (max-width: 768px) {
        width: 60px;
        font-size: 10px;
    }
}

.info-value {
    color: #ffffff;
    word-break: break-word;
    font-size: 12px;
    line-height: 1.4;

    &.path {
        font-family: 'Courier New', monospace;
        font-size: (12px * 0.9);
        background-color: #282828;
        padding: (16px * 0.25) (16px * 0.5);
        border-radius: (4px * 0.5);
        overflow-wrap: break-word;
        word-break: break-all;
    }

    @media (max-width: 768px) {
        font-size: 10px;

        &.path {
            font-size: (10px * 0.9);
            padding: (16px * 0.125) (16px * 0.25);
        }
    }
}

.info-path {
    margin-top: 16px;
    padding: (16px * 0.625);
    background-color: #121212;
    border-radius: 4px;
    display: flex;
    gap: (16px * 0.5);
    border: 1px solid #282828;

    .info-label {
        width: 70px;
        flex-shrink: 0;
    }

    @media (max-width: 768px) {
        padding: (16px * 0.5);
        gap: (16px * 0.375);

        .info-label {
            width: 60px;
        }
    }
}
</style>