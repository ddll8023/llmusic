/**
 * 第三方源管理 Store
 * 管理所有源的运行时状态、搜索、播放 URL 获取
 * 取代旧的 thirdpartyDownload.ts
 */
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { ThirdpartySourceInfo, NormalizedSongInfo, ThirdpartyStatus } from '../types/api'

const STORAGE_KEY_SOURCE = 'llmusic_thirdparty_source'   // 当前选中的源 ID
const STORAGE_KEY_QUALITY = 'llmusic_thirdparty_quality' // 首选音质
const OLD_STORAGE_KEY = 'llmusic_thirdparty_sources'     // 旧版本存储键（待迁移）

// ── 迁移旧数据 ──
function migrateOldData(): void {
  const oldData = localStorage.getItem(OLD_STORAGE_KEY)
  if (!oldData) return
  try {
    const oldSources = JSON.parse(oldData)
    if (Array.isArray(oldSources) && oldSources.length > 0) {
      // 从旧数据中提取默认源 ID 和平台
      const defaultSource = oldSources.find((s: any) => s.enabled !== false)
      if (defaultSource) {
        // 旧数据只有 qq 平台，新系统以 'kw' 为默认
        // 只迁移默认源选中状态
        localStorage.setItem(STORAGE_KEY_SOURCE, 'kw')
      }
    }
    localStorage.removeItem(OLD_STORAGE_KEY)
  } catch {
    // 旧数据格式异常，直接清除
    localStorage.removeItem(OLD_STORAGE_KEY)
  }
}

migrateOldData()

export const useThirdpartyStore = defineStore('thirdparty', () => {
  // ── 状态 ──
  const sources = ref<ThirdpartySourceInfo[]>([])
  const currentSourceId = ref(localStorage.getItem(STORAGE_KEY_SOURCE) || 'kw')
  const preferredQuality = ref(localStorage.getItem(STORAGE_KEY_QUALITY) || '320k')
  const status = ref<ThirdpartyStatus>({ currentSourceId: null, isScriptLoaded: false })
  const loading = ref(false)
  const searchResults = ref<NormalizedSongInfo[]>([])
  const searchTotal = ref(0)
  const errorMsg = ref('')

  // ── 计算属性 ──
  const sourceList = computed(() => Array.isArray(sources.value) ? sources.value : [])

  const currentSource = computed(() =>
    sourceList.value.find(s => s.id === currentSourceId.value),
  )

  const enabledSources = computed(() =>
    sourceList.value.filter(s => s.enabled),
  )

  const builtinSources = computed(() =>
    enabledSources.value.filter(s => s.type === 'builtin'),
  )

  const userApiSources = computed(() =>
    enabledSources.value.filter(s => s.type === 'userapi'),
  )

  // ── 持久化 ──
  watch(currentSourceId, (val) => {
    localStorage.setItem(STORAGE_KEY_SOURCE, val)
  })

  watch(preferredQuality, (val) => {
    localStorage.setItem(STORAGE_KEY_QUALITY, val)
  })

  // ── 动作 ──

  /** 从主进程刷新源列表 */
  async function refreshSources(): Promise<void> {
    try {
      if (!window.electronAPI?.thirdparty?.listSources) return
      sources.value = await window.electronAPI.thirdparty.listSources()
    } catch (err) {
      console.error('获取源列表失败:', err)
    }
  }

  /** 切换当前使用的源 */
  async function setSource(id: string): Promise<void> {
    if (currentSourceId.value === id) return
    currentSourceId.value = id
    try {
      await window.electronAPI.thirdparty.setSource(id)
      const result = await window.electronAPI.thirdparty.getStatus()
      status.value = result ?? { currentSourceId: null, isScriptLoaded: false }
    } catch (err) {
      console.error('切换源失败:', err)
    }
  }

  /** 搜索（仅内置源支持） */
  async function search(keyword: string, page = 1, pageSize = 20): Promise<void> {
    if (!keyword.trim()) return

    loading.value = true
    errorMsg.value = ''
    searchResults.value = []
    searchTotal.value = 0

    const sourceId = currentSourceId.value

    try {
      const result = await window.electronAPI.thirdparty.search({
        source: sourceId,
        keyword: keyword.trim(),
        page,
        pageSize,
      })
      searchResults.value = result?.songs || []
      searchTotal.value = result?.total || 0

      if (!result?.songs?.length) {
        errorMsg.value = '未找到相关歌曲'
      }
    } catch (err) {
      errorMsg.value = '搜索失败，请稍后重试'
      console.error('第三方搜索失败:', err)
    } finally {
      loading.value = false
    }
  }

  /** 获取播放 URL（内置源直调，UserAPI 走隐藏窗口） */
  async function getMusicUrl(song: NormalizedSongInfo, quality?: string): Promise<string | null> {
    try {
      const url = await window.electronAPI.thirdparty.getMusicUrl({
        source: song.source || currentSourceId.value,
        song,
        quality: quality || preferredQuality.value,
      })
      return url ?? null
    } catch (err) {
      console.error('获取播放 URL 失败:', err)
      return null
    }
  }

  /** 导入脚本 */
  async function importScript(): Promise<void> {
    try {
      const result = await window.electronAPI.thirdparty.importScript()
      if (result) {
        await refreshSources()
      }
    } catch (err) {
      console.error('导入脚本失败:', err)
    }
  }

  /** 删除脚本 */
  async function removeScript(id: string): Promise<void> {
    try {
      await window.electronAPI.thirdparty.removeScript(id)
      sources.value = sources.value.filter(s => s.id !== id)
      if (currentSourceId.value === id) {
        currentSourceId.value = 'kw'
        await setSource('kw')
      }
    } catch (err) {
      console.error('删除脚本失败:', err)
    }
  }

  /** 切换脚本启用/禁用 */
  async function toggleScript(id: string, enabled: boolean): Promise<void> {
    try {
      await window.electronAPI.thirdparty.toggleScript(id, enabled)
      const src = sources.value.find(s => s.id === id)
      if (src) src.enabled = enabled
      if (currentSourceId.value === id && !enabled) {
        // 当前使用的源被禁用了，切到第一个可用源
        const first = sources.value.find(s => s.enabled)
        if (first) await setSource(first.id)
      }
    } catch (err) {
      console.error('切换脚本状态失败:', err)
    }
  }

  /** 打开脚本 DevTools */
  function openDevTools(): void {
    window.electronAPI.thirdparty.openDevTools()
  }

  /** 关闭脚本 DevTools */
  function closeDevTools(): void {
    window.electronAPI.thirdparty.closeDevTools()
  }

  /** 刷新状态 */
  async function refreshStatus(): Promise<void> {
    try {
      status.value = await window.electronAPI.thirdparty.getStatus()
    } catch {
      // ignore
    }
  }

  return {
    // 状态
    sources,
    currentSourceId,
    preferredQuality,
    status,
    loading,
    searchResults,
    searchTotal,
    errorMsg,

    // 计算属性
    currentSource,
    enabledSources,
    builtinSources,
    userApiSources,

    // 动作
    refreshSources,
    setSource,
    search,
    getMusicUrl,
    importScript,
    removeScript,
    toggleScript,
    openDevTools,
    closeDevTools,
    refreshStatus,
  }
})
