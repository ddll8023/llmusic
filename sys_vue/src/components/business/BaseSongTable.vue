<script setup lang="ts">
/**
 * BaseSongTable
 * 统一歌曲表格组件，支持三种模式：
 * - local:  flex 布局 + IPC 封面加载（本地音乐）
 * - online: Grid 布局 + 复选框批量操作（在线搜索/平台歌单）
 * - virtual: RecycleScroller 虚拟滚动 + 右键菜单 + 排序（大列表场景）
 */
import { ref, computed, reactive, watch, nextTick, onUnmounted } from 'vue'
import { RecycleScroller } from 'vue-virtual-scroller'
import { usePlayerStore } from '../../store/player'
import { formatDuration } from '../../utils/timeUtils'
import FAIcon from '../common/FAIcon.vue'
import CustomButton from '../custom/CustomButton.vue'
import CustomCheckbox from '../custom/CustomCheckbox.vue'
import LoadingSpinner from '../custom/LoadingSpinner.vue'
import ContextMenu from '../common/ContextMenu.vue'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'

type TableMode = 'local' | 'online' | 'virtual'

interface SongItem {
  id?: string
  songMid?: string
  songId?: string
  title?: string
  songName?: string
  artist?: string
  singer?: string
  album?: string | { albumName?: string; albumCoverUrl?: string; albumMid?: string }
  duration: number | string
  cover?: string
  filePath?: string
  [key: string]: any
}

interface BaseSongTableProps {
  mode: TableMode
  songs: SongItem[]
  loading?: boolean
  loadingText?: string
  errorMsg?: string
  startIndex?: number
  downloadingIds?: Set<string>
  showSortable?: boolean
  showPlayCount?: boolean
  showCheckbox?: boolean
  showCover?: boolean
  showFormat?: boolean
  showAction?: boolean
  unifyActions?: boolean
  officialDisabled?: boolean
  emptyText?: string
  emptyIcon?: string
  containerHeight?: string
  currentListId?: string
  // virtual 模式专用
  showScrollButtons?: boolean
  showSelection?: boolean
  contextMenuType?: string
  /** 外部封面缓存（优先级高于内部 IPC 加载） */
  externalCoverCache?: Record<string, string> | null
}

const props = withDefaults(defineProps<BaseSongTableProps>(), {
  mode: 'local',
  songs: () => [],
  loading: false,
  loadingText: '',
  errorMsg: '',
  startIndex: 1,
  downloadingIds: () => new Set<string>(),
  showSortable: false,
  showPlayCount: false,
  showCheckbox: false,
  showCover: true,
  showFormat: false,
  showAction: false,
  officialDisabled: false,
  unifyActions: false,
  emptyText: '暂无歌曲',
  emptyIcon: 'music',
  containerHeight: '100%',
  currentListId: 'default',
  showScrollButtons: false,
  showSelection: false,
  contextMenuType: '',
  externalCoverCache: null,
})

const emit = defineEmits<{
  (e: 'play-song', payload: { song: SongItem; listId: string; songIds: any[] }): void
  (e: 'play', song: SongItem): void
  (e: 'download', song: SongItem): void
  (e: 'batch-download', songs: SongItem[]): void
  (e: 'selection-change', songs: SongItem[]): void
  (e: 'click-song', song: SongItem): void
  // virtual 模式
  (e: 'sort-change', payload: { sortBy: string; sortDirection: string }): void
  (e: 'context-menu-action', payload: { action: string; song: SongItem }): void
}>()

const playerStore = usePlayerStore()

const hoveredSongId = ref<any>(null)
const selectedIds = ref(new Set<string>())

const songCovers = reactive<Record<string, string>>({})
const coverErrorFlags = reactive<Record<string, boolean>>({})
const placeholderCover = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='

// ── 封面加载队列 ──
const MAX_COVER_CONCURRENCY = 2
const pendingCoverIds = new Set<string>()
const loadingCoverIds = new Set<string>()
const failedCoverIds = new Set<string>()
let isCoverQueueDisposed = false

function enqueueCover(songId: any): void {
  if (!songId) return
  const id = String(songId)
  if (songCovers[id] || loadingCoverIds.has(id) || pendingCoverIds.has(id) || failedCoverIds.has(id)) return
  if (props.externalCoverCache?.[id]) return
  pendingCoverIds.add(id)
  drainCoverQueue()
}

