<script setup lang="ts">
/**
 * BaseSongTable
 * 统一歌曲表格组件，支持本地/在线两种模式
 * mode="local": flex 布局 + IPC 封面加载
 * mode="online": Grid 布局 + 复选框批量操作
 * 依赖组件：CustomButton, CustomCheckbox, FAIcon, LoadingSpinner
 */
import { ref, computed, reactive, watch } from 'vue'
import { usePlayerStore } from '../../store/player'
import { formatDuration } from '../../utils/timeUtils'
import FAIcon from '../common/FAIcon.vue'
import CustomButton from '../custom/CustomButton.vue'
import CustomCheckbox from '../custom/CustomCheckbox.vue'
import LoadingSpinner from '../custom/LoadingSpinner.vue'

type TableMode = 'local' | 'online'

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
  emptyText?: string
  emptyIcon?: string
  containerHeight?: string
  currentListId?: string
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
  emptyText: '暂无歌曲',
  emptyIcon: 'music',
  containerHeight: '100%',
  currentListId: 'default',
})

const emit = defineEmits<{
  (e: 'play-song', payload: { song: SongItem; listId: string; songIds: any[] }): void
  (e: 'play', song: SongItem): void
  (e: 'download', song: SongItem): void
  (e: 'batch-download', songs: SongItem[]): void
  (e: 'selection-change', songs: SongItem[]): void
  (e: 'click-song', song: SongItem): void
}>()

const playerStore = usePlayerStore()

const hoveredSongId = ref<any>(null)
const selectedIds = ref(new Set<string>())

const songCovers = reactive<Record<string, string>>({})
const placeholderCover = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='

const currentSongId = computed(() => playerStore.currentSong?.id || null)
const isPlaying = computed(() => playerStore.playing)

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
  return songCovers[song.id!] || placeholderCover
}

function getDuration(song: SongItem): string {
  if (typeof song.duration === 'string') return song.duration
  return formatDuration(song.duration || 0)
}

// local 模式：监听 songs 变化触发封面加载
watch(() => props.songs, (songs) => {
  if (props.mode === 'local') {
    songs.forEach(s => { if (s.id) loadCover(s.id) })
  }
}, { immediate: true })

