<script setup>
import { ref, computed, reactive, nextTick, onMounted, watch } from 'vue';
import { RecycleScroller } from 'vue-virtual-scroller';
import { usePlayerStore } from '../../store/player';
import ContextMenu from './ContextMenu.vue';
import FAIcon from './FAIcon.vue';
import CustomButton from '../custom/CustomButton.vue';
import CustomCheckbox from '../custom/CustomCheckbox.vue';
import LoadingSpinner from '../custom/LoadingSpinner.vue';
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
const handleSongSelection = (song) => {
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

            const currentPlaying = document.querySelector(`[data-song-id="${currentSongId}"]`);
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
    <div class="flex flex-col flex-1 overflow-hidden relative bg-surface-base text-content-base" :style="{ height: containerHeight }">
        <!-- 加载状态 -->
        <div v-if="loading" class="flex items-center justify-center flex-1 p-8 max-md:p-4">
            <LoadingSpinner text="加载中..." />
        </div>

        <!-- 空状态 -->
        <div v-else-if="songs.length === 0" class="flex flex-col items-center justify-center flex-1 text-content-secondary p-8 max-md:p-4">
            <FAIcon :name="emptyIcon" size="xl" color="secondary" />
            <p class="text-lg mb-6 font-medium max-md:text-sm max-md:mb-4">{{ emptyText }}</p>
        </div>

        <!-- 歌曲表格 -->
        <div v-else class="flex flex-col flex-1 h-[calc(100%-40px)] min-h-0 relative overflow-hidden">
            <!-- 表头 -->
            <div class="flex items-center bg-surface-elevated text-content-secondary px-2.5 h-10 border-b border-line-base shrink-0 sticky top-0 z-[1] max-md:h-9 max-md:px-2">
                <div v-for="header in tableHeaders" :key="header.key"
                    :class="[
                        'p-2 font-medium text-sm whitespace-nowrap overflow-hidden text-ellipsis flex items-center max-md:text-xs max-md:p-1.5',
                        header.sortable ? 'cursor-pointer transition-colors duration-200 hover:text-content-base' : ''
                    ]"
                    :style="{ width: header.width, flexShrink: header.key === 'index' || header.key === 'cover' ? 0 : undefined }"
                    @click="header.sortable ? handleSort(header.key) : null">
                    {{ header.label }}
                    <FAIcon v-if="header.sortable && sortBy === header.key" :name="sortDirection === 'asc' ? 'sort-asc' : 'sort-desc'" size="small" class="ml-[5px]" />
                </div>
                <div v-if="showActionColumn" class="shrink-0 p-2 flex items-center max-md:p-1.5"></div>
            </div>

            <!-- 虚拟滚动列表 -->
            <RecycleScroller ref="scroller" class="flex-1 min-h-0 w-full overflow-y-auto" :items="songs" :item-size="60" key-field="id"
                :emit-update="true" v-slot="{ item: song, index }" @update="onUpdate" @scroll="handleScroll">
                <div @dblclick="handleSongPlay(song)"
                    :class="[
                        'group flex items-center h-[60px] px-2.5 border-b border-surface-base transition-all duration-200 cursor-pointer max-md:h-[52px] max-md:px-2',
                        'hover:bg-overlay-light active:bg-overlay-medium active:scale-[0.98]',
                        currentSongId === song.id ? 'text-accent-green bg-accent-green/10 border-l-[3px] border-l-accent-green pl-[7px] max-md:pl-[5px]' : '',
                        showSelection && selectedSongIds.includes(song.id) ? 'bg-accent-green/[0.04] shadow-[inset_3px_0_0_0_rgba(76,175,80,0.5)]' : ''
                    ]"
                    @mouseenter="hoveredSongId = song.id" @mouseleave="hoveredSongId = null"
                    @contextmenu="handleContextMenu($event, song)" :data-song-id="song.id">

                    <!-- 选择框 -->
                    <div v-if="showSelection" class="p-2 whitespace-nowrap overflow-hidden text-ellipsis flex items-center justify-center max-md:p-1.5" style="width: 40px; flex-shrink: 0;" @click.stop>
                        <CustomCheckbox :checked="selectedSongIds.includes(song.id)" size="small"
                            @change="handleSongSelection(song)" />
                    </div>

                    <!-- 序号 -->
                    <div :class="[
                        'p-2 whitespace-nowrap overflow-hidden text-ellipsis flex items-center justify-center font-medium text-xs max-md:p-1.5 max-md:text-[10px]',
                        currentSongId === song.id ? 'text-accent-green font-medium' : 'text-content-secondary'
                    ]" style="width: 40px; flex-shrink: 0;">
                        {{ getRealIndex(song) + 1 }}
                    </div>

                    <!-- 封面 -->
                    <div class="p-2 whitespace-nowrap overflow-hidden text-ellipsis flex items-center max-md:p-1.5" style="width: 60px; flex-shrink: 0;">
                        <div class="relative w-12 h-12 rounded overflow-hidden shrink-0 max-md:w-10 max-md:h-10">
                            <img :src="getSongCoverUrl(song)" alt="封面" class="w-full h-full object-cover rounded bg-surface-overlay shadow-md transition-transform duration-200 group-hover:scale-110" />
                            <transition name="fade">
                                <div v-if="hoveredSongId === song.id" class="absolute inset-0 bg-overlay-dark flex items-center justify-center cursor-pointer rounded"
                                    @click="handleSongPlay(song)">
                                    <FAIcon name="play" size="large" color="primary" />
                                </div>
                            </transition>
                        </div>
                    </div>

                    <!-- 歌曲名 -->
                    <div class="p-2 whitespace-nowrap overflow-hidden text-ellipsis flex items-center max-md:p-1.5" :style="{ width: showPlayCount ? '30%' : '35%' }">
                        {{ song.title || '未知歌曲' }}
                    </div>

                    <!-- 歌手 -->
                    <div class="p-2 whitespace-nowrap overflow-hidden text-ellipsis flex items-center max-md:p-1.5" :style="{ width: showPlayCount ? '15%' : '20%' }">
                        {{ song.artist || '未知艺术家' }}
                    </div>

                    <!-- 专辑 -->
                    <div class="p-2 whitespace-nowrap overflow-hidden text-ellipsis flex items-center max-md:p-1.5" :style="{ width: showPlayCount ? '20%' : '25%' }">
                        {{ song.album || '未知专辑' }}
                    </div>

                    <!-- 播放次数 -->
                    <div v-if="showPlayCount" class="p-2 whitespace-nowrap overflow-hidden text-ellipsis flex items-center max-md:p-1.5" style="width: 10%;">
                        {{ song.playCount || 0 }}
                    </div>

                    <!-- 时长 -->
                    <div class="p-2 whitespace-nowrap overflow-hidden text-ellipsis flex items-center max-md:p-1.5" style="width: 10%;">
                        {{ formatDuration(song.duration) }}
                    </div>

                    <!-- 操作列 -->
                    <div v-if="showActionColumn" class="p-2 whitespace-nowrap overflow-hidden text-ellipsis flex items-center shrink-0 justify-center gap-0.5 max-md:p-1.5 max-md:gap-px">
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
                <div v-if="showFixedButtons" class="fixed right-5 bottom-[110px] flex flex-col gap-2.5 z-[100] max-md:right-4 max-md:bottom-[100px] max-md:gap-2">
                    <CustomButton type="icon-only" icon="crosshairs" size="medium" circle customClass="!w-11 !h-11" @click="scrollToCurrentSong" title="定位当前播放歌曲" />

                    <CustomButton type="icon-only" icon="arrow-up" size="medium" circle customClass="!w-11 !h-11" @click="scrollToTop" title="回到顶部" />
                </div>
            </transition>
        </div>

        <!-- 右键菜单 -->
        <ContextMenu :show="contextMenu.show" :x="contextMenu.x" :y="contextMenu.y" :song="contextMenu.song"
            :menu-type="contextMenuType" @close="closeContextMenu" @action="handleMenuAction" />

        <!-- 歌曲信息对话框 -->
        <div v-if="songInfoDialogVisible" class="fixed inset-0 bg-overlay-dark flex items-center justify-center z-[300] fade-in">
            <div class="dialog-content bg-surface-elevated p-6 rounded-lg w-[90%] max-w-[500px] border border-line-base shadow-[0_10px_25px_rgba(0,0,0,0.5)] max-h-[80vh] overflow-y-auto max-md:p-4 max-md:max-h-[90vh]">
                <h2 class="mt-0 mb-5 text-accent-green border-b border-line-base pb-2.5 text-lg font-medium max-md:text-sm max-md:mb-4">歌曲信息</h2>
                <div class="grid grid-cols-2 gap-2.5 mb-4 max-md:grid-cols-1 max-md:gap-2">
                    <div class="p-2.5 bg-surface-base rounded border border-line-base max-md:p-2">
                        <h3 class="text-sm my-2.5 text-content-secondary font-medium max-md:text-xs max-md:my-2">基本信息</h3>
                        <div class="my-2 flex items-start gap-2 max-md:my-1.5 max-md:gap-1.5">
                            <span class="text-content-secondary w-[70px] shrink-0 font-medium text-xs max-md:w-[60px] max-md:text-[10px]">标题:</span>
                            <span class="text-content-base break-words text-xs leading-normal max-md:text-[10px]">{{ currentSongForInfo.title || '未知标题' }}</span>
                        </div>
                        <div class="my-2 flex items-start gap-2 max-md:my-1.5 max-md:gap-1.5">
                            <span class="text-content-secondary w-[70px] shrink-0 font-medium text-xs max-md:w-[60px] max-md:text-[10px]">艺术家:</span>
                            <span class="text-content-base break-words text-xs leading-normal max-md:text-[10px]">{{ currentSongForInfo.artist || '未知艺术家' }}</span>
                        </div>
                        <div class="my-2 flex items-start gap-2 max-md:my-1.5 max-md:gap-1.5">
                            <span class="text-content-secondary w-[70px] shrink-0 font-medium text-xs max-md:w-[60px] max-md:text-[10px]">专辑:</span>
                            <span class="text-content-base break-words text-xs leading-normal max-md:text-[10px]">{{ currentSongForInfo.album || '未知专辑' }}</span>
                        </div>
                        <div class="my-2 flex items-start gap-2 max-md:my-1.5 max-md:gap-1.5">
                            <span class="text-content-secondary w-[70px] shrink-0 font-medium text-xs max-md:w-[60px] max-md:text-[10px]">时长:</span>
                            <span class="text-content-base break-words text-xs leading-normal max-md:text-[10px]">{{ formatDuration(currentSongForInfo.duration) }}</span>
                        </div>
                        <div v-if="showPlayCount" class="my-2 flex items-start gap-2 max-md:my-1.5 max-md:gap-1.5">
                            <span class="text-content-secondary w-[70px] shrink-0 font-medium text-xs max-md:w-[60px] max-md:text-[10px]">播放次数:</span>
                            <span class="text-content-base break-words text-xs leading-normal max-md:text-[10px]">{{ currentSongForInfo.playCount || 0 }}</span>
                        </div>
                    </div>

                    <div class="p-2.5 bg-surface-base rounded border border-line-base max-md:p-2">
                        <h3 class="text-sm my-2.5 text-content-secondary font-medium max-md:text-xs max-md:my-2">技术信息</h3>
                        <div class="my-2 flex items-start gap-2 max-md:my-1.5 max-md:gap-1.5">
                            <span class="text-content-secondary w-[70px] shrink-0 font-medium text-xs max-md:w-[60px] max-md:text-[10px]">比特率:</span>
                            <span class="text-content-base break-words text-xs leading-normal max-md:text-[10px]">{{ currentSongForInfo.bitrate ? `${(currentSongForInfo.bitrate /
                                1000).toFixed(1)} kbps` : '未知' }}</span>
                        </div>
                        <div class="my-2 flex items-start gap-2 max-md:my-1.5 max-md:gap-1.5">
                            <span class="text-content-secondary w-[70px] shrink-0 font-medium text-xs max-md:w-[60px] max-md:text-[10px]">文件大小:</span>
                            <span class="text-content-base break-words text-xs leading-normal max-md:text-[10px]">{{
                                currentSongForInfo.fileSize
                                    ? currentSongForInfo.fileSize >= 1024 * 1024
                                        ? `${(currentSongForInfo.fileSize / (1024 * 1024)).toFixed(2)} MB`
                                        : currentSongForInfo.fileSize >= 1024
                                            ? `${(currentSongForInfo.fileSize / 1024).toFixed(1)} KB`
                                            : `${currentSongForInfo.fileSize} B`
                                    : '未知'
                            }}</span>
                        </div>
                        <div class="my-2 flex items-start gap-2 max-md:my-1.5 max-md:gap-1.5">
                            <span class="text-content-secondary w-[70px] shrink-0 font-medium text-xs max-md:w-[60px] max-md:text-[10px]">格式:</span>
                            <span class="text-content-base break-words text-xs leading-normal max-md:text-[10px]">{{ currentSongForInfo.format || '未知格式' }}</span>
                        </div>
                        <div class="my-2 flex items-start gap-2 max-md:my-1.5 max-md:gap-1.5">
                            <span class="text-content-secondary w-[70px] shrink-0 font-medium text-xs max-md:w-[60px] max-md:text-[10px]">采样率:</span>
                            <span class="text-content-base break-words text-xs leading-normal max-md:text-[10px]">{{ currentSongForInfo.sampleRate ? `${currentSongForInfo.sampleRate
                                / 1000}
                                kHz` : '未知' }}</span>
                        </div>
                    </div>
                </div>

                <div class="mt-4 p-2.5 bg-surface-base rounded flex gap-2 border border-line-base max-md:p-2 max-md:gap-1.5">
                    <span class="text-content-secondary w-[70px] shrink-0 font-medium text-xs max-md:w-[60px] max-md:text-[10px]">文件路径:</span>
                    <span class="font-mono text-[11px] bg-surface-overlay p-1 px-2 rounded-sm break-all text-content-base leading-normal max-md:text-[9px] max-md:p-0.5 max-md:px-1">{{ currentSongForInfo.filePath || '未知路径' }}</span>
                </div>

                <div class="mt-5 w-full max-md:mt-4">
                    <CustomButton type="primary" @click="closeSongInfoDialog">关闭</CustomButton>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* RecycleScroller 滚动条自定义 */
:deep(.vue-recycle-scroller)::-webkit-scrollbar {
    width: 8px;
}
:deep(.vue-recycle-scroller)::-webkit-scrollbar-track {
    background: #121212;
}
:deep(.vue-recycle-scroller)::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 4px;
}
:deep(.vue-recycle-scroller)::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.1);
}
@media (max-width: 768px) {
    :deep(.vue-recycle-scroller)::-webkit-scrollbar {
        width: 6px;
    }
}

/* dialog-content 滚动条 */
.dialog-content::-webkit-scrollbar {
    width: 6px;
}
.dialog-content::-webkit-scrollbar-track {
    background: #121212;
}
.dialog-content::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
}

/* 播放脉冲动画 (通过 JS classList.add('highlighted') 触发) */
[data-song-id].highlighted {
    animation: playingPulse 1.5s ease;
}
</style>