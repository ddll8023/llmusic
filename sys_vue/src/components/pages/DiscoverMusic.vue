<template>
		<div class="flex flex-col h-full bg-surface-base">
			<!-- 搜索栏 -->
			<header class="flex-shrink-0 bg-surface-elevated border-b border-line-base px-6 py-4">
				<h1 class="text-xl font-semibold text-content-base mb-3">发现音乐</h1>
				<div class="flex items-center gap-3">
					<div class="w-[130px]">
						<CustomSelect
							v-model="discoverStore.urlType"
							:options="urlTypeOptions"
							size="medium"
						/>
					</div>
					<div class="flex-1">
						<CustomInput
							v-model="discoverStore.searchUrl"
							type="text"
							placeholder="粘贴 QQ 音乐分享链接..."
							size="medium"
							@enter="discoverStore.handleSearch"
						/>
					</div>
					<CustomButton
						type="primary"
						size="medium"
						icon="search"
						:loading="discoverStore.loading"
						:disabled="!discoverStore.searchUrl.trim()"
						@click="discoverStore.handleSearch">
						搜索
					</CustomButton>
				</div>
			</header>

			<!-- 搜索进度 / 错误提示 -->
			<div v-if="discoverStore.loading || discoverStore.errorMsg" class="flex-shrink-0 px-6 py-2">
				<!-- 进度提示 -->
				<div v-if="discoverStore.loading && !discoverStore.errorMsg"
					class="flex items-center gap-2 text-sm text-primary-400">
					<span class="inline-flex animate-spin">
						<FAIcon name="spinner" size="small" color="accent" />
					</span>
					<span>{{ stepText }}</span>
				</div>
				<!-- 错误提示 -->
				<div v-if="discoverStore.errorMsg"
					class="flex items-center gap-2 text-sm text-accent-danger bg-accent-danger/10 border border-accent-danger/30 rounded-lg px-3 py-2">
					<FAIcon name="exclamation-circle" size="small" color="danger" />
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
			<footer v-if="totalPages > 1"
				class="flex-shrink-0 flex items-center justify-center gap-2 px-6 py-3 bg-surface-elevated border-t border-line-base">
				<CustomButton type="secondary" size="small" icon="chevron-left"
					:disabled="discoverStore.page <= 1"
					@click="discoverStore.setPage(discoverStore.page - 1)" />
				<template v-for="(p, idx) in visiblePages" :key="idx">
					<CustomButton v-if="p !== '...'"
						:type="p === discoverStore.page ? 'primary' : 'secondary'"
						size="small"
						@click="discoverStore.setPage(p)">
						{{ p }}
					</CustomButton>
					<span v-else class="px-2 text-sm text-content-disabled">...</span>
				</template>
				<CustomButton type="secondary" size="small" icon="chevron-right"
					:disabled="discoverStore.page >= totalPages"
					@click="discoverStore.setPage(discoverStore.page + 1)" />
				<span class="text-xs text-content-disabled ml-2">共 {{ discoverStore.total }} 首</span>
			</footer>
		</div>
	</template>

	<script setup>
	/**
	 * DiscoverMusic
	 * 搜索下载主页面
	 * 依赖组件：OnlineSongTable、CustomSelect、CustomInput、CustomButton、FAIcon
	 */
	import { computed } from 'vue'
	import { useDiscoverStore } from '../../store/discover.js'
	import { usePlayerStore } from '../../store/player.js'
	import OnlineSongTable from '../business/OnlineSongTable.vue'
	import CustomSelect from '../custom/CustomSelect.vue'
	import CustomInput from '../custom/CustomInput.vue'
	import CustomButton from '../custom/CustomButton.vue'
	import FAIcon from '../common/FAIcon.vue'

	const discoverStore = useDiscoverStore()
	const playerStore = usePlayerStore()

	const urlTypeOptions = [
		{ label: '歌曲链接', value: 'song' },
		{ label: '歌单链接', value: 'playlist' },
	]

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
