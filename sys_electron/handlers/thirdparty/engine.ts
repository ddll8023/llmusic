/**
 * UserAPI 隐藏窗口管理引擎
 * 脚本加载/卸载、生命周期、事件通信
 */
import { BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { createHiddenWindow, destroyHiddenWindow } from './hiddenWindow'
import { USER_API_EVENTS, type ScriptInfo, type ScriptRecord, type ProxyConfig } from '../../types/userapi'
import { inflateScript } from './scriptUtils'

let hiddenWindow: BrowserWindow | null = null
let currentScriptInfo: ScriptInfo | null = null
let currentHtml: string | null = null
let rendererDir: string | null = null
let onStatusChange: ((status: any) => void) | null = null
let onLog: ((level: number, message: string, line: number) => void) | null = null
let proxyConfig: ProxyConfig = { host: '', port: '' }

/**
 * 初始化引擎
 */
export function initEngine(
  statusCallback: (status: any) => void,
  logCallback?: (level: number, message: string, line: number) => void,
): void {
  onStatusChange = statusCallback
  onLog = logCallback || null
}

/**
 * 获取 UserAPI renderer 目录（用户数据目录下的 userApi/）
 */
function getRendererDir(): string {
  if (rendererDir) return rendererDir

  // 开发模式：使用项目内的 renderer 目录
  if (process.env.NODE_ENV !== 'production') {
    rendererDir = path.join(__dirname, 'renderer')
  } else {
    // 生产模式：使用 app.getAppPath() + extraResources
    const appPath = process.resourcesPath || path.join(__dirname, '..')
    rendererDir = path.join(appPath, 'userApi')
  }
  return rendererDir
}

/**
 * 获取 preload 脚本路径
 */
function getPreloadPath(): string {
  if (process.env.NODE_ENV !== 'production') {
    return path.join(getRendererDir(), 'preload.js')
  }
  return path.join(getRendererDir(), 'user-api-preload.js')
}

/**
 * 加载 HTML 模板（只在首次加载时读取文件，后续复用）
 */
async function getHtmlContent(): Promise<string> {
  if (currentHtml) return currentHtml

  const htmlPath = path.join(getRendererDir(), 'user-api.html')
  currentHtml = await fs.promises.readFile(htmlPath, 'utf8')
  return currentHtml
}

/**
 * 为指定脚本创建隐藏窗口并加载执行环境
 */
export async function loadScript(record: ScriptRecord): Promise<void> {
  // 如果已有窗口且正在运行不同的脚本，先关闭
  if (hiddenWindow) {
    await unloadScript()
  }

  currentScriptInfo = {
    id: record.id,
    name: record.name,
    description: record.description,
    author: record.author,
    homepage: record.homepage,
    version: record.version,
    allowShowUpdateAlert: record.allowShowUpdateAlert,
    enabled: record.enabled,
    importedAt: record.importedAt,
  }

  try {
    const scriptContent = await inflateScript(record.script)
    const htmlContent = await getHtmlContent()
    const preloadPath = getPreloadPath()

    hiddenWindow = await createHiddenWindow(
      preloadPath,
      htmlContent,
      onLog || undefined,
    )

    // 准备好后发送初始化事件
    hiddenWindow.on('ready-to-show', () => {
      sendInitEnv({
        ...currentScriptInfo!,
        script: scriptContent,
        proxy: proxyConfig,
      })
    })

  } catch (err) {
    const error = err as Error
    currentScriptInfo = null
    if (onStatusChange) {
      onStatusChange({
        status: false,
        message: error.message || 'Failed to load script',
      })
    }
  }
}

/**
 * 卸载当前脚本并关闭隐藏窗口
 */
export async function unloadScript(): Promise<void> {
  await destroyHiddenWindow(hiddenWindow)
  hiddenWindow = null
  currentScriptInfo = null
}

/**
 * 向隐藏窗口发送初始化环境事件
 */
function sendInitEnv(params: {
  id: string
  name: string
  description: string
  version: string
  author: string
  homepage: string
  script: string
  proxy: ProxyConfig
}): void {
  if (!hiddenWindow) return
  hiddenWindow.webContents.send(USER_API_EVENTS.INIT_ENV, params)
}

/**
 * 发送请求到当前加载的脚本
 */
function sendRequestToScript(data: {
  requestKey: string
  data: { source: string; action: string; info: Record<string, unknown> }
}): void {
  if (!hiddenWindow) return
  hiddenWindow.webContents.send(USER_API_EVENTS.REQUEST, data)
}

export { sendRequestToScript }

/**
 * 更新代理配置并通知隐藏窗口
 */
export function updateProxy(config: ProxyConfig): void {
  proxyConfig = config
  if (hiddenWindow) {
    hiddenWindow.webContents.send(USER_API_EVENTS.PROXY_UPDATE, config)
  }
}

/**
 * 打开 DevTools 调试窗口
 */
export function openDevTools(): void {
  if (hiddenWindow) {
    hiddenWindow.webContents.openDevTools({ mode: 'detach' })
  }
}

/**
 * 关闭 DevTools
 */
export function closeDevTools(): void {
  if (hiddenWindow) {
    hiddenWindow.webContents.closeDevTools()
  }
}

/**
 * 获取当前隐藏窗口实例
 */
export function getHiddenWindow(): BrowserWindow | null {
  return hiddenWindow
}

/**
 * 获取当前脚本信息
 */
export function getCurrentScript(): ScriptInfo | null {
  return currentScriptInfo
}

/**
 * 隐藏窗口是否已创建并加载脚本
 */
export function isScriptLoaded(): boolean {
  return hiddenWindow !== null && !hiddenWindow.isDestroyed()
}
