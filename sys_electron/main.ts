/**
 * LLMusic 本地音乐播放器 - 主进程入口
 * 负责应用生命周期管理、窗口创建、托盘集成和IPC通信设置
 */
import {
	app,
	BrowserWindow,
	Menu,
	Tray,
	nativeImage,
	ipcMain,
	session,
	shell,
	dialog,
} from "electron"
import path from "path"
import http from "http"
import { spawn, type ChildProcess } from "child_process"
import { initDb, validateSongFiles } from "./handlers/data/Database"
import { setupIpcHandlers } from "./handlers"
import { CHANNELS } from "./constants/ipcChannels"
import type { BackendState, AppState } from "./types"

// ===== 后端服务配置 =====
const BACKEND_HOST = "127.0.0.1"
const BACKEND_PORT = 9752

// 后端进程状态
let backendProcess: ChildProcess | null = null
let isWaitingBackendStop = false

// 后端状态对象，供 IPC 查询
const backendState: BackendState = {
	running: false,
	status: "stopped",
	baseUrl: "",
	host: "",
	port: null,
	pid: null,
	error: "",
}

/**
 * 获取后端可执行文件路径
 */
function getBackendExecutable(): string {
	const projectRoot = path.resolve(__dirname, "..")
	if (app.isPackaged) {
		return path.join(process.resourcesPath, "backend", "backend.exe")
	}
	return path.join(projectRoot, "backend", ".venv", "Scripts", "python.exe")
}

/**
 * 启动后端子进程
 */
function spawnBackend(): void {
	const projectRoot = path.resolve(__dirname, "..")
	const backendRoot = path.join(projectRoot, "backend")
	const executablePath = getBackendExecutable()
	const appDataDir = app.getPath("appData")

	backendState.status = "starting"
	backendState.host = BACKEND_HOST
	backendState.port = BACKEND_PORT
	backendState.baseUrl = `http://${BACKEND_HOST}:${BACKEND_PORT}`
	backendState.error = ""

	const spawnArgs = app.isPackaged
		? []
		: ["-m", "uvicorn", "app.main:app", "--host", BACKEND_HOST, "--port", String(BACKEND_PORT)]

	console.log(`[Backend] 启动中... 路径: ${executablePath}`)
	console.log(`[Backend] 参数: ${spawnArgs.join(" ") || "(无 - 打包模式)"}`)

	backendProcess = spawn(executablePath, spawnArgs, {
		cwd: app.isPackaged ? undefined : backendRoot,
		env: {
			...process.env,
			APP_HOST: BACKEND_HOST,
			APP_PORT: String(BACKEND_PORT),
			APP_DATA_DIR: path.join(appDataDir, "LLMusic"),
			PYTHONUNBUFFERED: "1",
		},
		stdio: ["ignore", "pipe", "pipe"],
		windowsHide: true,
	})

	backendState.pid = backendProcess.pid || null

	backendProcess.stdout?.on("data", (data: Buffer) => {
		console.log(`[Backend:out] ${data.toString().trim()}`)
	})
	backendProcess.stderr?.on("data", (data: Buffer) => {
		console.log(`[Backend:err] ${data.toString().trim()}`)
	})

	backendProcess.on("exit", (code: number | null, signal: string | null) => {
		console.log(`[Backend] 已退出, code=${code}, signal=${signal}`)
		backendState.running = false
		backendState.status = "stopped"
		backendState.pid = null
		backendProcess = null
	})

	backendProcess.on("error", (err: Error) => {
		console.error(`[Backend] 启动失败:`, err)
		backendState.status = "error"
		backendState.error = err.message
		backendState.running = false
	})
}

/**
 * 请求后端健康接口
 */
function requestBackendHealth(baseUrl: string): Promise<boolean> {
	return new Promise((resolve) => {
		const req = http.get(`${baseUrl}/health`, (res) => {
			let body = ""
			res.on("data", (chunk: string) => (body += chunk))
			res.on("end", () => {
				try {
					const data = JSON.parse(body)
					resolve(data.status === "ok")
				} catch {
					resolve(false)
				}
			})
		})
		req.on("error", () => resolve(false))
		req.setTimeout(2000, () => {
			req.destroy()
			resolve(false)
		})
	})
}

/**
 * 等待后端就绪（健康检查轮询）
 */
async function waitForBackendReady(baseUrl: string, timeoutMs = 15000): Promise<boolean> {
	const deadline = Date.now() + timeoutMs
	console.log(`[Backend] 等待就绪... (超时: ${timeoutMs}ms)`)

	while (Date.now() < deadline) {
		const isReady = await requestBackendHealth(baseUrl)
		if (isReady) {
			console.log("[Backend] 就绪!")
			backendState.running = true
			backendState.status = "running"
			return true
		}
		await new Promise((r) => setTimeout(r, 300))
	}

	console.error("[Backend] 健康检查超时!")
	backendState.status = "error"
	backendState.error = "健康检查超时"
	return false
}