function drainCoverQueue(): void {
  if (isCoverQueueDisposed || loadingCoverIds.size >= MAX_COVER_CONCURRENCY) return
  for (const id of pendingCoverIds) {
    if (loadingCoverIds.size >= MAX_COVER_CONCURRENCY) break
    pendingCoverIds.delete(id)
    loadingCoverIds.add(id)
    loadCover(id).finally(() => {
      loadingCoverIds.delete(id)
      drainCoverQueue()
    })
  }
}

async function loadCover(songId: any) {
  if (!songId) return
  const id = String(songId)
  if (isCoverQueueDisposed) return
  try {
    const result = await (window.electronAPI.getSongCover as any)(id)
    if (isCoverQueueDisposed) return
    if (result.success && result.cover) {
      const fmt = result.format || 'image/jpeg'
      songCovers[id] = `data:${fmt};base64,${result.cover}`
    } else {
      failedCoverIds.add(id)
    }
  } catch {
    if (!isCoverQueueDisposed) failedCoverIds.add(id)
  }
}

// virtual 模式：虚拟滚动按需入队封面
const onUpdate = (startIndex: any, endIndex: any) => {
  if (props.mode !== 'virtual' || props.songs.length === 0) return
  for (let i = startIndex; i <= endIndex; i++) {
    if (props.songs[i]) enqueueCover(props.songs[i]?.id)
  }
}

// local 模式：监听 songs 变化触发封面入队
watch(() => props.songs, (songs) => {
  if (props.mode === 'local') {
    songs.forEach(s => { if (s.id) enqueueCover(s.id) })
  }
  if (props.mode === 'online') {
    Object.keys(coverErrorFlags).forEach(k => delete coverErrorFlags[k])
  }
}, { immediate: true })

onUnmounted(() => {
  isCoverQueueDisposed = true
  pendingCoverIds.clear()
  loadingCoverIds.clear()
})

const currentSongId = computed(() => {
  if (playerStore.isOnlineSong) return playerStore.onlineSongMid
  return playerStore.currentSong?.id || null
})
const isPlaying = computed(() => playerStore.playing)

// ── 虚拟滚动相关 ──
const scroller = ref<any>(null)
const showFixedButtons = ref(false)
const sortBy = ref('default')
const sortDirection = ref('asc')
const songInfoDialogVisible = ref(false)
const currentSongForInfo = ref<any>(null)

const songIndexMap = computed(() => {
  const map = new Map<any, number>()
  props.songs.forEach((song: any, index: number) => {
    map.set(song.id, index)
  })
  return map
})

const getRealIndex = (song: any) => {
  const index = songIndexMap.value.get(song.id)
  return index !== undefined ? index : -1
}

// ── 右键菜单 ──
const contextMenu = reactive({
  show: false,
  x: 0,
  y: 0,
  song: null as any,
})

// ── 骨架屏行数 ──
const SKELETON_ROW_COUNT = 10

// ── 工具函数 ──
function getSongId(song: SongItem): string {
  return song.id || song.songMid || song.songId || ''
}

function getTitle(song: SongItem): string {
  return song.title || song.songName || '未知歌曲'
}

function getArtist(song: SongItem): string {
  return song.artist || song.singer || '未知艺术家'
}

function getAlbumName(song: SongItem): string {
  if (!song.album) return '未知专辑'
  if (typeof song.album === 'string') return song.album
  return song.album.albumName || '未知专辑'
}

function getCoverUrl(song: SongItem): string {
  if (props.mode === 'online') {
    const cover = (song.album as any)?.albumCoverUrl
    return cover || placeholderCover
  }
  // virtual / local：优先外部缓存，其次内部 IPC 缓存
  const cover = props.externalCoverCache?.[song.id!] || songCovers[song.id!]
  return cover || placeholderCover
}

function getDuration(song: SongItem): string {
  if (typeof song.duration === 'string') return song.duration
  return formatDuration(song.duration || 0)
}

function isDownloading(song: SongItem): boolean {
  return props.downloadingIds.has(getSongId(song))
}

// ── 选择逻辑 ──
const isAllSelected = computed(() =>
  props.songs.length > 0 && selectedIds.value.size === props.songs.length
)

const isPartialSelected = computed(() =>
  selectedIds.value.size > 0 && selectedIds.value.size < props.songs.length
)

function isSelected(song: SongItem): boolean {
  return selectedIds.value.has(getSongId(song))
}

function toggleSelect(song: SongItem) {
  const id = getSongId(song)
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id)
  } else {
    selectedIds.value.add(id)
  }
  selectedIds.value = new Set(selectedIds.value)
  emitSelectionChange()
}

function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(props.songs.map(s => getSongId(s)))
  }
  emitSelectionChange()
}

