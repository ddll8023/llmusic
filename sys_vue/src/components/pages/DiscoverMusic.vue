<script setup lang="ts">
/**
 * DiscoverMusic
 * 发现音乐页面 — [官方] [第三方] 双 Tab
 * 官方 Tab: 现有 QQ 音乐搜索/下载逻辑（不变）
 * 第三方 Tab: 插件化源搜索/播放/下载
 */
import { computed, ref, watch, onMounted } from 'vue'
import { useDiscoverStore } from '../../store/discover'
import { usePlayerStore } from '../../store/player'
import { useAuthStore } from '../../store/auth'
import { useThirdpartyStore } from '../../store/thirdpartySource'

import BaseSongTable from '../business/BaseSongTable.vue'
import CustomSelect from '../custom/CustomSelect.vue'
import CustomInput from '../custom/CustomInput.vue'
import CustomButton from '../custom/CustomButton.vue'
import FAIcon from '../common/FAIcon.vue'

type ActiveTab = 'official' | 'thirdparty'

// ── Stores ──
const discoverStore = useDiscoverStore()
const playerStore = usePlayerStore()
const authStore = useAuthStore()
const thirdpartyStore = useThirdpartyStore()

const activeTab = ref<ActiveTab>('official')

// ── 官方 Tab ──
const isLoggedIn = computed(() => authStore.isLoggedIn)
const showSourceMenu = ref(false)

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

const totalPages = computed(() => Math.ceil(discoverStore.total / discoverStore.pageSize))
const jumpPage = ref('')
watch(() => discoverStore.page, () => { jumpPage.value = '' })

