// 数据层聚合门面：re-export 数据库连接与各实体仓库函数，保持既有调用契约不变
export { initDb } from "./db"
export {
	parseSongFromFile,
	getSongById,
	getSongsByLibrary,
	addSongs,
	clearSongsByLibrary,
	_clearAllSongs_DANGEROUS,
	validateSongFiles,
	incrementPlayCount,
	updateSong,
	deleteSong,
	rebuildIndices,
} from "./songRepo"
export { getLibraries, getLibraryById, addLibrary, updateLibrary, removeLibrary } from "./libraryRepo"
export {
	getPlaylists,
	getPlaylistById,
	createPlaylist,
	updatePlaylist,
	deletePlaylist,
	addSongsToPlaylist,
	removeSongsFromPlaylist,
} from "./playlistRepo"
export { getSetting, setSetting, getAllSettings } from "./settingsRepo"
export {
	getPlaylistCache,
	savePlaylistCache,
	deletePlaylistCache,
	getUserPlaylistsCache,
	saveUserPlaylistsCache,
	clearUserOnlineCache,
} from "./onlinePlaylistCacheRepo"