function clearSelection() {
  selectedIds.value = new Set()
  emitSelectionChange()
}

function emitSelectionChange() {
  const selected = props.songs.filter(s => isSelected(s))
  emit('selection-change', selected)
}

function handleBatchDownload() {
  const selected = props.songs.filter(s => isSelected(s))
  emit('batch-download', selected)
}

// ── 行交互 ──
function handleRowClick(song: SongItem) {
  if (props.mode === 'online') {
    if (!(song as any).songUrl?.url) return
    emit('click-song', song)
  } else {
    handlePlaySong(song)
  }
}

function handlePlaySong(song: SongItem) {
  if (props.mode === 'online') {
    if (!(song as any).songUrl?.url) return
    emit('play', song)
  } else {
    emit('play-song', {
      song,
      listId: props.currentListId,
      songIds: props.songs.map(s => s.id),
    })
  }
}

function handleRowDblClick(song: SongItem) {
  if (props.mode === 'local' || props.mode === 'virtual') {
    handlePlaySong(song)
  }
}

// ── virtual 模式：排序 ──
function handleSort(field: string) {
  if (!props.showSortable) return
  if (sortBy.value === field) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = field
    sortDirection.value = 'asc'
  }
  emit('sort-change', { sortBy: sortBy.value, sortDirection: sortDirection.value })
}

// ── virtual 模式：右键菜单 ──
function handleContextMenu(event: MouseEvent, song: any) {
  if (!props.contextMenuType) return
  event.preventDefault()
  contextMenu.show = true
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.song = song
}

function closeContextMenu() {
  contextMenu.show = false
}

function handleMenuAction(actionData: any) {
  if (actionData.action === 'song-info') {
    showSongInfoDialog(actionData.song)
  } else {
    emit('context-menu-action', actionData)
  }
}

// ── virtual 模式：歌曲信息弹窗 ──
function showSongInfoDialog(song: any) {
  currentSongForInfo.value = song
  songInfoDialogVisible.value = true
}

function closeSongInfoDialog() {
  songInfoDialogVisible.value = false
}

// ── virtual 模式：滚动操作 ──
function handleScroll(event: any) {
  const scrollTop = event?.target?.scrollTop || 0
  showFixedButtons.value = scrollTop > 0
}

function scrollToTop() {
  if (!scroller.value || props.songs.length === 0) return
  nextTick(() => setTimeout(() => scroller.value.scrollToItem(0), 50))
}

function scrollToCurrentSong() {
  if (!playerStore.currentSong || !scroller.value) return
  const index = props.songs.findIndex((s: any) => s.id === playerStore.currentSong?.id)
  if (index !== -1) {
    nextTick(() => setTimeout(() => scroller.value.scrollToItem(index), 50))
  }
}

// ── 表头配置 ──
const headers = computed(() => {
  const h: Array<{ key: string; label: string; width: string; sortable?: boolean }> = []

  if (props.showCheckbox || props.showSelection) {
    h.push({ key: 'checkbox', label: '', width: '40px' })
  }

  h.push({ key: 'index', label: '#', width: '40px' })

  if (props.showCover || props.mode === 'virtual') {
    h.push({ key: 'cover', label: '', width: '50px' })
  }

  if (props.mode === 'local' || props.mode === 'virtual') {
    h.push({ key: 'title', label: '歌曲名', width: props.showPlayCount ? '30%' : '35%', sortable: props.showSortable })
    h.push({ key: 'artist', label: '歌手', width: props.showPlayCount ? '15%' : '20%', sortable: props.showSortable })
    h.push({ key: 'album', label: '专辑', width: props.showPlayCount ? '20%' : '25%', sortable: props.showSortable })
    if (props.showPlayCount) {
      h.push({ key: 'playCount', label: '播放次数', width: '10%', sortable: props.showSortable })
    }
    h.push({ key: 'duration', label: '时长', width: '10%', sortable: props.showSortable })
  } else {
    h.push({ key: 'title', label: '歌名', width: '2fr' })
    h.push({ key: 'artist', label: '歌手', width: '1.5fr' })
    h.push({ key: 'album', label: '专辑', width: '1.5fr' })
    h.push({ key: 'duration', label: '时长', width: '50px' })
    if (props.showFormat) {
      h.push({ key: 'format', label: '格式', width: '50px' })
    }
    if (props.showAction) {
      h.push({ key: 'action', label: props.unifyActions ? '' : '官方', width: '72px' })
    }
  }

  return h
})

const gridTemplateStyle = computed(() => {
  const widths = headers.value.map(h => h.width).join(' ')
  return { gridTemplateColumns: widths }
})

