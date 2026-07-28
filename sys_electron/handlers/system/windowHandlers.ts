import { promises as fs } from "fs"
import path from "path"
import { dialog, shell, clipboard } from "electron"
import { CHANNELS } from "../../constants/ipcChannels"
import type { IpcHandlerModule } from "../../types"

/** 窗口关闭行为的读写访问器（状态由 main.ts 的 appState 持有） */
export interface CloseBehaviorAccessor {
	get: () => string
	set: (behavior: string) => boolean
}

function createWindowHandlers(
	mainWindow: Electron.BrowserWindow,
	closeBehavior: CloseBehaviorAccessor
): IpcHandlerModule {
	const handlers = [
		{
			channel: CHANNELS.SELECT_DIRECTORY,
			handler: async () => {
				try {
					const { canceled, filePaths } = await dialog.showOpenDialog({
						properties: ["openDirectory"],
					})
					if (canceled || filePaths.length === 0) {
						return { success: true, canceled: true, path: null }
					}
					return { success: true, canceled: false, path: filePaths[0] }
				} catch (err) {
					const error = err as Error
					return { success: false, error: error.message }
				}
			},
		},
		{
			channel: CHANNELS.WINDOW_MINIMIZE,
			handler: () => {
				if (!mainWindow) return { success: false, error: "窗口不存在" }
				mainWindow.minimize()
				return { success: true }
			},
		},
		{
			channel: CHANNELS.WINDOW_MAXIMIZE,
			handler: () => {
				if (!mainWindow) return { success: false, error: "窗口不存在" }
				if (!mainWindow.isMaximized()) {
					mainWindow.maximize()
					mainWindow.webContents.send(CHANNELS.WINDOW_MAXIMIZED_CHANGE, true)
				}
				return { success: true }
			},
		},
		{
			channel: CHANNELS.WINDOW_RESTORE,
			handler: () => {
				if (!mainWindow) return { success: false, error: "窗口不存在" }
				if (mainWindow.isMaximized()) {
					mainWindow.restore()
					mainWindow.webContents.send(CHANNELS.WINDOW_MAXIMIZED_CHANGE, false)
				}
				return { success: true }
			},
		},
		{
			channel: CHANNELS.WINDOW_CLOSE,
			handler: () => {
				if (!mainWindow) return { success: false, error: "窗口不存在" }
				mainWindow.close()
				return { success: true }
			},
		},
		{
			channel: CHANNELS.WINDOW_SHOW,
			handler: () => {
				if (!mainWindow) return { success: false, error: "窗口不存在" }
				if (mainWindow.isMinimized()) {
					mainWindow.restore()
				}
				mainWindow.show()
				mainWindow.focus()
				return { success: true }
			},
		},
		{
			channel: CHANNELS.IS_WINDOW_MAXIMIZED,
			handler: () => {
				if (!mainWindow) return { success: false, error: "窗口不存在" }
				return { success: true, maximized: mainWindow.isMaximized() }
			},
		},
		{
			channel: CHANNELS.SET_CLOSE_BEHAVIOR,
			handler: (_event: Electron.IpcMainInvokeEvent, behavior: string) => {
				if (!closeBehavior.set(behavior)) {
					return { success: false, error: `无效的关闭行为: ${behavior}` }
				}
				return { success: true, behavior }
			},
		},
		{
			channel: CHANNELS.GET_CLOSE_BEHAVIOR,
			handler: () => {
				return { success: true, behavior: closeBehavior.get() }
			},
		},
		{
			channel: CHANNELS.SHOW_ITEM_IN_FOLDER,
			handler: async (_event: Electron.IpcMainInvokeEvent, filePath: string) => {
				// 要求绝对路径且文件存在
				if (!filePath || typeof filePath !== "string" || !path.isAbsolute(filePath)) {
					return { success: false, error: "非法路径" }
				}
				try {
					await fs.access(filePath)
				} catch {
					return { success: false, error: "非法路径" }
				}
				try {
					await shell.showItemInFolder(filePath)
					return { success: true }
				} catch (err) {
					const error = err as Error
					return { success: false, error: error.message }
				}
			},
		},
		{
			channel: CHANNELS.COPY_TO_CLIPBOARD,
			handler: (_event: Electron.IpcMainInvokeEvent, text: string) => {
				if (!text) return { success: false, error: "未提供文本" }
				clipboard.writeText(text)
				return { success: true }
			},
		},
		{
			channel: CHANNELS.SHOW_OPEN_DIALOG,
			handler: async (_event: Electron.IpcMainInvokeEvent, options: Electron.OpenDialogOptions) => {
				try {
					const result = await dialog.showOpenDialog(mainWindow, options)
					return {
						success: true,
						canceled: result.canceled,
						filePaths: result.filePaths,
					}
				} catch (err) {
					const error = err as Error
					return { success: false, error: error.message }
				}
			},
		},
	]

	// native window events -> forward to renderer
	const onMaximize = (): void => {
		mainWindow.webContents.send(CHANNELS.WINDOW_MAXIMIZED_CHANGE, true)
	}
	const onUnmaximize = (): void => {
		mainWindow.webContents.send(CHANNELS.WINDOW_MAXIMIZED_CHANGE, false)
	}

	if (mainWindow) {
		mainWindow.on("maximize", onMaximize)
		mainWindow.on("unmaximize", onUnmaximize)
	}

	const cleanup = (): void => {
		if (mainWindow) {
			mainWindow.removeListener("maximize", onMaximize)
			mainWindow.removeListener("unmaximize", onUnmaximize)
		}
	}

	return { handlers, cleanup }
}

export { createWindowHandlers }
