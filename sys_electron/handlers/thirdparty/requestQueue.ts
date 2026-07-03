/**
 * UserAPI 请求队列管理
 * 管理隐藏窗口的请求/响应通信，支持超时和取消
 */
import { BrowserWindow } from 'electron'
import { USER_API_EVENTS } from '../../types/userapi'
import type { UserApiRequestParams } from '../../types/userapi'

interface RequestEntry {
  resolve: (value: any) => void
  reject: (reason: Error) => void
  data: any
}

const requestQueue = new Map<string, RequestEntry>()
const timeouts = new Map<string, NodeJS.Timeout>()

const MAX_QUEUE_SIZE = 100
const DEFAULT_TIMEOUT_MS = {
  search: 15_000,
  musicUrl: 10_000,
  lyric: 8_000,
  pic: 8_000,
}

function getTimeoutForAction(action: string): number {
  switch (action) {
    case 'musicUrl': return DEFAULT_TIMEOUT_MS.musicUrl
    case 'lyric': return DEFAULT_TIMEOUT_MS.lyric
    case 'pic': return DEFAULT_TIMEOUT_MS.pic
    default: return 15_000
  }
}

/** 生成唯一的请求 key */
export function generateRequestKey(): string {
  return `req__${Math.random().toString(36).substring(2, 10)}_${Date.now()}`
}

/** 清除某个请求的超时定时器 */
export function clearRequestTimeout(requestKey: string): void {
  const timeout = timeouts.get(requestKey)
  if (timeout) {
    clearTimeout(timeout)
    timeouts.delete(requestKey)
  }
}

/** 发送请求到隐藏窗口，返回 Promise */
export function sendRequest(
  hiddenWin: BrowserWindow,
  params: UserApiRequestParams,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const { requestKey, data } = params

    // 如果已有相同 key 的请求，取消旧的
    if (timeouts.has(requestKey)) {
      clearRequestTimeout(requestKey)
      cancelRequestByKey(requestKey)
    }

    // 队列上限保护
    if (requestQueue.size >= MAX_QUEUE_SIZE) {
      reject(new Error('请求队列已满 (' + MAX_QUEUE_SIZE + ')，请稍后重试'))
      return
    }

    // 设置超时
    const timeoutMs = getTimeoutForAction(data.action)
    timeouts.set(
      requestKey,
      setTimeout(() => {
        cancelRequestByKey(requestKey)
      }, timeoutMs),
    )

    // 存入队列
    requestQueue.set(requestKey, { resolve, reject, data })

    // 发送到隐藏窗口
    hiddenWin.webContents.send(USER_API_EVENTS.REQUEST, params)
  })
}

/** 取消请求 */
function cancelRequestByKey(requestKey: string): void {
  const entry = requestQueue.get(requestKey)
  if (!entry) return
  entry.reject(new Error('Cancel request'))
  requestQueue.delete(requestKey)
  clearRequestTimeout(requestKey)
}

/** 处理隐藏窗口返回的响应 */
export function handleResponse(params: {
  status: boolean
  message?: string
  data?: { requestKey: string; result?: any }
}): void {
  const { status, message, data } = params
  if (!data?.requestKey) return

  const requestKey = data.requestKey
  const entry = requestQueue.get(requestKey)
  if (!entry) return

  requestQueue.delete(requestKey)
  clearRequestTimeout(requestKey)

  if (status) {
    entry.resolve(data.result)
  } else {
    entry.reject(new Error(message || 'Request failed'))
  }
}

/** 取消所有待处理的请求 */
export function cancelAllRequests(): void {
  for (const [key, entry] of requestQueue) {
    entry.reject(new Error('All requests cancelled'))
    clearRequestTimeout(key)
  }
  requestQueue.clear()
}

/** 检查是否有正在进行的请求 */
export function hasPendingRequests(): boolean {
  return requestQueue.size > 0
}
