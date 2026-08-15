import { app, BrowserWindow, screen } from "electron"
import path from "path"
import { CHANNELS } from "../../constants/ipcChannels"
import { getSetting, setSetting } from "../data/settingsRepo"
import type { LyricLine } from "../../types/song"

export interface DesktopLyricConfig {
	enabled: boolean
	locked: boolean
	alwaysOnTop: boolean
	fontSize: number
	x: number | null
	y: number | null
	width: number
	height: number
	showTranslation: boolean
	doubleLine: boolean
	currentLineColor: string
	nextLineColor: string
}

export interface NowPlayingTrack {
	id?: string
	title: string
	artist: string
	album: string
	isOnline?: boolean
}

export interface NowPlayingSnapshot {
	track: NowPlayingTrack | null
	lyric: LyricLine[]
	position: number
	playing: boolean
	speed: number
	lyricOffsetMs: number
	sendTimestamp: number
	showTranslation: boolean
	showRoma: boolean
}

export interface NowPlayingPositionSync {
	position: number
	playing: boolean
	speed: number
	sendTimestamp: number
}

export interface DesktopLyricUnlockButtonBounds {
	x: number
	y: number
	width: number
	height: number
}

const DEFAULT_CONFIG: DesktopLyricConfig = {
	enabled: false,
	locked: false,
	alwaysOnTop: true,
	fontSize: 28,
	x: null,
	y: null,
	width: 800,
	height: 120,
	showTranslation: true,
	doubleLine: false,
	currentLineColor: "#ffffff",
	nextLineColor: "#b3b3b3",
}

const SETTINGS_KEY = "desktopLyric"

let config: DesktopLyricConfig = { ...DEFAULT_CONFIG }
let desktopLyricWindow: BrowserWindow | null = null
let unlockButtonBounds: DesktopLyricUnlockButtonBounds | null = null
let cursorPollTimer: NodeJS.Timeout | null = null
let mouseEventsIgnored = false
let lastCursorInside = false

let currentSnapshot: NowPlayingSnapshot = {
	track: null,
	lyric: [],
	position: 0,
	playing: false,
	speed: 1,
	lyricOffsetMs: 0,
	sendTimestamp: Date.now(),
	showTranslation: true,
	showRoma: false,
}

async function loadConfig(): Promise<void> {
	try {
		const saved = await getSetting<Partial<DesktopLyricConfig>>(SETTINGS_KEY)
		config = { ...DEFAULT_CONFIG, ...(saved || {}) }
	} catch (error) {
		console.error("[DesktopLyric] 读取配置失败，使用默认配置:", error)
		config = { ...DEFAULT_CONFIG }
	}
}

async function saveConfig(): Promise<void> {
	try {
		await setSetting(SETTINGS_KEY, config)
	} catch (error) {
		console.error("[DesktopLyric] 保存配置失败:", error)
	}
}

function sendToDesktopLyric(channel: string, payload: unknown): void {
	if (!desktopLyricWindow || desktopLyricWindow.isDestroyed()) return
	desktopLyricWindow.webContents.send(channel, payload)
}

function broadcastConfig(): void {
	const payload = config
	for (const win of BrowserWindow.getAllWindows()) {
		if (!win.isDestroyed()) {
			win.webContents.send(CHANNELS.DESKTOP_LYRIC_CONFIG_CHANGED, payload)
		}
	}
}

function isCursorInsideBounds(): boolean {
	if (!desktopLyricWindow || desktopLyricWindow.isDestroyed()) return false
	const cursor = screen.getCursorScreenPoint()
	const bounds = desktopLyricWindow.getBounds()
	return (
		cursor.x >= bounds.x &&
		cursor.x < bounds.x + bounds.width &&
		cursor.y >= bounds.y &&
		cursor.y < bounds.y + bounds.height
	)
}

function isCursorInsideUnlockButton(): boolean {
	if (!desktopLyricWindow || desktopLyricWindow.isDestroyed() || !unlockButtonBounds) return false
	const cursor = screen.getCursorScreenPoint()
	const content = desktopLyricWindow.getContentBounds()
	return (
		cursor.x - content.x >= unlockButtonBounds.x &&
		cursor.x - content.x < unlockButtonBounds.x + unlockButtonBounds.width &&
		cursor.y - content.y >= unlockButtonBounds.y &&
		cursor.y - content.y < unlockButtonBounds.y + unlockButtonBounds.height
	)
}

