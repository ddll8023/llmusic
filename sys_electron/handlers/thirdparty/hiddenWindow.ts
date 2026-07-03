/**
 * UserAPI 隐藏窗口管理
 * 创建/销毁隐藏 BrowserWindow，脚本安全执行环境
 */
import { BrowserWindow, session } from 'electron'
import path from 'node:path'
import { USER_API_EVENTS, type ProxyConfig } from '../../types/userapi'

/**
 * 私有 IP 地址段检测（SSRF 防护）
 * 阻止脚本访问内网服务
 */
const PRIVATE_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^\[::1\]$/,
  /^\[fe80:/,
]

/** 私有 IP 地址段检测（SSRF 防护）增强版 */
function isPrivateIP(hostname: string): boolean {
  // 去除可能的方括号（某些场景下 IPv6 地址可能带方括号）
  const clean = hostname.replace(/^\[|\]$/g, '')

  // IPv4-mapped IPv6 → 提取 IPv4 部分后再检查
  const ipv4MappedMatch = clean.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (ipv4MappedMatch) {
    return PRIVATE_IP_RANGES.some((range) => range.test(ipv4MappedMatch[1]))
  }

  return PRIVATE_IP_RANGES.some((range) => range.test(clean))
}

/** 释放隐藏窗口的 session 缓存 */
function clearSession(win: BrowserWindow): Promise<void[]> {
  return Promise.all([
    win.webContents.session.clearAuthCache(),
    win.webContents.session.clearStorageData(),
    win.webContents.session.clearCache(),
  ])
}

/**
 * 创建可运行 UserAPI 脚本的隐藏窗口
 * @returns 创建的隐藏窗口
 */
export async function createHiddenWindow(
  preloadPath: string,
  htmlContent: string,
  onConsoleMessage?: (level: number, message: string, line: number) => void,
): Promise<BrowserWindow> {
  const hiddenWin = new BrowserWindow({
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    roundedCorners: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: false, // preload 需要
      spellcheck: false,
      autoplayPolicy: 'document-user-activation-required',
      enableWebSQL: false,
      disableDialogs: true,
      webgl: false,
      images: false,
      preload: preloadPath,
      // 禁用不安全内容
      // (Electron 类型定义不包含 allowFileAccess，但运行时生效)
    },
    // 不可或缺：隐藏窗口也需要渲染，否则 executeJavaScript 不执行
    paintWhenInitiallyHidden: true,
  })

  // ── 安全策略 ──

  // 禁止导航/重定向/webview 附着
  const denyEvents = ['will-navigate', 'will-redirect', 'will-attach-webview',
    'will-prevent-unload', 'media-started-playing'] as const
  for (const eventName of denyEvents) {
    // @ts-expect-error Electron 事件类型不完美
    hiddenWin.webContents.on(eventName, (event: Electron.Event) => {
      event.preventDefault()
    })
  }

  // 禁止所有权限请求
  hiddenWin.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, resolve) => {
      resolve(false)
    },
  )

  // 禁止窗口打开
  hiddenWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // SSRF 防护：阻止私有 IP 的出站连接
  const sess = hiddenWin.webContents.session
  sess.webRequest.onBeforeRequest(
    { urls: ['<all_urls>'] },
    (details, callback) => {
      try {
        const url = new URL(details.url)
        if (isPrivateIP(url.hostname)) {
          callback({ cancel: true })
          return
        }
      } catch { /* URL 格式错误 */ }
      callback({ cancel: false })
    },
  )

  // 监听控制台日志（用于脚本调试）
  if (onConsoleMessage) {
    hiddenWin.webContents.on('console-message', (_event, level, message, line) => {
      onConsoleMessage(level, message, line)
    })
  }

  // ── 加载宿主页面 ──
  await hiddenWin.loadURL(
    'data:text/html;charset=UTF-8,' + encodeURIComponent(htmlContent),
  )

  return hiddenWin
}

/**
 * 销毁隐藏窗口
 */
export async function destroyHiddenWindow(win: BrowserWindow | null): Promise<void> {
  if (!win) return
  if (win.isDestroyed()) return
  await clearSession(win)
  win.destroy()
}
