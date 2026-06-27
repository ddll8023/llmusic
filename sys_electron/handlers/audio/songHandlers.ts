import { net } from "electron"
import { CHANNELS } from "../../constants/ipcChannels"
import {
	getSongsByLibrary,
	getSongById,
	parseSongFromFile,
	_clearAllSongs_DANGEROUS,
	incrementPlayCount,
	deleteSong,
	addSongs,
} from "../data/Database"
import { isScanRunning } from "../scan/scanHandlers"
import { coverCache } from "./coverHandlers"
import type { IpcHandlerModule } from "../../types"
import type { Song } from "../../types/song"

function createSongHandlers(): IpcHandlerModule {
	const handlers = [
		{
			channel: CHANNELS.GET_SONGS,
			handler: async (_event: Electron.IpcMainInvokeEvent, params: { libraryId?: string } = {}) => {
				try {
					const songs = await getSongsByLibrary(params.libraryId || "all")
					return { success: true, songs }
				} catch (err) {
					const error = err as Error
					return { success: false, error: error.message }
				}
			},
		},
		{
			channel: CHANNELS.GET_SONG_BY_ID,
			handler: async (_event: Electron.IpcMainInvokeEvent, id: string) => {
				try {
					const song = await getSongById(id)
					return { success: true, song }
				} catch (err) {
					const error = err as Error
					return { success: false, error: error.message }
				}
			},
		},
		{
			channel: CHANNELS.PARSE_SONG_FROM_FILE,
			handler: async (_event: Electron.IpcMainInvokeEvent, filePath: string) => {
				try {
					const song = await parseSongFromFile(filePath)
					return song ? { success: true, song } : { success: false, error: "无法解析文件" }
				} catch (err) {
					const error = err as Error
					return { success: false, error: error.message }
				}
			},
		},
		{
			channel: CHANNELS.CLEAR_ALL_SONGS,
			handler: async () => {
				if (isScanRunning()) return { success: false, error: "扫描进行中，无法清空" }
				try {
					await _clearAllSongs_DANGEROUS()
					coverCache.clear()
					return { success: true }
				} catch (err) {
					const error = err as Error
					return { success: false, error: error.message }
				}
			},
		},
		{
			channel: CHANNELS.INCREMENT_PLAY_COUNT,
			handler: async (_event: Electron.IpcMainInvokeEvent, songId: string) => {
				try {
					if (!songId) {
						return { success: false, error: "歌曲ID不能为空" }
					}
					const updatedSong = await incrementPlayCount(songId)
					return { success: true, song: updatedSong }
				} catch (err) {
					const error = err as Error
					return { success: false, error: error.message }
				}
			},
		},
		{
			channel: CHANNELS.DELETE_SONG,
			handler: async (_event: Electron.IpcMainInvokeEvent, songId: string) => {
				if (isScanRunning()) {
					return { success: false, error: "扫描进行中，无法删除歌曲" }
				}
				try {
					const result = await deleteSong(songId)
					if (result.success) {
						coverCache.delete(songId)
					}
					return result
				} catch (err) {
					const error = err as Error
					return { success: false, error: error.message }
				}
			},
		},
		{
			channel: CHANNELS.IMPORT_MUSIC_FILES,
			handler: async (_event: Electron.IpcMainInvokeEvent, filePaths: string[]) => {
				if (isScanRunning()) {
					return { success: false, error: "扫描进行中，无法导入文件" }
				}

				try {
					if (!Array.isArray(filePaths) || filePaths.length === 0) {
						return { success: false, error: "未提供有效的文件路径" }
					}

					const parsedSongs: Song[] = []
					const failedFiles: string[] = []

					for (const filePath of filePaths) {
						try {
							const song = await parseSongFromFile(filePath)
							if (song) {
								parsedSongs.push(song)
							} else {
								failedFiles.push(filePath)
							}
						} catch {
							failedFiles.push(filePath)
						}
					}

					if (parsedSongs.length > 0) {
						const result = await addSongs(parsedSongs)
						return {
							success: true,
							importedCount: result.addedCount,
							updatedCount: result.updatedCount,
							failedFiles: failedFiles,
							message: `成功导入 ${result.addedCount} 首新歌曲，更新了 ${result.updatedCount} 首歌曲`,
						}
					} else {
						return {
							success: false,
							error: `所有文件导入失败。失败的文件：${failedFiles.join(", ")}`,
						}
					}
				} catch (err) {
					const error = err as Error
					console.error("导入音乐文件失败:", err)
					return { success: false, error: error.message }
				}
			},
		},
		{
			channel: CHANNELS.SEARCH_ONLINE_METADATA,
			handler: async (_event: Electron.IpcMainInvokeEvent, searchParams: Record<string, unknown>) => {
				try {
					console.log("在线搜索请求:", searchParams)

					const keyword = String(searchParams.searchUrl || "")
					const body = JSON.stringify({
						keyword,
						page: searchParams.page || 1,
						pageSize: searchParams.pageSize || 10,
						requestId: searchParams.requestId || Date.now().toString(),
					})

					const response = await net.fetch("http://127.0.0.1:9752/api/v1/song/searchByKeyword", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body,
					})

					if (!response.ok) {
						return { code: 500, data: [], message: `后端请求失败: ${response.status}` }
					}

					const json = await response.json() as { code: number; data?: { result?: unknown[] }; message?: string }

					if (json.code !== 0) {
						return { code: 500, data: [], message: json.message || "搜索失败" }
					}

					return {
						code: 200,
						data: json.data?.result || [],
						message: "success",
					}
				} catch (err) {
					const error = err as Error
					console.error("在线搜索失败:", error.message)
					return {
						code: 500,
						data: [],
						error: error.message,
						message: "在线搜索服务暂时不可用，请确认后端已启动",
					}
				}
			},
		},
	]

	return {
		handlers,
		cleanup: () => {},
	}
}

export { createSongHandlers }
