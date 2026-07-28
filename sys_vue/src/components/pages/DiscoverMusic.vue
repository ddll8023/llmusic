<script setup lang="ts">
/**
 * DiscoverMusic
 * 发现音乐页面 — QQ 音乐官方在线搜索
 */
import { computed, ref } from 'vue'
import type { SongItem } from '@/types'
import { useDiscoverStore } from '../../store/discover'
import { usePlayerStore } from '../../store/player'
import { useAuthStore } from '../../store/auth'
import { useNotificationStore } from '../../store/notification'
import BaseSongTable from '../business/BaseSongTable.vue'
import BatchDownloadDialog from '../business/BatchDownloadDialog.vue'
import PaginationBar from '../common/PaginationBar.vue'
import CustomSelect from '../custom/CustomSelect.vue'
import CustomInput from '../custom/CustomInput.vue'
import CustomButton from '../custom/CustomButton.vue'
import FAIcon from '../common/FAIcon.vue'

// ── Stores ──
const discoverStore = useDiscoverStore()
const playerStore = usePlayerStore()
const authStore = useAuthStore()
const notification = useNotificationStore()

// ── 官方 Tab ──
const isLoggedIn = computed(() => authStore.isLoggedIn)
const showSourceMenu = ref(false)

const urlTypeOptions = [
  { label: '歌曲链接', value: 'song' },
  { label: '歌单链接', value: 'playlist' },
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

function toggleSearchMode() {
  discoverStore.searchMode = discoverStore.searchMode === 'link' ? 'keyword' : 'link'
}

// ── 官方 Tab 事件 ──
function handleOfficialPlay(song: SongItem) {
  if (!song.songUrl?.url) return
  const info = discoverStore.playOnline(song)
  playerStore.playOnlineSong(info)
}

function handleOfficialClickSong(song: SongItem) {
  handleOfficialPlay(song)
  playerStore.showLyricsDisplay()
}

const officialSelectedSongs = ref<SongItem[]>([])

function handleOfficialSelectionChange(songs: SongItem[]) {
  officialSelectedSongs.value = songs
}

/** 下载 IPC 返回结构（warning：元数据写入失败但已保存纯音频） */
type DownloadResult = IpcResult<{ filePath?: string; warning?: string }>

async function handleOfficialDownload(song: SongItem) {
  try {
    const result = (await discoverStore.downloadSong(song)) as DownloadResult | undefined
    if (!result) return
    if (result.success) {
      if (result.warning) {
        notification.warning(result.warning)
      } else {
        notification.success(result.filePath ? `已保存到 ${result.filePath}` : '下载完成')
      }
    } else if (!result.canceled) {
      notification.error(`下载失败: ${result.error || '未知错误'}`)
    }
  } catch (e) {
    notification.notifyError(e)
  }
}

async function handleOfficialBatchDownload(songs: SongItem[]) {
  try {
    await discoverStore.batchDownload(songs)
  } catch (e) {
    notification.notifyError(e)
  }
}

function handleCloseBatchProgress() {
  discoverStore.batchProgress = {
    total: 0,
    completed: 0,
    succeeded: 0,
    failed: 0,
    items: [],
    active: false,
  }
}

async function handleRetryFailed() {
  try {
    await discoverStore.retryFailed()
  } catch (e) {
    notification.notifyError(e)
  }
}

</script>

<template>
  <div class="flex flex-col h-full bg-surface-base">
    <!-- ═══ 搜索栏 ═══ -->
    <header class="flex-shrink-0 bg-surface-elevated border-b border-line-base">
      <div class="flex items-center gap-3 px-6 py-4">
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
    </header>

    <!-- ═══ 内容区 ═══ -->
    <main class="flex-1 overflow-hidden flex flex-col">
        <BaseSongTable mode="online"
          :songs="discoverStore.searchResults"
          :start-index="(discoverStore.page - 1) * discoverStore.pageSize + 1"
          :page-size="discoverStore.pageSize"
          :downloading-ids="discoverStore.downloadingIds"
          :loading="discoverStore.loading"
          :loading-text="stepText"
          :error-msg="discoverStore.errorMsg"
          show-cover show-format show-action :unify-actions="true"
          show-checkbox
          :official-disabled="!isLoggedIn"
          empty-text="暂无搜索结果"
          @click-song="handleOfficialClickSong"
          @play="handleOfficialPlay"
          @download="handleOfficialDownload"
          @batch-download="handleOfficialBatchDownload"
          @selection-change="handleOfficialSelectionChange" />

        <!-- 通用分页栏 -->
        <PaginationBar
          v-if="discoverStore.total > discoverStore.pageSize"
          :page="discoverStore.page"
          :page-size="discoverStore.pageSize"
          :total="discoverStore.total"
          @page-change="discoverStore.setPage"
          @page-size-change="discoverStore.setPageSize" />
    </main>

    <!-- 批量下载进度弹窗 -->
    <BatchDownloadDialog :progress="discoverStore.batchProgress"
      @close="handleCloseBatchProgress" @retry="handleRetryFailed" />
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
