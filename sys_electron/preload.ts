import { contextBridge, ipcRenderer } from "electron"

/**
 * 创建事件监听器并返回清理函数
 */
function createListener(channel: string, callback: (...args: unknown[]) => void, once = false): () => void {
	const wrappedCallback = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => callback(...args)

	if (once) {
		ipcRenderer.once(channel, wrappedCallback)
	} else {
		ipcRenderer.on(channel, wrappedCallback)
	}

	return () => {
		ipcRenderer.removeListener(channel, wrappedCallback)
	}
}

// 按功能域分组的API
const API = {
	scan: {
		start: (options: Record<string, unknown>) => ipcRenderer.invoke("scan-music-start", options),
		cancel: () => ipcRenderer.invoke("scan-music-cancel"),
		onProgress: (callback: (...args: unknown[]) => void) => createListener("scan-progress", callback),
	},

	songs: {
		getAll: (options: Record<string, unknown>) => ipcRenderer.invoke("get-songs", options),
		getById: (songId: string) => ipcRenderer.invoke("get-song-by-id", songId),
		parseFromFile: (filePath: string) => ipcRenderer.invoke("parse-song-from-file", filePath),
		incrementPlayCount: (songId: string) => ipcRenderer.invoke("increment-play-count", songId),
		deleteSong: (songId: string) => ipcRenderer.invoke("delete-song", songId),
		import: (filePaths: string[]) => ipcRenderer.invoke("import-music-files", filePaths),
		clearAll: () => ipcRenderer.invoke("clear-all-songs"),
	},

	library: {
		getAll: () => ipcRenderer.invoke("get-libraries"),
		add: (options: Record<string, unknown>) => ipcRenderer.invoke("add-library", options),
		remove: (options: Record<string, unknown>) => ipcRenderer.invoke("remove-library", options),
		update: (options: Record<string, unknown>) => ipcRenderer.invoke("update-library", options),
		selectDirectory: () => ipcRenderer.invoke("select-directory"),
	},

	cover: {
		get: (songId: string) => ipcRenderer.invoke("get-song-cover", songId),
		forceExtract: (songId: string) => ipcRenderer.invoke("force-extract-cover", songId),
		getFromFile: (filePath: string) => ipcRenderer.invoke("get-cover-from-file", filePath),
	},

	lyrics: {
		get: (songId: string) => ipcRenderer.invoke("get-lyrics", songId),
	},

	file: {
		showInFolder: (filePath: string) => ipcRenderer.invoke("show-item-in-folder", filePath),
		copyToClipboard: (text: string) => ipcRenderer.invoke("copy-to-clipboard", text),
		showOpenDialog: (options?: Record<string, unknown>) => ipcRenderer.invoke("show-open-dialog", options),
		getPathForFile: (file: File) => ipcRenderer.invoke("get-path-for-file", file),
	},

	player: {
		play: (options: Record<string, unknown>) => ipcRenderer.invoke("player-play", options),
		stop: () => ipcRenderer.invoke("player-stop"),
		seek: (position: number) => ipcRenderer.invoke("player-seek", { position }),
		getStatus: () => ipcRenderer.invoke("player-get-status"),
		onEnded: (callback: (...args: unknown[]) => void) => createListener("player-ended", callback),
		onError: (callback: (...args: unknown[]) => void) => createListener("player-error", callback),
		onAudioData: (callback: (...args: unknown[]) => void) => createListener("player-audio-data", callback),
	},

	playlist: {
		getAll: () => ipcRenderer.invoke("get-playlists"),
		getById: (playlistId: string) => ipcRenderer.invoke("get-playlist-by-id", playlistId),
		create: (playlistData: Record<string, unknown>) => ipcRenderer.invoke("create-playlist", playlistData),
		update: (playlistId: string, playlistData: Record<string, unknown>) =>
			ipcRenderer.invoke("update-playlist", playlistId, playlistData),
		delete: (playlistId: string) => ipcRenderer.invoke("delete-playlist", playlistId),
		addSongs: (playlistId: string, songIds: string[]) =>
			ipcRenderer.invoke("add-songs-to-playlist", playlistId, songIds),
		removeSongs: (playlistId: string, songIds: string[]) =>
			ipcRenderer.invoke("remove-songs-from-playlist", playlistId, songIds),
	},

	navigation: {
		toMain: () => ipcRenderer.send("navigate-to-main"),
		onNavigateToMain: (callback: (...args: unknown[]) => void) =>
			createListener("navigate-to-main", callback),
	},

	fileOpen: {
		onOpenAudioFile: (callback: (...args: unknown[]) => void) =>
			createListener("open-audio-file", callback),
	},

	window: {
		minimize: () => ipcRenderer.invoke("window-minimize"),
		maximize: () => ipcRenderer.invoke("window-maximize"),
		restore: () => ipcRenderer.invoke("window-restore"),
		close: () => ipcRenderer.invoke("window-close"),
		show: () => ipcRenderer.invoke("window-show"),
		isMaximized: () => ipcRenderer.invoke("is-window-maximized"),
		onMaximizedChange: (callback: (...args: unknown[]) => void) =>
			createListener("window-maximized-change", callback),
		setCloseBehavior: (behavior: string) => ipcRenderer.invoke("set-close-behavior", behavior),
		getCloseBehavior: () => ipcRenderer.invoke("get-close-behavior"),
	},

	tags: {
		getSongTags: (songId: string) => ipcRenderer.invoke("get-song-tags", songId),
		updateSongTags: (songId: string, tags: Record<string, unknown>) =>
			ipcRenderer.invoke("update-song-tags", { songId, tags }),
		validateTagChanges: (tags: Record<string, unknown>) =>
			ipcRenderer.invoke("validate-tag-changes", tags),
		getFromFile: (filePath: string) => ipcRenderer.invoke("get-tags-from-file", filePath),
		updateToFile: (filePath: string, tags: Record<string, unknown>) =>
			ipcRenderer.invoke("update-tags-to-file", { filePath, tags }),
	},

	online: {
		searchMetadata: (searchParams: Record<string, unknown>) =>
			ipcRenderer.invoke("search-online-metadata", searchParams),
	},

	download: {
		saveFile: (options: Record<string, unknown>) => ipcRenderer.invoke("download-file", options),
		batchDownload: (options: Record<string, unknown>) => ipcRenderer.invoke("batch-download", options),
	},
}