/**
 * 停止后端子进程
 */
function stopBackend(): Promise<void> {
	return new Promise((resolve) => {
		if (!backendProcess || backendState.status === "stopped") {
			resolve()
			return
		}

		backendState.status = "stopping"
		console.log("[Backend] 正在停止...")

		const timeout = setTimeout(() => {
			console.log("[Backend] 优雅退出超时，强制终止")
			if (backendProcess) {
				backendProcess.kill("SIGKILL")
			}
			resolve()
		}, 3000)

		backendProcess.on("exit", () => {
			clearTimeout(timeout)
			resolve()
		})

		backendProcess.kill()
	})
}

// 应用全局状态
const appState: AppState = {
	mainWindow: null,
	tray: null,
	closeWindowBehavior: "exit",
	ipcDisposer: null,
	pendingFileToOpen: null,
}

/**
 * 创建并配置主窗口
 */
function createWindow(): BrowserWindow {
	Menu.setApplicationMenu(null)

	const mainWindow = new BrowserWindow({
		width: 1200,
		height: 800,
		minWidth: 1000,
		minHeight: 700,
		frame: false,
		backgroundColor: "#121212",
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			nodeIntegration: false,
			contextIsolation: true,
		},
	})

	mainWindow.on("close", (event) => {
		if (appState.closeWindowBehavior === "minimize" && mainWindow) {
			event.preventDefault()
			mainWindow.hide()

			if (process.platform === "win32" && appState.tray) {
				appState.tray.displayBalloon({
					title: "LLMusic 已最小化",
					content: "应用程序正在后台运行，点击托盘图标恢复。",
					iconType: "info",
				})
			}
			return false
		}
	})

	if (app.isPackaged) {
		mainWindow.loadFile(
			path.join(process.resourcesPath, "sys_vue", "dist", "index.html")
		)
	} else {
		mainWindow.loadURL("http://localhost:9753")
	}

	mainWindow.webContents.openDevTools()

	return mainWindow
}

/**
 * 创建系统托盘图标及菜单
 */
function createTray(): Tray {
	const iconPath = path.join(
		__dirname,
		"..",
		"sys_vue",
		"src",
		"assets",
		"tray-icon.png"
	)
	const icon = nativeImage
		.createFromPath(iconPath)
		.resize({ width: 16, height: 16 })

	const tray = new Tray(icon)
	tray.setToolTip("LLMusic 本地音乐播放器")

	const updateTrayMenu = (): void => {
		const contextMenu = Menu.buildFromTemplate([
			{
				label: "显示主界面",
				click: () => {
					if (appState.mainWindow && !appState.mainWindow.isDestroyed()) {
						appState.mainWindow.show()
					}
				},
			},
			{ type: "separator" },
			{
				label: "退出",
				click: () => {
					app.quit()
				},
			},
		])
		tray.setContextMenu(contextMenu)
	}

	updateTrayMenu()

	tray.on("click", () => {
		if (appState.mainWindow && !appState.mainWindow.isDestroyed()) {
			appState.mainWindow.show()
		}
	})

	return tray
}

/**
 * 设置内容安全策略 (CSP)
 */
function setupContentSecurityPolicy(): void {
	const ses = session.defaultSession

	ses.webRequest.onHeadersReceived((details, callback) => {
		const csp = [
			"default-src 'self'",
			"script-src 'self' 'unsafe-inline' 'unsafe-eval'",
			"style-src 'self' 'unsafe-inline' https://rsms.me",
			"font-src 'self' data: https://rsms.me",
			"connect-src 'self' http://localhost:* ws://localhost:*",
			"img-src 'self' data: blob: https:",
			"media-src 'self' https:",
		].join("; ")

		const responseHeaders = { ...details.responseHeaders }
		delete responseHeaders["content-security-policy"]

		callback({
			responseHeaders: {
				...responseHeaders,
				"Content-Security-Policy": [csp],
			},
		})
	})
}

/**
 * 设置窗口关闭行为
 */
function setCloseWindowBehavior(behavior: string): boolean {
	if (behavior === "exit" || behavior === "minimize") {
		appState.closeWindowBehavior = behavior
		return true
	}
	return false
}

/**
 * 处理文件打开请求（防御性二次校验）
 */
function handleFileOpen(filePath: string): void {
	if (!filePath) return

	// 路径归一化 + 目录遍历防护
	const resolved = path.resolve(filePath)
	if (resolved.includes("..")) return

	const fs = require("fs") as typeof import("fs")
	if (!fs.existsSync(resolved)) {
		return
	}

	const supportedExtensions = [".mp3", ".flac", ".wav", ".m4a", ".ogg", ".aac"]
	const ext = path.extname(resolved).toLowerCase()

	if (!supportedExtensions.includes(ext)) {
		return
	}

	if (appState.mainWindow && !appState.mainWindow.isDestroyed()) {
		appState.mainWindow.webContents.send("open-audio-file", resolved)
		appState.mainWindow.show()
		appState.mainWindow.focus()
	} else {
		appState.pendingFileToOpen = resolved
	}
}

