// 在线歌单缓存 IPC 处理器：读写主进程 SQLite 中的 QQ 歌单持久化缓存
import { CHANNELS } from "../../constants/ipcChannels"
import {
	getPlaylistCache,
	savePlaylistCache,
	deletePlaylistCache,
	getUserPlaylistsCache,
	saveUserPlaylistsCache,
	clearUserOnlineCache,
} from "./onlinePlaylistCacheRepo"
import type { IpcHandlerModule } from "../../types"

function createOnlinePlaylistCacheHandlers(): IpcHandlerModule {
	const handlers = [
		{
			channel: CHANNELS.GET_QQ_PLAYLIST_CACHE,
			handler: async (
				_event: Electron.IpcMainInvokeEvent,
				params: { userKey: string; playlistId: number }
			) => {
				if (!params?.userKey || typeof params.playlistId !== "number") {
					return { success: false, error: "参数不完整" }
				}
				const result = getPlaylistCache(params.userKey, params.playlistId)
				if (!result.success) return result
				return { success: true, payload: result.payload }
			},
		},
		{
			channel: CHANNELS.SAVE_QQ_PLAYLIST_CACHE,
			handler: async (
				_event: Electron.IpcMainInvokeEvent,
				params: { userKey: string; playlistId: number; total: number; songs: unknown[] }
			) => {
				if (!params?.userKey || typeof params.playlistId !== "number" || !Array.isArray(params.songs)) {
					return { success: false, error: "参数不完整" }
				}
				return savePlaylistCache(params.userKey, params.playlistId, params.total || 0, params.songs)
			},
		},
		{
			channel: CHANNELS.DELETE_QQ_PLAYLIST_CACHE,
			handler: async (
				_event: Electron.IpcMainInvokeEvent,
				params: { userKey: string; playlistId?: number }
			) => {
				if (!params?.userKey) {
					return { success: false, error: "参数不完整" }
				}
				return deletePlaylistCache(params.userKey, params.playlistId)
			},
		},
		{
			channel: CHANNELS.GET_QQ_USER_PLAYLISTS_CACHE,
			handler: async (
				_event: Electron.IpcMainInvokeEvent,
				params: { userKey: string }
			) => {
				if (!params?.userKey) {
					return { success: false, error: "参数不完整" }
				}
				const result = getUserPlaylistsCache(params.userKey)
				if (!result.success) return result
				return { success: true, payload: result.payload }
			},
		},
		{
			channel: CHANNELS.SAVE_QQ_USER_PLAYLISTS_CACHE,
			handler: async (
				_event: Electron.IpcMainInvokeEvent,
				params: { userKey: string; playlists: unknown[]; total?: number }
			) => {
				if (!params?.userKey || !Array.isArray(params.playlists)) {
					return { success: false, error: "参数不完整" }
				}
				return saveUserPlaylistsCache(params.userKey, params.playlists, params.total || params.playlists.length)
			},
		},
		{
			channel: CHANNELS.CLEAR_QQ_ONLINE_CACHE,
			handler: async (
				_event: Electron.IpcMainInvokeEvent,
				params: { userKey: string }
			) => {
				if (!params?.userKey) {
					return { success: false, error: "参数不完整" }
				}
				return clearUserOnlineCache(params.userKey)
			},
		},
	]

	return {
		handlers,
		cleanup: () => {},
	}
}

export { createOnlinePlaylistCacheHandlers }
