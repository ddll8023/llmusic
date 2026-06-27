import { scanMusic, cancelScan } from "./MusicScanner"
import { CHANNELS } from "../../constants/ipcChannels"
import type { IpcHandlerModule } from "../../types"

import { throttle } from "../../utils/ipc/ipcWrapper"

// 扫描状态
let _isScanActive = false
let _lastProgressTime = 0
const PROGRESS_THROTTLE_MS = 100

function isScanRunning(): boolean {
	return _isScanActive
}

function createScanHandlers(mainWindow: Electron.BrowserWindow): IpcHandlerModule {
	const pushProgress = throttle((progress: Record<string, unknown>) => {
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send(CHANNELS.SCAN_PROGRESS, progress)
		}
	}, PROGRESS_THROTTLE_MS)

	const handlers = [
		{
			channel: CHANNELS.SCAN_MUSIC_START,
			handler: async (
				_event: Electron.IpcMainInvokeEvent,
				{ libraryId, clearExisting = false }: { libraryId: string; clearExisting?: boolean }
			) => {
				if (_isScanActive) {
					return { success: false, error: "已有扫描任务正在进行中" }
				}
				if (!libraryId) {
					return { success: false, error: "未提供有效的 libraryId" }
				}
				_isScanActive = true
				try {
					const result = await scanMusic(libraryId, clearExisting, (progress) => {
						const now = Date.now()
						const isFinal = ["complete", "error", "canceled"].includes(progress.phase)
						if (isFinal || now - _lastProgressTime >= PROGRESS_THROTTLE_MS) {
							_lastProgressTime = now
							pushProgress(progress)
						}
					})
					return result
				} catch (err) {
					const error = err as Error
					pushProgress({ phase: "error", message: error.message || "扫描失败" })
					return { success: false, error: error.message }
				} finally {
					_isScanActive = false
				}
			},
		},
		{
			channel: CHANNELS.SCAN_MUSIC_CANCEL,
			handler: async () => {
				if (!_isScanActive) {
					pushProgress({ phase: "canceled", message: "扫描已取消" })
					return { success: true, message: "无扫描任务" }
				}
				try {
					const ok = cancelScan()
					return ok
						? { success: true, message: "取消请求已发送" }
						: { success: false, error: "无法取消扫描" }
				} catch (err) {
					const error = err as Error
					return { success: false, error: error.message }
				}
			},
		},
	]

	return { handlers, cleanup: () => {} }
}

export { createScanHandlers, isScanRunning }
