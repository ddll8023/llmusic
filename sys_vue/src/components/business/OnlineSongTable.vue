<template>
		<div class="flex flex-col w-full h-full relative">
				<!-- 批量操作栏 -->
				<div v-if="selectedIds.size > 0" class="flex items-center gap-3 px-4 py-2 bg-accent-green/10 border-b border-accent-green/20">
					<span class="text-sm text-accent-green">已选择 {{ selectedIds.size }} 首</span>
					<CustomButton type="primary" size="small" icon="download" @click="handleBatchDownload">
						批量下载
					</CustomButton>
					<CustomButton type="secondary" size="small" @click="clearSelection">
						取消选择
					</CustomButton>
				</div>

				<!-- 表头 -->
				<div class="grid gap-2 px-4 py-2 bg-surface-overlay border-b border-line-base text-xs font-medium text-content-tertiary uppercase tracking-wider select-none"
					:style="gridTemplate">
					<div class="flex items-center justify-center">
						<CustomCheckbox :checked="isAllSelected" :indeterminate="isPartialSelected"
							size="small" @change="toggleSelectAll" />
					</div>
					<div class="flex items-center">#</div>
					<div class="flex items-center">封面</div>
					<div class="flex items-center">歌名</div>
					<div class="flex items-center">歌手</div>
					<div class="flex items-center">专辑</div>
					<div class="flex items-center">时长</div>
					<div class="flex items-center">格式</div>
					<div class="flex items-center justify-center">操作</div>
				</div>

				<!-- 表体 -->
				<div class="flex-1 overflow-y-auto relative">
					<!-- 加载遮罩 -->
					<Transition name="loading-fade">
						<div v-if="loading" class="absolute inset-0 z-10 flex flex-col items-center justify-center bg-surface-base/80 backdrop-blur-sm">
              <LoadingSpinner :text="loadingText" />
						</div>
					</Transition>

					<!-- 错误提示 -->
					<div v-if="errorMsg"
						class="mx-4 my-4 flex items-center gap-2 text-sm text-accent-danger bg-accent-danger/10 border border-accent-danger/30 rounded-lg px-3 py-2">
						<FAIcon name="exclamation-circle" size="small" color="danger" />
						<span>{{ errorMsg }}</span>
					</div>

					<div v-for="(song, index) in songs" :key="song.songMid || song.songId"
						class="grid gap-2 px-4 py-2 border-b border-line-base items-center hover:bg-surface-overlay transition-colors group"
						:class="{ 'bg-accent-green/[0.04] shadow-[inset_3px_0_0_0_rgba(76,175,80,0.5)]': isSelected(song) }"
						:style="gridTemplate">
						<!-- Checkbox -->
						<div class="flex items-center justify-center">
							<CustomCheckbox :checked="isSelected(song)" size="small"
								@change="toggleSelect(song)" />
						</div>

						<!-- 序号 -->
						<div class="text-sm text-content-tertiary">{{ startIndex + index }}</div>

						<!-- 封面 -->
						<div class="flex items-center">
							<img v-if="song.album?.albumCoverUrl" :src="song.album.albumCoverUrl"
								:alt="song.songName" loading="lazy"
								class="w-9 h-9 rounded object-cover bg-surface-overlay" />
							<div v-else class="w-9 h-9 rounded bg-surface-overlay flex items-center justify-center">
								<FAIcon name="music" size="small" color="disabled" />
							</div>
						</div>

						<!-- 歌名 -->
						<div class="text-sm text-content-base truncate font-medium" :title="song.songName">
							{{ song.songName }}
						</div>

						<!-- 歌手 -->
						<div class="text-sm text-content-secondary truncate" :title="song.singer">
							{{ song.singer }}
						</div>

						<!-- 专辑 -->
						<div class="text-sm text-content-secondary truncate" :title="song.album?.albumName">
							{{ song.album?.albumName || '-' }}
						</div>

						<!-- 时长 -->
						<div class="text-sm text-content-tertiary">{{ song.duration || '-' }}</div>

						<!-- 格式 -->
						<div class="text-sm">
							<span v-if="song.songUrl?.urlType" class="px-1.5 py-0.5 text-xs rounded bg-surface-overlay text-content-secondary uppercase">
								{{ song.songUrl.urlType }}
							</span>
							<span v-else class="text-content-disabled">-</span>
						</div>

						<!-- 操作 -->
						<div class="flex items-center justify-center gap-1">
							<CustomButton type="icon-only" size="small" icon="play"
								:disabled="!song.songUrl?.url"
								:title="song.songUrl?.url ? '试听' : '登录后可试听'"
								@click="$emit('play', song)" />
							<CustomButton type="icon-only" size="small"
								:icon="isDownloading(song) ? 'spinner' : 'download'"
								:loading="isDownloading(song)"
								:disabled="!song.songUrl?.url || isDownloading(song)"
								title="下载"
								@click="$emit('download', song)" />
						</div>
					</div>

					<!-- 空状态 -->
					<div v-if="songs.length === 0 && !loading && !errorMsg" class="flex flex-col items-center justify-center py-16 text-content-disabled">
						<FAIcon name="music" size="xl" color="disabled" custom-class="mb-3" />
						<span class="text-sm">暂无搜索结果</span>
					</div>
				</div>
			</div>
		</template>

		<script setup lang="ts">
