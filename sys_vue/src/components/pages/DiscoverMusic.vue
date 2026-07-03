<template>
	<div class="flex flex-col h-full bg-surface-base">

		<!-- 搜索栏 -->
		<header class="flex-shrink-0 bg-surface-elevated border-b border-line-base px-6 py-4">
			<h1 class="text-xl font-semibold text-content-base mb-3">发现音乐</h1>
			<div class="flex items-center gap-3">
				<!-- 搜索模式切换 -->
				<CustomButton
					type="secondary"
					size="small"
					:icon="discoverStore.searchMode === 'link' ? 'link' : 'search'"
					@click="toggleSearchMode">
					{{ discoverStore.searchMode === 'link' ? '链接搜索' : '关键词搜索' }}
				</CustomButton>

				<!-- 链接搜索模式 -->
				<template v-if="discoverStore.searchMode === 'link'">
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
				</template>

				<!-- 关键词搜索模式 -->
				<template v-else>
					<div class="flex-1">
						<CustomInput
							v-model="discoverStore.keyword"
							type="text"
							placeholder="输入歌曲名称..."
							size="medium"
							@enter="discoverStore.handleSearch"
						/>
					</div>
				</template>

				<CustomButton
					type="primary"
					size="medium"
					icon="search"
					:loading="discoverStore.loading"
					:disabled="!searchBtnEnabled"
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
				<div class="relative">
					<CustomButton type="secondary" size="medium" icon="download" @click="showSourceMenu = !showSourceMenu">
						三方: {{ thirdpartyStore.defaultSourceName }}
					</CustomButton>
					<div v-if="showSourceMenu" class="absolute right-0 top-full mt-1 z-50 min-w-[140px] bg-surface-elevated border border-line-base rounded-lg shadow-lg overflow-hidden" @click.stop>
						<div v-for="src in thirdpartyStore.sources.filter(s => s.enabled)" :key="src.id" class="flex items-center justify-between px-3 py-2 text-xs text-content-secondary hover:bg-accent-warning/15 hover:text-accent-warning cursor-pointer select-none whitespace-nowrap border-b border-line-base last:border-b-0" @click="selectSource(src.id)">
							<span>{{ src.name }}</span>
							<span v-if="thirdpartyStore.defaultSourceId === src.id" class="text-accent-warning ml-2">&#10003;</span>
						</div>
					</div>
				</div>
			</div>
		</header>

		<!-- 搜索结果表格 -->
		<main class="flex-1 overflow-hidden flex flex-col">
			<BaseSongTable mode="online" :songs="discoverStore.searchResults as any"
				:start-index="(discoverStore.page - 1) * discoverStore.pageSize + 1"
				:downloading-ids="discoverStore.downloadingIds"
				:loading="discoverStore.loading"
				:loading-text="stepText"
				:error-msg="discoverStore.errorMsg"
				:show-cover="true"
				:show-format="true"
				:show-action="true"
				:show-thirdparty-action="true"
				:official-disabled="!isLoggedIn"
				:show-checkbox="true"
				empty-text="暂无搜索结果"
				@click-song="handleClickSong"
				@play="handlePlay"
				@download="handleDownload"
				@batch-download="handleBatchDownload"
				@selection-change="handleSelectionChange"
				@thirdparty-play="handleThirdpartyPlay"
				@thirdparty-download="handleThirdpartyDownload" />
		</main>

		<!-- 分页控件 -->
		<footer v-if="totalPages > 1"
			class="flex-shrink-0 flex items-center justify-between px-5 py-3.5 bg-surface-base/80 backdrop-blur-md border-t border-line-base">

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
							@change="(v: any) => discoverStore.setPageSize(Number(v))"
						/>
					</div>
					<span class="text-xs text-content-tertiary whitespace-nowrap">首/页</span>
				</div>
			</div>

			<div class="flex items-center gap-1">
				<button class="page-btn page-btn--default" :class="{ 'page-btn--disabled': discoverStore.page <= 1 }"
					:disabled="discoverStore.page <= 1" @click="discoverStore.setPage(discoverStore.page - 1)">
					<FAIcon name="chevron-left" size="small" color="secondary" />
				</button>
				<template v-for="(p, idx) in visiblePages" :key="idx">
					<button v-if="p !== '...'" class="page-btn" :class="p === discoverStore.page ? 'page-btn--active' : 'page-btn--default'"
						@click="discoverStore.setPage(Number(p))">{{ p }}</button>
					<span v-else class="px-1 text-xs text-content-disabled select-none">...</span>
				</template>
				<button class="page-btn page-btn--default" :class="{ 'page-btn--disabled': discoverStore.page >= totalPages }"
					:disabled="discoverStore.page >= totalPages" @click="discoverStore.setPage(discoverStore.page + 1)">
					<FAIcon name="chevron-right" size="small" color="secondary" />
				</button>
			</div>

			<div class="flex items-center gap-2">
				<span class="text-xs text-content-tertiary">跳至</span>
				<CustomInput :model-value="jumpPage" type="number" :min="1" :max="totalPages" size="small" custom-class="!w-[52px]"
					@enter="handleJumpPage" @update:model-value="jumpPage = String($event)" />
				<span class="text-xs text-content-tertiary">页</span>
			</div>
		</footer>
	</div>
