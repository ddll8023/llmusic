import { contextBridge, ipcRenderer, webUtils } from "electron"

/**
 * IPC 通道常量（preload 内联版本 — Electron sandbox 不支持 require 本地模块）
 */
const CHANNELS = {
	// --- 窗口 & UI ---
	WINDOW_MINIMIZE: "window-minimize",
	WINDOW_MAXIMIZE: "window-maximize",
	WINDOW_RESTORE: "window-restore",
	WINDOW_CLOSE: "window-close",
	WINDOW_SHOW: "window-show",
	IS_WINDOW_MAXIMIZED: "is-window-maximized",
	WINDOW_MAXIMIZED_CHANGE: "window-maximized-change",
	// --- 扫描 ---
	SCAN_MUSIC_START: "scan-music-start",
	SCAN_MUSIC_CANCEL: "scan-music-cancel",
	SCAN_PROGRESS: "scan-progress",
	// --- 歌曲 ---
	GET_SONGS: "get-songs",
	GET_SONG_BY_ID: "get-song-by-id",
	PARSE_SONG_FROM_FILE: "parse-song-from-file",
	INCREMENT_PLAY_COUNT: "increment-play-count",
	DELETE_SONG: "delete-song",
	CLEAR_ALL_SONGS: "clear-all-songs",
	DOWNLOAD_SONG_WITH_METADATA: "download-song-with-metadata",
	DOWNLOAD_SONG_TO_DIR: "download-song-to-dir",
	// --- 封面 & 歌词 ---
	GET_SONG_COVER: "get-song-cover",
	FORCE_EXTRACT_COVER: "force-extract-cover",
	GET_COVER_FROM_FILE: "get-cover-from-file",
	GET_LYRICS: "get-lyrics",
	// --- 标签 ---
	GET_SONG_TAGS: "get-song-tags",
	UPDATE_SONG_TAGS: "update-song-tags",
	VALIDATE_TAG_CHANGES: "validate-tag-changes",
	GET_TAGS_FROM_FILE: "get-tags-from-file",
	UPDATE_TAGS_TO_FILE: "update-tags-to-file",
	// --- 文件 & 剪贴板 ---
	SHOW_ITEM_IN_FOLDER: "show-item-in-folder",
	COPY_TO_CLIPBOARD: "copy-to-clipboard",
	SHOW_OPEN_DIALOG: "show-open-dialog",
	SELECT_DIRECTORY: "select-directory",
	// --- 音乐库 ---
	GET_LIBRARIES: "get-libraries",
	ADD_LIBRARY: "add-library",
	REMOVE_LIBRARY: "remove-library",
	UPDATE_LIBRARY: "update-library",
	// --- 播放列表 ---
	GET_PLAYLISTS: "get-playlists",
	GET_PLAYLIST_BY_ID: "get-playlist-by-id",
	CREATE_PLAYLIST: "create-playlist",
	UPDATE_PLAYLIST: "update-playlist",
	DELETE_PLAYLIST: "delete-playlist",
	ADD_SONGS_TO_PLAYLIST: "add-songs-to-playlist",
	REMOVE_SONGS_FROM_PLAYLIST: "remove-songs-from-playlist",
	// --- 音乐导入 ---
	IMPORT_MUSIC_FILES: "import-music-files",
	// --- 在线搜索 ---
	SEARCH_ONLINE_METADATA: "search-online-metadata",
	// --- 在线歌单缓存 ---
	GET_QQ_PLAYLIST_CACHE: "get-qq-playlist-cache",
	SAVE_QQ_PLAYLIST_CACHE: "save-qq-playlist-cache",
	DELETE_QQ_PLAYLIST_CACHE: "delete-qq-playlist-cache",
	GET_QQ_USER_PLAYLISTS_CACHE: "get-qq-user-playlists-cache",
	SAVE_QQ_USER_PLAYLISTS_CACHE: "save-qq-user-playlists-cache",
	CLEAR_QQ_ONLINE_CACHE: "clear-qq-online-cache",
	// --- 窗口行为 ---
	SET_CLOSE_BEHAVIOR: "set-close-behavior",
	GET_CLOSE_BEHAVIOR: "get-close-behavior",
	// --- 外部文件打开 ---
	OPEN_AUDIO_FILE: "open-audio-file",
	// --- 桌面歌词 ---
	DESKTOP_LYRIC_SET_ENABLED: "desktop-lyric-set-enabled",
	DESKTOP_LYRIC_GET_STATE: "desktop-lyric-get-state",
	DESKTOP_LYRIC_UPDATE_CONFIG: "desktop-lyric-update-config",
	DESKTOP_LYRIC_CONFIG_CHANGED: "desktop-lyric-config-changed",
	DESKTOP_LYRIC_REQUEST_SNAPSHOT: "desktop-lyric-request-snapshot",
	DESKTOP_LYRIC_NOW_PLAYING_CHANGED: "desktop-lyric-now-playing-changed",
	DESKTOP_LYRIC_POSITION_SYNC: "desktop-lyric-position-sync",
	DESKTOP_LYRIC_CURSOR_INSIDE: "desktop-lyric-cursor-inside",
	DESKTOP_LYRIC_MOVE: "desktop-lyric-move",
	DESKTOP_LYRIC_SAVE_STATE: "desktop-lyric-save-state",
	DESKTOP_LYRIC_CLOSE: "desktop-lyric-close",
	DESKTOP_LYRIC_SET_UNLOCK_BUTTON_BOUNDS: "desktop-lyric-set-unlock-button-bounds",
	// --- 播放状态同步 ---
	NOW_PLAYING_UPDATE: "now-playing-update",
	NOW_PLAYING_POSITION: "now-playing-position",
	// --- 应用更新 ---
	UPDATE_GET_STATUS: "update-get-status",
	UPDATE_CHECK: "update-check",
	UPDATE_DOWNLOAD: "update-download",
	UPDATE_INSTALL: "update-install",
	UPDATE_STATUS_CHANGED: "update-status-changed",
} as const

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

