<script setup lang="ts">
/**
 * BaseSongTable
 * 统一歌曲表格组件，全模式基于 RecycleScroller 虚拟滚动渲染：
 * - local:  本地歌曲布局（IPC 封面队列加载、排序、右键菜单、操作列、滚动定位）
 * - online: 在线歌曲 Grid 布局（远程封面、格式列、下载操作列、骨架屏）
 * 差异能力全部通过 props 开关配置（复选框选择、受控选择、操作列类型等）
 * 依赖组件：FAIcon, CustomButton, CustomCheckbox, LoadingSpinner, ContextMenu
 */

// 1. Vue 官方 API
import { ref, computed, reactive, watch, nextTick, onUnmounted } from 'vue'

// 2. Pinia Store
import { usePlayerStore } from '../../store/player'

// 3. 类型导入
import type { Song, OnlineSong } from '../../types/api'

// 4. 工具函数
import { formatDuration } from '../../utils/timeUtils'

// 5. 第三方组件
import { RecycleScroller } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'

// 6. 子组件导入
import FAIcon from '../common/FAIcon.vue'
import ContextMenu from '../common/ContextMenu.vue'
import CustomButton from '../custom/CustomButton.vue'
import CustomCheckbox from '../custom/CustomCheckbox.vue'
import LoadingSpinner from '../custom/LoadingSpinner.vue'

type TableMode = 'local' | 'online'
type ActionColumnType = 'none' | 'metadata' | 'remove'

/** 本地歌曲与在线歌曲的联合展示类型（字段全部可选，兼容两种来源） */
type SongItem = Omit<Partial<Song>, 'album' | 'duration'> &
  Omit<Partial<OnlineSong>, 'album' | 'duration'> & {
    album?: string | OnlineSong['album']
    duration?: number | string
  }

/** 虚拟滚动行数据：rid 为预计算的行唯一 ID，避免每行重复调用 getSongId */
interface TableRow {
  rid: string
  song: SongItem
}

interface TableHeader {
  key: string
  label: string
  width: string
  sortable?: boolean
}

interface BaseSongTableProps {
  /** 表格模式：local 本地歌曲 / online 在线歌曲 */
  mode?: TableMode
  songs?: SongItem[]
  loading?: boolean
  /** local 模式加载中的提示文案 */
  loadingText?: string
  /** online 模式错误提示 */
  errorMsg?: string
  emptyText?: string
  emptyIcon?: string
  containerHeight?: string
  /** 播放列表 ID（play-song 事件透传） */
  currentListId?: string
  /** online 模式序号起始值（分页偏移） */
  startIndex?: number
  /** online 模式骨架屏行数（与分页 pageSize 对齐） */
  pageSize?: number
  /** 下载中歌曲 ID 集合 */
  downloadingIds?: Set<string>
  /** 表头可排序（local 模式） */
  showSortable?: boolean
  /** 显示播放次数列（local 模式） */
  showPlayCount?: boolean
  /** 显示复选框批量选择列 */
  showCheckbox?: boolean
  /** 受控选择模式：非 null 时选中态完全由父组件控制 */
  selectedSongIds?: string[] | null
  /** 显示封面列 */
  showCover?: boolean
  /** 显示格式列（online 模式） */
  showFormat?: boolean
  /** 显示操作列（online 模式：播放/下载按钮） */
  showAction?: boolean
  /** online 操作列统一样式（无"官方"标题） */
  unifyActions?: boolean
  /** online 下载按钮禁用（未登录） */
  officialDisabled?: boolean
  /** local 模式操作列类型：metadata 编辑+在线搜索 / remove 从歌单移除 */
  actionColumnType?: ActionColumnType
  /** 右键菜单类型，空字符串表示禁用右键菜单 */
  contextMenuType?: string
  /** 显示滚动到顶部/定位当前歌曲按钮 */
  showScrollButtons?: boolean
  /** 外部封面缓存（非 null 时完全接管封面来源，跳过内部 IPC 加载） */
  externalCoverCache?: Record<string, string> | null
}

