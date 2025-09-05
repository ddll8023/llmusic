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
        default: 'none', // 'edit', 'metadata', 'none'
        validator: (value) => ['edit', 'metadata', 'none'].includes(value)
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


// 封面加载
const loadSongCover = async (songId) => {
    if (!songId || songCovers[songId]) return;

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
                            <img :src="songCovers[song.id] || placeholderCover" alt="封面" class="song-cover" />
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

<style lang="scss" scoped>
.song-table {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    background-color: $bg-primary;
    color: $text-primary;
}

// 加载状态
.loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: $text-secondary;
    padding: ($content-padding * 2);

    @include respond-to("sm") {
        padding: $content-padding;
    }
}

.loader {
    width: 40px;
    height: 40px;
    border: 3px solid $bg-tertiary;
    border-radius: 50%;
    border-top-color: $accent-green;
    animation: spin 1s linear infinite;
    margin-bottom: $content-padding;

    @include respond-to("sm") {
        width: 32px;
        height: 32px;
        border-width: 2px;
        margin-bottom: ($content-padding * 0.75);
    }
}


// 空状态
.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: $text-secondary;
    padding: ($content-padding * 2);

    .icon-wrapper {
        color: $text-disabled;
        margin-bottom: $content-padding;
        opacity: 0.6;
    }

    p {
        font-size: $font-size-lg;
        margin-bottom: ($content-padding * 1.5);
        font-weight: $font-weight-medium;

        @include respond-to("sm") {
            font-size: $font-size-base;
            margin-bottom: $content-padding;
        }
    }

    @include respond-to("sm") {
        padding: $content-padding;
    }
}

// 表格容器
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
    background-color: $bg-secondary;
    color: $text-secondary;
    padding: 0 ($content-padding * 0.625);
    height: 40px;
    border-bottom: 1px solid $bg-tertiary;
    flex-shrink: 0;
    position: sticky;
    top: 0;
    z-index: $z-base;

    @include respond-to("sm") {
        height: 36px;
        padding: 0 ($content-padding * 0.5);
    }
}

.header-col {
    padding: ($content-padding * 0.5);
    font-weight: $font-weight-semibold;
    font-size: $font-size-base;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;

    &.sortable {
        cursor: pointer;
        transition: color $transition-base;

        &:hover {
            color: $text-primary;
        }
    }

    @include respond-to("sm") {
        font-size: $font-size-sm;
        padding: ($content-padding * 0.375);
    }
}

.header-col-fixed {
    flex-shrink: 0;
    padding: 0 ($content-padding * 0.5);
    display: flex;
    align-items: center;

    @include respond-to("sm") {
        padding: 0 ($content-padding * 0.375);
    }
}

.sort-icon {
    margin-left: ($content-padding * 0.3125);
}

// 虚拟滚动器
.song-scroller {
    flex: 1;
    min-height: 0;
    width: 100%;
    overflow-y: auto;

    &::-webkit-scrollbar {
        width: 8px;
    }

    &::-webkit-scrollbar-track {
        background: $bg-primary;
    }

    &::-webkit-scrollbar-thumb {
        background: $overlay-medium;
        border-radius: ($border-radius);
        transition: background-color $transition-base;

        &:hover {
            background: $overlay-light;
        }
    }

    @include respond-to("sm") {
        &::-webkit-scrollbar {
            width: 6px;
        }
    }
}

// 歌曲行
.song-row {
    display: flex;
    align-items: center;
    height: 60px;
    padding: 0 ($content-padding * 0.625);
    border-bottom: 1px solid $bg-primary;
    transition: all $transition-base;
    cursor: pointer;

    &:hover {
        background-color: $overlay-light;

        .song-cover {
            transform: scale(1.1);
        }
    }

    &:active {
        background-color: $overlay-medium;
        transform: scale(0.98);
    }

    &.playing {
        color: $accent-green;
        background-color: rgba($accent-green, 0.1);
        border-left: 3px solid $accent-green;
        padding-left: calc(#{$content-padding * 0.625} - 3px);

        .song-index {
            color: $accent-green;
            font-weight: $font-weight-semibold;
        }

        &.highlighted {
            animation: playingPulse 1.5s ease;
        }
    }

    @include respond-to("sm") {
        height: 52px;
        padding: 0 ($content-padding * 0.5);

        &.playing {
            padding-left: calc(#{$content-padding * 0.5} - 3px);
        }
    }
}


.song-col {
    padding: ($content-padding * 0.5);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;

    @include respond-to("sm") {
        padding: ($content-padding * 0.375);
    }
}

.song-index {
    justify-content: center;
    font-weight: $font-weight-medium;
    color: $text-secondary;
    font-size: $font-size-sm;

    @include respond-to("sm") {
        font-size: $font-size-xs;
    }
}

// 歌曲封面
.song-cover-container {
    position: relative;
    width: 48px;
    height: 48px;
    border-radius: $border-radius;
    overflow: hidden;
    flex-shrink: 0;

    @include respond-to("sm") {
        width: 40px;
        height: 40px;
    }
}

.song-cover {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: $border-radius;
    background-color: $bg-tertiary;
    box-shadow: $box-shadow;
    transition: transform $transition-base;
}

.play-icon-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: $overlay-dark;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: $border-radius;
}

.play-icon {
    fill: $text-primary;
    width: 20px;
    height: 20px;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));

    @include respond-to("sm") {
        width: 16px;
        height: 16px;
    }
}

// 操作按钮
.action-column {
    flex-shrink: 0;
    justify-content: center;
    gap: 2px;

    @include respond-to("sm") {
        gap: 1px;
    }
}

