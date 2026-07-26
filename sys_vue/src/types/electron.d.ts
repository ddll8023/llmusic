/** Electron IPC 协议类型 — IPC handler 的返回格式基于 olddb/Electron handler 实现 */

declare global {
	// ---- IPC 通用返回格式 ----
	type IpcResult<T = Record<string, never>> = { success: boolean; error?: string; canceled?: boolean } & T

	interface ElectronAPI {
		// ── 窗口控制 ──
		windowMinimize: () => Promise<IpcResult>
		windowMaximize: () => Promise<IpcResult>
		windowRestore: () => Promise<IpcResult>
		windowClose: () => Promise<IpcResult>
		/** 实际返回 IpcResult<{ maximized: boolean }>；TitleBar 仍按 boolean 读取（历史遗留，初始态以 onWindowMaximizedChange 为准） */
		isWindowMaximized: () => Promise<IpcResult<{ maximized?: boolean }>>
		showWindow: () => Promise<IpcResult>
		setCloseBehavior: (behavior: string) => Promise<IpcResult<{ behavior?: string }>>
		getCloseBehavior: () => Promise<IpcResult<{ behavior?: string }>>

		// ── 导航 ──
		onOpenAudioFile: (callback: (filePath: string) => void) => () => void
		onWindowMaximizedChange: (callback: (maximized: boolean) => void) => () => void

		// ── 歌曲管理 ──
		getSongs: (params: { libraryId?: string }) => Promise<IpcResult<{ songs: import('./api').Song[] }>>
		getSongById: (id: string) => Promise<IpcResult<{ song?: import('./api').Song }>>
		incrementPlayCount: (id: string) => Promise<IpcResult<{ song: import('./api').Song }>>
		parseSongFromFile: (filePath: string) => Promise<IpcResult<{ song?: import('./api').Song }>>
		deleteSong: (id: string) => Promise<IpcResult<{ warning?: string }>>
		clearAllSongs: () => Promise<IpcResult>

		// ── 封面 & 歌词 ──
		getSongCover: (songId: string) => Promise<IpcResult<{ cover: string; format: string; source: string }>>
		getCoverFromFile: (filePath: string) => Promise<IpcResult<{ cover: string; format: string; source: string }>>
		getLyrics: (songId: string) => Promise<IpcResult<{ lyrics: import('./api').LyricLine[] }>>
		forceExtractCover: (songId: string) => Promise<IpcResult<{ cover: string; format: string; source: string }>>
		getPathForFile: (file: File) => Promise<IpcResult<{ filePath: string }>>
		importMusicFiles: (filePaths: string[]) => Promise<IpcResult<{ importedCount: number; updatedCount: number; failedFiles: string[]; message: string }>>

		// ── 歌单 ──
		getPlaylists: () => Promise<IpcResult<{ playlists: import('./api').Playlist[] }>>
		getPlaylistById: (id: string) => Promise<IpcResult<{ playlist: import('./api').Playlist }>>
		createPlaylist: (data: { name: string; description?: string }) => Promise<IpcResult<{ playlist: import('./api').Playlist }>>
		updatePlaylist: (id: string, data: { name: string; description?: string }) => Promise<IpcResult<{ playlist: import('./api').Playlist }>>
		deletePlaylist: (id: string) => Promise<IpcResult>
		addSongsToPlaylist: (playlistId: string, songIds: string[]) => Promise<IpcResult>
		removeSongsFromPlaylist: (playlistId: string, songIds: string[]) => Promise<IpcResult>

		// ── 下载（带元数据嵌入） ──
		downloadSongWithMetadata: (data: {
			url: string
			filename: string
			metadata: {
				title: string
				artist: string
				album: string
				trackNumber: number
				genre: string
				year: string
				lyrics: string
				coverUrl: string
				format: string
			}
		}) => Promise<IpcResult<{ filePath?: string; warning?: string }>>

		/** 批量下载 — 写入指定目录, 不弹保存对话框 */
		downloadSongToDir: (data: {
			url: string
			filename: string
			metadata: {
				title: string
				artist: string
				album: string
				trackNumber: number
				genre: string
				year: string
				lyrics: string
				coverUrl: string
				format: string
			}
			targetDir: string
		}) => Promise<IpcResult<{ filePath?: string; warning?: string }>>
		showItemInFolder: (filePath: string) => Promise<IpcResult>
		copyToClipboard: (text: string) => Promise<IpcResult>
		showOpenDialog: (options?: Record<string, unknown>) => Promise<IpcResult<{ filePaths?: string[] }>>

		// ── 扫描 ──
		scanMusic: (params: { libraryId: string; clearExisting: boolean }) => Promise<IpcResult<{ canceled?: boolean; count?: number; failedCount?: number }>>
		cancelScan: () => Promise<IpcResult>
		onScanProgress: (callback: (progress: import('./api').ScanProgress) => void) => () => void

		// ── 标签 ──
		getSongTags: (songId: string) => Promise<IpcResult<{ tags: Record<string, unknown>; format: string }>>
		updateSongTags: (songId: string, tags: Record<string, unknown>) => Promise<IpcResult<{ updatedSong?: import('./api').Song; warning?: string }>>
		getTagsFromFile: (filePath: string) => Promise<IpcResult<{ tags: Record<string, unknown>; format: string }>>
		updateTagsToFile: (filePath: string, tags: Record<string, unknown>) => Promise<IpcResult<{ updatedTags?: Record<string, unknown> | null }>>
		validateTagChanges: (tags: Record<string, unknown>) => Promise<IpcResult<{ validation: { valid: boolean; errors: string[]; warnings: string[] } }>>
		searchOnlineMetadata: (searchParams: Record<string, unknown>) => Promise<IpcResult<{ results?: unknown[] }>>

		// ── 音乐库 ──
		getLibraries: () => Promise<IpcResult<{ libraries: import('./api').Library[] }>>
		addLibrary: (data: { dirPath: string }) => Promise<IpcResult<{ library: import('./api').Library }>>
		updateLibrary: (data: { libraryId: string; updates: Record<string, unknown> }) => Promise<IpcResult<{ library: import('./api').Library }>>
		removeLibrary: (id: string) => Promise<IpcResult>
		selectDirectory: () => Promise<IpcResult<{ path?: string }>>
	}

	interface Window {
		electronAPI: ElectronAPI
	}
}

export {}
