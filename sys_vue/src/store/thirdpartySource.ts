/**
 * 第三方源管理 Store
 * 管理所有源的运行时状态、搜索、播放 URL 获取
 * 取代旧的 thirdpartyDownload.ts
 *
 * 方案B 重构：
 * - searchSourceId（搜索源，内置平台）与 playbackScriptId（播放脚本，UserAPI）分离
 * - 搜索源切换纯前端（不触 IPC），播放脚本切换走 IPC
 * - localStorage 双 key 持久化 + 旧 key 数据迁移
 */
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { ThirdpartySourceInfo, NormalizedSongInfo, ThirdpartyStatus } from '../types/api'

const STORAGE_KEY_SEARCH_SOURCE = 'llmusic_thirdparty_search_source'     // 搜索源（内置平台）
const STORAGE_KEY_PLAYBACK_SCRIPT = 'llmusic_thirdparty_playback_script' // 播放脚本（UserAPI）
const STORAGE_KEY_QUALITY = 'llmusic_thirdparty_quality'                 // 首选音质
const OLD_STORAGE_KEY = 'llmusic_thirdparty_sources'                     // 旧版本存储键（待迁移）
const OLD_STORAGE_KEY_SOURCE = 'llmusic_thirdparty_source'               // 旧版本源 ID 键（待迁移）

