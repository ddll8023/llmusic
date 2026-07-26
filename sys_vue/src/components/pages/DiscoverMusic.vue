<script setup lang="ts">
/**
 * DiscoverMusic
 * 发现音乐页面 — QQ 音乐官方在线搜索
 */
import { computed, ref } from 'vue'
import { useDiscoverStore } from '../../store/discover'
import { usePlayerStore } from '../../store/player'
import { useAuthStore } from '../../store/auth'
import { useNotificationStore } from '../../store/notification'
import BaseSongTable from '../business/BaseSongTable.vue'
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

/** 下载 IPC 返回结构（warning：元数据写入失败但已保存纯音频） */
type DownloadResult = IpcResult<{ filePath?: string; warning?: string }>

async function handleOfficialDownload(song: any) {
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

async function handleOfficialBatchDownload(songs: any) {
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
    <transition name="fade">
      <div v-if="discoverStore.batchProgress.active || discoverStore.batchProgress.completed > 0"
        class="fixed inset-0 bg-overlay-dark flex items-center justify-center z-[300]"
        @click.self="handleCloseBatchProgress">
        <div class="bg-surface-elevated border border-line-base rounded-lg p-5 w-[420px] max-h-[70vh] flex flex-col shadow-[0_10px_25px_rgba(0,0,0,0.5)]">
          <h3 class="text-base font-medium text-content-base mb-3 flex items-center gap-2">
            <FAIcon name="download" size="small" color="primary" />
            批量下载
          </h3>

          <!-- 进度条 -->
          <div class="mb-3">
            <div class="flex justify-between text-xs text-content-secondary mb-1">
              <span>进度 {{ discoverStore.batchProgress.completed }}/{{ discoverStore.batchProgress.total }}</span>
              <span>成功 {{ discoverStore.batchProgress.succeeded }} / 失败 {{ discoverStore.batchProgress.failed }}</span>
            </div>
            <div class="w-full h-2 bg-surface-overlay rounded-full overflow-hidden">
              <div class="h-full rounded-full transition-all duration-300"
                :class="discoverStore.batchProgress.active ? 'bg-accent-green animate-pulse' : 'bg-accent-green'"
                :style="{ width: discoverStore.batchProgress.total > 0 ? (discoverStore.batchProgress.completed / discoverStore.batchProgress.total) * 100 + '%' : '0%' }">
              </div>
            </div>
          </div>

          <!-- 歌曲列表 -->
          <div class="flex-1 overflow-y-auto max-h-[300px] space-y-1">
            <div v-for="(item, idx) in discoverStore.batchProgress.items" :key="idx"
              class="flex items-center gap-2 px-2 py-1.5 rounded text-xs"
              :class="item.status === 'success' ? 'bg-accent-green/5' : item.status === 'failed' ? 'bg-accent-danger/5' : item.status === 'downloading' ? 'bg-accent-blue/5' : ''">
              <FAIcon v-if="item.status === 'pending'" name="circle-o" size="small" color="disabled" />
              <FAIcon v-else-if="item.status === 'downloading'" name="spinner" size="small" color="primary" class="animate-spin" />
              <FAIcon v-else-if="item.status === 'success'" name="check-circle" size="small" color="primary" />
              <FAIcon v-else-if="item.status === 'failed'" name="times-circle" size="small" color="danger" />
              <span class="truncate flex-1" :class="item.status === 'success' ? 'text-content-base' : item.status === 'failed' ? 'text-accent-danger' : 'text-content-secondary'">
                {{ item.songName }} - {{ item.singer }}
              </span>
              <span v-if="item.status === 'failed' && item.error" class="text-accent-danger shrink-0 font-bold" :title="item.error">!</span>
            </div>
          </div>

          <!-- 关闭按钮 -->
          <div v-if="!discoverStore.batchProgress.active" class="mt-3 flex justify-end">
            <CustomButton type="primary" size="small" @click="handleCloseBatchProgress">关闭</CustomButton>
          </div>
        </div>
      </div>
    </transition>
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