function syncMousePassthrough(cursorInsideUnlockButton = isCursorInsideUnlockButton()): void {
	if (!desktopLyricWindow || desktopLyricWindow.isDestroyed()) return
	const shouldIgnore = config.locked && !cursorInsideUnlockButton
	if (shouldIgnore === mouseEventsIgnored) return
	desktopLyricWindow.setIgnoreMouseEvents(shouldIgnore, { forward: true })
	mouseEventsIgnored = shouldIgnore
}

function startCursorPolling(): void {
	if (cursorPollTimer) return
	lastCursorInside = isCursorInsideBounds()
	sendToDesktopLyric(CHANNELS.DESKTOP_LYRIC_CURSOR_INSIDE, lastCursorInside)
	cursorPollTimer = setInterval(() => {
		if (!desktopLyricWindow || desktopLyricWindow.isDestroyed()) {
			stopCursorPolling()
			return
		}
		const inside = isCursorInsideBounds()
		syncMousePassthrough()
		if (inside !== lastCursorInside) {
			lastCursorInside = inside
			sendToDesktopLyric(CHANNELS.DESKTOP_LYRIC_CURSOR_INSIDE, inside)
		}
	}, 150)
}

function stopCursorPolling(): void {
	if (cursorPollTimer) {
		clearInterval(cursorPollTimer)
		cursorPollTimer = null
	}
}

function applyLock(): void {
	if (!desktopLyricWindow || desktopLyricWindow.isDestroyed()) return
	desktopLyricWindow.setMovable(!config.locked)
	desktopLyricWindow.setResizable(!config.locked)
	if (config.locked) {
		startCursorPolling()
	} else {
		stopCursorPolling()
	}
	syncMousePassthrough()
}

function applyAlwaysOnTop(): void {
	if (!desktopLyricWindow || desktopLyricWindow.isDestroyed()) return
	desktopLyricWindow.setAlwaysOnTop(config.alwaysOnTop, "screen-saver")
}

function applyConfigToWindow(): void {
	if (!desktopLyricWindow || desktopLyricWindow.isDestroyed()) return
	applyAlwaysOnTop()
	applyLock()
}

export async function initDesktopLyricWindow(): Promise<void> {
	await loadConfig()
	if (config.enabled) {
		createDesktopLyricWindow()
	}
}

export function getDesktopLyricConfig(): DesktopLyricConfig {
	return { ...config }
}

export async function setDesktopLyricEnabled(enabled: boolean): Promise<void> {
	if (config.enabled === enabled) return
	config.enabled = enabled
	await saveConfig()
	broadcastConfig()
	if (enabled) {
		createDesktopLyricWindow()
	} else {
		closeDesktopLyricWindow()
	}
}

export async function updateDesktopLyricConfig(partial: Partial<DesktopLyricConfig>): Promise<void> {
	const oldEnabled = config.enabled
	const oldHeight = config.height
	config = { ...config, ...partial }
	await saveConfig()
	applyConfigToWindow()
	if (
		desktopLyricWindow &&
		!desktopLyricWindow.isDestroyed() &&
		partial.height !== undefined &&
		config.height !== oldHeight
	) {
		const bounds = desktopLyricWindow.getBounds()
		desktopLyricWindow.setBounds({ ...bounds, height: config.height })
	}
	broadcastConfig()
	if (oldEnabled !== config.enabled) {
		if (config.enabled) createDesktopLyricWindow()
		else closeDesktopLyricWindow()
	}
}

export function getNowPlayingSnapshot(): NowPlayingSnapshot {
	return { ...currentSnapshot, lyric: [...currentSnapshot.lyric] }
}

export function updateNowPlaying(payload: Omit<NowPlayingSnapshot, "sendTimestamp">): void {
	currentSnapshot = {
		...payload,
		sendTimestamp: Date.now(),
	}
	sendToDesktopLyric(CHANNELS.DESKTOP_LYRIC_NOW_PLAYING_CHANGED, currentSnapshot)
}