/**
 * OnlineSongTable
 * 通用在线歌曲表格组件
 * 依赖组件：CustomButton、FAIcon
 */
import { ref, computed } from 'vue'
import type { OnlineSong } from '../../types/api'
import CustomButton from '../custom/CustomButton.vue'
import CustomCheckbox from '../custom/CustomCheckbox.vue'
import FAIcon from '../common/FAIcon.vue'
import LoadingSpinner from '../custom/LoadingSpinner.vue'

/** 表格行数据：在 OnlineSong 基础上补充模板使用的额外字段 */
type SongTableItem = OnlineSong & {
	duration?: string
	album?: {
		albumMid?: string
		albumCoverUrl?: string
		albumName?: string
	}
}

interface Props {
	songs: SongTableItem[]
	startIndex?: number
	downloadingIds?: Set<string>
	loading?: boolean
	loadingText?: string
	errorMsg?: string
}

const props = withDefaults(defineProps<Props>(), {
	songs: () => [],
	startIndex: 1,
	downloadingIds: () => new Set<string>(),
	loading: false,
	loadingText: '',
	errorMsg: '',
})

const emit = defineEmits<{
	(e: 'play', song: SongTableItem): void
	(e: 'download', song: SongTableItem): void
	(e: 'batch-download', songs: SongTableItem[]): void
	(e: 'selection-change', songs: SongTableItem[]): void
}>()

const selectedIds = ref(new Set<string>())

const gridTemplate = {
	gridTemplateColumns: '40px 36px 44px minmax(120px, 2fr) minmax(80px, 1.5fr) minmax(80px, 1.5fr) 50px 50px 70px',
}

const isAllSelected = computed(() =>
	props.songs.length > 0 && selectedIds.value.size === props.songs.length
)

const isPartialSelected = computed(() =>
	selectedIds.value.size > 0 && selectedIds.value.size < props.songs.length
)

function isSelected(song: SongTableItem): boolean {
	return selectedIds.value.has(song.songMid || song.songId!)
}

function isDownloading(song: SongTableItem): boolean {
	return props.downloadingIds.has(song.songMid || song.songId!)
}

function toggleSelect(song: SongTableItem): void {
	const id = song.songMid || song.songId!
	if (selectedIds.value.has(id)) {
		selectedIds.value.delete(id)
	} else {
		selectedIds.value.add(id)
	}
	selectedIds.value = new Set(selectedIds.value)
	emitSelectionChange()
}

function toggleSelectAll(): void {
	if (isAllSelected.value) {
		selectedIds.value = new Set()
	} else {
		selectedIds.value = new Set(props.songs.map(s => s.songMid || s.songId!))
	}
	emitSelectionChange()
}

function clearSelection(): void {
	selectedIds.value = new Set()
	emitSelectionChange()
}

function emitSelectionChange(): void {
	const selected = props.songs.filter(s => isSelected(s))
	emit('selection-change', selected)
}

function handleBatchDownload(): void {
	const selected = props.songs.filter(s => isSelected(s))
	emit('batch-download', selected)
}
</script>

		<style scoped>
		/* 加载遮罩过渡 */
		.loading-fade-enter-active,
		.loading-fade-leave-active {
			transition: opacity 0.3s ease;
		}
		.loading-fade-enter-from,
		.loading-fade-leave-to {
			opacity: 0;
		}

        /* 加载动画已迁移至 LoadingSpinner 组件 */
		</style>