// 暴露给渲染进程的扁平化 API（与 sys_vue/src/types/electron.d.ts 的 ElectronAPI 声明一一对应）
const compatAPI: Record<string, unknown> = {
	// 扫描
	scanMusic: (options: Record<string, unknown>) => ipcRenderer.invoke(CHANNELS.SCAN_MUSIC_START, options),
	cancelScan: () => ipcRenderer.invoke(CHANNELS.SCAN_MUSIC_CANCEL),
	onScanProgress: (callback: (...args: unknown[]) => void) => createListener(CHANNELS.SCAN_PROGRESS, callback),

	// 歌曲数据
	getSongs: (options: Record<string, unknown>) => ipcRenderer.invoke(CHANNELS.GET_SONGS, options),
	getSongById: (songId: string) => ipcRenderer.invoke(CHANNELS.GET_SONG_BY_ID, songId),
	parseSongFromFile: (filePath: string) => ipcRenderer.invoke(CHANNELS.PARSE_SONG_FROM_FILE, filePath),
	incrementPlayCount: (songId: string) => ipcRenderer.invoke(CHANNELS.INCREMENT_PLAY_COUNT, songId),
	deleteSong: (songId: string) => ipcRenderer.invoke(CHANNELS.DELETE_SONG, songId),

	// 目录选择
	selectDirectory: () => ipcRenderer.invoke(CHANNELS.SELECT_DIRECTORY),

	// 音乐库
	getLibraries: () => ipcRenderer.invoke(CHANNELS.GET_LIBRARIES),
	addLibrary: (options: Record<string, unknown>) => ipcRenderer.invoke(CHANNELS.ADD_LIBRARY, options),
	removeLibrary: (options: Record<string, unknown>) => ipcRenderer.invoke(CHANNELS.REMOVE_LIBRARY, options),
	updateLibrary: (options: Record<string, unknown>) => ipcRenderer.invoke(CHANNELS.UPDATE_LIBRARY, options),

	// 封面
	getSongCover: (songId: string) => ipcRenderer.invoke(CHANNELS.GET_SONG_COVER, songId),
	forceExtractCover: (songId: string) => ipcRenderer.invoke(CHANNELS.FORCE_EXTRACT_COVER, songId),
	getCoverFromFile: (filePath: string) => ipcRenderer.invoke(CHANNELS.GET_COVER_FROM_FILE, filePath),

	// 歌词
	getLyrics: (songId: string) => ipcRenderer.invoke(CHANNELS.GET_LYRICS, songId),

	// 文件系统
	showItemInFolder: (filePath: string) => ipcRenderer.invoke(CHANNELS.SHOW_ITEM_IN_FOLDER, filePath),
	copyToClipboard: (text: string) => ipcRenderer.invoke(CHANNELS.COPY_TO_CLIPBOARD, text),
	showOpenDialog: (options?: Record<string, unknown>) => ipcRenderer.invoke(CHANNELS.SHOW_OPEN_DIALOG, options),
	// webUtils.getPathForFile 必须在 preload（渲染上下文）调用，File 对象无法经 IPC 传递
	getPathForFile: (file: File) => {
		try {
			return Promise.resolve({ success: true, filePath: webUtils.getPathForFile(file) })
		} catch (err) {
			return Promise.resolve({ success: false, error: (err as Error).message })
		}
	},

	// 播放列表
	getPlaylists: () => ipcRenderer.invoke(CHANNELS.GET_PLAYLISTS),
	getPlaylistById: (playlistId: string) => ipcRenderer.invoke(CHANNELS.GET_PLAYLIST_BY_ID, playlistId),
	createPlaylist: (playlistData: Record<string, unknown>) => ipcRenderer.invoke(CHANNELS.CREATE_PLAYLIST, playlistData),
	updatePlaylist: (playlistId: string, playlistData: Record<string, unknown>) =>
		ipcRenderer.invoke(CHANNELS.UPDATE_PLAYLIST, playlistId, playlistData),
	deletePlaylist: (playlistId: string) => ipcRenderer.invoke(CHANNELS.DELETE_PLAYLIST, playlistId),
	addSongsToPlaylist: (playlistId: string, songIds: string[]) =>
		ipcRenderer.invoke(CHANNELS.ADD_SONGS_TO_PLAYLIST, playlistId, songIds),
	removeSongsFromPlaylist: (playlistId: string, songIds: string[]) =>
		ipcRenderer.invoke(CHANNELS.REMOVE_SONGS_FROM_PLAYLIST, playlistId, songIds),

	// 文件打开（主进程 → 渲染进程）
	onOpenAudioFile: (callback: (...args: unknown[]) => void) =>
		createListener(CHANNELS.OPEN_AUDIO_FILE, callback),

	// 窗口控制
	windowMinimize: () => ipcRenderer.invoke(CHANNELS.WINDOW_MINIMIZE),
	windowMaximize: () => ipcRenderer.invoke(CHANNELS.WINDOW_MAXIMIZE),
	windowRestore: () => ipcRenderer.invoke(CHANNELS.WINDOW_RESTORE),
	windowClose: () => ipcRenderer.invoke(CHANNELS.WINDOW_CLOSE),
	showWindow: () => ipcRenderer.invoke(CHANNELS.WINDOW_SHOW),
	isWindowMaximized: () => ipcRenderer.invoke(CHANNELS.IS_WINDOW_MAXIMIZED),
	onWindowMaximizedChange: (callback: (...args: unknown[]) => void) =>
		createListener(CHANNELS.WINDOW_MAXIMIZED_CHANGE, callback),
	setCloseBehavior: (behavior: string) => ipcRenderer.invoke(CHANNELS.SET_CLOSE_BEHAVIOR, behavior),
	getCloseBehavior: () => ipcRenderer.invoke(CHANNELS.GET_CLOSE_BEHAVIOR),

	// 标签编辑
	getSongTags: (songId: string) => ipcRenderer.invoke(CHANNELS.GET_SONG_TAGS, songId),
	updateSongTags: (songId: string, tags: Record<string, unknown>) =>
		ipcRenderer.invoke(CHANNELS.UPDATE_SONG_TAGS, { songId, tags }),
	validateTagChanges: (tags: Record<string, unknown>) =>
		ipcRenderer.invoke(CHANNELS.VALIDATE_TAG_CHANGES, tags),
	getTagsFromFile: (filePath: string) => ipcRenderer.invoke(CHANNELS.GET_TAGS_FROM_FILE, filePath),
	updateTagsToFile: (filePath: string, tags: Record<string, unknown>) =>
		ipcRenderer.invoke(CHANNELS.UPDATE_TAGS_TO_FILE, { filePath, tags }),

	// 音乐导入
	importMusicFiles: (filePaths: string[]) => ipcRenderer.invoke(CHANNELS.IMPORT_MUSIC_FILES, filePaths),

	// 歌曲管理
	clearAllSongs: () => ipcRenderer.invoke(CHANNELS.CLEAR_ALL_SONGS),

	// 在线搜索
	searchOnlineMetadata: (searchParams: Record<string, unknown>) =>
		ipcRenderer.invoke(CHANNELS.SEARCH_ONLINE_METADATA, searchParams),

	// 在线歌单缓存
	getQQPlaylistCache: (params: { userKey: string; playlistId: number }) =>
		ipcRenderer.invoke(CHANNELS.GET_QQ_PLAYLIST_CACHE, params),
	saveQQPlaylistCache: (params: { userKey: string; playlistId: number; total: number; songs: unknown[] }) =>
		ipcRenderer.invoke(CHANNELS.SAVE_QQ_PLAYLIST_CACHE, params),
	deleteQQPlaylistCache: (params: { userKey: string; playlistId?: number }) =>
		ipcRenderer.invoke(CHANNELS.DELETE_QQ_PLAYLIST_CACHE, params),
	getQQUserPlaylistsCache: (params: { userKey: string }) =>
		ipcRenderer.invoke(CHANNELS.GET_QQ_USER_PLAYLISTS_CACHE, params),
	saveQQUserPlaylistsCache: (params: { userKey: string; playlists: unknown[]; total?: number }) =>
		ipcRenderer.invoke(CHANNELS.SAVE_QQ_USER_PLAYLISTS_CACHE, params),
	clearQQOnlineCache: (params: { userKey: string }) =>
		ipcRenderer.invoke(CHANNELS.CLEAR_QQ_ONLINE_CACHE, params),

	// 文件下载（带元数据嵌入）
	downloadSongWithMetadata: (options: Record<string, unknown>) =>
		ipcRenderer.invoke(CHANNELS.DOWNLOAD_SONG_WITH_METADATA, options),

	// 批量下载（选择目录, 不弹保存对话框）
	downloadSongToDir: (options: Record<string, unknown>) =>
		ipcRenderer.invoke(CHANNELS.DOWNLOAD_SONG_TO_DIR, options),

	// 桌面歌词
	setDesktopLyricEnabled: (enabled: boolean) => ipcRenderer.invoke(CHANNELS.DESKTOP_LYRIC_SET_ENABLED, enabled),
	getDesktopLyricState: () => ipcRenderer.invoke(CHANNELS.DESKTOP_LYRIC_GET_STATE),
	updateDesktopLyricConfig: (config: Record<string, unknown>) =>
		ipcRenderer.invoke(CHANNELS.DESKTOP_LYRIC_UPDATE_CONFIG, config),
	onDesktopLyricConfigChange: (callback: (...args: unknown[]) => void) =>
		createListener(CHANNELS.DESKTOP_LYRIC_CONFIG_CHANGED, callback),
	requestDesktopLyricSnapshot: () => ipcRenderer.invoke(CHANNELS.DESKTOP_LYRIC_REQUEST_SNAPSHOT),
	onDesktopLyricNowPlaying: (callback: (...args: unknown[]) => void) =>
		createListener(CHANNELS.DESKTOP_LYRIC_NOW_PLAYING_CHANGED, callback),
	onDesktopLyricPositionSync: (callback: (...args: unknown[]) => void) =>
		createListener(CHANNELS.DESKTOP_LYRIC_POSITION_SYNC, callback),
	onDesktopLyricCursorInside: (callback: (...args: unknown[]) => void) =>
		createListener(CHANNELS.DESKTOP_LYRIC_CURSOR_INSIDE, callback),
	desktopLyricMove: (x: number, y: number) => ipcRenderer.invoke(CHANNELS.DESKTOP_LYRIC_MOVE, x, y),
	desktopLyricSaveState: () => ipcRenderer.invoke(CHANNELS.DESKTOP_LYRIC_SAVE_STATE),
	desktopLyricClose: () => ipcRenderer.invoke(CHANNELS.DESKTOP_LYRIC_CLOSE),
	setDesktopLyricUnlockButtonBounds: (bounds: Record<string, unknown>) =>
		ipcRenderer.invoke(CHANNELS.DESKTOP_LYRIC_SET_UNLOCK_BUTTON_BOUNDS, bounds),

	// 播放状态同步（桌面歌词等消费）
	updateNowPlaying: (payload: Record<string, unknown>) => ipcRenderer.invoke(CHANNELS.NOW_PLAYING_UPDATE, payload),
	syncNowPlayingPosition: (payload: Record<string, unknown>) => ipcRenderer.invoke(CHANNELS.NOW_PLAYING_POSITION, payload),

	// 应用更新
	getUpdateStatus: () => ipcRenderer.invoke(CHANNELS.UPDATE_GET_STATUS),
	checkForUpdates: () => ipcRenderer.invoke(CHANNELS.UPDATE_CHECK),
	downloadUpdate: () => ipcRenderer.invoke(CHANNELS.UPDATE_DOWNLOAD),
	installUpdate: () => ipcRenderer.invoke(CHANNELS.UPDATE_INSTALL),
	onUpdateStatus: (callback: (...args: unknown[]) => void) =>
		createListener(CHANNELS.UPDATE_STATUS_CHANGED, callback),
}

// 安全地暴露主进程的API给渲染进程
contextBridge.exposeInMainWorld("electronAPI", compatAPI)
