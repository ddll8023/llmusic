import { promises as fs } from "fs"
import { dialog, webUtils, shell, clipboard } from "electron"
import { CHANNELS } from "../../constants/ipcChannels"
import type { IpcHandlerModule } from "../../types"

function createWindowHandlers(mainWindow: Electron.BrowserWindow): IpcHandlerModule {
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
				if (mainWindow) {
					mainWindow.minimize()
					return true
				}
				return false
			},
		},
		{
			channel: CHANNELS.WINDOW_MAXIMIZE,
			handler: () => {
				if (mainWindow) {
					if (!mainWindow.isMaximized()) {
						mainWindow.maximize()
						mainWindow.webContents.send(CHANNELS.WINDOW_MAXIMIZED_CHANGE, true)
					}
					return true
				}
				return false
			},
		},
		{
			channel: CHANNELS.WINDOW_RESTORE,
			handler: () => {
				if (mainWindow) {
					if (mainWindow.isMaximized()) {
						mainWindow.restore()
						mainWindow.webContents.send(CHANNELS.WINDOW_MAXIMIZED_CHANGE, false)
					}
					return true
				}
				return false
			},
		},
		{
			channel: CHANNELS.WINDOW_CLOSE,
			handler: () => {
				if (mainWindow) {
					mainWindow.close()
					return true
				}
				return false
			},
		},
		{
			channel: CHANNELS.WINDOW_SHOW,
			handler: () => {
				if (mainWindow) {
					if (mainWindow.isMinimized()) {
						mainWindow.restore()
					}
					mainWindow.show()
					mainWindow.focus()
					return true
				}
				return false
			},
		},
		{
			channel: CHANNELS.IS_WINDOW_MAXIMIZED,
			handler: () => {
				if (mainWindow) {
					return mainWindow.isMaximized()
				}
				return false
			},
		},
		{
			channel: CHANNELS.SHOW_ITEM_IN_FOLDER,
			handler: async (_event: Electron.IpcMainInvokeEvent, filePath: string) => {
				try {
					if (!filePath) return { success: false, error: "未提供文件路径" }
					await fs.access(filePath)
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
		{
			channel: CHANNELS.GET_PATH_FOR_FILE,
			handler: async (_event: Electron.IpcMainInvokeEvent, file: File) => {
				try {
					const filePath = webUtils.getPathForFile(file)
					return { success: true, filePath }
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
