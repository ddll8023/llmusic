/**
 * UserAPI IPC 处理器
 * 处理渲染进程的第三方源请求：搜索、获取URL、脚本管理
 */
import { ipcMain, dialog } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { net } from 'electron'
import type { IpcHandlerModule } from '../../types'
import { CHANNELS } from '../../constants/ipcChannels'
import { USER_API_EVENTS } from '../../types/userapi'
import { BUILTIN_SOURCES, isBuiltinSource } from './builtinSources'
import {
  createScriptRecord,
  toScriptInfo,
  findDuplicateScript,
  inflateScript,
} from './scriptUtils'
import { generateRequestKey, handleResponse, sendRequest } from './requestQueue'
import {
  getHiddenWindow,
  isScriptLoaded,
  loadScript,
  unloadScript,
  openDevTools,
  closeDevTools,
  updateProxy,
} from './engine'

/**
 * 获取脚本存储路径
 */
function getScriptStoreFile(userDataPath: string): string {
  return path.join(userDataPath, 'userApiScripts.json')
}

/**
 * 加载存储的脚本列表
 */
async function loadStoredScripts(storePath: string): Promise<any[]> {
  try {
    await fs.promises.access(storePath)
    const raw = await fs.promises.readFile(storePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

/**
 * 保存脚本列表
 */
async function saveStoredScripts(storePath: string, scripts: any[]): Promise<void> {
  await fs.promises.writeFile(storePath, JSON.stringify(scripts, null, 2), 'utf8')
}

/**
 * 从存储中读取脚本记录并解析
 */
async function getScriptRecords(storePath: string): Promise<any[]> {
  const stored = await loadStoredScripts(storePath)
  return stored.map((s: any) => ({
    ...s,
    enabled: s.enabled !== false,
  }))
}

export function createThirdpartyHandlers(
  _mainWindow: Electron.BrowserWindow,
  userDataPath: string,
): IpcHandlerModule {
  const storePath = getScriptStoreFile(userDataPath)
  let currentPlaybackScriptId: string | null = null

  // ── 初始化：加载已存储的脚本 ──
  ;(async () => {
    /* eager init */
    await getScriptRecords(storePath)
  })()

  // ── 业务逻辑函数 ──

  async function listSources(): Promise<any[]> {
    const sources: any[] = []
    for (const bs of BUILTIN_SOURCES) {
      sources.push({
        id: bs.id,
        name: bs.name,
        platform: bs.id,
        type: 'builtin',
        enabled: true,
        qualitys: ['128k', '320k', 'flac', 'flac24bit'],
        actions: [],
        version: '1.0.0',
        author: 'Built-in',
      })
    }

    const records = await getScriptRecords(storePath)
    for (const rec of records) {
      sources.push({
        id: rec.id,
        name: rec.name || 'Unknown Script',
        platform: '',
        type: 'userapi',
        enabled: rec.enabled !== false,
        qualitys: [],
        actions: [],
        version: rec.version || '',
        author: rec.author || '',
      })
    }
    return sources
  }

  async function handleSetPlaybackScript(id: string | null | ''): Promise<void> {
    // P1-3：拒绝接收内置源 ID（只接受 UserAPI 脚本 ID、null 或空字符串）
    if (id && isBuiltinSource(id)) {
      console.warn(`[thirdparty] 拒绝设置内置源 ID "${id}" 作为播放脚本`)
      return
    }

    currentPlaybackScriptId = id || null

    if (!id) {
      // 空字符串 / null：卸载当前脚本
      if (isScriptLoaded()) await unloadScript()
      return
    }

    // UserAPI 脚本：加载到隐藏窗口
    const records = await getScriptRecords(storePath)
    const record = records.find((r: any) => r.id === id)
    if (record && record.enabled !== false) {
      await loadScript(record)
    } else {
      throw new Error(`Script not found or disabled: ${id}`)
    }
  }

  async function handleSearch(params: {
    source: string; keyword: string; page: number; pageSize: number
  }): Promise<any> {
    const { source, keyword, page, pageSize } = params
    if (!isBuiltinSource(source)) return { total: 0, songs: [] }
    const builtin = BUILTIN_SOURCES.find((b) => b.id === source)
    if (!builtin) return { total: 0, songs: [] }
    return builtin.search(keyword, page, pageSize)
  }

  async function handleGetMusicUrl(params: {
    source: string; song: any; quality: string
  }): Promise<string | null> {
    const { source, song, quality } = params

    /** 构建符合 lx-music 协议的 musicInfo，展平 platformIds 到顶层 */
    function buildMusicInfo(song: any): Record<string, unknown> {
      const info: Record<string, unknown> = { ...song }
      if (song.platformIds && typeof song.platformIds === 'object') {
        const pIds = song.platformIds as Record<string, any>
        if (pIds.tx?.songMid) info.songmid = pIds.tx.songMid
        if (pIds.kg?.hash) info.hash = pIds.kg.hash
        if (pIds.kg?.albumId) info.albumId = pIds.kg.albumId
        if (pIds.kw?.rid) info.rid = pIds.kw.rid
        if (pIds.mg?.copyrightId) info.copyrightId = pIds.mg.copyrightId
      }
      // 展平后清理 platformIds 冗余字段
      delete info.platformIds
      return info
    }

    const logPrefix = `[debug][getMusicUrl][${song?.id || '?'}]`
    console.log(`${logPrefix} 收到请求:`, {
      source,
      quality,
      songId: song?.id,
      songName: song?.songName,
      isScriptLoaded: isScriptLoaded(),
      hiddenWin: getHiddenWindow() ? '存在' : 'null',
      hasPlatformIds: !!song?.platformIds,
      platformIdsType: typeof song?.platformIds,
    })

    // P1-6：优先走 UserAPI（当前有已加载脚本时）
    if (isScriptLoaded()) {
      const hiddenWin = getHiddenWindow()
      if (hiddenWin && !hiddenWin.isDestroyed()) {
        const requestKey = generateRequestKey()
        console.log(`${logPrefix} 走 UserAPI 路径，请求 key: ${requestKey}`)
        try {
          const musicInfo = buildMusicInfo(song)
          const result = await sendRequest(hiddenWin, {
            requestKey,
            data: { source: source as any, action: 'musicUrl', info: { type: quality, musicInfo } },
          })
          // UserAPI 返回格式：{ source, action, data: { type, url } }，提取 url
          if (result === null || result === undefined) return null
          const url = result?.data?.url
          console.log(`${logPrefix} UserAPI 返回 URL:`, typeof url === 'string' ? `成功 (${url.slice(0, 60)}...)` : 'null/非字符串')
          if (typeof url === 'string') return url
          return null
        } catch (scriptErr) {
          console.warn(`${logPrefix} UserAPI 脚本执行异常:`, (scriptErr as Error).message)
          return null
        }
      } else {
        console.warn(`${logPrefix} isScriptLoaded=true 但 hiddenWin 不可用: destroyed=${hiddenWin?.isDestroyed()}`)
      }
    }

    // 降级：尝试内置源（当前为 stub，绝大部分返回 null）
    if (isBuiltinSource(source)) {
      const builtin = BUILTIN_SOURCES.find((b) => b.id === source)
      const builtinResult = builtin?.getMusicUrl(song, quality as any) ?? null
      console.log(`${logPrefix} 降级走内置源:`, builtinResult ? '有结果' : 'null(stub)')
      return builtinResult
    }

    console.warn(`${logPrefix} 无可用路径，返回 null`)
    return null
  }

  async function handleImportScript(): Promise<any | null> {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'JavaScript', extensions: ['js'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const fileContent = await fs.promises.readFile(result.filePaths[0], 'utf8')
    return saveScriptFromContent(fileContent)
  }

  /**
   * 从 URL 在线导入脚本
   */
  async function handleImportScriptFromUrl(url: string): Promise<any | null> {
    try {
      // URL 基本校验
      if (!url || (!url.startsWith('https://') && !url.startsWith('http://'))) {
        throw new Error('无效的 URL，必须以 http:// 或 https:// 开头')
      }

      // 只允许 .js 文件
      if (!url.endsWith('.js')) {
        throw new Error('仅支持导入 .js 脚本文件')
      }

      // 使用 Electron net 模块请求 URL 内容（遵循系统代理设置）
      const content = await new Promise<string>((resolve, reject) => {
        const request = net.request(url)
        request.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
        request.on('response', (response) => {
          if (response.statusCode !== 200) {
            reject(new Error(`服务器返回状态码 ${response.statusCode}`))
            return
          }
          let data = ''
          response.on('data', (chunk) => { data += chunk.toString() })
          response.on('end', () => resolve(data))
        })
        request.on('error', (err) => {
          reject(new Error(`网络请求失败: ${err.message}`))
        })
        request.end()
      })

      if (!content || content.trim().length === 0) {
        throw new Error('从 URL 获取的脚本内容为空')
      }

      return saveScriptFromContent(content)
    } catch (err: any) {
      console.error('在线导入脚本失败:', err.message)
      throw err
    }
  }

  /**
   * 保存脚本内容到存储（公共逻辑）
   */
  async function saveScriptFromContent(content: string): Promise<any | null> {
    const records = await getScriptRecords(storePath)
    const newRecord = await createScriptRecord(content)

    if (findDuplicateScript(newRecord.script, records)) return null

    records.push(newRecord)
    await saveStoredScripts(storePath, records)
    return toScriptInfo(newRecord)
  }

  async function handleRemoveScript(id: string): Promise<void> {
    const records = await getScriptRecords(storePath)
    const filtered = records.filter((r: any) => r.id !== id)
    await saveStoredScripts(storePath, filtered)
    if (currentPlaybackScriptId === id) {
      await unloadScript()
      currentPlaybackScriptId = null
    }
  }

  async function handleToggleScript(id: string, enabled: boolean): Promise<void> {
    const records = await getScriptRecords(storePath)
    const target = records.find((r: any) => r.id === id)
    if (!target) return
    target.enabled = enabled
    await saveStoredScripts(storePath, records)
    if (currentPlaybackScriptId === id && !enabled) {
      await unloadScript()
      currentPlaybackScriptId = null
    }
  }

  /**
   * 测试脚本是否可正常初始化
   * 加载脚本 → 等待 INIT 事件 → 返回结果 → 恢复原有源
   */
  async function handleTestScript(scriptId: string): Promise<boolean> {
    const records = await getScriptRecords(storePath)
    const record = records.find((r: any) => r.id === scriptId)
    if (!record) throw new Error('脚本不存在')

    const prevSourceId = currentPlaybackScriptId

    // 1. 先创建 INIT 事件的 promise（在 loadScript 前注册，避免竞态）
    let cancelInit: () => void = () => {}

    const initPromise = new Promise<{ success: boolean; error?: string }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cancelInit()
        reject(new Error('脚本加载超时（15s）'))
      }, 15000)

      const onInit = (_event: Electron.IpcMainEvent, params: any) => {
        clearTimeout(timeout)
        try { ipcMain.removeListener(USER_API_EVENTS.INIT, onInit) } catch { /* ignore */ }
        if (params?.status === true) {
          resolve({ success: true })
        } else {
          reject(new Error(params?.message || '脚本初始化失败'))
        }
      }

      ipcMain.once(USER_API_EVENTS.INIT, onInit)

      cancelInit = () => {
        clearTimeout(timeout)
        try { ipcMain.removeListener(USER_API_EVENTS.INIT, onInit) } catch { /* ignore */ }
      }
    })

    try {
      // 2. 加载脚本（此时监听器已在位，不会遗漏 INIT 事件）
      await loadScript(record)

      // 3. 等待初始化结果
      // 返回 true（布尔值），避免 ipcWrapper 检测到 success 字段后透传不加 data
      await initPromise
      return true
    } catch (err: any) {
      // loadScript 异常（如创建窗口失败），主动取消 initPromise 避免悬空
      cancelInit()
      throw err
    } finally {
      // 4. 恢复测试前的源状态
      if (prevSourceId && prevSourceId !== scriptId) {
        const prevRecord = records.find((r: any) => r.id === prevSourceId)
        if (prevRecord) {
          await loadScript(prevRecord).catch(() => {})
        }
      } else if (!prevSourceId) {
        await unloadScript().catch(() => {})
      }
    }
  }

  async function handleGetStatus(): Promise<any> {
    return { playbackScriptId: currentPlaybackScriptId, isScriptLoaded: isScriptLoaded() }
  }

  // ── 隐藏窗口 ← → 主进程 IPC 监听 ──
  const cleanupIpcListeners: (() => void)[] = []

  function setupHiddenWindowListeners(): void {
    const onInit = (_event: Electron.IpcMainEvent, params: any) => {
      // 转发隐藏窗口的初始化状态到渲染进程
      try { _mainWindow.webContents.send('source:status-change', params) } catch { /* ignore */ }
    }
    const onResponse = (_event: Electron.IpcMainEvent, params: any) => {
      handleResponse(params)
    }
    const onOpenDevtools = () => { openDevTools() }

    ipcMain.on(USER_API_EVENTS.INIT, onInit)
    ipcMain.on(USER_API_EVENTS.RESPONSE, onResponse)
    ipcMain.on(USER_API_EVENTS.OPEN_DEVTOOLS, onOpenDevtools)

    cleanupIpcListeners.push(
      () => ipcMain.removeListener(USER_API_EVENTS.INIT, onInit),
      () => ipcMain.removeListener(USER_API_EVENTS.RESPONSE, onResponse),
      () => ipcMain.removeListener(USER_API_EVENTS.OPEN_DEVTOOLS, onOpenDevtools),
    )
  }

  setupHiddenWindowListeners()

  return {
    handlers: [
      { channel: CHANNELS.THIRDPARTY_LIST_SOURCES, handler: listSources },
      { channel: CHANNELS.THIRDPARTY_SET_SOURCE, handler: async (_e: any, id: string) => handleSetPlaybackScript(id) },
      { channel: CHANNELS.THIRDPARTY_SEARCH, handler: async (_e: any, p: any) => handleSearch(p) },
      { channel: CHANNELS.THIRDPARTY_GET_MUSIC_URL, handler: async (_e: any, p: any) => handleGetMusicUrl(p) },
      { channel: CHANNELS.THIRDPARTY_IMPORT_SCRIPT, handler: async () => handleImportScript() },
      { channel: CHANNELS.THIRDPARTY_IMPORT_SCRIPT_URL, handler: async (_e: any, url: string) => handleImportScriptFromUrl(url) },
      { channel: CHANNELS.THIRDPARTY_REMOVE_SCRIPT, handler: async (_e: any, id: string) => handleRemoveScript(id) },
      { channel: CHANNELS.THIRDPARTY_TOGGLE_SCRIPT, handler: async (_e: any, id: string, en: boolean) => handleToggleScript(id, en) },
      { channel: CHANNELS.THIRDPARTY_TEST_SCRIPT, handler: async (_e: any, id: string) => handleTestScript(id) },
      { channel: CHANNELS.THIRDPARTY_GET_STATUS, handler: async () => handleGetStatus() },
      { channel: CHANNELS.THIRDPARTY_OPEN_DEVTOOLS, handler: async () => openDevTools() },
      { channel: CHANNELS.THIRDPARTY_CLOSE_DEVTOOLS, handler: async () => closeDevTools() },
    ],
    cleanup: () => {
      unloadScript()
      cleanupIpcListeners.forEach((fn) => fn())
    },
  }
}