// 选择相关样式
.selection-col {
    justify-content: center;
}

.song-checkbox {
    width: 16px;
    height: 16px;
    border-radius: 3px;
    border: 2px solid $text-secondary;
    background-color: transparent;
    cursor: pointer;
    transition: all $transition-base;

    &:checked {
        background-color: $accent-green;
        border-color: $accent-green;
    }

    &:hover {
        border-color: $accent-green;
    }
}

// 选中行样式
.song-row.selected {
    background-color: rgba($accent-green, 0.05);
    border-left: 2px solid $accent-green;
    padding-left: calc(#{$content-padding * 0.625} - 2px);

    @include respond-to("sm") {
        padding-left: calc(#{$content-padding * 0.5} - 2px);
    }
}

// 固定按钮
.fixed-buttons {
    position: fixed;
    right: ($content-padding * 1.25);
    bottom: 110px;
    display: flex;
    flex-direction: column;
    gap: ($content-padding * 0.625);
    z-index: $z-modal;

    @include respond-to("sm") {
        right: $content-padding;
        bottom: 100px;
        gap: ($content-padding * 0.5);
    }
}


.fixed-button {
    width: 44px;
    height: 44px;
    border-radius: $border-radius;
    background-color: $bg-tertiary;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: $box-shadow-hover;
    transition: all $transition-base;
    user-select: none;
    border: 1px solid $bg-tertiary;

    &:hover {
        transform: scale(1.05);
        background-color: $bg-tertiary-hover;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    &:active {
        transform: scale(0.95);
    }

    svg {
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
    }

    @include respond-to("sm") {
        width: 40px;
        height: 40px;

        svg {
            width: 20px;
            height: 20px;
        }
    }
}

// 歌曲信息对话框
.song-info-dialog {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: $overlay-dark;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: $z-tooltip;

    .dialog-content {
        background-color: $bg-secondary;
        padding: ($content-padding * 1.5);
        border-radius: ($border-radius * 2);
        width: 90%;
        max-width: 500px;
        border: 1px solid $bg-tertiary;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
        max-height: 80vh;
        overflow-y: auto;

        &::-webkit-scrollbar {
            width: 6px;
        }

        &::-webkit-scrollbar-track {
            background: $bg-primary;
        }

        &::-webkit-scrollbar-thumb {
            background: $overlay-medium;
            border-radius: ($border-radius * 0.5);
        }

        @include respond-to("sm") {
            padding: $content-padding;
            max-height: 90vh;
        }
    }

    h2 {
        margin-top: 0;
        margin-bottom: ($content-padding * 1.25);
        color: $accent-green;
        border-bottom: 1px solid $bg-tertiary;
        padding-bottom: ($content-padding * 0.625);
        font-size: $font-size-lg;
        font-weight: $font-weight-semibold;

        @include respond-to("sm") {
            font-size: $font-size-base;
            margin-bottom: $content-padding;
        }
    }

    h3 {
        font-size: $font-size-base;
        margin: ($content-padding * 0.625) 0;
        color: $text-secondary;
        font-weight: $font-weight-medium;

        @include respond-to("sm") {
            font-size: $font-size-sm;
            margin: ($content-padding * 0.5) 0;
        }
    }

    .custom-button {
        margin-top: ($content-padding * 1.25);
        width: 100%;

        @include respond-to("sm") {
            margin-top: $content-padding;
        }
    }
}

.info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: ($content-padding * 0.625);
    margin-bottom: $content-padding;

    @include respond-to("sm") {
        grid-template-columns: 1fr;
        gap: ($content-padding * 0.5);
    }
}

.info-section {
    padding: ($content-padding * 0.625);
    background-color: $bg-primary;
    border-radius: $border-radius;
    border: 1px solid $bg-tertiary;

    @include respond-to("sm") {
        padding: ($content-padding * 0.5);
    }
}

.info-item {
    margin: ($content-padding * 0.5) 0;
    display: flex;
    align-items: flex-start;
    gap: ($content-padding * 0.5);

    @include respond-to("sm") {
        margin: ($content-padding * 0.375) 0;
        gap: ($content-padding * 0.375);
    }
}

.info-label {
    color: $text-secondary;
    width: 70px;
    flex-shrink: 0;
    font-weight: $font-weight-medium;
    font-size: $font-size-sm;

    @include respond-to("sm") {
        width: 60px;
        font-size: $font-size-xs;
    }
}

.info-value {
    color: $text-primary;
    word-break: break-word;
    font-size: $font-size-sm;
    line-height: 1.4;

    &.path {
        font-family: 'Courier New', monospace;
        font-size: ($font-size-sm * 0.9);
        background-color: $bg-tertiary;
        padding: ($content-padding * 0.25) ($content-padding * 0.5);
        border-radius: ($border-radius * 0.5);
        overflow-wrap: break-word;
        word-break: break-all;
    }

    @include respond-to("sm") {
        font-size: $font-size-xs;

        &.path {
            font-size: ($font-size-xs * 0.9);
            padding: ($content-padding * 0.125) ($content-padding * 0.25);
        }
    }
}

.info-path {
    margin-top: $content-padding;
    padding: ($content-padding * 0.625);
    background-color: $bg-primary;
    border-radius: $border-radius;
    display: flex;
    gap: ($content-padding * 0.5);
    border: 1px solid $bg-tertiary;

    .info-label {
        width: 70px;
        flex-shrink: 0;
    }

    @include respond-to("sm") {
        padding: ($content-padding * 0.5);
        gap: ($content-padding * 0.375);

        .info-label {
            width: 60px;
        }
    }
}
</style>