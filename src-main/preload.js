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
		onCompleted: (callback) => createListener("scan-completed", callback),
	},

	// 歌曲数据相关
	songs: {
		getAll: (options) => ipcRenderer.invoke("get-songs", options),
		getById: (songId) => ipcRenderer.invoke("get-song-by-id", songId),
		validateFiles: () => ipcRenderer.invoke("validate-song-files"),
		parseFromFile: (filePath) =>
			ipcRenderer.invoke("parse-song-from-file", filePath),
		incrementPlayCount: (songId) =>
			ipcRenderer.invoke("increment-play-count", songId),
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
		clearCache: () => ipcRenderer.invoke("clear-cover-cache"),
	},

	// 歌词处理
	lyrics: {
		get: (songId) => ipcRenderer.invoke("get-lyrics", songId),
	},

	// 文件系统交互
	file: {
		checkExists: (filePath) =>
			ipcRenderer.invoke("check-file-exists", filePath),
		showInFolder: (filePath) =>
			ipcRenderer.invoke("show-item-in-folder", filePath),
		copyToClipboard: (text) => ipcRenderer.invoke("copy-to-clipboard", text),
	},

	// 播放器控制
	player: {
		// 核心播放控制
		play: (options) => ipcRenderer.invoke("player-play", options),
		stop: () => ipcRenderer.invoke("player-stop"),
		pause: () => ipcRenderer.invoke("player-pause"),
		resume: () => ipcRenderer.invoke("player-resume"),
		seek: (position) => ipcRenderer.invoke("player-seek", { position }),
		setVolume: (volume) => ipcRenderer.invoke("player-set-volume", { volume }),
		setMuted: (muted) => ipcRenderer.invoke("player-set-muted", { muted }),
		getStatus: () => ipcRenderer.invoke("player-get-status"),

		// 事件监听
		onProgress: (callback) => createListener("player-progress", callback),
		onEnded: (callback) => createListener("player-ended", callback),
		onError: (callback) => createListener("player-error", callback),
		onAudioData: (callback) => createListener("player-audio-data", callback),

		// 导航控制
		onRequestNext: (callback) =>
			createListener("player-request-next", callback),
		onRequestPrev: (callback) =>
			createListener("player-request-prev", callback),
		onRequestPlay: (callback) =>
			createListener("player-request-play", callback),
		onRequestPause: (callback) =>
			createListener("player-request-pause", callback),
		onRequestSeek: (callback) =>
			createListener("player-request-seek", callback),
		updateStatus: (status) => ipcRenderer.send("player-status-update", status),
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

	// 窗口控制
	window: {
		minimize: () => ipcRenderer.invoke("window-minimize"),
		maximize: () => ipcRenderer.invoke("window-maximize"),
		restore: () => ipcRenderer.invoke("window-restore"),
		close: () => ipcRenderer.invoke("window-close"),
		isMaximized: () => ipcRenderer.invoke("is-window-maximized"),
		onMaximizedChange: (callback) =>
			createListener("window-maximized-change", callback),
		setCloseBehavior: (behavior) =>
			ipcRenderer.invoke("set-close-behavior", behavior),
		getCloseBehavior: () => ipcRenderer.invoke("get-close-behavior"),
		show: () => ipcRenderer.invoke("show-window"),
	},

	// 音频处理（兼容旧API）
	audio: {
		process: (options) => ipcRenderer.invoke("player-play", options),
		cancelProcessing: () => ipcRenderer.invoke("player-stop"),
		getProcessorStatus: () => ipcRenderer.invoke("player-get-status"),
		onProcessingProgress: (callback) =>
			createListener("player-progress", callback),
		onProcessingComplete: (callback) =>
			createListener("player-ended", callback),
		onProcessingError: (callback) => createListener("player-error", callback),
		onProcessedAudioData: (callback) =>
			createListener("player-audio-data", callback),
	},
};

// 创建扁平化API结构以保持向后兼容性
const compatAPI = {
	// 音乐扫描相关
	scanMusic: API.scan.start,
	cancelScan: API.scan.cancel,
	onScanProgress: API.scan.onProgress,
	onScanCompleted: API.scan.onCompleted,

	// 歌曲数据相关
	getSongs: API.songs.getAll,
	getSongById: API.songs.getById,
	validateSongFiles: API.songs.validateFiles,
	parseSongFromFile: API.songs.parseFromFile,
	incrementPlayCount: API.songs.incrementPlayCount,

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
	clearCoverCache: API.cover.clearCache,

	// 歌词处理
	getLyrics: API.lyrics.get,

	// 文件系统交互
	checkFileExists: API.file.checkExists,
	showItemInFolder: API.file.showInFolder,
	copyToClipboard: API.file.copyToClipboard,

	// 播放器控制
	playerPlay: API.player.play,
	playerStop: API.player.stop,
	playerPause: API.player.pause,
	playerResume: API.player.resume,
	playerSeek: API.player.seek,
	playerSetVolume: API.player.setVolume,
	playerSetMuted: API.player.setMuted,
	playerGetStatus: API.player.getStatus,
	onPlayerProgress: API.player.onProgress,
	onPlayerEnded: API.player.onEnded,
	onPlayerError: API.player.onError,
	onPlayerAudioData: API.player.onAudioData,
	onPlayerRequestNext: API.player.onRequestNext,
	onPlayerRequestPrev: API.player.onRequestPrev,
	onPlayerRequestPlay: API.player.onRequestPlay,
	onPlayerRequestPause: API.player.onRequestPause,
	onPlayerRequestSeek: API.player.onRequestSeek,
	updatePlayerStatus: API.player.updateStatus,

	// 播放列表相关
	getPlaylists: API.playlist.getAll,
	getPlaylistById: API.playlist.getById,
	createPlaylist: API.playlist.create,
	updatePlaylist: API.playlist.update,
	deletePlaylist: API.playlist.delete,
	addSongsToPlaylist: API.playlist.addSongs,
	removeSongsFromPlaylist: API.playlist.removeSongs,

	// 导航相关
	navigateToMain: API.navigation.toMain,
	onNavigateToMain: API.navigation.onNavigateToMain,

	// 窗口控制
	windowMinimize: API.window.minimize,
	windowMaximize: API.window.maximize,
	windowRestore: API.window.restore,
	windowClose: API.window.close,
	isWindowMaximized: API.window.isMaximized,
	onWindowMaximizedChange: API.window.onMaximizedChange,
	setCloseBehavior: API.window.setCloseBehavior,
	getCloseBehavior: API.window.getCloseBehavior,
	showWindow: API.window.show,

	// 音频处理
	processAudio: API.audio.process,
	cancelProcessing: API.audio.cancelProcessing,
	getProcessorStatus: API.audio.getProcessorStatus,
	onProcessingProgress: API.audio.onProcessingProgress,
	onProcessingComplete: API.audio.onProcessingComplete,
	onProcessingError: API.audio.onProcessingError,
	onProcessedAudioData: API.audio.onProcessedAudioData,
};

// 安全地暴露主进程的API给渲染进程
contextBridge.exposeInMainWorld("electronAPI", compatAPI);

// 同时暴露结构化API，未来可以迁移到这个更清晰的API
contextBridge.exposeInMainWorld("musicApp", API);
