import { registerIPC, unregisterAll } from "../utils/ipc/ipcWrapper"

// 系统相关处理器
import { createWindowHandlers, type CloseBehaviorAccessor } from "./system/windowHandlers"
import { createDesktopLyricHandlers } from "./system/desktopLyricHandlers"
import { createUpdateHandlers } from "./system/updateHandlers"

// 扫描相关处理器
import { createScanHandlers } from "./scan/scanHandlers"

// 音频相关处理器
import { createSongHandlers } from "./audio/songHandlers"
import { createCoverHandlers } from "./audio/coverHandlers"
import { createLyricsHandlers } from "./audio/lyricsHandlers"

// 数据相关处理器
import { createPlaylistHandlers } from "./data/playlistHandlers"
import { createLibraryHandlers } from "./data/libraryHandlers"
import { createTagHandlers } from "./audio/tagHandlers"
import { createOnlinePlaylistCacheHandlers } from "./data/onlinePlaylistCacheHandlers"

// 下载相关处理器
import { createDownloadHandlers } from "./download/downloadHandlers"

import type { IpcHandlerModule } from "../types"

/**
 * setupIpcHandlers(mainWindow, closeBehavior)
 * 调用后注册所有 IPC 处理，并返回一个 disposer() 便于在应用退出时卸载
 */
function setupIpcHandlers(
	mainWindow: Electron.BrowserWindow,
	closeBehavior: CloseBehaviorAccessor
): () => void {
	const modules: IpcHandlerModule[] = [
		createWindowHandlers(mainWindow, closeBehavior),
		createScanHandlers(mainWindow),
		createSongHandlers(),
		createCoverHandlers(),
		createLyricsHandlers(),
		createPlaylistHandlers(),
		createLibraryHandlers(),
		createTagHandlers(),
		createOnlinePlaylistCacheHandlers(),
		createDownloadHandlers(mainWindow),
		createDesktopLyricHandlers(),
		createUpdateHandlers(),
	]

	modules.forEach((m) => {
		m.handlers.forEach(({ channel, handler }) => {
			registerIPC(channel, handler)
		})
	})

	return () => {
		unregisterAll()
		modules.forEach((m) => m.cleanup && m.cleanup())
	}
}

export { setupIpcHandlers }
