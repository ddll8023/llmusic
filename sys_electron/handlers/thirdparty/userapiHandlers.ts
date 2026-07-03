/**
 * UserAPI IPC 处理器
 * 处理渲染进程的第三方源请求：搜索、获取URL、脚本管理
 */
import { ipcMain, dialog } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
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
  let currentSourceId: string | null = null

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

  async function setSource(id: string): Promise<void> {
    currentSourceId = id
    if (isBuiltinSource(id)) {
      if (isScriptLoaded()) await unloadScript()
      return
    }

    const records = await getScriptRecords(storePath)
    const record = records.find((r: any) => r.id === id)
    if (record && record.enabled !== false) {
      await loadScript(record)
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

    // 内置源：直接调用
    if (isBuiltinSource(source)) {
      const builtin = BUILTIN_SOURCES.find((b) => b.id === source)
      if (!builtin) return null
      return builtin.getMusicUrl(song, quality as any)
    }

    // UserAPI：通过隐藏窗口 + 请求队列
    const hiddenWin = getHiddenWindow()
    if (!hiddenWin || hiddenWin.isDestroyed()) return null

    const requestKey = generateRequestKey()
    return sendRequest(hiddenWin, {
      requestKey,
      data: { source: source as any, action: 'musicUrl', info: { ...song, type: quality } },
    })
  }

  async function handleImportScript(): Promise<any | null> {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'JavaScript', extensions: ['js'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const fileContent = await fs.promises.readFile(result.filePaths[0], 'utf8')
    const records = await getScriptRecords(storePath)
    const newRecord = await createScriptRecord(fileContent)

    if (findDuplicateScript(newRecord.script, records)) return null

    records.push(newRecord)
    await saveStoredScripts(storePath, records)
    return toScriptInfo(newRecord)
  }

  async function handleRemoveScript(id: string): Promise<void> {
    const records = await getScriptRecords(storePath)
    const filtered = records.filter((r: any) => r.id !== id)
    await saveStoredScripts(storePath, filtered)
    if (currentSourceId === id) {
      await unloadScript()
      currentSourceId = null
    }
  }

  async function handleToggleScript(id: string, enabled: boolean): Promise<void> {
    const records = await getScriptRecords(storePath)
    const target = records.find((r: any) => r.id === id)
    if (!target) return
    target.enabled = enabled
    await saveStoredScripts(storePath, records)
    if (currentSourceId === id && !enabled) {
      await unloadScript()
      currentSourceId = null
    }
  }

  async function handleGetStatus(): Promise<any> {
    return { currentSourceId, isScriptLoaded: isScriptLoaded() }
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
      { channel: CHANNELS.THIRDPARTY_SET_SOURCE, handler: async (_e: any, id: string) => setSource(id) },
      { channel: CHANNELS.THIRDPARTY_SEARCH, handler: async (_e: any, p: any) => handleSearch(p) },
      { channel: CHANNELS.THIRDPARTY_GET_MUSIC_URL, handler: async (_e: any, p: any) => handleGetMusicUrl(p) },
      { channel: CHANNELS.THIRDPARTY_IMPORT_SCRIPT, handler: async () => handleImportScript() },
      { channel: CHANNELS.THIRDPARTY_REMOVE_SCRIPT, handler: async (_e: any, id: string) => handleRemoveScript(id) },
      { channel: CHANNELS.THIRDPARTY_TOGGLE_SCRIPT, handler: async (_e: any, id: string, en: boolean) => handleToggleScript(id, en) },
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
