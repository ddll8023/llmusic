const { contextBridge, ipcRenderer } = require("electron");

/**
 * 创建事件监听器并返回清理函数
 * @param {string} channel - IPC通道名称
 * @param {Function} callback - 回调函数
 * @param {boolean} once - 是否只监听一次
 * @return {Function} 清理函数
 */
function createListener(channel, callback, once = false) {
	const wrappedCallback = (event, ...args) => callback(...args);

	if (once) {
		ipcRenderer.once(channel, wrappedCallback);
	} else {
		ipcRenderer.on(channel, wrappedCallback);
	}

	return () => {
		ipcRenderer.removeListener(channel, wrappedCallback);
	};
}

// 按功能域分组的API
const API = {
	// 音乐扫描相关
	scan: {
		start: (options) => ipcRenderer.invoke("scan-music-start", options),
		cancel: () => ipcRenderer.invoke("scan-music-cancel"),
		onProgress: (callback) => createListener("scan-progress", callback),
	},

	// 歌曲数据相关
	songs: {
		getAll: (options) => ipcRenderer.invoke("get-songs", options),
		getById: (songId) => ipcRenderer.invoke("get-song-by-id", songId),

		parseFromFile: (filePath) =>
			ipcRenderer.invoke("parse-song-from-file", filePath),
		incrementPlayCount: (songId) =>
			ipcRenderer.invoke("increment-play-count", songId),
		deleteSong: (songId) => ipcRenderer.invoke("delete-song", songId),
		import: (filePaths) => ipcRenderer.invoke("import-music-files", filePaths),
		clearAll: () => ipcRenderer.invoke("clear-all-songs"),
	},

	// 音乐库相关
	library: {
		getAll: () => ipcRenderer.invoke("get-libraries"),
		add: (options) => ipcRenderer.invoke("add-library", options),
		remove: (options) => ipcRenderer.invoke("remove-library", options),
		update: (options) => ipcRenderer.invoke("update-library", options),
		selectDirectory: () => ipcRenderer.invoke("select-directory"),
	},

	// 封面处理
	cover: {
		get: (songId) => ipcRenderer.invoke("get-song-cover", songId),
		forceExtract: (songId) => ipcRenderer.invoke("force-extract-cover", songId),
	},

	// 歌词处理
	lyrics: {
		get: (songId) => ipcRenderer.invoke("get-lyrics", songId),
	},

	// 文件系统交互
	file: {
		showInFolder: (filePath) =>
			ipcRenderer.invoke("show-item-in-folder", filePath),
		copyToClipboard: (text) => ipcRenderer.invoke("copy-to-clipboard", text),
		showOpenDialog: (options) =>
			ipcRenderer.invoke("show-open-dialog", options),
		getPathForFile: (file) => ipcRenderer.invoke("get-path-for-file", file),
	},

	// 播放器控制
	player: {
		// 核心播放控制
		play: (options) => ipcRenderer.invoke("player-play", options),
		stop: () => ipcRenderer.invoke("player-stop"),
		seek: (position) => ipcRenderer.invoke("player-seek", { position }),
		getStatus: () => ipcRenderer.invoke("player-get-status"),

		// 事件监听
		onEnded: (callback) => createListener("player-ended", callback),
		onError: (callback) => createListener("player-error", callback),
		onAudioData: (callback) => createListener("player-audio-data", callback),
	},

	// 播放列表相关
	playlist: {
		getAll: () => ipcRenderer.invoke("get-playlists"),
		getById: (playlistId) =>
			ipcRenderer.invoke("get-playlist-by-id", playlistId),
		create: (playlistData) =>
			ipcRenderer.invoke("create-playlist", playlistData),
		update: (playlistId, playlistData) =>
			ipcRenderer.invoke("update-playlist", playlistId, playlistData),
		delete: (playlistId) => ipcRenderer.invoke("delete-playlist", playlistId),
		addSongs: (playlistId, songIds) =>
			ipcRenderer.invoke("add-songs-to-playlist", playlistId, songIds),
		removeSongs: (playlistId, songIds) =>
			ipcRenderer.invoke("remove-songs-from-playlist", playlistId, songIds),
	},

	// 导航相关
	navigation: {
		toMain: () => ipcRenderer.send("navigate-to-main"),
		onNavigateToMain: (callback) =>
			createListener("navigate-to-main", callback),
	},

	// 文件打开相关
	fileOpen: {
		onOpenAudioFile: (callback) => createListener("open-audio-file", callback),
	},

	// 窗口控制
	window: {
		minimize: () => ipcRenderer.invoke("window-minimize"),
		maximize: () => ipcRenderer.invoke("window-maximize"),
		restore: () => ipcRenderer.invoke("window-restore"),
		close: () => ipcRenderer.invoke("window-close"),
		show: () => ipcRenderer.invoke("window-show"),
		isMaximized: () => ipcRenderer.invoke("is-window-maximized"),
		onMaximizedChange: (callback) =>
			createListener("window-maximized-change", callback),
		setCloseBehavior: (behavior) =>
			ipcRenderer.invoke("set-close-behavior", behavior),
		getCloseBehavior: () => ipcRenderer.invoke("get-close-behavior"),
	},

	// 标签编辑相关
	tags: {
		getSongTags: (songId) => ipcRenderer.invoke("get-song-tags", songId),
		updateSongTags: (songId, tags) =>
			ipcRenderer.invoke("update-song-tags", { songId, tags }),
		validateTagChanges: (tags) =>
			ipcRenderer.invoke("validate-tag-changes", tags),
	},

	// 在线搜索相关
	online: {
		searchMetadata: (searchParams) =>
			ipcRenderer.invoke("search-online-metadata", searchParams),
	},
};

