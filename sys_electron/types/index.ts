import type { BrowserWindow } from "electron"

// ---- IPC 处理器注册格式 ----
export interface IpcHandlerDef {
	channel: string
	handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown
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

// ---- 扫描相关 ----
export interface ScanProgress {
	phase: string
	message?: string
	processed?: number
	total?: number
	[key: string]: unknown
}

export type ProgressCallback = (progress: ScanProgress) => void

// ---- 下载 ----
export interface SongDownloadMetadata {
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
