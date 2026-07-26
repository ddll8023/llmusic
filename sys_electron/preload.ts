import { contextBridge, ipcRenderer } from "electron"
import { CHANNELS } from "./constants/ipcChannels"

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
	getPathForFile: (file: File) => ipcRenderer.invoke(CHANNELS.GET_PATH_FOR_FILE, file),

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

	// 文件下载（带元数据嵌入）
	downloadSongWithMetadata: (options: Record<string, unknown>) =>
		ipcRenderer.invoke(CHANNELS.DOWNLOAD_SONG_WITH_METADATA, options),

	// 批量下载（选择目录, 不弹保存对话框）
	downloadSongToDir: (options: Record<string, unknown>) =>
		ipcRenderer.invoke(CHANNELS.DOWNLOAD_SONG_TO_DIR, options),
}

// 安全地暴露主进程的API给渲染进程
contextBridge.exposeInMainWorld("electronAPI", compatAPI)