// 创建扁平化API结构以保持向后兼容性
const compatAPI = {
	// 音乐扫描相关
	scanMusic: API.scan.start,
	cancelScan: API.scan.cancel,
	onScanProgress: API.scan.onProgress,

	// 歌曲数据相关
	getSongs: API.songs.getAll,
	getSongById: API.songs.getById,

	parseSongFromFile: API.songs.parseFromFile,
	incrementPlayCount: API.songs.incrementPlayCount,
	deleteSong: API.songs.deleteSong,

	// 目录选择
	selectDirectory: API.library.selectDirectory,

	// 音乐库相关
	getLibraries: API.library.getAll,
	addLibrary: API.library.add,
	removeLibrary: API.library.remove,
	updateLibrary: API.library.update,

	// 封面处理
	getSongCover: API.cover.get,
	forceExtractCover: API.cover.forceExtract,

	// 歌词处理
	getLyrics: API.lyrics.get,

	// 文件系统交互
	showItemInFolder: API.file.showInFolder,
	copyToClipboard: API.file.copyToClipboard,
	showOpenDialog: API.file.showOpenDialog,
	getPathForFile: API.file.getPathForFile,

	// 播放器控制
	playerPlay: API.player.play,
	playerStop: API.player.stop,
	playerSeek: API.player.seek,
	playerGetStatus: API.player.getStatus,
	onPlayerEnded: API.player.onEnded,
	onPlayerError: API.player.onError,
	onPlayerAudioData: API.player.onAudioData,

	// 播放列表相关
	getPlaylists: API.playlist.getAll,
	getPlaylistById: API.playlist.getById,
	createPlaylist: API.playlist.create,
	updatePlaylist: API.playlist.update,
	deletePlaylist: API.playlist.delete,
	addSongsToPlaylist: API.playlist.addSongs,
	removeSongsFromPlaylist: API.playlist.removeSongs,

	// 导航相关
	onNavigateToMain: API.navigation.onNavigateToMain,

	// 文件打开相关
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

	// 音乐导入
	importMusicFiles: API.songs.import,

	// 歌曲管理
	clearAllSongs: API.songs.clearAll,

	// 在线搜索
	searchOnlineMetadata: API.online.searchMetadata,
};

// 安全地暴露主进程的API给渲染进程
contextBridge.exposeInMainWorld("electronAPI", compatAPI);
