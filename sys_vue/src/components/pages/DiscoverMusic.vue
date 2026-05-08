<template>
		<div class="flex flex-col h-full bg-surface-base">
			<!-- 搜索栏 -->
			<header class="flex-shrink-0 bg-surface-elevated border-b border-line-base px-6 py-4">
				<h1 class="text-xl font-semibold text-content-base mb-3">发现音乐</h1>
				<div class="flex items-center gap-3">
					<select v-model="discoverStore.urlType"
						class="px-3 py-2 text-sm border border-line-light rounded-lg bg-surface-overlay text-content-secondary focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent">
						<option value="song">歌曲链接</option>
						<option value="playlist">歌单链接</option>
					</select>
					<input v-model="discoverStore.searchUrl" type="text" placeholder="粘贴 QQ 音乐分享链接..."
						class="flex-1 px-4 py-2 text-sm border border-line-light rounded-lg bg-surface-overlay text-content-base placeholder-content-disabled focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
						@keyup.enter="discoverStore.handleSearch" />
					<button
						class="px-5 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-surface-base"
						:disabled="discoverStore.loading || !discoverStore.searchUrl.trim()"
						@click="discoverStore.handleSearch">
						<i v-if="discoverStore.loading" class="fa fa-spinner fa-spin mr-1" aria-hidden="true"></i>
						<i v-else class="fa fa-search mr-1" aria-hidden="true"></i>
						搜索
					</button>
				</div>
			</header>

			<!-- 搜索进度 / 错误提示 -->
			<div v-if="discoverStore.loading || discoverStore.errorMsg" class="flex-shrink-0 px-6 py-2">
				<!-- 进度提示 -->
				<div v-if="discoverStore.loading && !discoverStore.errorMsg"
					class="flex items-center gap-2 text-sm text-primary-400">
					<i class="fa fa-spinner fa-spin" aria-hidden="true"></i>
					<span>{{ stepText }}</span>
				</div>
				<!-- 错误提示 -->
				<div v-if="discoverStore.errorMsg"
					class="flex items-center gap-2 text-sm text-accent-danger bg-accent-danger/10 border border-accent-danger/30 rounded-lg px-3 py-2">
					<i class="fa fa-exclamation-circle" aria-hidden="true"></i>
					<span>{{ discoverStore.errorMsg }}</span>
				</div>
			</div>

			<!-- 搜索结果表格 -->
			<main class="flex-1 overflow-hidden flex flex-col">
				<OnlineSongTable :songs="discoverStore.searchResults"
					:start-index="(discoverStore.page - 1) * discoverStore.pageSize + 1"
					:downloading-ids="discoverStore.downloadingIds"
					@play="handlePlay"
					@download="handleDownload"
					@batch-download="handleBatchDownload" />
			</main>

			<!-- 分页控件 -->
			<footer v-if="discoverStore.total > discoverStore.pageSize"
				class="flex-shrink-0 flex items-center justify-center gap-2 px-6 py-3 bg-surface-elevated border-t border-line-base">
				<button
					class="px-3 py-1.5 text-sm border border-line-light rounded hover:bg-surface-overlay transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-content-secondary"
					:disabled="discoverStore.page <= 1"
					@click="discoverStore.setPage(discoverStore.page - 1)">
					<i class="fa fa-chevron-left" aria-hidden="true"></i>
				</button>
				<button v-for="p in visiblePages" :key="p"
					class="px-3 py-1.5 text-sm rounded transition-colors"
					:class="p === discoverStore.page
						? 'bg-primary-600 text-white'
						: 'border border-line-light text-content-secondary hover:bg-surface-overlay'"
					@click="discoverStore.setPage(p)">
					{{ p }}
				</button>
				<button
					class="px-3 py-1.5 text-sm border border-line-light rounded hover:bg-surface-overlay transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-content-secondary"
					:disabled="discoverStore.page >= totalPages"
					@click="discoverStore.setPage(discoverStore.page + 1)">
					<i class="fa fa-chevron-right" aria-hidden="true"></i>
				</button>
				<span class="text-xs text-content-disabled ml-2">共 {{ discoverStore.total }} 首</span>
			</footer>
		</div>
	</template>

<script setup>
/**
 * DiscoverMusic
 * 搜索下载主页面
 * 依赖组件：OnlineSongTable
 */
import { computed } from 'vue'
import { useDiscoverStore } from '../../store/discover.js'
import { usePlayerStore } from '../../store/player.js'
import OnlineSongTable from '../business/OnlineSongTable.vue'

const discoverStore = useDiscoverStore()
const playerStore = usePlayerStore()

const stepTextMap = {
	searching: '正在搜索歌曲...',
	covers: '正在加载封面...',
	urls: '正在获取下载链接...',
	done: '搜索完成',
}

const stepText = computed(() => stepTextMap[discoverStore.searchStep] || '')

const totalPages = computed(() => Math.ceil(discoverStore.total / discoverStore.pageSize))

const visiblePages = computed(() => {
	const total = totalPages.value
	const current = discoverStore.page
	if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
	const pages = []
	pages.push(1)
	const start = Math.max(2, current - 1)
	const end = Math.min(total - 1, current + 1)
	if (start > 2) pages.push('...')
	for (let i = start; i <= end; i++) pages.push(i)
	if (end < total - 1) pages.push('...')
	pages.push(total)
	return pages
})

function handlePlay(song) {
	const info = discoverStore.playOnline(song)
	playerStore.playOnlineSong(info)
}

async function handleDownload(song) {
	await discoverStore.downloadSong(song)
}

async function handleBatchDownload(songs) {
	await discoverStore.batchDownload(songs)
}
</script>