const props = withDefaults(defineProps<BaseSongTableProps>(), {
  mode: 'local',
  songs: () => [],
  loading: false,
  loadingText: '',
  errorMsg: '',
  emptyText: '暂无歌曲',
  emptyIcon: 'music',
  containerHeight: '100%',
  currentListId: 'default',
  startIndex: 1,
  pageSize: 10,
  downloadingIds: () => new Set<string>(),
  showSortable: false,
  showPlayCount: false,
  showCheckbox: false,
  selectedSongIds: null,
  showCover: true,
  showFormat: false,
  showAction: false,
  unifyActions: false,
  officialDisabled: false,
  actionColumnType: 'none',
  contextMenuType: '',
  showScrollButtons: false,
  externalCoverCache: null,
})

interface BaseSongTableEmits {
  (e: 'play-song', payload: { song: SongItem; listId: string; songIds: string[] }): void
  (e: 'play', song: SongItem): void
  (e: 'click-song', song: SongItem): void
  (e: 'download', song: SongItem): void
  (e: 'batch-download', songs: SongItem[]): void
  (e: 'selection-change', songs: SongItem[]): void
  (e: 'action-click', payload: { action: string; song: SongItem }): void
  (e: 'sort-change', payload: { sortBy: string; sortDirection: string }): void
  (e: 'context-menu-action', payload: { action: string; song: SongItem | null }): void
}

const emit = defineEmits<BaseSongTableEmits>()

const playerStore = usePlayerStore()

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

function getDuration(song: SongItem): string {
  if (typeof song.duration === 'string') return song.duration
  return formatDuration(song.duration || 0)
}

function isDownloading(rid: string): boolean {
  return props.downloadingIds.has(rid)
}

// ── 行数据（rid 预计算，仅随 songs 变化重建） ──
const rows = computed<TableRow[]>(() =>
  props.songs.map((song) => ({ rid: getSongId(song), song }))
)

const rowHeight = computed(() => (props.mode === 'online' ? 54 : 60))

// ── 当前播放歌曲 ──
const currentSongId = computed<string | null>(() => {
  if (playerStore.isOnlineSong) return playerStore.onlineSongMid
  return playerStore.currentSong?.id || null
})

const hoveredSongId = ref<string | null>(null)

// ── 封面：IPC 队列加载（并发 2 + 失败黑名单），仅可视区域按需入队 ──
const songCovers = reactive<Record<string, string>>({})
const coverErrorFlags = reactive<Record<string, boolean>>({})
const placeholderCover = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='

const MAX_COVER_CONCURRENCY = 2
const pendingCoverIds = new Set<string>()
const loadingCoverIds = new Set<string>()
const failedCoverIds = new Set<string>()
let isCoverQueueDisposed = false