export function updateNowPlayingPosition(payload: { position: number; playing: boolean; speed: number }): void {
	currentSnapshot.position = payload.position
	currentSnapshot.playing = payload.playing
	currentSnapshot.speed = payload.speed || 1
	currentSnapshot.sendTimestamp = Date.now()
	const positionSync: NowPlayingPositionSync = {
		position: currentSnapshot.position,
		playing: currentSnapshot.playing,
		speed: currentSnapshot.speed,
		sendTimestamp: currentSnapshot.sendTimestamp,
	}
	sendToDesktopLyric(CHANNELS.DESKTOP_LYRIC_POSITION_SYNC, positionSync)
}

export async function moveDesktopLyricWindow(x: number, y: number): Promise<void> {
	const win = desktopLyricWindow
	if (!win || win.isDestroyed()) return
	const bounds = win.getBounds()
	const display = screen.getDisplayMatching({ x, y, width: bounds.width, height: bounds.height })
	const workArea = display.workArea
	const tx = Math.max(workArea.x, Math.min(workArea.x + workArea.width - bounds.width, x))
	const ty = Math.max(workArea.y, Math.min(workArea.y + workArea.height - bounds.height, y))
	win.setBounds({ x: tx, y: ty, width: bounds.width, height: bounds.height })
}

export async function saveDesktopLyricState(): Promise<void> {
	const win = desktopLyricWindow
	if (!win || win.isDestroyed()) return
	const bounds = win.getBounds()
	config.x = bounds.x
	config.y = bounds.y
	config.width = bounds.width
	config.height = bounds.height
	await saveConfig()
}

export function setUnlockButtonBounds(bounds: DesktopLyricUnlockButtonBounds | null): void {
	unlockButtonBounds = bounds
	syncMousePassthrough()
}

export function cleanupDesktopLyric(): void {
	stopCursorPolling()
	if (desktopLyricWindow && !desktopLyricWindow.isDestroyed()) {
		desktopLyricWindow.destroy()
	}
	desktopLyricWindow = null
	mouseEventsIgnored = false
	unlockButtonBounds = null
}

function closeDesktopLyricWindow(): void {
	stopCursorPolling()
	if (desktopLyricWindow && !desktopLyricWindow.isDestroyed()) {
		desktopLyricWindow.close()
	}
	desktopLyricWindow = null
}

function createDesktopLyricWindow(): void {
	if (desktopLyricWindow && !desktopLyricWindow.isDestroyed()) {
		desktopLyricWindow.showInactive()
		return
	}

	const display = screen.getPrimaryDisplay()
	const width = config.width || DEFAULT_CONFIG.width
	const height = config.height || DEFAULT_CONFIG.height
	let x = config.x
	let y = config.y
	if (x === null || y === null) {
		x = Math.round(display.workArea.x + (display.workArea.width - width) / 2)
		y = Math.round(display.workArea.y + display.workArea.height - height - 60)
	}

	desktopLyricWindow = new BrowserWindow({
		width,
		height,
		x,
		y,
		minWidth: 300,
		minHeight: 80,
		frame: false,
		transparent: true,
		hasShadow: false,
		backgroundColor: "#00000000",
		resizable: !config.locked,
		movable: !config.locked,
		minimizable: false,
		maximizable: false,
		fullscreenable: false,
		alwaysOnTop: config.alwaysOnTop,
		skipTaskbar: true,
		focusable: false,
		show: false,
		webPreferences: {
			preload: path.join(__dirname, "..", "..", "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
		},
	})

	if (app.isPackaged) {
		desktopLyricWindow.loadFile(
			path.join(process.resourcesPath, "sys_vue", "dist", "desktop-lyric.html")
		)
	} else {
		desktopLyricWindow.loadURL("http://localhost:9753/desktop-lyric.html")
	}

	desktopLyricWindow.once("ready-to-show", () => {
		if (!desktopLyricWindow || desktopLyricWindow.isDestroyed()) return
		applyAlwaysOnTop()
		applyLock()
		desktopLyricWindow.showInactive()
	})

	desktopLyricWindow.on("closed", () => {
		stopCursorPolling()
		desktopLyricWindow = null
		mouseEventsIgnored = false
		unlockButtonBounds = null
	})
}
