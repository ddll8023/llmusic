<template>
	<div class="flex flex-col w-full">
		<!-- 批量操作栏 -->
		<div v-if="selectedIds.length > 0" class="flex items-center gap-3 px-4 py-2 bg-primary-900/30 border-b border-primary-800/40">
			<span class="text-sm text-primary-300">已选择 {{ selectedIds.length }} 首</span>
			<button
				class="px-3 py-1 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors"
				@click="handleBatchDownload">
				<i class="fa fa-download mr-1" aria-hidden="true"></i>批量下载
			</button>
			<button
				class="px-3 py-1 text-sm text-content-secondary border border-line-light rounded hover:bg-surface-overlay transition-colors"
				@click="clearSelection">
				取消选择
			</button>
		</div>

		<!-- 表头 -->
		<div class="grid gap-2 px-4 py-2 bg-surface-overlay border-b border-line-base text-xs font-medium text-content-tertiary uppercase tracking-wider select-none"
			:style="gridTemplate">
			<div class="flex items-center justify-center">
				<input type="checkbox" :checked="isAllSelected" :indeterminate="isPartialSelected"
					class="w-4 h-4 rounded border-line-light text-primary-600 focus:ring-primary-500 cursor-pointer"
					@change="toggleSelectAll" />
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
		<div class="flex-1 overflow-y-auto">
			<div v-for="(song, index) in songs" :key="song.songMid || song.songId"
				class="grid gap-2 px-4 py-2 border-b border-line-base items-center hover:bg-surface-overlay transition-colors group"
				:class="{ 'bg-primary-900/20': isSelected(song) }"
				:style="gridTemplate">
				<!-- Checkbox -->
				<div class="flex items-center justify-center">
					<input type="checkbox" :checked="isSelected(song)"
						class="w-4 h-4 rounded border-line-light text-primary-600 focus:ring-primary-500 cursor-pointer"
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
						<i class="fa fa-music text-content-disabled text-xs" aria-hidden="true"></i>
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
					<button
						class="p-1.5 text-content-tertiary hover:text-primary-400 transition-colors rounded hover:bg-surface-overlay"
						title="试听" aria-label="试听"
						@click="$emit('play', song)">
						<i class="fa fa-play text-xs" aria-hidden="true"></i>
					</button>
					<button
						class="p-1.5 text-content-tertiary hover:text-primary-400 transition-colors rounded hover:bg-surface-overlay"
						:class="{ 'opacity-50 cursor-not-allowed': !song.songUrl?.url || isDownloading(song) }"
						:disabled="!song.songUrl?.url || isDownloading(song)"
						title="下载" aria-label="下载"
						@click="$emit('download', song)">
						<i :class="isDownloading(song) ? 'fa fa-spinner fa-spin' : 'fa fa-download'" class="text-xs"
							aria-hidden="true"></i>
					</button>
				</div>
			</div>

			<!-- 空状态 -->
			<div v-if="songs.length === 0" class="flex flex-col items-center justify-center py-16 text-content-disabled">
				<i class="fa fa-music text-4xl mb-3" aria-hidden="true"></i>
				<span class="text-sm">暂无搜索结果</span>
			</div>
		</div>
	</div>
</template>

<script setup>
/**
 * OnlineSongTable
 * 通用在线歌曲表格组件
 * 依赖组件：无
 */
import { ref, computed } from 'vue'

const props = defineProps({
	songs: { type: Array, required: true },
	startIndex: { type: Number, default: 1 },
	downloadingIds: { type: Set, default: () => new Set() },
})

const emit = defineEmits(['play', 'download', 'batch-download'])

const selectedIds = ref(new Set())

const gridTemplate = {
	gridTemplateColumns: '40px 36px 44px minmax(120px, 2fr) minmax(80px, 1.5fr) minmax(80px, 1.5fr) 50px 50px 70px',
}

const isAllSelected = computed(() =>
	props.songs.length > 0 && selectedIds.value.size === props.songs.length
)

const isPartialSelected = computed(() =>
	selectedIds.value.size > 0 && selectedIds.value.size < props.songs.length
)

function isSelected(song) {
	return selectedIds.value.has(song.songMid || song.songId)
}

function isDownloading(song) {
	return props.downloadingIds.has(song.songMid || song.songId)
}

function toggleSelect(song) {
	const id = song.songMid || song.songId
	if (selectedIds.value.has(id)) {
		selectedIds.value.delete(id)
	} else {
		selectedIds.value.add(id)
	}
	selectedIds.value = new Set(selectedIds.value)
}

function toggleSelectAll() {
	if (isAllSelected.value) {
		selectedIds.value = new Set()
	} else {
		selectedIds.value = new Set(props.songs.map(s => s.songMid || s.songId))
	}
}

function clearSelection() {
	selectedIds.value = new Set()
}

function handleBatchDownload() {
	const selected = props.songs.filter(s => isSelected(s))
	emit('batch-download', selected)
}
</script>