// ── 迁移旧数据（仅限 OLD_STORAGE_KEY，OLD_STORAGE_KEY_SOURCE 的迁移在 refreshSources 中执行）──
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
        localStorage.setItem(STORAGE_KEY_SEARCH_SOURCE, 'kw')
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

  // P0-2：搜索源 ID（内置平台），默认 'kw'
  const searchSourceId = ref(localStorage.getItem(STORAGE_KEY_SEARCH_SOURCE) || 'kw')

  // P0-2：播放脚本 ID（UserAPI），默认 ''
  const playbackScriptId = ref(localStorage.getItem(STORAGE_KEY_PLAYBACK_SCRIPT) || '')

  const preferredQuality = ref(localStorage.getItem(STORAGE_KEY_QUALITY) || '320k')

  // P1-1：status 初始值使用 playbackScriptId
  const status = ref<ThirdpartyStatus>({ playbackScriptId: null, isScriptLoaded: false })

  const loading = ref(false)
  const searchResults = ref<NormalizedSongInfo[]>([])
  const searchTotal = ref(0)
  const errorMsg = ref('')

  // ── 计算属性 ──
  const sourceList = computed(() => Array.isArray(sources.value) ? sources.value : [])

  // currentSource 改为基于 playbackScriptId 查找
  const currentSource = computed(() =>
    sourceList.value.find(s => s.id === playbackScriptId.value),
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

  /** 当前活跃的 UserAPI 脚本详情（便于 UI 展示） */
  const activePlaybackScript = computed(() =>
    userApiSources.value.find(s => s.id === playbackScriptId.value) || null,
  )

  // ── 持久化 ──
  watch(searchSourceId, (val) => {
    localStorage.setItem(STORAGE_KEY_SEARCH_SOURCE, val)
  })

  watch(playbackScriptId, (val) => {
    localStorage.setItem(STORAGE_KEY_PLAYBACK_SCRIPT, val)
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

      // ★ P0-2：localStorage 数据迁移（此时 sources 已加载，可正确判断）
      const oldVal = localStorage.getItem(OLD_STORAGE_KEY_SOURCE)
      if (oldVal !== null) {
        const isUserApiScriptId = sources.value.some(s => s.id === oldVal)
        if (isUserApiScriptId) {
          // 老值是 UserAPI 脚本 ID → 迁入 playbackScriptId，搜索源保持默认
          playbackScriptId.value = oldVal
          searchSourceId.value = 'kw'
        } else {
          // 老值是内置源 ID 或无效值 → 迁入 searchSourceId，播放脚本清空
          searchSourceId.value = oldVal || 'kw'
          playbackScriptId.value = ''
        }
        localStorage.removeItem(OLD_STORAGE_KEY_SOURCE) // 删除老键
        // 写入新键
        localStorage.setItem(STORAGE_KEY_PLAYBACK_SCRIPT, playbackScriptId.value)
        localStorage.setItem(STORAGE_KEY_SEARCH_SOURCE, searchSourceId.value)
      }
    } catch (err) {
      console.error('获取源列表失败:', err)
    }
  }

  /** 切换搜索源（纯前端，不触 IPC） */
  function setSearchSource(id: string): void {
    if (searchSourceId.value === id) return
    searchSourceId.value = id
    // 不调用 backend，不涉及隐藏窗口
  }

  /** 切换播放脚本（UserAPI，走 IPC 加载脚本到隐藏窗口） */
  async function setPlaybackScript(id: string | null): Promise<void> {
    // 如果 ID 相同且后端已加载，跳过（防止重启后 localStorage 旧 ID 导致提前 return）
    if (playbackScriptId.value === (id || '') && status.value.isScriptLoaded) return
    playbackScriptId.value = id || ''
    try {
      await window.electronAPI.thirdparty.setSource(id || '')
      const result = await window.electronAPI.thirdparty.getStatus()
      status.value = result ?? { playbackScriptId: id || null, isScriptLoaded: false }
    } catch (err) {
      console.error('切换播放脚本失败:', err)
      status.value = { playbackScriptId: id || null, isScriptLoaded: false }
    }
  }

  /** 搜索（仅内置源支持） */
  async function search(keyword: string, page = 1, pageSize = 20): Promise<void> {
    if (!keyword.trim()) return

    loading.value = true
    errorMsg.value = ''
    searchResults.value = []
    searchTotal.value = 0

    // P1-7：source 参数使用 searchSourceId（而非 playbackScriptId）
    const sourceId = searchSourceId.value

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
      // 深拷贝 song：JSON.parse/stringify 彻底剥离 Vue reactive proxy，
      // 避免 platformIds 等嵌套对象残留 reactive wrapper 导致 structuredClone 失败
      const plainSong = JSON.parse(JSON.stringify(song))
      const sourceId = song.source || searchSourceId.value
      const qualityVal = quality || preferredQuality.value

      console.log('[debug] getMusicUrl 参数:', {
        source: sourceId,
        quality: qualityVal,
        songId: plainSong.id,
        songName: plainSong.songName,
        keys: Object.keys(plainSong),
        platformIds: plainSong.platformIds,
      })

      const url = await window.electronAPI.thirdparty.getMusicUrl({
        source: sourceId,
        song: plainSong,
        quality: qualityVal,
      })

      console.log('[debug] getMusicUrl 返回值:', url ? `成功 (${url.slice(0, 60)}...)` : 'null/无结果')
      return url ?? null
    } catch (err) {
      console.error('[debug] 获取播放 URL 失败:', {
        error: (err as Error).message,
        stack: (err as Error).stack,
        songId: song?.id,
        songName: song?.songName,
        source: song?.source || searchSourceId.value,
        quality: quality || preferredQuality.value,
      })
      return null
    }
  }

  /** 获取歌词（UserAPI → 内置源 → 后端降级） */
  async function getThirdpartyLyric(song: NormalizedSongInfo): Promise<string | null> {
    try {
      const plainSong = JSON.parse(JSON.stringify(song))
      const sourceId = song.source || searchSourceId.value

      console.log('[debug] getThirdpartyLyric 参数:', {
        source: sourceId,
        songId: plainSong.id,
        songName: plainSong.songName,
      })

      const lyric = await window.electronAPI.thirdparty.getLyric({
        source: sourceId,
        song: plainSong,
      })

      return lyric ?? null
    } catch (err) {
      console.error('[debug] 获取歌词失败:', {
        error: (err as Error).message,
        songId: song?.id,
        songName: song?.songName,
      })
      return null
    }
  }

  /** 导入脚本（本地文件） */
  async function importScript(): Promise<boolean> {
    try {
      const result = await window.electronAPI.thirdparty.importScript()
      await refreshSources()
      return result !== null
    } catch (err) {
      console.error('导入脚本失败:', err)
      return false
    }
  }

  /** 从 URL 在线导入脚本 */
  async function importScriptFromUrl(url: string): Promise<boolean> {
    try {
      const result = await window.electronAPI.thirdparty.importScriptFromUrl(url)
      await refreshSources()
      return result !== null
    } catch (err) {
      console.error('在线导入脚本失败:', err)
      throw err
    }
  }

  /** 删除脚本 */
  async function removeScript(id: string): Promise<void> {
    try {
      await window.electronAPI.thirdparty.removeScript(id)
      sources.value = sources.value.filter(s => s.id !== id)
      // P0-1：若删除的是当前播放脚本 → 清空 playbackScriptId，不 fallback 到 'kw'
      if (playbackScriptId.value === id) {
        playbackScriptId.value = ''
        await setPlaybackScript(null)
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
      // P0-1：若禁用的是当前播放脚本 → 尝试切到第一个可用 UserAPI 脚本，无则清空
      if (playbackScriptId.value === id && !enabled) {
        const firstUserApi = sources.value.find(s => s.enabled && s.type === 'userapi')
        if (firstUserApi) {
          await setPlaybackScript(firstUserApi.id)
        } else {
          playbackScriptId.value = ''
          await setPlaybackScript(null)
        }
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

  /** 在线导入脚本状态 */
  const testingResults = ref<Record<string, { status: 'success' | 'fail' | 'testing'; error?: string }>>({})

  /** 刷新状态 */
  async function refreshStatus(): Promise<void> {
    try {
      status.value = await window.electronAPI.thirdparty.getStatus()
    } catch {
      // ignore
    }
  }

  /** 测试指定脚本能否正常加载 */
  async function testScript(scriptId: string): Promise<{ success: boolean; error?: string }> {
    testingResults.value[scriptId] = { status: 'testing' }
    try {
      await window.electronAPI.thirdparty.testScript(scriptId)
      // 成功：IPC 返回 true，不抛异常
      testingResults.value[scriptId] = { status: 'success' }
      setTimeout(() => {
        if (testingResults.value[scriptId]) {
          delete testingResults.value[scriptId]
        }
      }, 3000)
      return { success: true }
    } catch (err: any) {
      testingResults.value[scriptId] = { status: 'fail', error: err.message || '测试失败' }
      setTimeout(() => {
        if (testingResults.value[scriptId]) {
          delete testingResults.value[scriptId]
        }
      }, 3000)
      return { success: false, error: err.message || '测试失败' }
    }
  }

  return {
    // 状态
    sources,
    searchSourceId,
    playbackScriptId,
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
    activePlaybackScript,

    // 动作
    refreshSources,
    setSearchSource,
    setPlaybackScript,
    search,
    getMusicUrl,
    getThirdpartyLyric,
    importScript,
    importScriptFromUrl,
    removeScript,
    toggleScript,
    openDevTools,
    closeDevTools,
    refreshStatus,

    // 测试
    testingResults,
    testScript,
  }
})
