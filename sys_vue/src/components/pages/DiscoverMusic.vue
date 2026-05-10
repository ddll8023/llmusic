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
					<CustomButton
						type="primary"
						size="medium"
						icon="download"
						:disabled="selectedSongs.length === 0"
						@click="handleBatchDownload(selectedSongs)">
						批量下载{{ selectedSongs.length > 0 ? `(${selectedSongs.length})` : '' }}
					</CustomButton>
				</div>
			</header>

			<!-- 搜索结果表格 -->
			<main class="flex-1 overflow-hidden flex flex-col">
				<OnlineSongTable :songs="discoverStore.searchResults"
					:start-index="(discoverStore.page - 1) * discoverStore.pageSize + 1"
					:downloading-ids="discoverStore.downloadingIds"
					:loading="discoverStore.loading"
					:loading-text="stepText"
					:error-msg="discoverStore.errorMsg"
					@play="handlePlay"
					@download="handleDownload"
					@batch-download="handleBatchDownload"
					@selection-change="handleSelectionChange" />
			</main>

			<!-- 分页控件 -->
			<footer v-if="totalPages > 1"
				class="flex-shrink-0 flex items-center justify-between px-5 py-3.5 bg-surface-base/80 backdrop-blur-md border-t border-line-base">

				<!-- 左侧：总数 + 每页条数 -->
				<div class="flex items-center gap-3">
					<span class="text-xs text-content-tertiary whitespace-nowrap">共 {{ discoverStore.total }} 首</span>
					<div class="w-px h-4 bg-line-base"></div>
					<div class="flex items-center gap-1.5">
						<div class="w-[72px]">
							<CustomSelect
								:model-value="discoverStore.pageSize"
								:options="pageSizeOptions"
								size="small"
								placement="top"
								@change="discoverStore.setPageSize"
							/>
						</div>
						<span class="text-xs text-content-tertiary whitespace-nowrap">首/页</span>
					</div>
				</div>

				<!-- 中间：页码按钮 -->
				<div class="flex items-center gap-1">
					<button
						class="page-btn page-btn--default"
						:class="{ 'page-btn--disabled': discoverStore.page <= 1 }"
						:disabled="discoverStore.page <= 1"
						@click="discoverStore.setPage(discoverStore.page - 1)">
						<FAIcon name="chevron-left" size="small" color="secondary" />
					</button>
					<template v-for="(p, idx) in visiblePages" :key="idx">
						<button v-if="p !== '...'"
							class="page-btn"
							:class="p === discoverStore.page ? 'page-btn--active' : 'page-btn--default'"
							@click="discoverStore.setPage(p)">
							{{ p }}
						</button>
						<span v-else class="px-1 text-xs text-content-disabled select-none">...</span>
					</template>
					<button
						class="page-btn page-btn--default"
						:class="{ 'page-btn--disabled': discoverStore.page >= totalPages }"
						:disabled="discoverStore.page >= totalPages"
						@click="discoverStore.setPage(discoverStore.page + 1)">
						<FAIcon name="chevron-right" size="small" color="secondary" />
					</button>
				</div>

				<!-- 右侧：跳转 -->
				<div class="flex items-center gap-2">
					<span class="text-xs text-content-tertiary">跳至</span>
					<CustomInput
						:model-value="jumpPage"
						type="number"
						:min="1"
						:max="totalPages"
						size="small"
						custom-class="!w-[52px]"
						@enter="handleJumpPage"
						@update:model-value="jumpPage = $event"
					/>
					<span class="text-xs text-content-tertiary">页</span>
				</div>
			</footer>
		</div>
		</template>

		<script setup>
		/**
		 * DiscoverMusic
		 * 搜索下载主页面
		 * 依赖组件：OnlineSongTable、CustomSelect、CustomInput、CustomButton、FAIcon
		 */
		import { computed, ref, watch } from 'vue'
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

		const pageSizeOptions = [
			{ label: '10', value: 10 },
			{ label: '20', value: 20 },
			{ label: '50', value: 50 },
		]

		const stepTextMap = {
			searching: '正在搜索歌曲...',
			covers: '正在加载封面...',
			urls: '正在获取下载链接...',
			done: '搜索完成',
		}

		const stepText = computed(() => stepTextMap[discoverStore.searchStep] || '')

		const totalPages = computed(() => Math.ceil(discoverStore.total / discoverStore.pageSize))

		const jumpPage = ref('')

		// 页码变化时清空跳转输入框
		watch(() => discoverStore.page, () => { jumpPage.value = '' })

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

		function handleJumpPage() {
			const n = parseInt(jumpPage.value, 10)
			if (!isNaN(n) && n >= 1 && n <= totalPages.value) {
				discoverStore.setPage(n)
			}
		}

		function handlePlay(song) {
			const info = discoverStore.playOnline(song)
			playerStore.playOnlineSong(info)
		}

		async function handleDownload(song) {
			await discoverStore.downloadSong(song)
		}

		const selectedSongs = ref([])

		function handleSelectionChange(songs) {
			selectedSongs.value = songs
		}

		async function handleBatchDownload(songs) {
			await discoverStore.batchDownload(songs)
		}
		</script>

<style scoped>
@reference "../../styles/tailwind-entry.css";
.page-btn {
	@apply w-8 h-8 inline-flex items-center justify-center rounded-lg text-xs font-medium
			transition-all duration-200 cursor-pointer select-none outline-none;
}

.page-btn--default {
	@apply text-content-secondary hover:bg-overlay-light hover:text-content-base
			hover:-translate-y-0.5 active:translate-y-0;
}

.page-btn--active {
	@apply bg-accent-green text-white font-semibold shadow-custom cursor-default;
}

.page-btn--disabled {
	@apply text-content-disabled opacity-40 cursor-not-allowed pointer-events-none;
}
</style>
