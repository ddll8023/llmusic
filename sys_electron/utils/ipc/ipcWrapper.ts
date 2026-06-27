import { ipcMain, type IpcMainInvokeEvent } from "electron"
import { CHANNELS } from "../../constants/ipcChannels"

// 简化的节流函数实现
export const throttle = <T extends (...args: never[]) => void>(
	fn: T,
	wait: number = 100
): ((...args: Parameters<T>) => void) => {
	let lastCallTime = 0
	let timerId: ReturnType<typeof setTimeout> | null = null
	return function throttled(this: unknown, ...args: Parameters<T>): void {
		const now = Date.now()
		const remaining = wait - (now - lastCallTime)
		if (remaining <= 0 || remaining > wait) {
			if (timerId) {
				clearTimeout(timerId)
				timerId = null
			}
			lastCallTime = now
			fn.apply(this, args)
		} else if (!timerId) {
			timerId = setTimeout(() => {
				lastCallTime = Date.now()
				timerId = null
				fn.apply(this, args)
			}, remaining)
		}
	}
}

/**
 * 记录已注册的通道与包装函数，便于卸载
 */
const _registry: Map<string, (...args: unknown[]) => unknown> = new Map()

interface RegisterOptions {
	throttleMs?: number
}

/**
 * 注册 ipcMain.handle，并对错误统一封装 { success: false, error }
 */
function registerIPC(
	channel: string,
	handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
	options: RegisterOptions = {}
): void {
	if (_registry.has(channel)) {
		console.warn(`[ipcWrapper] channel "${channel}" 已存在，将被覆盖`)
		ipcMain.removeHandler(channel)
	}

	let wrapped = async function (event: IpcMainInvokeEvent, ...args: unknown[]): Promise<Record<string, unknown>> {
		try {
			const res = await handler(event, ...args)
			// 若 handler 未显式返回 success 字段，则自动包裹成功
			if (res && typeof res === "object" && "success" in (res as Record<string, unknown>)) {
				return res as Record<string, unknown>
			}
			return { success: true, data: res }
		} catch (err) {
			console.error(`[ipcWrapper] channel ${channel} 处理异常:`, err)
			const error = err as Error
			return { success: false, error: error?.message || String(err) }
		}
	}

	if (typeof options.throttleMs === "number") {
		const throttled = throttle(
			wrapped as (...args: never[]) => void,
			options.throttleMs
		)
		ipcMain.handle(channel, throttled as any)
		_registry.set(channel, throttled as any)
	} else {
		ipcMain.handle(channel, wrapped as any)
		_registry.set(channel, wrapped as any)
	}
}

/** 卸载指定通道 */
function unregisterIPC(channel: string): void {
	if (_registry.has(channel)) {
		ipcMain.removeHandler(channel)
		_registry.delete(channel)
	}
}

/** 卸载全部 */
function unregisterAll(): void {
	for (const channel of _registry.keys()) {
		ipcMain.removeHandler(channel)
	}
	_registry.clear()
}

export { registerIPC, unregisterIPC, unregisterAll }