function enqueueCover(id: string): void {
  if (!id) return
  // 外部封面缓存接管时完全跳过内部 IPC 加载
  if (props.externalCoverCache) return
  if (songCovers[id] || loadingCoverIds.has(id) || pendingCoverIds.has(id) || failedCoverIds.has(id)) return
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

async function loadCover(id: string): Promise<void> {
  if (isCoverQueueDisposed) return
  try {
    const result = await window.electronAPI.getSongCover(id)
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

/** RecycleScroller 可视区域变化：仅对可视行触发封面入队（local 模式） */
function onScrollerUpdate(startIndex: number, endIndex: number): void {
  if (props.mode !== 'local' || props.externalCoverCache || rows.value.length === 0) return
  for (let i = startIndex; i <= endIndex; i++) {
    const row = rows.value[i]
    if (row) enqueueCover(row.rid)
  }
}

// online 模式：songs 变化时重置封面错误标记
watch(
  () => props.songs,
  () => {
    if (props.mode === 'online') {
      Object.keys(coverErrorFlags).forEach((k) => delete coverErrorFlags[k])
    }
  }
)

onUnmounted(() => {
  isCoverQueueDisposed = true
  pendingCoverIds.clear()
  loadingCoverIds.clear()
})

function getLocalCoverUrl(rid: string): string {
  return props.externalCoverCache?.[rid] || songCovers[rid] || placeholderCover
}

function getOnlineCoverUrl(song: SongItem): string {
  if (song.album && typeof song.album === 'object') return song.album.albumCoverUrl || ''
  return ''
}

// ── 选择逻辑（受控 / 非受控） ──
const internalSelectedIds = ref(new Set<string>())

/** 当前生效的选中 ID 集合：受控模式取 props，否则取内部状态 */
const selectedIdSet = computed<Set<string>>(() => {
  if (props.selectedSongIds !== null) return new Set(props.selectedSongIds)
  return internalSelectedIds.value
})

const isAllSelected = computed(
  () => props.songs.length > 0 && selectedIdSet.value.size === props.songs.length
)

const isPartialSelected = computed(
  () => selectedIdSet.value.size > 0 && selectedIdSet.value.size < props.songs.length
)

function applySelection(next: Set<string>): void {
  if (props.selectedSongIds === null) {
    internalSelectedIds.value = next
  }
  emit('selection-change', props.songs.filter((s) => next.has(getSongId(s))))
}

function toggleSelect(rid: string): void {
  const next = new Set(selectedIdSet.value)
  if (next.has(rid)) {
    next.delete(rid)
  } else {
    next.add(rid)
  }
  applySelection(next)
}

function toggleSelectAll(): void {
  const next = isAllSelected.value
    ? new Set<string>()
    : new Set(rows.value.map((r) => r.rid))
  applySelection(next)
}

function clearSelection(): void {
  applySelection(new Set<string>())
}

function handleBatchDownload(): void {
  emit('batch-download', props.songs.filter((s) => selectedIdSet.value.has(getSongId(s))))
}

// ── 行样式（每行仅计算一次选中/当前标志） ──
function localRowClasses(row: TableRow): string[] {
  const isCurrent = currentSongId.value === row.rid
  const isChecked = props.showCheckbox && selectedIdSet.value.has(row.rid)
  return [
    'group flex items-center h-[60px] px-2.5 border-b border-surface-base transition-all duration-200 cursor-pointer',
    'hover:bg-overlay-light active:bg-overlay-medium active:scale-[0.98]',
    isCurrent ? 'text-accent-green bg-accent-green/10 border-l-[3px] border-l-accent-green pl-[7px]' : '',
    isChecked ? 'bg-accent-green/[0.04] shadow-[inset_3px_0_0_0_rgba(76,175,80,0.5)]' : '',
  ]
}

function onlineRowClasses(row: TableRow): string[] {
  const isCurrent = currentSongId.value === row.rid
  const isChecked = props.showCheckbox && selectedIdSet.value.has(row.rid)
  return [
    'grid gap-2 px-4 h-[54px] border-b border-line-base items-center hover:bg-overlay-light transition-colors group cursor-pointer',
    isChecked ? 'bg-accent-green/[0.04] shadow-[inset_3px_0_0_0_rgba(76,175,80,0.5)]' : '',
    isCurrent ? 'text-accent-green bg-accent-green/10 border-l-[3px] border-l-accent-green' : '',
  ]
}

// ── 行交互 ──
function handlePlaySong(song: SongItem): void {
  if (props.mode === 'online') {
    if (!song.songUrl?.url) return
    emit('play', song)
  } else {
    emit('play-song', {
      song,
      listId: props.currentListId,
      songIds: rows.value.map((r) => r.rid),
    })
  }
}

function handleRowClick(song: SongItem): void {
  if (props.mode !== 'online') return
  if (!song.songUrl?.url) return
  emit('click-song', song)
}

function emitAction(action: string, song: SongItem): void {
  emit('action-click', { action, song })
}

// ── 排序 ──
const sortBy = ref('default')
const sortDirection = ref('asc')

function handleSort(field: string): void {
  if (!props.showSortable) return
  if (sortBy.value === field) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = field
    sortDirection.value = 'asc'
  }
  emit('sort-change', { sortBy: sortBy.value, sortDirection: sortDirection.value })
}

// ── 右键菜单 ──
const contextMenu = reactive({
  show: false,
  x: 0,
  y: 0,
  song: null as Song | null,
})

function handleContextMenu(event: MouseEvent, song: SongItem): void {
  if (!props.contextMenuType) return
  event.preventDefault()
  contextMenu.show = true
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  // 右键菜单仅在 local 模式启用，行数据即本地 Song
  contextMenu.song = song as Song
}

function closeContextMenu(): void {
  contextMenu.show = false
}

function handleMenuAction(actionData: { action: string; song: Song | null }): void {
  if (actionData.action === 'song-info') {
    if (actionData.song) showSongInfoDialog(actionData.song)
  } else {
    emit('context-menu-action', actionData)
  }
}

// ── 歌曲信息弹窗 ──
const songInfoDialogVisible = ref(false)
const currentSongForInfo = ref<Song | null>(null)

function showSongInfoDialog(song: Song): void {
  currentSongForInfo.value = song
  songInfoDialogVisible.value = true
}

function closeSongInfoDialog(): void {
  songInfoDialogVisible.value = false
}

// ── 滚动操作 ──
const scroller = ref<any>(null)
const showFixedButtons = ref(false)

function handleScroll(event: Event): void {
  const scrollTop = (event?.target as HTMLElement | null)?.scrollTop || 0
  showFixedButtons.value = scrollTop > 0 && !playerStore.showLyrics
}

// 歌词页打开时隐藏悬浮按钮
watch(
  () => playerStore.showLyrics,
  (visible) => {
    const scrollTop = scroller.value?.$el?.scrollTop || 0
    showFixedButtons.value = scrollTop > 0 && !visible
  }
)

function scrollToItem(index: number): void {
  if (!scroller.value) return
  scroller.value.scrollToItem(index)
}

function scrollToTop(): void {
  if (!scroller.value || rows.value.length === 0) return
  nextTick(() => setTimeout(() => scroller.value?.scrollToItem(0), 50))
}

function scrollToCurrentSong(): void {
  const targetId = currentSongId.value
  if (!targetId || !scroller.value) return
  const index = rows.value.findIndex((r) => r.rid === targetId)
  if (index === -1) return
  nextTick(() =>
    setTimeout(() => {
      scroller.value?.scrollToItem(index)
      // 定位后闪烁高亮 1500ms
      const el = document.querySelector(`[data-song-id="${targetId}"]`)
      if (el) {
        el.classList.add('highlighted')
        setTimeout(() => el.classList.remove('highlighted'), 1500)
      }
    }, 50)
  )
}

// ── 表头配置 ──
const headers = computed<TableHeader[]>(() => {
  const h: TableHeader[] = []

  if (props.showCheckbox) {
    h.push({ key: 'checkbox', label: '', width: '40px' })
  }
  h.push({ key: 'index', label: '#', width: '40px' })
  if (props.showCover) {
    h.push({ key: 'cover', label: '', width: '50px' })
  }

  if (props.mode === 'local') {
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

const gridTemplateStyle = computed(() => ({
  gridTemplateColumns: headers.value.map((h) => h.width).join(' '),
}))

// ── 骨架屏行数（与分页 pageSize 对齐） ──
const skeletonRowCount = computed(() => Math.max(1, Math.floor(props.pageSize)))

// ── 暴露方法 ──
defineExpose({
  scrollToTop,
  scrollToCurrentSong,
  scrollToItem,
})
</script>

<template>
  <div class="flex flex-col flex-1 overflow-hidden relative bg-surface-base text-content-base"
    :style="{ height: containerHeight }">

    <!-- 在线模式：批量操作栏 -->
    <div v-if="mode === 'online' && selectedIdSet.size > 0"
      class="flex items-center gap-3 px-4 py-2 bg-accent-green/10 border-b border-accent-green/20 shrink-0">
      <span class="text-sm text-accent-green">已选择 {{ selectedIdSet.size }} 首</span>
      <CustomButton type="primary" size="small" icon="download" @click="handleBatchDownload">
        批量下载
      </CustomButton>
      <CustomButton type="secondary" size="small" @click="clearSelection">
        取消选择
      </CustomButton>
    </div>

    <!-- 加载状态（local 首次加载） -->
    <div v-if="mode === 'local' && loading && songs.length === 0"
      class="flex items-center justify-center flex-1 p-8">
      <LoadingSpinner :text="loadingText || '加载中...'" />
    </div>

    <!-- 错误提示（online 模式） -->
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
    <template v-else>
      <!-- ========== 表头 ========== -->
      <div
        :class="[
          'bg-surface-elevated text-content-secondary h-10 border-b border-line-base shrink-0 sticky top-0 z-[1]',
          mode === 'online' ? 'grid items-center gap-2 px-4' : 'flex items-center px-2.5'
        ]"
        :style="mode === 'online' ? gridTemplateStyle : {}">

        <!-- online 表头 -->
        <template v-if="mode === 'online'">
          <div v-for="h in headers" :key="h.key"
            class="flex items-center font-medium text-sm whitespace-nowrap overflow-hidden text-ellipsis">
            <template v-if="h.key === 'checkbox'">
              <CustomCheckbox :checked="isAllSelected" :indeterminate="isPartialSelected"
                size="small" @change="toggleSelectAll" />
            </template>
            <span v-else-if="h.key !== 'cover'">{{ h.label }}</span>
          </div>
        </template>

        <!-- local 表头 -->
        <template v-else>
          <div v-for="h in headers" :key="h.key"
            :class="[
              'flex items-center p-2 font-medium text-sm whitespace-nowrap overflow-hidden text-ellipsis',
              h.sortable ? 'cursor-pointer transition-colors duration-200 hover:text-content-base' : ''
            ]"
            :style="{ width: h.width, flexShrink: h.key === 'index' || h.key === 'cover' || h.key === 'checkbox' ? 0 : undefined }"
            @click="h.sortable ? handleSort(h.key) : null">
            {{ h.label }}
            <FAIcon v-if="h.sortable && sortBy === h.key"
              :name="sortDirection === 'asc' ? 'sort-asc' : 'sort-desc'" size="small" class="ml-[5px]" />
          </div>
          <!-- 操作列留白 -->
          <div v-if="actionColumnType !== 'none'" class="shrink-0 p-2" style="width:80px"></div>
        </template>
      </div>

      <!-- ========== 表格体 ========== -->
      <div class="flex-1 relative flex flex-col min-h-0 overflow-hidden">

        <!-- online 模式：骨架屏（行数与 pageSize 对齐） -->
        <template v-if="mode === 'online' && loading">
          <div v-for="n in skeletonRowCount" :key="'skeleton-' + n"
            class="grid gap-2 px-4 py-2 border-b border-line-base items-center animate-pulse shrink-0"
            :style="gridTemplateStyle">
            <div v-if="showCheckbox" class="flex items-center justify-center">
              <div class="w-4 h-4 rounded bg-surface-overlay"></div>
            </div>
            <div class="flex items-center">
              <div class="w-4 h-4 rounded bg-surface-overlay"></div>
            </div>
            <div v-if="showCover" class="flex items-center">
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

        <!-- 统一虚拟滚动列表 -->
        <RecycleScroller v-else ref="scroller"
          class="flex-1 min-h-0 w-full overflow-y-auto"
          :items="rows" :item-size="rowHeight" key-field="rid"
          :emit-update="true"
          v-slot="{ item: row, index }"
          @update="onScrollerUpdate"
          @scroll="handleScroll">

          <!-- ──────── local 行 ──────── -->
          <div v-if="mode === 'local'"
            :class="localRowClasses(row)"
            :data-song-id="row.rid"
            @dblclick="handlePlaySong(row.song)"
            @mouseenter="hoveredSongId = row.rid"
            @mouseleave="hoveredSongId = null"
            @contextmenu="handleContextMenu($event, row.song)">

            <!-- 复选框 -->
            <div v-if="showCheckbox" class="p-2 flex items-center justify-center" style="width:40px;flex-shrink:0" @click.stop>
              <CustomCheckbox :checked="selectedIdSet.has(row.rid)" size="small" @change="toggleSelect(row.rid)" />
            </div>

            <!-- 序号（RecycleScroller 的 index 即真实索引） -->
            <div :class="[
              'p-2 flex items-center justify-center font-medium text-xs',
              currentSongId === row.rid ? 'text-accent-green' : 'text-content-secondary'
            ]" style="width:40px;flex-shrink:0">
              {{ index + 1 }}
            </div>

            <!-- 封面 -->
            <div v-if="showCover" class="p-2 flex items-center" style="width:50px;flex-shrink:0">
              <div class="relative w-10 h-10 rounded overflow-hidden shrink-0">
                <img :src="getLocalCoverUrl(row.rid)" alt="封面"
                  class="w-full h-full object-cover rounded bg-surface-overlay shadow-md transition-transform duration-200 group-hover:scale-110"
                  @error.once="songCovers[row.rid] = placeholderCover" />
                <transition name="fade">
                  <div v-if="hoveredSongId === row.rid"
                    class="absolute inset-0 bg-overlay-dark flex items-center justify-center cursor-pointer rounded"
                    @click="handlePlaySong(row.song)">
                    <FAIcon name="play" size="large" color="primary" />
                  </div>
                </transition>
              </div>
            </div>

            <!-- 歌曲名 -->
            <div class="p-2 truncate flex items-center text-sm"
              :style="{ width: showPlayCount ? '30%' : '35%' }">
              {{ getTitle(row.song) }}
            </div>

            <!-- 歌手 -->
            <div class="p-2 truncate flex items-center text-sm text-content-secondary"
              :style="{ width: showPlayCount ? '15%' : '20%' }">
              {{ getArtist(row.song) }}
            </div>

            <!-- 专辑 -->
            <div class="p-2 truncate flex items-center text-sm text-content-secondary"
              :style="{ width: showPlayCount ? '20%' : '25%' }">
              {{ getAlbumName(row.song) }}
            </div>

            <!-- 播放次数 -->
            <div v-if="showPlayCount" class="p-2 flex items-center text-sm text-content-secondary"
              style="width:10%">
              {{ row.song.playCount || 0 }}
            </div>

            <!-- 时长 -->
            <div class="p-2 flex items-center text-sm text-content-tertiary" style="width:10%">
              {{ getDuration(row.song) }}
            </div>

            <!-- 操作列 -->
            <div v-if="actionColumnType !== 'none'"
              class="p-2 flex items-center justify-center gap-0.5 shrink-0" style="width:80px" @click.stop>
              <template v-if="actionColumnType === 'metadata'">
                <CustomButton type="icon-only" icon="edit" size="small" :circle="true" title="编辑元数据"
                  @click="emitAction('edit', row.song)" />
                <CustomButton type="icon-only" icon="search" size="small" :circle="true" title="搜索在线元数据"
                  @click="emitAction('search-online', row.song)" />
              </template>
              <template v-else-if="actionColumnType === 'remove'">
                <CustomButton type="icon-only" icon="trash" size="small" :circle="true" title="从歌单移除"
                  @click="emitAction('remove', row.song)" />
              </template>
            </div>
          </div>

          <!-- ──────── online 行 ──────── -->
          <div v-else
            :class="onlineRowClasses(row)"
            :style="gridTemplateStyle"
            :data-song-id="row.rid"
            @click="handleRowClick(row.song)">

            <!-- 复选框 -->
            <div v-if="showCheckbox" class="flex items-center justify-center" @click.stop>
              <CustomCheckbox :checked="selectedIdSet.has(row.rid)" size="small" @change="toggleSelect(row.rid)" />
            </div>

            <!-- 序号（分页偏移） -->
            <div class="text-sm text-content-tertiary flex items-center">{{ startIndex + index }}</div>

            <!-- 封面 -->
            <div v-if="showCover" class="flex items-center">
              <template v-if="getOnlineCoverUrl(row.song) && !coverErrorFlags[row.rid]">
                <img :src="getOnlineCoverUrl(row.song)"
                  :alt="getTitle(row.song)" loading="lazy"
                  class="w-9 h-9 rounded object-cover bg-surface-overlay"
                  @error.once="coverErrorFlags[row.rid] = true" />
              </template>
              <template v-else>
                <div class="w-9 h-9 rounded bg-surface-overlay flex items-center justify-center">
                  <FAIcon name="music" size="small" color="disabled" />
                </div>
              </template>
            </div>

            <!-- 歌名 -->
            <div class="text-sm text-content-base truncate font-medium" :title="getTitle(row.song)">
              {{ getTitle(row.song) }}
            </div>

            <!-- 歌手 -->
            <div class="text-sm text-content-secondary truncate" :title="getArtist(row.song)">
              {{ getArtist(row.song) }}
            </div>

            <!-- 专辑 -->
            <div class="text-sm text-content-secondary truncate" :title="getAlbumName(row.song)">
              {{ getAlbumName(row.song) }}
            </div>

            <!-- 时长 -->
            <div class="text-sm text-content-tertiary">{{ getDuration(row.song) }}</div>

            <!-- 格式 -->
            <div v-if="showFormat" class="text-sm">
              <span v-if="row.song.songUrl?.urlType"
                class="px-1.5 py-0.5 text-xs rounded bg-surface-overlay text-content-secondary uppercase">
                {{ row.song.songUrl.urlType }}
              </span>
              <span v-else class="text-content-disabled">-</span>
            </div>

            <!-- 操作列：播放 / 下载 -->
            <div v-if="showAction" class="flex items-center justify-center gap-1" @click.stop>
              <button
                class="w-[26px] h-[26px] inline-flex items-center justify-center cursor-pointer select-none disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-125 transition-all duration-150"
                style="color:#4caf50"
                :disabled="!row.song.songUrl?.url"
                :title="row.song.songUrl?.url ? (unifyActions ? '播放' : '试听') : (unifyActions ? '无可用的播放链接' : '登录后可试听')"
                @click="handlePlaySong(row.song)">
                <FAIcon name="play" size="small" color="current" />
              </button>
              <button
                class="w-[26px] h-[26px] inline-flex items-center justify-center cursor-pointer select-none disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-125 transition-all duration-150"
                style="color:#4caf50"
                :disabled="!row.song.songUrl?.url || officialDisabled || isDownloading(row.rid)"
                title="下载"
                @click="emit('download', row.song)">
                <FAIcon :name="isDownloading(row.rid) ? 'spinner' : 'download'" size="small" color="current" />
              </button>
            </div>
          </div>
        </RecycleScroller>

        <!-- 固定滚动按钮 -->
        <transition name="slide-fade">
          <div v-if="showScrollButtons && showFixedButtons"
            class="fixed right-5 bottom-[110px] flex flex-col gap-2.5 z-[100]">
            <CustomButton type="icon-only" icon="crosshairs" size="medium" circle
              customClass="!w-11 !h-11" @click="scrollToCurrentSong" title="定位当前播放歌曲" />
            <CustomButton type="icon-only" icon="arrow-up" size="medium" circle
              customClass="!w-11 !h-11" @click="scrollToTop" title="回到顶部" />
          </div>
        </transition>
      </div>
    </template>

    <!-- 右键菜单 -->
    <ContextMenu v-if="contextMenuType" :show="contextMenu.show" :x="contextMenu.x" :y="contextMenu.y"
      :song="contextMenu.song" :menu-type="contextMenuType"
      @close="closeContextMenu" @action="handleMenuAction" />

    <!-- 歌曲信息对话框 -->
    <div v-if="songInfoDialogVisible && currentSongForInfo"
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
  </div>
</template>

<style scoped>
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

/* dialog-content 滚动条 */
.dialog-content::-webkit-scrollbar {
  width: 6px;
}
.dialog-content::-webkit-scrollbar-track {
  background: var(--color-surface-base);
}
.dialog-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}

/* 定位闪烁动画（scrollToCurrentSong 通过 classList.add('highlighted') 触发） */
[data-song-id].highlighted {
  animation: playingPulse 1.5s ease;
}
</style>