// 创建扁平化API结构以保持向后兼容性
const compatAPI: Record<string, unknown> = {
	// 音乐扫描
	scanMusic: API.scan.start,
	cancelScan: API.scan.cancel,
	onScanProgress: API.scan.onProgress,

	// 歌曲数据
	getSongs: API.songs.getAll,
	getSongById: API.songs.getById,
	parseSongFromFile: API.songs.parseFromFile,
	incrementPlayCount: API.songs.incrementPlayCount,
	deleteSong: API.songs.deleteSong,

	// 目录选择
	selectDirectory: API.library.selectDirectory,

	// 音乐库
	getLibraries: API.library.getAll,
	addLibrary: API.library.add,
	removeLibrary: API.library.remove,
	updateLibrary: API.library.update,

	// 封面
	getSongCover: API.cover.get,
	forceExtractCover: API.cover.forceExtract,
	getCoverFromFile: API.cover.getFromFile,

	// 歌词
	getLyrics: API.lyrics.get,

	// 文件系统
	showItemInFolder: API.file.showInFolder,
	copyToClipboard: API.file.copyToClipboard,
	showOpenDialog: API.file.showOpenDialog,
	getPathForFile: API.file.getPathForFile,

	// 播放器
	playerPlay: API.player.play,
	playerStop: API.player.stop,
	playerSeek: API.player.seek,
	playerGetStatus: API.player.getStatus,
	onPlayerEnded: API.player.onEnded,
	onPlayerError: API.player.onError,
	onPlayerAudioData: API.player.onAudioData,

	// 播放列表
	getPlaylists: API.playlist.getAll,
	getPlaylistById: API.playlist.getById,
	createPlaylist: API.playlist.create,
	updatePlaylist: API.playlist.update,
	deletePlaylist: API.playlist.delete,
	addSongsToPlaylist: API.playlist.addSongs,
	removeSongsFromPlaylist: API.playlist.removeSongs,

	// 导航
	onNavigateToMain: API.navigation.onNavigateToMain,

	// 文件打开
	onOpenAudioFile: API.fileOpen.onOpenAudioFile,

	// 窗口控制
	windowMinimize: API.window.minimize,
	windowMaximize: API.window.maximize,
	windowRestore: API.window.restore,
	windowClose: API.window.close,
	showWindow: API.window.show,
	isWindowMaximized: API.window.isMaximized,
	onWindowMaximizedChange: API.window.onMaximizedChange,
	setCloseBehavior: API.window.setCloseBehavior,
	getCloseBehavior: API.window.getCloseBehavior,

	// 标签编辑
	getSongTags: API.tags.getSongTags,
	updateSongTags: API.tags.updateSongTags,
	validateTagChanges: API.tags.validateTagChanges,
	getTagsFromFile: API.tags.getFromFile,
	updateTagsToFile: API.tags.updateToFile,

	// 音乐导入
	importMusicFiles: API.songs.import,

	// 歌曲管理
	clearAllSongs: API.songs.clearAll,

	// 在线搜索
	searchOnlineMetadata: API.online.searchMetadata,

	// 文件下载
	downloadFile: API.download.saveFile,
	batchDownloadFiles: API.download.batchDownload,
}

// 安全地暴露主进程的API给渲染进程
contextBridge.exposeInMainWorld("electronAPI", compatAPI)
