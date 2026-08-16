import type { BrowserWindow } from "electron"
import { app } from "electron"
import { autoUpdater } from "electron-updater"
import type { ProgressInfo, UpdateDownloadedEvent, UpdateInfo } from "electron-updater"
import { CHANNELS } from "../constants/ipcChannels"
import {
	macCheckForUpdates,
	macDownloadUpdate,
	macInstallUpdate,
	macReadInstallResult,
	macCleanup,
	type MacUpdateInfo,
} from "./macUpdater"

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

const IS_MAC = process.platform === "darwin"

let mainWindow: BrowserWindow | null = null
let winUpdaterInitialized = false
let checkPromise: Promise<AppUpdateStatus> | null = null

// macOS 自定义更新链路的状态
let macPending: MacUpdateInfo | null = null

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

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
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

/**
 * Windows 更新链路：electron-updater + NSIS。
 * 未配置 publisherName 时 NSIS 不做发布者签名校验，未签名产物可正常更新。
 */
function configureWinUpdater(): void {
	if (winUpdaterInitialized) return
	winUpdaterInitialized = true

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
		const message = errorMessage(error)
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

	if (IS_MAC) {
		// 读取上次独立助手安装结果：失败则提示，成功仅记录日志
		const lastResult = macReadInstallResult()
		if (lastResult) {
			if (lastResult.ok) {
				console.log(`[Updater] 上次更新安装成功 (v${lastResult.version ?? ""})`)
			} else {
				console.error(`[Updater] 上次更新安装失败: ${lastResult.message ?? "未知错误"}`)
				setStatus({
					status: "error",
					currentVersion: app.getVersion(),
					error: `上次更新安装失败: ${lastResult.message ?? "未知错误"}`,
				})
			}
		}
		macCleanup()
	} else {
		configureWinUpdater()
	}

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

	checkPromise = (async () => {
		setStatus({ status: "checking", currentVersion: app.getVersion(), error: undefined })
		try {
			if (IS_MAC) {
				const info = await macCheckForUpdates()
				if (!info) {
					macPending = null
					setStatus({
						status: "not-available",
						currentVersion: app.getVersion(),
						version: undefined,
						releaseNotes: undefined,
						error: undefined,
					})
				} else {
					macPending = info
					setStatus({
						status: "available",
						currentVersion: app.getVersion(),
						version: info.version,
						releaseNotes: info.releaseNotes,
						error: undefined,
					})
				}
			} else {
				configureWinUpdater()
				await autoUpdater.checkForUpdates()
			}
		} catch (error) {
			const message = errorMessage(error)
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
	if (!app.isPackaged) return getSnapshot()

	if (IS_MAC) {
		if (state.status !== "available" || !macPending) return getSnapshot()
		try {
			setStatus({ status: "downloading", progress: 0, currentVersion: app.getVersion(), error: undefined })
			await macDownloadUpdate(macPending, (percent) => {
				setStatus({
					status: "downloading",
					currentVersion: app.getVersion(),
					progress: percent,
					error: undefined,
				})
			})
			setStatus({
				status: "downloaded",
				currentVersion: app.getVersion(),
				version: macPending.version,
				releaseNotes: macPending.releaseNotes,
				progress: 100,
				error: undefined,
			})
		} catch (error) {
			const message = errorMessage(error)
			console.error("[Updater] 下载更新失败:", message)
			setStatus({ status: "error", currentVersion: app.getVersion(), error: message })
		}
		return getSnapshot()
	}

	if (state.status !== "available") return getSnapshot()
	try {
		setStatus({ status: "downloading", progress: 0, error: undefined })
		await autoUpdater.downloadUpdate()
	} catch (error) {
		const message = errorMessage(error)
		console.error("[Updater] 下载更新失败:", message)
		setStatus({ status: "error", error: message })
	}
	return getSnapshot()
}

export function installUpdate(): AppUpdateStatus {
	if (state.status !== "downloaded") return getSnapshot()

	if (IS_MAC) {
		if (!macPending) return getSnapshot()
		try {
			macInstallUpdate(macPending)
		} catch (error) {
			const message = errorMessage(error)
			console.error("[Updater] 启动安装失败:", message)
			setStatus({ status: "error", currentVersion: app.getVersion(), error: message })
			return getSnapshot()
		}
		// 独立助手接管替换与重启，主应用立即退出
		app.quit()
		return getSnapshot()
	}

	autoUpdater.quitAndInstall(false, true)
	return getSnapshot()
}

export function getUpdateStatus(): AppUpdateStatus {
	return getSnapshot()
}
