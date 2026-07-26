/**
 * 全局通知（Toast）Store
 * 职责：维护 toast 队列，提供 notify/success/error/info/warning 入口，
 * 以及统一的未知错误分类提示 notifyError（网络/业务/系统三类文案）。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ApiError } from '@/api/qqmusic'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastItem {
	id: number
	type: ToastType
	message: string
}

/** 同文案去重窗口 (ms)：窗口内相同 message 不重复弹出 */
const DEDUPE_WINDOW = 2500

/** 默认展示时长 (ms) */
const DEFAULT_DURATION = 3000

let _nextId = 1

/** 判断是否为网络层错误（axios 请求未到达后端 / 超时） */
function isNetworkError(e: unknown): boolean {
	if (e instanceof Error) {
		const code = (e as Error & { code?: string }).code
		if (code === 'ERR_NETWORK' || code === 'ECONNABORTED' || code === 'ETIMEDOUT') return true
		return /network error|timeout/i.test(e.message)
	}
	return false
}

export const useNotificationStore = defineStore('notification', () => {
	const toasts = ref<ToastItem[]>([])

	/** 最近弹出的文案 → 时间戳，用于短时间去重 */
	const recentMessages = new Map<string, number>()

	function remove(id: number) {
		toasts.value = toasts.value.filter((t) => t.id !== id)
	}

	function notify(type: ToastType, message: string, duration = DEFAULT_DURATION) {
		if (!message) return

		// 短时间内同文案去重
		const now = Date.now()
		const last = recentMessages.get(message)
		if (last !== undefined && now - last < DEDUPE_WINDOW) return
		recentMessages.set(message, now)

		// 清理过期的去重记录，避免 Map 无限增长
		for (const [msg, ts] of recentMessages) {
			if (now - ts >= DEDUPE_WINDOW) recentMessages.delete(msg)
		}

		const id = _nextId++
		toasts.value.push({ id, type, message })
		window.setTimeout(() => remove(id), duration)
	}

	const success = (message: string, duration?: number) => notify('success', message, duration)
	const error = (message: string, duration?: number) => notify('error', message, duration)
	const info = (message: string, duration?: number) => notify('info', message, duration)
	const warning = (message: string, duration?: number) => notify('warning', message, duration)

	/**
	 * 统一错误分类提示：
	 * - ApiError（业务错误）→ 直接展示 message
	 * - 网络错误 → "网络连接失败，请重试"
	 * - 其他（系统错误）→ "系统异常，请稍后重试"
	 */
	function notifyError(e: unknown) {
		if (e instanceof ApiError) {
			error(e.message)
			return
		}
		if (isNetworkError(e)) {
			error('网络连接失败，请重试')
			return
		}
		error('系统异常，请稍后重试')
	}

	return { toasts, notify, remove, success, error, info, warning, notifyError }
})