const visiblePages = computed(() => {
  const total = totalPages.value
  const current = discoverStore.page
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | string)[] = [1]
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

// ── 三方 Tab ──
const thirdpartyKeyword = ref('')
const thirdpartyPage = ref(1)
const thirdpartyPageSize = ref(20)

/** 给第三方搜索结果注入 songUrl，使 BaseSongTable 的播放按钮可用 */
const thirdpartySongs = computed(() =>
  thirdpartyStore.searchResults.map(s => ({
    ...s,
    songUrl: { url: 'thirdparty://placeholder', urlType: 'mp3' },
  })),
)

const thirdpartyTotalPages = computed(() =>
  Math.ceil(thirdpartyStore.searchTotal / thirdpartyPageSize.value) || 1,
)

const pageSizeOptionsThirdparty = [
  { label: '20', value: 20 },
  { label: '50', value: 50 },
]

async function handleThirdpartySearch() {
  if (!thirdpartyKeyword.value.trim()) return
  thirdpartyPage.value = 1
  await thirdpartyStore.search(thirdpartyKeyword.value, thirdpartyPage.value, thirdpartyPageSize.value)
}

async function handleThirdpartyPageChange(page: number) {
  thirdpartyPage.value = page
  await thirdpartyStore.search(thirdpartyKeyword.value, page, thirdpartyPageSize.value)
}

async function handleThirdpartyPlay(song: any) {
  const url = await thirdpartyStore.getMusicUrl(song)
  if (!url) {
    showToast('获取播放链接失败，请检查源是否可用')
    return
  }
  playerStore.playOnlineSong({
    songMid: song.id,
    songName: song.songName || '',
    singer: song.artist || '',
    coverUrl: song.albumCoverUrl || '',
    url,
    urlType: 'mp3',
  })
}

async function handleThirdpartyDownload(song: any) {
  const url = await thirdpartyStore.getMusicUrl(song)
  if (!url) {
    showToast('获取下载链接失败')
    return
  }
  const filename = `${song.songName || '未知'} - ${song.artist || '未知'}.mp3`
  window.electronAPI.downloadSongWithMetadata({
    url,
    filename,
    metadata: {
      title: song.songName || '',
      artist: song.artist || '',
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

function handleThirdpartySelectSource(id: string) {
  thirdpartyStore.setSource(id)
  showSourceMenu.value = false
}

// ── 官方 Tab 事件 ──
function handleOfficialPlay(song: any) {
  if (!song.songUrl?.url) return
  const info = discoverStore.playOnline(song)
  playerStore.playOnlineSong(info)
}

function handleOfficialClickSong(song: any) {
  handleOfficialPlay(song)
  playerStore.showLyricsDisplay()
}

const officialSelectedSongs = ref([])

function handleOfficialSelectionChange(songs: any) {
  officialSelectedSongs.value = songs
}

async function handleOfficialDownload(song: any) {
  await discoverStore.downloadSong(song)
}

async function handleOfficialBatchDownload(songs: any) {
  await discoverStore.batchDownload(songs)
}

// ── 通用 ──
function showToast(msg: string) {
  const el = document.createElement('div')
  el.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2 rounded-lg text-sm shadow-lg bg-surface-elevated border border-line-base text-content-base transition-all duration-300'
  el.textContent = msg
  document.body.appendChild(el)
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300) }, 2500)
}

onMounted(async () => {
  await thirdpartyStore.refreshSources()
  if (thirdpartyStore.currentSourceId) {
    await thirdpartyStore.setSource(thirdpartyStore.currentSourceId)
  }
})
</script>

<template>
  <div class="flex flex-col h-full bg-surface-base">
    <!-- ═══ Tab 栏 ═══ -->
    <header class="flex-shrink-0 bg-surface-elevated border-b border-line-base">
      <div class="flex items-center gap-0 px-6 pt-3">
        <button
          class="px-4 py-2 text-sm font-medium transition-colors duration-150 border-b-2 -mb-[1px]"
          :class="activeTab === 'official'
            ? 'text-accent-green border-accent-green'
            : 'text-content-secondary border-transparent hover:text-content-base'"
          @click="activeTab = 'official'">
          <FAIcon name="music" size="small" :color="activeTab === 'official' ? 'accent' : 'secondary'" class="mr-1.5" />
          官方
        </button>
        <button
          class="px-4 py-2 text-sm font-medium transition-colors duration-150 border-b-2 -mb-[1px]"
          :class="activeTab === 'thirdparty'
            ? 'text-accent-green border-accent-green'
            : 'text-content-secondary border-transparent hover:text-content-base'"
          @click="activeTab = 'thirdparty'">
          <FAIcon name="puzzle-piece" size="small" :color="activeTab === 'thirdparty' ? 'accent' : 'secondary'" class="mr-1.5" />
          第三方
        </button>
      </div>

      <!-- ═══ 官方 Tab 搜索栏 ═══ -->
      <div v-if="activeTab === 'official'" class="flex items-center gap-3 px-6 py-4 border-t border-line-base">
        <CustomButton
          type="secondary" size="small"
          :icon="discoverStore.searchMode === 'link' ? 'link' : 'search'"
          @click="toggleSearchMode">
          {{ discoverStore.searchMode === 'link' ? '链接搜索' : '关键词搜索' }}
        </CustomButton>

        <template v-if="discoverStore.searchMode === 'link'">
          <div class="w-[130px]">
            <CustomSelect v-model="discoverStore.urlType" :options="urlTypeOptions" size="medium" />
          </div>
          <div class="flex-1">
            <CustomInput v-model="discoverStore.searchUrl" type="text"
              placeholder="粘贴 QQ 音乐分享链接..." size="medium"
              @enter="discoverStore.handleSearch" />
          </div>
        </template>
        <template v-else>
          <div class="flex-1">
            <CustomInput v-model="discoverStore.keyword" type="text"
              placeholder="输入歌曲名称..." size="medium"
              @enter="discoverStore.handleSearch" />
          </div>
        </template>

        <CustomButton type="primary" size="medium" icon="search"
          :loading="discoverStore.loading"
          :disabled="!searchBtnEnabled"
          @click="discoverStore.handleSearch">搜索</CustomButton>
        <CustomButton type="primary" size="medium" icon="download"
          :disabled="officialSelectedSongs.length === 0"
          @click="handleOfficialBatchDownload(officialSelectedSongs)">
          批量下载{{ officialSelectedSongs.length > 0 ? `(${officialSelectedSongs.length})` : '' }}
        </CustomButton>
      </div>

      <!-- ═══ 第三方 Tab 搜索栏 ═══ -->
      <div v-else class="flex items-center gap-3 px-6 py-4 border-t border-line-base">
        <div class="w-[140px]">
          <CustomSelect
            v-model="thirdpartyStore.currentSourceId"
            :options="thirdpartyStore.enabledSources.map((s: any) => ({ label: `${s.name} (${s.platform})`, value: s.id }))"
            size="medium" @change="(v: string | number) => handleThirdpartySelectSource(String(v))" />
        </div>
        <div class="flex-1">
          <CustomInput v-model="thirdpartyKeyword" type="text"
            placeholder="输入歌曲名称搜索..." size="medium"
            @enter="handleThirdpartySearch" />
        </div>
        <CustomButton type="primary" size="medium" icon="search"
          :loading="thirdpartyStore.loading"
          :disabled="!thirdpartyKeyword.trim()"
          @click="handleThirdpartySearch">搜索</CustomButton>
      </div>
    </header>

    <!-- ═══ 内容区 ═══ -->
    <main class="flex-1 overflow-hidden flex flex-col">
      <!-- 官方 Tab 内容 -->
      <template v-if="activeTab === 'official'">
        <BaseSongTable mode="online"
          :songs="discoverStore.searchResults as any"
          :start-index="(discoverStore.page - 1) * discoverStore.pageSize + 1"
          :downloading-ids="discoverStore.downloadingIds"
          :loading="discoverStore.loading"
          :loading-text="stepText"
          :error-msg="discoverStore.errorMsg"
          show-cover show-format show-action :unify-actions="true"
          :official-disabled="!isLoggedIn"
          empty-text="暂无搜索结果"
          @click-song="handleOfficialClickSong"
          @play="handleOfficialPlay"
          @download="handleOfficialDownload"
          @batch-download="handleOfficialBatchDownload"
          @selection-change="handleOfficialSelectionChange" />

        <!-- 官方分页 -->
        <footer v-if="totalPages > 1"
          class="flex-shrink-0 flex items-center justify-between px-5 py-3.5 bg-surface-base/80 backdrop-blur-md border-t border-line-base">
          <div class="flex items-center gap-3">
            <span class="text-xs text-content-tertiary">共 {{ discoverStore.total }} 首</span>
            <div class="w-px h-4 bg-line-base"></div>
            <div class="w-[72px]">
              <CustomSelect :model-value="discoverStore.pageSize" :options="pageSizeOptions" size="small" placement="top"
                @change="(v: any) => discoverStore.setPageSize(Number(v))" />
            </div>
            <span class="text-xs text-content-tertiary">首/页</span>
          </div>
          <div class="flex items-center gap-1">
            <button class="page-btn page-btn--default" :class="{ 'page-btn--disabled': discoverStore.page <= 1 }"
              :disabled="discoverStore.page <= 1" @click="discoverStore.setPage(discoverStore.page - 1)">
              <FAIcon name="chevron-left" size="small" color="secondary" />
            </button>
            <template v-for="(p, idx) in visiblePages" :key="idx">
              <button v-if="p !== '...'" class="page-btn"
                :class="p === discoverStore.page ? 'page-btn--active' : 'page-btn--default'"
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
            <CustomInput :model-value="jumpPage" type="number" :min="1" :max="totalPages" size="small"
              custom-class="!w-[52px]" @enter="handleJumpPage"
              @update:model-value="jumpPage = String($event)" />
            <span class="text-xs text-content-tertiary">页</span>
          </div>
        </footer>
      </template>

      <!-- 第三方 Tab 内容 -->
      <template v-else>
        <div class="flex-1 overflow-hidden flex flex-col">
          <!-- 源状态提示 -->
          <div v-if="thirdpartyStore.currentSource?.type === 'userapi'"
            class="mx-4 mt-3 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
            :class="thirdpartyStore.status.isScriptLoaded
              ? 'bg-accent-green/10 text-accent-green border border-accent-green/20'
              : 'bg-accent-warning/10 text-accent-warning border border-accent-warning/20'">
            <FAIcon :name="thirdpartyStore.status.isScriptLoaded ? 'check-circle' : 'exclamation-triangle'"
              size="small" :color="thirdpartyStore.status.isScriptLoaded ? 'accent' : 'danger'" />
            <span>{{ thirdpartyStore.status.isScriptLoaded ? '脚本已加载' : '脚本未加载，部分功能可能不可用' }}</span>
          </div>

          <BaseSongTable mode="online"
            :songs="thirdpartySongs"
            :loading="thirdpartyStore.loading"
            :loading-text="thirdpartyStore.loading ? '搜索中...' : ''"
            :error-msg="thirdpartyStore.errorMsg"
            show-cover show-format show-action :unify-actions="true"
            empty-text="输入关键词搜索"
            @play="handleThirdpartyPlay"
            @download="handleThirdpartyDownload" />
        </div>

        <!-- 第三方分页 -->
        <footer v-if="thirdpartyStore.searchTotal > thirdpartyPageSize"
          class="flex-shrink-0 flex items-center justify-between px-5 py-3.5 bg-surface-base/80 backdrop-blur-md border-t border-line-base">
          <div class="flex items-center gap-3">
            <span class="text-xs text-content-tertiary">共 {{ thirdpartyStore.searchTotal }} 首</span>
          </div>
          <div class="flex items-center gap-1">
            <button class="page-btn page-btn--default"
              :class="{ 'page-btn--disabled': thirdpartyPage <= 1 }"
              :disabled="thirdpartyPage <= 1"
              @click="handleThirdpartyPageChange(thirdpartyPage - 1)">
              <FAIcon name="chevron-left" size="small" color="secondary" />
            </button>
            <span class="px-2 text-xs text-content-secondary">{{ thirdpartyPage }} / {{ thirdpartyTotalPages }}</span>
            <button class="page-btn page-btn--default"
              :class="{ 'page-btn--disabled': thirdpartyPage >= thirdpartyTotalPages }"
              :disabled="thirdpartyPage >= thirdpartyTotalPages"
              @click="handleThirdpartyPageChange(thirdpartyPage + 1)">
              <FAIcon name="chevron-right" size="small" color="secondary" />
            </button>
          </div>
        </footer>
      </template>
    </main>
  </div>
</template>

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
