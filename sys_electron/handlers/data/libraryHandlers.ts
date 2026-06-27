import path from "path"
import { promises as fs } from "fs"
import { getLibraries, addLibrary, updateLibrary, removeLibrary } from "./Database"
import { CHANNELS } from "../../constants/ipcChannels"
import { isScanRunning } from "../scan/scanHandlers"
import type { IpcHandlerModule } from "../../types"

function createLibraryHandlers(): IpcHandlerModule {
	const handlers = [
		{
			channel: CHANNELS.GET_LIBRARIES,
			handler: async () => {
				try {
					const libraries = await getLibraries()
					return { success: true, libraries }
				} catch (err) {
					const error = err as Error
					return { success: false, error: error.message }
				}
			},
		},
		{
			channel: CHANNELS.ADD_LIBRARY,
			handler: async (_event: Electron.IpcMainInvokeEvent, { name, dirPath }: { name?: string; dirPath: string }) => {
				if (!dirPath) return { success: false, error: "未提供路径" }
				try {
					await fs.access(dirPath)
					const lib = await addLibrary({
						name: name || path.basename(dirPath),
						path: dirPath,
					})
					return { success: true, library: lib }
				} catch (err) {
					const error = err as Error
					return { success: false, error: error.message }
				}
			},
		},
		{
			channel: CHANNELS.REMOVE_LIBRARY,
			handler: async (_event: Electron.IpcMainInvokeEvent, libraryId: string) => {
				if (isScanRunning()) return { success: false, error: "扫描进行中，无法删除" }
				try {
					const ok = await removeLibrary(libraryId)
					return { success: ok }
				} catch (err) {
					const error = err as Error
					return { success: false, error: error.message }
				}
			},
		},
		{
			channel: CHANNELS.UPDATE_LIBRARY,
			handler: async (
				_event: Electron.IpcMainInvokeEvent,
				{ libraryId, updates }: { libraryId: string; updates: Record<string, unknown> }
			) => {
				try {
					const lib = await updateLibrary(libraryId, updates as { name?: string; path?: string })
					return lib
						? { success: true, library: lib }
						: { success: false, error: "未找到音乐库" }
				} catch (err) {
					const error = err as Error
					return { success: false, error: error.message }
				}
			},
		},
	]

	return { handlers, cleanup: () => {} }
}

export { createLibraryHandlers }
