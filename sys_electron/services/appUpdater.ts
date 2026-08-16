import type { BrowserWindow } from "electron"
import { app } from "electron"
import { autoUpdater } from "electron-updater"
import type { ProgressInfo, UpdateDownloadedEvent, UpdateInfo } from "electron-updater"
import { CHANNELS } from "../constants/ipcChannels"

export type AppUpdateStatusName =
	| "idle"
	| "checking"
	| "not-available"
	| "available"
	| "downloading"
	| "downloaded"
	| "error"

export interface AppUpdateStatus {
	status: AppUpdateStatusName
	currentVersion: string
	version?: string
	progress?: number
	error?: string
	releaseNotes?: string
}

let mainWindow: BrowserWindow | null = null
let initialized = false
let checkPromise: Promise<AppUpdateStatus> | null = null

const state: AppUpdateStatus = {
	status: "idle",
	currentVersion: "",
}

function getSnapshot(): AppUpdateStatus {
	return { ...state }
}

function sendStatus(): void {
	if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
		mainWindow.webContents.send(CHANNELS.UPDATE_STATUS_CHANGED, getSnapshot())
	}
}

function setStatus(patch: Partial<AppUpdateStatus>): void {
	Object.assign(state, patch)
	sendStatus()
}

function formatReleaseNotes(info: UpdateInfo): string | undefined {
	const releaseNotes = info.releaseNotes
	if (!releaseNotes) return undefined
	if (typeof releaseNotes === "string") return releaseNotes

	return releaseNotes
		.map((item) => {
			if (typeof item === "string") return item
			return item.version ? `v${item.version}: ${item.note}` : item.note
		})
		.join("\n")
}

function applyUpdateInfo(status: AppUpdateStatusName, info: UpdateInfo): void {
	setStatus({
		status,
		currentVersion: app.getVersion(),
		version: info.version,
		releaseNotes: formatReleaseNotes(info),
		error: undefined,
	})
}

function configureUpdater(): void {
	if (initialized) return
	initialized = true

	// 更新由用户在设置页确认下载，避免启动时占用带宽或打断播放。
	autoUpdater.autoDownload = false
	autoUpdater.autoInstallOnAppQuit = false
	autoUpdater.allowPrerelease = false
	autoUpdater.logger = {
		info: (message?: unknown) => console.info("[Updater]", message),
		warn: (message?: unknown) => console.warn("[Updater]", message),
		error: (message?: unknown) => console.error("[Updater]", message),
	}

	autoUpdater.on("checking-for-update", () => {
		setStatus({ status: "checking", currentVersion: app.getVersion(), error: undefined })
	})
	autoUpdater.on("update-available", (info) => {
		applyUpdateInfo("available", info)
	})
	autoUpdater.on("update-not-available", (info) => {
		applyUpdateInfo("not-available", info)
	})
	autoUpdater.on("download-progress", (info: ProgressInfo) => {
		setStatus({
			status: "downloading",
			currentVersion: app.getVersion(),
			progress: Math.max(0, Math.min(100, Math.round(info.percent))),
			error: undefined,
		})
	})
	autoUpdater.on("update-downloaded", (event: UpdateDownloadedEvent) => {
		applyUpdateInfo("downloaded", event)
		setStatus({ progress: 100 })
	})
	autoUpdater.on("update-cancelled", (info) => {
		applyUpdateInfo("idle", info)
	})
	autoUpdater.on("error", (error) => {
		const message = error instanceof Error ? error.message : String(error)
		console.error("[Updater] 更新失败:", message)
		setStatus({ status: "error", currentVersion: app.getVersion(), error: message })
	})
}

export function setUpdaterWindow(window: BrowserWindow | null): void {
	mainWindow = window
	if (mainWindow) sendStatus()
}

export function initializeAppUpdater(window: BrowserWindow): void {
	setUpdaterWindow(window)
	state.currentVersion = app.getVersion()

	if (!app.isPackaged) return
	configureUpdater()

	// 给应用启动、后端就绪和首屏加载留出时间，再执行后台检查。
	setTimeout(() => {
		void checkForUpdates()
	}, 5000)
}

export async function checkForUpdates(): Promise<AppUpdateStatus> {
	if (!app.isPackaged) {
		setStatus({ status: "not-available", currentVersion: app.getVersion(), error: undefined })
		return getSnapshot()
	}
	if (state.status === "downloading" || state.status === "downloaded") {
		return getSnapshot()
	}
	if (checkPromise) return checkPromise

	configureUpdater()
	checkPromise = (async () => {
		setStatus({ status: "checking", currentVersion: app.getVersion(), error: undefined })
		try {
			await autoUpdater.checkForUpdates()
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			console.error("[Updater] 检查更新失败:", message)
			setStatus({ status: "error", currentVersion: app.getVersion(), error: message })
		}
		return getSnapshot()
	})()

	try {
		return await checkPromise
	} finally {
		checkPromise = null
	}
}

export async function downloadUpdate(): Promise<AppUpdateStatus> {
	if (!app.isPackaged || state.status !== "available") return getSnapshot()

	try {
		setStatus({ status: "downloading", progress: 0, error: undefined })
		await autoUpdater.downloadUpdate()
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		console.error("[Updater] 下载更新失败:", message)
		setStatus({ status: "error", error: message })
	}
	return getSnapshot()
}

export function installUpdate(): AppUpdateStatus {
	if (state.status !== "downloaded") return getSnapshot()
	autoUpdater.quitAndInstall(false, true)
	return getSnapshot()
}

export function getUpdateStatus(): AppUpdateStatus {
	return getSnapshot()
}