// ── 暴露方法 ──
defineExpose({
  scrollToTop,
  scrollToCurrentSong,
})
</script>

<template>
  <div class="flex flex-col flex-1 overflow-hidden relative bg-surface-base text-content-base"
    :style="{ height: containerHeight }">

    <!-- 在线模式：批量操作栏 -->
    <div v-if="mode === 'online' && selectedIds.size > 0"
      class="flex items-center gap-3 px-4 py-2 bg-accent-green/10 border-b border-accent-green/20 shrink-0">
      <span class="text-sm text-accent-green">已选择 {{ selectedIds.size }} 首</span>
      <CustomButton type="primary" size="small" icon="download" @click="handleBatchDownload">
        批量下载
      </CustomButton>
      <CustomButton type="secondary" size="small" @click="clearSelection">
        取消选择
      </CustomButton>
    </div>

    <!-- 加载状态（仅 local/virtual 首次加载） -->
    <div v-if="loading && (mode === 'local' || (mode === 'virtual' && songs.length === 0))"
      class="flex items-center justify-center flex-1 p-8">
      <LoadingSpinner :text="loadingText || '加载中...'" />
    </div>

    <!-- 错误提示（在线模式） -->
    <div v-else-if="errorMsg"
      class="mx-4 mt-4 flex items-center gap-2 text-sm text-accent-danger bg-accent-danger/10 border border-accent-danger/30 rounded-lg px-3 py-2 shrink-0">
      <FAIcon name="exclamation-circle" size="small" color="danger" />
      <span>{{ errorMsg }}</span>
    </div>

    <!-- 空状态 -->
    <div v-else-if="songs.length === 0 && !loading"
      class="flex flex-col items-center justify-center flex-1 text-content-secondary p-8">
      <FAIcon :name="emptyIcon" size="xl" color="secondary" />
      <p class="text-lg mb-6 font-medium mt-3">{{ emptyText }}</p>
    </div>

    <!-- 表格区域 -->
    <template v-else-if="!((mode === 'local' || mode === 'virtual') && songs.length === 0)">
      <!-- ========== 表头 ========== -->
      <div
        :class="[
          'bg-surface-elevated text-content-secondary h-10 border-b border-line-base shrink-0 sticky top-0 z-[1]',
          mode === 'online' ? 'grid items-center gap-2 px-4' : 'flex items-center px-2.5'
        ]"
        :style="mode === 'online' ? gridTemplateStyle : {}">

        <!-- 在线表头 -->
        <template v-if="mode === 'online'">
          <div v-for="h in headers" :key="h.key"
            class="flex items-center font-medium text-sm whitespace-nowrap overflow-hidden text-ellipsis"
            :style="{ width: h.width }">
            <template v-if="h.key === 'checkbox'">
              <CustomCheckbox :checked="isAllSelected" :indeterminate="isPartialSelected"
                size="small" @change="toggleSelectAll" />
            </template>
            <template v-else-if="h.key === 'cover'"></template>
            <span v-else>{{ h.label }}</span>
          </div>
        </template>

        <!-- local/virtual 表头 -->
        <template v-else>
          <div v-for="h in headers" :key="h.key"
            :class="[
              'flex items-center p-2 font-medium text-sm whitespace-nowrap overflow-hidden text-ellipsis',
              h.sortable ? 'cursor-pointer transition-colors duration-200 hover:text-content-base' : ''
            ]"
            :style="{ width: h.width, flexShrink: h.key === 'index' || h.key === 'cover' ? 0 : undefined }"
            @click="h.sortable ? handleSort(h.key) : null">
            {{ h.label }}
            <FAIcon v-if="h.sortable && sortBy === h.key"
              :name="sortDirection === 'asc' ? 'sort-asc' : 'sort-desc'" size="small" class="ml-[5px]" />
          </div>
          <!-- 操作留白 -->
          <div v-if="mode === 'virtual' && contextMenuType" class="shrink-0 p-2" style="width:40px"></div>
        </template>
      </div>

      <!-- ========== 表格体 ========== -->
      <div :class="[
        'flex-1 relative',
        mode === 'virtual' ? 'flex flex-col min-h-0 overflow-hidden' : 'overflow-y-auto'
      ]">

        <!-- ──────────── 在线模式：骨架屏 ──────────── -->
        <template v-if="mode === 'online' && loading">
          <div v-for="n in SKELETON_ROW_COUNT" :key="'skeleton-' + n"
            class="grid gap-2 px-4 py-2 border-b border-line-base items-center animate-pulse"
            :style="gridTemplateStyle">
            <div v-if="showCheckbox" class="flex items-center justify-center">
              <div class="w-4 h-4 rounded bg-surface-overlay"></div>
            </div>
            <div class="flex items-center">
              <div class="w-4 h-4 rounded bg-surface-overlay"></div>
            </div>
            <div class="flex items-center">
              <div class="w-9 h-9 rounded bg-surface-overlay"></div>
            </div>
            <div class="h-4 bg-surface-overlay rounded w-3/4"></div>
            <div class="h-4 bg-surface-overlay rounded w-2/3"></div>
            <div class="h-4 bg-surface-overlay rounded w-1/2"></div>
            <div class="h-4 bg-surface-overlay rounded w-10"></div>
            <div v-if="showFormat" class="h-4 bg-surface-overlay rounded w-8"></div>
            <div v-if="showAction" class="flex justify-center gap-1">
              <div class="w-[26px] h-[26px] rounded bg-surface-overlay"></div>
              <div class="w-[26px] h-[26px] rounded bg-surface-overlay"></div>
            </div>
          </div>
        </template>

        <!-- ──────────── 本地模式 ──────────── -->
        <template v-else-if="mode === 'local'">
          <div class="flex flex-col">
            <div v-for="(song, index) in songs" :key="song.id"
              @dblclick="handleRowDblClick(song)"
              :class="[
                'group flex items-center h-[60px] px-2.5 border-b border-surface-base transition-all duration-200 cursor-pointer',
                'hover:bg-overlay-light active:bg-overlay-medium active:scale-[0.98]',
                currentSongId === song.id
                  ? 'text-accent-green bg-accent-green/10 border-l-[3px] border-l-accent-green pl-[7px]'
                  : '',
                showCheckbox && isSelected(song) ? 'bg-accent-green/[0.04] shadow-[inset_3px_0_0_0_rgba(76,175,80,0.5)]' : ''
              ]"
              @mouseenter="hoveredSongId = song.id"
              @mouseleave="hoveredSongId = null"
              @click="handleRowClick(song)"
              :data-song-id="song.id">

              <div v-if="showCheckbox" class="p-2 flex items-center justify-center" style="width:40px;flex-shrink:0" @click.stop>
                <CustomCheckbox :checked="isSelected(song)" size="small" @change="toggleSelect(song)" />
              </div>

              <div :class="[
                'p-2 flex items-center justify-center font-medium text-xs',
                currentSongId === song.id ? 'text-accent-green' : 'text-content-secondary'
              ]" style="width:40px;flex-shrink:0">
                {{ index + 1 }}
              </div>

              <div v-if="showCover" class="p-2 flex items-center" style="width:50px;flex-shrink:0">
                <div class="relative w-10 h-10 rounded overflow-hidden shrink-0">
                  <img :src="getCoverUrl(song)" alt="封面" class="w-full h-full object-cover rounded bg-surface-overlay"
                    @error.once="songCovers[song.id!] = placeholderCover" />
                </div>
              </div>

              <div class="p-2 truncate flex items-center text-sm"
                :style="{ width: showPlayCount ? '30%' : '35%' }">
                {{ getTitle(song) }}
              </div>

              <div class="p-2 truncate flex items-center text-sm text-content-secondary"
                :style="{ width: showPlayCount ? '15%' : '20%' }">
                {{ getArtist(song) }}
              </div>

              <div class="p-2 truncate flex items-center text-sm text-content-secondary"
                :style="{ width: showPlayCount ? '20%' : '25%' }">
                {{ getAlbumName(song) }}
              </div>

              <div v-if="showPlayCount" class="p-2 flex items-center text-sm text-content-secondary"
                style="width:10%">
                {{ song.playCount || 0 }}
              </div>

              <div class="p-2 flex items-center text-sm text-content-tertiary" style="width:10%">
                {{ getDuration(song) }}
              </div>
            </div>
          </div>
        </template>

        <!-- ──────────── 虚拟滚动模式 ──────────── -->
        <template v-else-if="mode === 'virtual' && songs.length > 0">
          <RecycleScroller ref="scroller"
            class="flex-1 min-h-0 w-full overflow-y-auto"
            :items="songs" :item-size="60" key-field="id"
            :emit-update="true"
            v-slot="{ item: song, index }"
            @update="onUpdate"
            @scroll="handleScroll">
            <div @dblclick="handleRowDblClick(song)"
              :class="[
                'group flex items-center h-[60px] px-2.5 border-b border-surface-base transition-all duration-200 cursor-pointer',
                'hover:bg-overlay-light active:bg-overlay-medium active:scale-[0.98]',
                currentSongId === song.id
                  ? 'text-accent-green bg-accent-green/10 border-l-[3px] border-l-accent-green pl-[7px]'
                  : '',
                showSelection && isSelected(song) ? 'bg-accent-green/[0.04] shadow-[inset_3px_0_0_0_rgba(76,175,80,0.5)]' : ''
              ]"
              @mouseenter="hoveredSongId = song.id"
              @mouseleave="hoveredSongId = null"
              @contextmenu="handleContextMenu($event, song)"
              :data-song-id="song.id">

              <div v-if="showSelection" class="p-2 flex items-center justify-center" style="width:40px;flex-shrink:0" @click.stop>
                <CustomCheckbox :checked="isSelected(song)" size="small" @change="toggleSelect(song)" />
              </div>

              <div :class="[
                'p-2 flex items-center justify-center font-medium text-xs',
                currentSongId === song.id ? 'text-accent-green' : 'text-content-secondary'
              ]" style="width:40px;flex-shrink:0">
                {{ getRealIndex(song) + 1 }}
              </div>

              <div class="p-2 flex items-center" style="width:50px;flex-shrink:0">
                <div class="relative w-10 h-10 rounded overflow-hidden shrink-0">
                  <img :src="getCoverUrl(song)" alt="封面"
                    class="w-full h-full object-cover rounded bg-surface-overlay shadow-md transition-transform duration-200 group-hover:scale-110"
                    @error.once="songCovers[song.id!] = placeholderCover" />
                  <transition name="fade">
                    <div v-if="hoveredSongId === song.id"
                      class="absolute inset-0 bg-overlay-dark flex items-center justify-center cursor-pointer rounded"
                      @click="handlePlaySong(song)">
                      <FAIcon name="play" size="large" color="primary" />
                    </div>
                  </transition>
                </div>
              </div>

              <div class="p-2 truncate flex items-center text-sm"
                :style="{ width: showPlayCount ? '30%' : '35%' }">
                {{ getTitle(song) }}
              </div>

              <div class="p-2 truncate flex items-center text-sm text-content-secondary"
                :style="{ width: showPlayCount ? '15%' : '20%' }">
                {{ getArtist(song) }}
              </div>

              <div class="p-2 truncate flex items-center text-sm text-content-secondary"
                :style="{ width: showPlayCount ? '20%' : '25%' }">
                {{ getAlbumName(song) }}
              </div>

              <div v-if="showPlayCount" class="p-2 flex items-center text-sm text-content-secondary"
                style="width:10%">
                {{ song.playCount || 0 }}
              </div>

              <div class="p-2 flex items-center text-sm text-content-tertiary" style="width:10%">
                {{ getDuration(song) }}
              </div>
            </div>
          </RecycleScroller>

          <!-- 固定滚动按钮 -->
          <transition name="slide-fade">
            <div v-if="showFixedButtons && showScrollButtons"
              class="fixed right-5 bottom-[110px] flex flex-col gap-2.5 z-[100]">
              <CustomButton type="icon-only" icon="crosshairs" size="medium" circle
                customClass="!w-11 !h-11" @click="scrollToCurrentSong" title="定位当前播放歌曲" />
              <CustomButton type="icon-only" icon="arrow-up" size="medium" circle
                customClass="!w-11 !h-11" @click="scrollToTop" title="回到顶部" />
            </div>
          </transition>

          <!-- 右键菜单 -->
          <ContextMenu :show="contextMenu.show" :x="contextMenu.x" :y="contextMenu.y"
            :song="contextMenu.song" :menu-type="contextMenuType"
            @close="closeContextMenu" @action="handleMenuAction" />

          <!-- 歌曲信息对话框 -->
          <div v-if="songInfoDialogVisible"
            class="fixed inset-0 bg-overlay-dark flex items-center justify-center z-[300] fade-in"
            @click.self="closeSongInfoDialog">
            <div
              class="dialog-content bg-surface-elevated p-6 rounded-lg w-[90%] max-w-[500px] border border-line-base shadow-[0_10px_25px_rgba(0,0,0,0.5)] max-h-[80vh] overflow-y-auto">
              <h2 class="mt-0 mb-5 text-accent-green border-b border-line-base pb-2.5 text-lg font-medium">歌曲信息</h2>
              <div class="grid grid-cols-2 gap-2.5 mb-4">
                <div class="p-2.5 bg-surface-base rounded border border-line-base">
                  <h3 class="text-sm my-2.5 text-content-secondary font-medium">基本信息</h3>
                  <div class="my-2 flex items-start gap-2">
                    <span class="text-content-secondary w-[70px] shrink-0 font-medium text-xs">标题:</span>
                    <span class="text-content-base break-words text-xs">{{ currentSongForInfo.title || '未知标题' }}</span>
                  </div>
                  <div class="my-2 flex items-start gap-2">
                    <span class="text-content-secondary w-[70px] shrink-0 font-medium text-xs">艺术家:</span>
                    <span class="text-content-base break-words text-xs">{{ currentSongForInfo.artist || '未知艺术家' }}</span>
                  </div>
                  <div class="my-2 flex items-start gap-2">
                    <span class="text-content-secondary w-[70px] shrink-0 font-medium text-xs">专辑:</span>
                    <span class="text-content-base break-words text-xs">{{ currentSongForInfo.album || '未知专辑' }}</span>
                  </div>
                  <div class="my-2 flex items-start gap-2">
                    <span class="text-content-secondary w-[70px] shrink-0 font-medium text-xs">时长:</span>
                    <span class="text-content-base break-words text-xs">{{ formatDuration(currentSongForInfo.duration) }}</span>
                  </div>
                  <div v-if="showPlayCount" class="my-2 flex items-start gap-2">
                    <span class="text-content-secondary w-[70px] shrink-0 font-medium text-xs">播放次数:</span>
                    <span class="text-content-base break-words text-xs">{{ currentSongForInfo.playCount || 0 }}</span>
                  </div>
                </div>
                <div class="p-2.5 bg-surface-base rounded border border-line-base">
                  <h3 class="text-sm my-2.5 text-content-secondary font-medium">技术信息</h3>
                  <div class="my-2 flex items-start gap-2">
                    <span class="text-content-secondary w-[70px] shrink-0 font-medium text-xs">比特率:</span>
                    <span class="text-content-base break-words text-xs">{{ currentSongForInfo.bitrate ? `${(currentSongForInfo.bitrate / 1000).toFixed(1)} kbps` : '未知' }}</span>
                  </div>
                  <div class="my-2 flex items-start gap-2">
                    <span class="text-content-secondary w-[70px] shrink-0 font-medium text-xs">文件大小:</span>
                    <span class="text-content-base break-words text-xs">{{ currentSongForInfo.fileSize ? currentSongForInfo.fileSize >= 1048576 ? `${(currentSongForInfo.fileSize / 1048576).toFixed(2)} MB` : currentSongForInfo.fileSize >= 1024 ? `${(currentSongForInfo.fileSize / 1024).toFixed(1)} KB` : `${currentSongForInfo.fileSize} B` : '未知' }}</span>
                  </div>
                  <div class="my-2 flex items-start gap-2">
                    <span class="text-content-secondary w-[70px] shrink-0 font-medium text-xs">格式:</span>
                    <span class="text-content-base break-words text-xs">{{ currentSongForInfo.format || '未知格式' }}</span>
                  </div>
                  <div class="my-2 flex items-start gap-2">
                    <span class="text-content-secondary w-[70px] shrink-0 font-medium text-xs">采样率:</span>
                    <span class="text-content-base break-words text-xs">{{ currentSongForInfo.sampleRate ? `${currentSongForInfo.sampleRate / 1000} kHz` : '未知' }}</span>
                  </div>
                </div>
              </div>
              <div class="mt-4 p-2.5 bg-surface-base rounded flex gap-2 border border-line-base">
                <span class="text-content-secondary w-[70px] shrink-0 font-medium text-xs">文件路径:</span>
                <span class="font-mono text-[11px] bg-surface-overlay p-1 px-2 rounded-sm break-all text-content-base">{{ currentSongForInfo.filePath || '未知路径' }}</span>
              </div>
              <div class="mt-5 w-full">
                <CustomButton type="primary" @click="closeSongInfoDialog">关闭</CustomButton>
              </div>
            </div>
          </div>
        </template>

        <!-- ──────────── 在线模式 ──────────── -->
        <template v-else-if="mode === 'online'">
          <div v-for="(song, index) in songs" :key="getSongId(song)"
            :class="[
              'grid gap-2 px-4 py-2 border-b border-line-base items-center hover:bg-overlay-light transition-colors group cursor-pointer',
              isSelected(song) ? 'bg-accent-green/[0.04] shadow-[inset_3px_0_0_0_rgba(76,175,80,0.5)]' : '',
              currentSongId === getSongId(song)
                ? 'text-accent-green bg-accent-green/10 border-l-[3px] border-l-accent-green'
                : ''
            ]"
            :style="gridTemplateStyle"
            @click="handleRowClick(song)">

            <div v-if="showCheckbox" class="flex items-center justify-center" @click.stop>
              <CustomCheckbox :checked="isSelected(song)" size="small" @change="toggleSelect(song)" />
            </div>

            <div class="text-sm text-content-tertiary flex items-center">{{ startIndex + index }}</div>

            <div v-if="showCover" class="flex items-center">
              <template v-if="(song.album as any)?.albumCoverUrl && !coverErrorFlags[getSongId(song)]">
                <img :src="(song.album as any).albumCoverUrl"
                  :alt="getTitle(song)" loading="lazy"
                  class="w-9 h-9 rounded object-cover bg-surface-overlay"
                  @error.once="coverErrorFlags[getSongId(song)] = true" />
              </template>
              <template v-else>
                <div class="w-9 h-9 rounded bg-surface-overlay flex items-center justify-center">
                  <FAIcon name="music" size="small" color="disabled" />
                </div>
              </template>
            </div>

            <div class="text-sm text-content-base truncate font-medium" :title="getTitle(song)">
              {{ getTitle(song) }}
            </div>

            <div class="text-sm text-content-secondary truncate" :title="getArtist(song)">
              {{ getArtist(song) }}
            </div>

            <div class="text-sm text-content-secondary truncate" :title="getAlbumName(song)">
              {{ getAlbumName(song) }}
            </div>

            <div class="text-sm text-content-tertiary">{{ getDuration(song) }}</div>

            <div v-if="showFormat" class="text-sm">
              <span v-if="song.songUrl?.urlType"
                class="px-1.5 py-0.5 text-xs rounded bg-surface-overlay text-content-secondary uppercase">
                {{ song.songUrl.urlType }}
              </span>
              <span v-else class="text-content-disabled">-</span>
            </div>

            <!-- 统一操作列（unifyActions 模式） -->
            <div v-if="showAction && unifyActions" class="flex items-center justify-center gap-1" @click.stop>
              <button
                class="w-[26px] h-[26px] inline-flex items-center justify-center cursor-pointer select-none disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-125 transition-all duration-150"
                style="color:#4caf50"
                :disabled="!song.songUrl?.url"
                :title="song.songUrl?.url ? '播放' : '无可用的播放链接'"
                @click="emit('play', song)">
                <FAIcon name="play" size="small" color="current" />
              </button>
              <button
                class="w-[26px] h-[26px] inline-flex items-center justify-center cursor-pointer select-none disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-125 transition-all duration-150"
                style="color:#4caf50"
                :disabled="!song.songUrl?.url || officialDisabled || isDownloading(song)"
                title="下载"
                @click="emit('download', song)">
                <FAIcon :name="isDownloading(song) ? 'spinner' : 'download'" size="small" color="current" />
              </button>
            </div>

            <!-- 官方操作 -->
            <div v-if="showAction && !unifyActions" class="flex items-center justify-center gap-1" @click.stop>
              <button
                class="w-[26px] h-[26px] inline-flex items-center justify-center cursor-pointer select-none disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-125 transition-all duration-150"
                style="color:#4caf50"
                :disabled="!song.songUrl?.url"
                :title="song.songUrl?.url ? '试听' : '登录后可试听'"
                @click="handlePlaySong(song)">
                <FAIcon name="play" size="small" color="current" />
              </button>
              <button
                class="w-[26px] h-[26px] inline-flex items-center justify-center cursor-pointer select-none disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-125 transition-all duration-150"
                style="color:#4caf50"
                :disabled="officialDisabled || !song.songUrl?.url || isDownloading(song)"
                title="下载"
                @click="emit('download', song)">
                <FAIcon :name="isDownloading(song) ? 'spinner' : 'download'" size="small" color="current" />
              </button>
            </div>

          </div>
        </template>

      </div>
    </template>
  </div>
</template>

<style scoped>
.loading-fade-enter-active,
.loading-fade-leave-active {
  transition: opacity 0.3s ease;
}
.loading-fade-enter-from,
.loading-fade-leave-to {
  opacity: 0;
}

.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

/* RecycleScroller 滚动条自定义 */
:deep(.vue-recycle-scroller)::-webkit-scrollbar {
  width: 8px;
}
:deep(.vue-recycle-scroller)::-webkit-scrollbar-track {
  background: var(--color-surface-base);
}
:deep(.vue-recycle-scroller)::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}
:deep(.vue-recycle-scroller)::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
</style>