async function loadCover(songId: any) {
  if (!songId || songCovers[songId] || props.mode === 'online') return
  try {
    const result = await (window.electronAPI.getSongCover as any)(songId)
    if (result.success && result.cover) {
      const fmt = result.format || 'image/jpeg'
      songCovers[songId] = `data:${fmt};base64,${result.cover}`
    }
  } catch { /* ignore */ }
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

function isDownloading(song: SongItem): boolean {
  return props.downloadingIds.has(getSongId(song))
}

// ── 行点击 ──
function handleRowClick(song: SongItem) {
  if (props.mode === 'online') {
    emit('click-song', song)
  } else {
    handlePlaySong(song)
  }
}

function handlePlaySong(song: SongItem) {
  if (props.mode === 'online') {
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
  if (props.mode === 'local') {
    handlePlaySong(song)
  }
}

// ── 表头配置 ──
const headers = computed(() => {
  const h: Array<{ key: string; label: string; width: string }> = []

  if (props.showCheckbox) {
    h.push({ key: 'checkbox', label: '', width: '40px' })
  }

  h.push({ key: 'index', label: '#', width: '40px' })
  h.push({ key: 'cover', label: '', width: '50px' })

  if (props.mode === 'local') {
    h.push({ key: 'title', label: '歌曲名', width: props.showPlayCount ? '30%' : '35%' })
    h.push({ key: 'artist', label: '歌手', width: props.showPlayCount ? '15%' : '20%' })
    h.push({ key: 'album', label: '专辑', width: props.showPlayCount ? '20%' : '25%' })
    if (props.showPlayCount) {
      h.push({ key: 'playCount', label: '播放次数', width: '10%' })
    }
    h.push({ key: 'duration', label: '时长', width: '10%' })
  } else {
    h.push({ key: 'title', label: '歌名', width: '2fr' })
    h.push({ key: 'artist', label: '歌手', width: '1.5fr' })
    h.push({ key: 'album', label: '专辑', width: '1.5fr' })
    h.push({ key: 'duration', label: '时长', width: '50px' })
    if (props.showFormat) {
      h.push({ key: 'format', label: '格式', width: '50px' })
    }
    if (props.showAction) {
      h.push({ key: 'action', label: '操作', width: '70px' })
    }
  }

  return h
})

const gridTemplateStyle = computed(() => {
  const widths = headers.value.map(h => h.width).join(' ')
  return { gridTemplateColumns: widths }
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

    <!-- 加载状态 -->
    <div v-if="loading" class="flex items-center justify-center flex-1 p-8">
      <LoadingSpinner :text="loadingText || (mode === 'online' ? '搜索中...' : '加载中...')" />
    </div>

    <!-- 错误提示（在线模式） -->
    <div v-else-if="errorMsg"
      class="mx-4 mt-4 flex items-center gap-2 text-sm text-accent-danger bg-accent-danger/10 border border-accent-danger/30 rounded-lg px-3 py-2 shrink-0">
      <FAIcon name="exclamation-circle" size="small" color="danger" />
      <span>{{ errorMsg }}</span>
    </div>

    <!-- 空状态 -->
    <div v-else-if="songs.length === 0"
      class="flex flex-col items-center justify-center flex-1 text-content-secondary p-8">
      <FAIcon :name="emptyIcon" size="xl" color="secondary" />
      <p class="text-lg mb-6 font-medium mt-3">{{ emptyText }}</p>
    </div>

    <!-- 表格区域 -->
    <template v-else>
      <!-- 表头 -->
      <div
        :class="[
          'bg-surface-elevated text-content-secondary h-10 border-b border-line-base shrink-0 sticky top-0 z-[1]',
          mode === 'online' ? 'grid items-center gap-2 px-4' : 'flex items-center px-2.5'
        ]"
        :style="mode === 'online' ? gridTemplateStyle : {}">
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
        <template v-else>
          <div v-for="h in headers" :key="h.key"
            class="flex items-center p-2 font-medium text-sm whitespace-nowrap overflow-hidden text-ellipsis"
            :style="{ width: h.width, flexShrink: h.key === 'index' || h.key === 'cover' ? 0 : undefined }">
            {{ h.label }}
          </div>
        </template>
      </div>

      <!-- 表格体 -->
      <div class="flex-1 overflow-y-auto relative">
        <!-- 在线模式：加载遮罩 -->
        <Transition name="loading-fade">
          <div v-if="mode === 'online' && loading"
            class="absolute inset-0 z-10 flex flex-col items-center justify-center bg-surface-base/80 backdrop-blur-sm">
            <LoadingSpinner :text="loadingText" />
          </div>
        </Transition>

        <!-- 本地模式：RecycleScroller 虚拟滚动 -->
        <template v-if="mode === 'local'">
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

              <!-- Checkbox -->
              <div v-if="showCheckbox" class="p-2 flex items-center justify-center" style="width:40px;flex-shrink:0" @click.stop>
                <CustomCheckbox :checked="isSelected(song)" size="small" @change="toggleSelect(song)" />
              </div>

              <!-- 序号 -->
              <div :class="[
                'p-2 flex items-center justify-center font-medium text-xs',
                currentSongId === song.id ? 'text-accent-green' : 'text-content-secondary'
              ]" style="width:40px;flex-shrink:0">
                {{ index + 1 }}
              </div>

              <!-- 封面 -->
              <div v-if="showCover" class="p-2 flex items-center" style="width:50px;flex-shrink:0">
                <div class="relative w-10 h-10 rounded overflow-hidden shrink-0">
                  <img :src="getCoverUrl(song)" alt="封面" class="w-full h-full object-cover rounded bg-surface-overlay"
                    @error.once="songCovers[song.id!] = placeholderCover" />
                </div>
              </div>

              <!-- 歌名 -->
              <div class="p-2 truncate flex items-center text-sm"
                :style="{ width: showPlayCount ? '30%' : '35%' }">
                {{ getTitle(song) }}
              </div>

              <!-- 歌手 -->
              <div class="p-2 truncate flex items-center text-sm text-content-secondary"
                :style="{ width: showPlayCount ? '15%' : '20%' }">
                {{ getArtist(song) }}
              </div>

              <!-- 专辑 -->
              <div class="p-2 truncate flex items-center text-sm text-content-secondary"
                :style="{ width: showPlayCount ? '20%' : '25%' }">
                {{ getAlbumName(song) }}
              </div>

              <!-- 播放次数 -->
              <div v-if="showPlayCount" class="p-2 flex items-center text-sm text-content-secondary"
                style="width:10%">
                {{ song.playCount || 0 }}
              </div>

              <!-- 时长 -->
              <div class="p-2 flex items-center text-sm text-content-tertiary" style="width:10%">
                {{ getDuration(song) }}
              </div>
            </div>
          </div>
        </template>

        <!-- 在线模式：静态 Grid 渲染 -->
        <template v-else>
          <div v-for="(song, index) in songs" :key="getSongId(song)"
            :class="[
              'grid gap-2 px-4 py-2 border-b border-line-base items-center hover:bg-overlay-light transition-colors group cursor-pointer',
              isSelected(song) ? 'bg-accent-green/[0.04] shadow-[inset_3px_0_0_0_rgba(76,175,80,0.5)]' : ''
            ]"
            :style="gridTemplateStyle"
            @click="handleRowClick(song)">

            <!-- Checkbox -->
            <div v-if="showCheckbox" class="flex items-center justify-center" @click.stop>
              <CustomCheckbox :checked="isSelected(song)" size="small" @change="toggleSelect(song)" />
            </div>

            <!-- 序号 -->
            <div class="text-sm text-content-tertiary flex items-center">{{ startIndex + index }}</div>

            <!-- 封面 -->
            <div v-if="showCover" class="flex items-center">
              <img v-if="(song.album as any)?.albumCoverUrl"
                :src="(song.album as any).albumCoverUrl"
                :alt="getTitle(song)" loading="lazy"
                class="w-9 h-9 rounded object-cover bg-surface-overlay"
                @error.once="(e: any) => { e.target.style.display = 'none' }" />
              <div v-else class="w-9 h-9 rounded bg-surface-overlay flex items-center justify-center">
                <FAIcon name="music" size="small" color="disabled" />
              </div>
            </div>

            <!-- 歌名 -->
            <div class="text-sm text-content-base truncate font-medium" :title="getTitle(song)">
              {{ getTitle(song) }}
            </div>

            <!-- 歌手 -->
            <div class="text-sm text-content-secondary truncate" :title="getArtist(song)">
              {{ getArtist(song) }}
            </div>

            <!-- 专辑 -->
            <div class="text-sm text-content-secondary truncate" :title="getAlbumName(song)">
              {{ getAlbumName(song) }}
            </div>

            <!-- 时长 -->
            <div class="text-sm text-content-tertiary">{{ getDuration(song) }}</div>

            <!-- 格式 -->
            <div v-if="showFormat" class="text-sm">
              <span v-if="song.songUrl?.urlType"
                class="px-1.5 py-0.5 text-xs rounded bg-surface-overlay text-content-secondary uppercase">
                {{ song.songUrl.urlType }}
              </span>
              <span v-else class="text-content-disabled">-</span>
            </div>

            <!-- 操作 -->
            <div v-if="showAction" class="flex items-center justify-center gap-1" @click.stop>
              <CustomButton type="icon-only" size="small" icon="play"
                :disabled="!song.songUrl?.url"
                :title="song.songUrl?.url ? '试听' : '登录后可试听'"
                @click="handlePlaySong(song)" />
              <CustomButton type="icon-only" size="small"
                :icon="isDownloading(song) ? 'spinner' : 'download'"
                :loading="isDownloading(song)"
                :disabled="!song.songUrl?.url || isDownloading(song)"
                title="下载"
                @click="emit('download', song)" />
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
</style>
