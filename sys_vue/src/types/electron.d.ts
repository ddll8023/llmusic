/** Electron IPC 协议类型 — IPC handler 的返回格式基于 olddb/Electron handler 实现 */

declare global {
	// ---- IPC 通用返回格式 ----
	type IpcResult<T = Record<string, never>> = { success: boolean; error?: string; canceled?: boolean } & T

	interface ElectronAPI {
		// ── 窗口控制 ──
		windowMinimize: () => Promise<void>
		windowMaximize: () => Promise<void>
		windowRestore: () => Promise<void>
		windowClose: () => Promise<void>
		isWindowMaximized: () => Promise<boolean>
		showWindow: () => Promise<void>
		setCloseBehavior: (behavior: string) => Promise<boolean>
		getCloseBehavior: () => Promise<string>

		// ── 导航 ──
		onNavigateToMain: (callback: () => void) => () => void
		onOpenAudioFile: (callback: (filePath: string) => void) => () => void
		onWindowMaximizedChange: (callback: (maximized: boolean) => void) => () => void

		// ── 歌曲管理 ──
		getSongs: (params: { libraryId?: string }) => Promise<IpcResult<{ songs: import('./api').Song[] }>>
		getSongById: (id: string) => Promise<IpcResult<{ song?: import('./api').Song }>>
		incrementPlayCount: (id: string) => Promise<IpcResult<{ song: import('./api').Song }>>
		parseSongFromFile: (filePath: string) => Promise<IpcResult<{ song?: import('./api').Song }>>
		deleteSong: (id: string) => Promise<IpcResult>
		clearAllSongs: () => Promise<IpcResult>

		// ── 封面 & 歌词 ──
		getSongCover: (songId: string) => Promise<string>
		getCoverFromFile: (filePath: string) => Promise<string>
		getLyrics: (songId: string) => Promise<IpcResult<{ lyrics: import('./api').LyricLine[] }>>
		forceExtractCover: (songId: string) => Promise<IpcResult<{ cover: string; format: string; source: string }>>
		getPathForFile: (file: File) => Promise<IpcResult<{ filePath: string }>>
		importMusicFiles: (filePaths: string[]) => Promise<IpcResult<{ importedCount: number; updatedCount: number; failedFiles: string[]; message: string }>>
		onPlayerEnded: (callback: (data: unknown) => void) => void

		// ── 播放器 ──
		playerPlay: (data?: { filePath: string }) => Promise<void>
		playerStop: () => Promise<void>
		playerSeek: (time: number) => Promise<void>
		playerGetStatus: () => Promise<Record<string, unknown>>
		onPlayerAudioData: (callback: (data: unknown) => void) => void
		onPlayerError: (callback: (error: string) => void) => void

		// ── 歌单 ──
		getPlaylists: () => Promise<IpcResult<{ playlists: import('./api').Playlist[] }>>
		getPlaylistById: (id: string) => Promise<IpcResult<{ playlist: import('./api').Playlist }>>
		createPlaylist: (data: { name: string; description?: string }) => Promise<IpcResult<{ playlist: import('./api').Playlist }>>
		updatePlaylist: (id: string, data: { name: string; description?: string }) => Promise<IpcResult<{ playlist: import('./api').Playlist }>>
		deletePlaylist: (id: string) => Promise<IpcResult>
		addSongsToPlaylist: (playlistId: string, songIds: string[]) => Promise<IpcResult>
		removeSongsFromPlaylist: (playlistId: string, songIds: string[]) => Promise<IpcResult>

		// ── 下载 ──
		downloadFile: (data: { url: string; filename: string }) => Promise<string>
		batchDownloadFiles: (data: { songs: { url: string; filename: string }[] }) => Promise<string[]>
		showItemInFolder: (filePath: string) => Promise<IpcResult>
		copyToClipboard: (text: string) => Promise<void>
		showOpenDialog: (options?: Record<string, unknown>) => Promise<IpcResult<{ path?: string }>>

		// ── 扫描 ──
		scanMusic: (params: { libraryId: string; clearExisting: boolean }) => Promise<IpcResult<{ canceled?: boolean }>>
		cancelScan: () => Promise<IpcResult>
		onScanProgress: (callback: (progress: import('./api').ScanProgress) => void) => void

		// ── 标签 ──
		getSongTags: (songId: string) => Promise<IpcResult<{ tags: Record<string, unknown>; format: string }>>
		updateSongTags: (songId: string, tags: Record<string, unknown>) => Promise<IpcResult<{ updatedSong?: import('./api').Song; warning?: string }>>
		getTagsFromFile: (filePath: string) => Promise<IpcResult<{ tags: Record<string, unknown>; format: string }>>
		updateTagsToFile: (data: { filePath: string; tags: Record<string, unknown> }) => Promise<IpcResult>
		validateTagChanges: (tags: Record<string, unknown>) => Promise<IpcResult<{ validation: { valid: boolean; errors: string[]; warnings: string[] } }>>
		searchOnlineMetadata: (searchParams: Record<string, unknown>) => Promise<{ code: number; data: unknown[]; message: string }>

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
