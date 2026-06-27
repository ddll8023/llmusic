import type { ChildProcess } from "child_process"
import type { BrowserWindow } from "electron"
import type { Low } from "lowdb"
import type { Song } from "../types/song"

// ---- IPC 通用返回格式 ----
export type IpcResultSuccess<T = Record<string, never>> = { success: true } & T

export interface IpcResultError {
	success: false
	error?: string
	canceled?: boolean
}

export type IpcResult<T = Record<string, never>> = IpcResultSuccess<T> | IpcResultError

// ---- IPC 处理器注册格式 ----
export interface IpcHandlerDef {
	channel: string
	handler: Function
	options?: { throttleMs?: number }
}

export interface IpcHandlerModule {
	handlers: IpcHandlerDef[]
	cleanup: () => void
}

// ---- 后端进程状态 ----
export interface BackendState {
	running: boolean
	status: "stopped" | "starting" | "running" | "stopping" | "error"
	baseUrl: string
	host: string
	port: number | null
	pid: number | null
	error: string
}

// ---- 应用全局状态 ----
export interface AppState {
	mainWindow: BrowserWindow | null
	tray: Electron.Tray | null
	closeWindowBehavior: "exit" | "minimize"
	ipcDisposer: (() => void) | null
	pendingFileToOpen: string | null
}

// ---- 数据库类型定义 ----
export interface Library {
	id: string
	name: string
	path: string
	createdAt: string
}

export interface Playlist {
	id: string
	name: string
	description: string
	coverImgId: string | null
	songs: string[]
	createTime: number
	updateTime: number
}

export interface DbData {
	songs: Song[]
	libraries: Library[]
	playlists: Playlist[]
	settings: Record<string, unknown>
}

// ---- 扫描相关 ----
export interface ScanProgress {
	phase: string
	message?: string
	processed?: number
	total?: number
	[key: string]: unknown
}

export type ProgressCallback = (progress: ScanProgress) => void

// ---- 音频处理 ----
export interface AudioProcessingOptions {
	filePath?: string
	position?: number
	audioCodec?: string
	audioChannels?: number
	audioFrequency?: number
	format?: string
	timeout?: number
	logLevel?: string
	[key: string]: unknown
}

export interface ProcessingStatus {
	state: string
	filePath: string | null
	duration: number
}

// ---- 音乐库管理 ----
export interface LibraryData {
	name: string
	dirPath: string
}

export interface LibraryUpdate {
	libraryId: string
	updates: Record<string, unknown>
}

// ---- 下载 ----
export interface DownloadOptions {
	url: string
	filename: string
}

export interface BatchDownloadOptions {
	songs: { url: string; filename: string }[]
}

// ---- 歌曲管理 ----
export interface SongQueryParams {
	libraryId?: string
}

export interface ImportMusicResult {
	success: boolean
	importedCount?: number
	updatedCount?: number
	failedFiles?: string[]
	error?: string
	message?: string
}