/**
 * 解析命令行参数获取文件路径
 */
function getFilePathFromArgs(): string | null {
	const args = process.argv

	for (let i = 1; i < args.length; i++) {
		const arg = args[i]

		if (arg === "." || arg.includes("electron") || arg.includes("main.js") || arg.includes("main.ts")) {
			continue
		}

		if (arg && !arg.startsWith("-")) {
			const supportedExtensions = [".mp3", ".flac", ".wav", ".m4a", ".ogg", ".aac"]
			const ext = path.extname(arg).toLowerCase()

			if (path.isAbsolute(arg) || supportedExtensions.includes(ext)) {
				return arg
			}
		}
	}

	return null
}

/**
 * 从命令行参数中提取文件路径
 */
function getFilePathFromCommandLine(commandLine: string[]): string | null {
	for (let i = 1; i < commandLine.length; i++) {
		const arg = commandLine[i]

		if (arg === "." || arg.includes("electron") || arg.includes("main.js")) {
			continue
		}

		if (arg && !arg.startsWith("-")) {
			const supportedExtensions = [".mp3", ".flac", ".wav", ".m4a", ".ogg", ".aac"]
			const ext = path.extname(arg).toLowerCase()

			if (path.isAbsolute(arg) || supportedExtensions.includes(ext)) {
				return arg
			}
		}
	}

	return null
}

/**
 * 注册IPC处理程序
 */
function registerIpcHandlers(): void {
	ipcMain.handle(CHANNELS.SET_CLOSE_BEHAVIOR, (_event: Electron.IpcMainInvokeEvent, behavior: string) => {
		return setCloseWindowBehavior(behavior)
	})

	ipcMain.handle(CHANNELS.GET_CLOSE_BEHAVIOR, () => {
		return appState.closeWindowBehavior
	})
}

/**
 * 清理资源
 */
function cleanup(): void {
	if (appState.ipcDisposer) {
		appState.ipcDisposer()
		appState.ipcDisposer = null
	}

	ipcMain.removeHandler(CHANNELS.SET_CLOSE_BEHAVIOR)
	ipcMain.removeHandler(CHANNELS.GET_CLOSE_BEHAVIOR)
}

/**
 * 初始化应用
 */
async function initializeApp(): Promise<void> {
	try {
		if (process.env.LLMUSIC_BACKEND_MANAGED) {
			console.log("[Backend] 由 dev-runner 管理，跳过自动启动。")
		} else {
			spawnBackend()
			const backendReady = await waitForBackendReady(backendState.baseUrl)
			if (!backendReady) {
				console.error("后端启动失败，应用可能无法正常使用在线功能。")
			}
		}

		await initDb()
		console.log("数据库已成功初始化。")

		validateSongFiles().catch((err: Error) => {
			console.error("文件验证失败:", err)
		})

		setupContentSecurityPolicy()

		appState.tray = createTray()

		appState.mainWindow = createWindow()

		registerIpcHandlers()

		appState.ipcDisposer = setupIpcHandlers(appState.mainWindow)

		if (appState.pendingFileToOpen) {
			appState.mainWindow.webContents.once("did-finish-load", () => {
				setTimeout(() => {
					appState.mainWindow!.webContents.send(
						"open-audio-file",
						appState.pendingFileToOpen
					)
					appState.pendingFileToOpen = null
				}, 2000)
			})
		}
	} catch (error) {
		console.error("应用初始化失败:", error)
	}
}

// 单实例锁定
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
	app.quit()
} else {
	app.on("second-instance", (_event: Electron.Event, commandLine: string[]) => {
		if (appState.mainWindow) {
			if (appState.mainWindow.isMinimized()) appState.mainWindow.restore()
			appState.mainWindow.focus()
		}

		const filePath = getFilePathFromCommandLine(commandLine)
		if (filePath) {
			handleFileOpen(filePath)
		}
	})

	app.whenReady().then(() => {
		const filePath = getFilePathFromArgs()

		if (filePath) {
			appState.pendingFileToOpen = filePath
		}

		initializeApp()
	})
}

// 应用激活事件（macOS）
app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		appState.mainWindow = createWindow()
	}
})

// 所有窗口关闭事件
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit()
	}
})

// 应用退出前事件
app.on("before-quit", (event: Electron.Event) => {
	if (process.env.LLMUSIC_BACKEND_MANAGED) return
	if (!backendProcess || isWaitingBackendStop) return
	event.preventDefault()
	isWaitingBackendStop = true
	cleanup()
	stopBackend().finally(() => app.quit())
})
