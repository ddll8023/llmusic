import { registerIPC, unregisterAll } from "../utils/ipc/ipcWrapper"

// 系统相关处理器
import { createWindowHandlers } from "./system/windowHandlers"

// 扫描相关处理器
import { createScanHandlers } from "./scan/scanHandlers"

// 音频相关处理器
import { createSongHandlers } from "./audio/songHandlers"
import { createCoverHandlers } from "./audio/coverHandlers"
import { createLyricsHandlers } from "./audio/lyricsHandlers"
import { createPlayerHandlers } from "./audio/playerHandlers"

// 数据相关处理器
import { createPlaylistHandlers } from "./data/playlistHandlers"
import { createLibraryHandlers } from "./data/libraryHandlers"
import { createTagHandlers } from "./audio/tagHandlers"

// 下载相关处理器
import { createDownloadHandlers } from "./download/downloadHandlers"

import type { IpcHandlerModule } from "../types"

/**
 * setupIpcHandlers(mainWindow)
 * 调用后注册所有 IPC 处理，并返回一个 disposer() 便于在应用退出时卸载
 */
function setupIpcHandlers(mainWindow: Electron.BrowserWindow): () => void {
	const modules: IpcHandlerModule[] = [
		createWindowHandlers(mainWindow),
		createScanHandlers(mainWindow),
		createSongHandlers(),
		createCoverHandlers(),
		createLyricsHandlers(),
		createPlayerHandlers(mainWindow),
		createPlaylistHandlers(),
		createLibraryHandlers(),
		createTagHandlers(),
		createDownloadHandlers(mainWindow),
	]

	modules.forEach((m) => {
		m.handlers.forEach(({ channel, handler, options }) => {
			registerIPC(channel, handler as (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown, options)
		})
	})

	return () => {
		unregisterAll()
		modules.forEach((m) => m.cleanup && m.cleanup())
	}
}

export { setupIpcHandlers }