</template>

<script setup lang="ts">
/**
 * DiscoverMusic
 * 发现音乐页面 — 搜索 + 官方下载 + 第三方下载
 */
import { computed, ref, watch } from 'vue'
import { useDiscoverStore } from '../../store/discover'
import { usePlayerStore } from '../../store/player'
import { useAuthStore } from '../../store/auth'
import { useThirdpartyDownloadStore } from '../../store/thirdpartyDownload'

import BaseSongTable from '../business/BaseSongTable.vue'
import CustomSelect from '../custom/CustomSelect.vue'
import CustomInput from '../custom/CustomInput.vue'
import CustomButton from '../custom/CustomButton.vue'
import FAIcon from '../common/FAIcon.vue'

const discoverStore = useDiscoverStore()
const playerStore = usePlayerStore()
const authStore = useAuthStore()
const thirdpartyStore = useThirdpartyDownloadStore()

const isLoggedIn = computed(() => authStore.isLoggedIn)

const showSourceMenu = ref(false)

function showToast(msg: string) {
  const el = document.createElement('div')
  el.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2 rounded-lg text-sm shadow-lg bg-surface-elevated border border-line-base text-content-base transition-all duration-300'
  el.textContent = msg
  document.body.appendChild(el)
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300) }, 2500)
}

function selectSource(id: string) {
  thirdpartyStore.setDefaultSource(id)
  showSourceMenu.value = false
}

const urlTypeOptions = [
  { label: '歌曲链接', value: 'song' },
  { label: '歌单链接', value: 'playlist' },
]

const pageSizeOptions = [
  { label: '10', value: 10 },
  { label: '20', value: 20 },
  { label: '50', value: 50 },
]

const stepTextMap: Record<string, string> = {
  searching: '正在搜索歌曲...',
  covers: '正在加载封面...',
  urls: '正在获取下载链接...',
  done: '搜索完成',
}

const stepText = computed(() => stepTextMap[discoverStore.searchStep] || '')

const searchBtnEnabled = computed(() => {
  if (discoverStore.searchMode === 'link') return discoverStore.searchUrl.trim()
  return discoverStore.keyword.trim()
})

async function handleClickSong(song: any) {
  handlePlay(song)
  playerStore.showLyricsDisplay()
}

const totalPages = computed(() => Math.ceil(discoverStore.total / discoverStore.pageSize))

const jumpPage = ref('')

watch(() => discoverStore.page, () => { jumpPage.value = '' })

const visiblePages = computed(() => {
  const total = totalPages.value
  const current = discoverStore.page
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | string)[] = []
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

function toggleSearchMode() {
  discoverStore.searchMode = discoverStore.searchMode === 'link' ? 'keyword' : 'link'
}

function handlePlay(song: any) {
  if (!song.songUrl?.url) return
  const info = discoverStore.playOnline(song)
  playerStore.playOnlineSong(info)
}

async function handleDownload(song: any) {
  await discoverStore.downloadSong(song)
}

const selectedSongs = ref([])

function handleSelectionChange(songs: any) {
  selectedSongs.value = songs
}

async function handleBatchDownload(songs: any) {
  await discoverStore.batchDownload(songs)
}

/** 第三方播放 */
async function handleThirdpartyPlay(song: any) {
  const songMid = song.songMid || ''
  if (!songMid) return
  const result = await thirdpartyStore.getDownloadUrl('qq', songMid)
  if (!result) {
    showToast('三方播放链接获取失败，请检查下载源是否可用')
    return
  }
  playerStore.playOnlineSong({
    songMid,
    songName: song.songName || song.title || '',
    singer: song.singer || song.artist || '',
    coverUrl: (song as any).album?.albumCoverUrl || '',
    url: result.url,
    urlType: 'mp3',
  })
}

/** 第三方下载 */
async function handleThirdpartyDownload(payload: { song: any; sourceId: string }) {
  const song = payload.song
  const songMid = song.songMid || ''
  if (!songMid) return
  showToast('正在获取三方下载地址...')
  const result = await thirdpartyStore.getDownloadUrl('qq', songMid)
  if (!result) {
    showToast('三方下载链接获取失败，请在设置中切换其他下载源')
    return
  }
  // 验证链接可用性
  const valid = await thirdpartyStore.validateDownloadUrl(result.url)
  if (!valid) {
    showToast('下载链接不可用，请在设置中切换其他源')
    return
  }
  const filename = `${song.songName || '未知'} - ${song.singer || '未知'}.mp3`
  window.electronAPI.downloadSongWithMetadata({
    url: result.url,
    filename,
    metadata: {
      title: song.songName || '',
      artist: song.singer || '',
      album: '',
      trackNumber: 0,
      genre: '',
      year: '',
      lyrics: '',
      coverUrl: '',
      format: 'mp3',
    },
  })
}
</script>

<style scoped>
@reference "../../styles/tailwind-entry.css";
.page-btn {
	@apply w-8 h-8 inline-flex items-center justify-center rounded-lg text-xs font-medium
			transition-[background-color,color,transform,box-shadow] duration-200 cursor-pointer select-none outline-none;
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
