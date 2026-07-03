import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { defaultThirdpartySources, STORAGE_KEY } from '../config/thirdpartySources'
import type { ThirdpartySource } from '../config/thirdpartySources'

export const useThirdpartyDownloadStore = defineStore('thirdpartyDownload', () => {
  // ── 从 localStorage 加载，无则用默认 ──
  const stored = localStorage.getItem(STORAGE_KEY)
  const sources = ref<ThirdpartySource[]>(
    stored ? JSON.parse(stored) : defaultThirdpartySources,
  )

  // 持久化 sources 到 localStorage
  watch(sources, (val) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(val))
  }, { deep: true })

  /** 全局默认下载源 ID */
  const defaultSourceId = ref(localStorage.getItem('llmusic_default_source') || 'vkeys')

  // 如果默认源被禁用，切到第一个启用的源
  const enabledIds = computed(() => sources.value.filter(s => s.enabled).map(s => s.id))
  watch([defaultSourceId, enabledIds], () => {
    if (defaultSourceId.value && enabledIds.value.length > 0 && !enabledIds.value.includes(defaultSourceId.value)) {
      defaultSourceId.value = enabledIds.value[0]
    }
  }, { immediate: true })

  watch(defaultSourceId, (val) => {
    localStorage.setItem('llmusic_default_source', val)
  })

  /** 当前默认源名称 */
  const defaultSourceName = computed(() => {
    const src = sources.value.find(s => s.id === defaultSourceId.value)
    return src?.name || 'vkeys.cn'
  })

  function setDefaultSource(id: string) {
    defaultSourceId.value = id
  }

  /** 获取当前平台启用的第三方源 */
  function getEnabledSources(platform: string): ThirdpartySource[] {
    return sources.value.filter(s => s.enabled && s.platform === platform)
  }

  /** 遍历启用的源，返回第一个可用的下载 URL（走后端代理） */
  async function getDownloadUrl(platform: string, songMid: string): Promise<{ url: string; sourceName: string } | null> {
    const enabled = getEnabledSources(platform)
    for (const source of enabled) {
      try {
        const resp = await fetch('http://localhost:9752/api/v1/thirdparty/get-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: source.url, songMid }),
        })
        const data = await resp.json()
        if (data.code === 0 && data.data?.url) {
          return { url: data.data.url, sourceName: source.name }
        }
      } catch {
        continue
      }
    }
    return null
  }

  /** 验证下载链接是否可访问（走后端代理） */
  async function validateDownloadUrl(url: string): Promise<boolean> {
    try {
      const resp = await fetch('http://localhost:9752/api/v1/thirdparty/validate-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await resp.json()
      return data.code === 0 && data.data?.ok === true
    } catch {
      return false
    }
  }

  /** 测试单个源是否可用（走后端代理避免 CORS） */
  async function testSource(source: ThirdpartySource, songMid: string): Promise<{ ok: boolean; ms: number }> {
    try {
      const resp = await fetch('http://localhost:9752/api/v1/thirdparty/test-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: source.url, songMid }),
      })
      const data = await resp.json()
      if (data.code === 0 && data.data) {
        return data.data
      }
    } catch {
      // fallback
    }
    return { ok: false, ms: 0 }
  }

  /** 切换源启/禁用 */
  function toggleSource(id: string) {
    const src = sources.value.find(s => s.id === id)
    if (src) src.enabled = !src.enabled
  }

  /** 重置为默认配置 */
  function resetToDefaults() {
    sources.value = JSON.parse(JSON.stringify(defaultThirdpartySources))
  }

  return {
    sources,
    getEnabledSources,
    getDownloadUrl,
    validateDownloadUrl,
    testSource,
    toggleSource,
    resetToDefaults,
    defaultSourceId,
    defaultSourceName,
    setDefaultSource,
  }
})
