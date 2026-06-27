import {
	getPlaylists,
	getPlaylistById,
	createPlaylist,
	updatePlaylist,
	deletePlaylist,
	addSongsToPlaylist,
	removeSongsFromPlaylist,
} from "./Database"
import { CHANNELS } from "../../constants/ipcChannels"
import type { IpcHandlerModule } from "../../types"

function createPlaylistHandlers(): IpcHandlerModule {
	const handlers = [
		{ channel: CHANNELS.GET_PLAYLISTS, handler: () => getPlaylists() },
		{
			channel: CHANNELS.GET_PLAYLIST_BY_ID,
			handler: (_event: Electron.IpcMainInvokeEvent, id: string) => getPlaylistById(id),
		},
		{
			channel: CHANNELS.CREATE_PLAYLIST,
			handler: (
				_event: Electron.IpcMainInvokeEvent,
				data: { name?: string; description?: string; coverImgId?: string; songs?: string[] }
			) => createPlaylist(data),
		},
		{
			channel: CHANNELS.UPDATE_PLAYLIST,
			handler: (
				_event: Electron.IpcMainInvokeEvent,
				id: string,
				data: { name?: string; description?: string; coverImgId?: string }
			) => updatePlaylist(id, data),
		},
		{
			channel: CHANNELS.DELETE_PLAYLIST,
			handler: (_event: Electron.IpcMainInvokeEvent, id: string) => deletePlaylist(id),
		},
		{
			channel: CHANNELS.ADD_SONGS_TO_PLAYLIST,
			handler: (_event: Electron.IpcMainInvokeEvent, id: string, songIds: string | string[]) =>
				addSongsToPlaylist(id, songIds),
		},
		{
			channel: CHANNELS.REMOVE_SONGS_FROM_PLAYLIST,
			handler: (_event: Electron.IpcMainInvokeEvent, id: string, songIds: string | string[]) =>
				removeSongsFromPlaylist(id, songIds),
		},
	]
	return { handlers, cleanup: () => {} }
}

export { createPlaylistHandlers }
