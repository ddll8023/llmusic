import { dialog, net } from "electron"
import fs from "fs"
import path from "path"
import { CHANNELS } from "../../constants/ipcChannels"
import type { IpcHandlerModule } from "../../types"

function createDownloadHandlers(mainWindow: Electron.BrowserWindow): IpcHandlerModule {
	const handlers = [
		{
			channel: CHANNELS.DOWNLOAD_FILE,
			handler: async (
				_event: Electron.IpcMainInvokeEvent,
				options: { url: string; filename: string }
			) => {
				const { url, filename } = options
				const saveResult = await dialog.showSaveDialog(mainWindow, {
					defaultPath: filename,
				})
				if (saveResult.canceled) {
					return { success: true, canceled: true }
				}
				try {
					const response = await net.fetch(url)
					if (!response.ok) {
						return { success: false, error: "下载失败" }
					}
					const buffer = Buffer.from(await response.arrayBuffer())
					fs.writeFileSync(saveResult.filePath!, buffer)
					return { success: true, filePath: saveResult.filePath }
				} catch {
					return { success: false, error: "下载失败" }
				}
			},
		},
		{
			channel: CHANNELS.BATCH_DOWNLOAD,
			handler: async (
				_event: Electron.IpcMainInvokeEvent,
				options: { songs: { url: string; filename: string }[] }
			) => {
				const { songs } = options
				const dirResult = await dialog.showOpenDialog(mainWindow, {
					properties: ["openDirectory"],
					title: "选择保存目录",
				})
				if (dirResult.canceled || !dirResult.filePaths[0]) {
					return { success: true, canceled: true }
				}
				const saveDir = dirResult.filePaths[0]
				const results: { filename: string; success: boolean }[] = []
				for (const song of songs) {
					try {
						const safeFilename = path.basename(song.filename)
			const filePath = path.join(saveDir, safeFilename)
						const response = await net.fetch(song.url)
						if (!response.ok) {
							results.push({ filename: song.filename, success: false })
							continue
						}
						const buffer = Buffer.from(await response.arrayBuffer())
						fs.writeFileSync(filePath, buffer)
						results.push({ filename: song.filename, success: true })
					} catch {
						results.push({ filename: song.filename, success: false })
					}
				}
				return { success: true, results }
			},
		},
	]
	return { handlers, cleanup: () => {} }
}

export { createDownloadHandlers }
