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
	protocol,
	session,
	shell,
	dialog,
} from "electron"
import path from "path"
import fs from "fs"
import http from "http"
import { spawn, type ChildProcess } from "child_process"
import { initDb, validateSongFiles } from "./handlers/data/Database"
import { closeDb } from "./handlers/data/db"
import { setupIpcHandlers } from "./handlers"
import { terminateScan } from "./handlers/scan/MusicScanner"
import { registerAudioProtocol } from "./handlers/system/audioProtocol"
import { CHANNELS } from "./constants/ipcChannels"
import { SUPPORTED_AUDIO_EXTENSIONS } from "./constants/formats"
import { BACKEND_HOST, BACKEND_PORT } from "./constants/backend"
import type { BackendState, AppState } from "./types"

// 全局异常兜底：仅记录日志，不主动退出
process.on("uncaughtException", (err: Error) => {
	console.error("[Main] uncaughtException:", err)
})
process.on("unhandledRejection", (reason: unknown) => {
	console.error("[Main] unhandledRejection:", reason)
})

// llmusic:// 音频流协议：特权声明必须在 app ready 之前完成
protocol.registerSchemesAsPrivileged([
	{
		scheme: "llmusic",
		privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, bypassCSP: true },
	},
])

// 仓库根目录：编译产物位于 sys_electron/dist-ts/ 下，需上溯两级才是仓库根
const REPO_ROOT = path.resolve(__dirname, "..", "..")


// 后端进程状态
let backendProcess: ChildProcess | null = null
let isWaitingBackendStop = false
// 是否正在退出应用（darwin 上用于区分"关窗口隐藏"与"真正退出"）
let isQuitting = false

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
 * 获取后端可执行文件路径（win32 / darwin / linux）
 */
function getBackendExecutable(): string {
	if (app.isPackaged) {
		const executableName = process.platform === "win32" ? "backend.exe" : "backend"
		return path.join(process.resourcesPath, "backend", executableName)
	}
	const venvPython =
		process.platform === "win32"
			? path.join("Scripts", "python.exe")
			: path.join("bin", "python")
	return path.join(REPO_ROOT, "backend", ".venv", venvPython)
}

/**
 * 启动后端子进程
 */
function spawnBackend(): void {
	const backendRoot = path.join(REPO_ROOT, "backend")
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
		// macOS 惯例：关闭窗口仅隐藏，进程与播放/扫描状态保持存活（Cmd+Q 才真正退出）
		if (process.platform === "darwin" && !isQuitting) {
			event.preventDefault()
			mainWindow.hide()
			return
		}
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
		}
	})

	if (app.isPackaged) {
		mainWindow.loadFile(
			path.join(process.resourcesPath, "sys_vue", "dist", "index.html")
		)
	} else {
		mainWindow.loadURL("http://localhost:9753")
	}

	if (!app.isPackaged) {
		mainWindow.webContents.openDevTools()
	}

	return mainWindow
}

/**
 * 创建系统托盘图标及菜单
 */
function createTray(): Tray {
	// 打包后托盘图标由 extraResources 复制到 resources/assets 下
	const iconPath = app.isPackaged
		? path.join(process.resourcesPath, "assets", "tray-icon.png")
		: path.join(REPO_ROOT, "sys_vue", "src", "assets", "tray-icon.png")
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

	// 路径归一化
	const resolved = path.resolve(filePath)

	if (!fs.existsSync(resolved)) {
		return
	}

	const ext = path.extname(resolved).toLowerCase()
	if (!SUPPORTED_AUDIO_EXTENSIONS.includes(ext)) {
		return
	}

	if (appState.mainWindow && !appState.mainWindow.isDestroyed()) {
		appState.mainWindow.webContents.send(CHANNELS.OPEN_AUDIO_FILE, resolved)
		appState.mainWindow.show()
		appState.mainWindow.focus()
	} else {
		appState.pendingFileToOpen = resolved
	}
}

/**
 * 从命令行参数中提取音频文件路径（启动参数与 second-instance 共用）
 */
function extractAudioFilePath(args: string[]): string | null {
	for (let i = 1; i < args.length; i++) {
		const arg = args[i]

		if (arg === "." || arg.includes("electron") || arg.includes("main.js") || arg.includes("main.ts")) {
			continue
		}

		if (arg && !arg.startsWith("-")) {
			const ext = path.extname(arg).toLowerCase()

			if (path.isAbsolute(arg) || SUPPORTED_AUDIO_EXTENSIONS.includes(ext)) {
				return arg
			}
		}
	}

	return null
}

// cleanup 防重入标记：任何退出路径只执行一次清理
let cleanupDone = false

/**
 * 清理资源（IPC 卸载、扫描 Worker 终止、托盘销毁、数据库关闭）
 * 幂等：任何退出路径都可安全调用
 */
function cleanup(): void {
	if (cleanupDone) return
	cleanupDone = true

	if (appState.ipcDisposer) {
		try {
			appState.ipcDisposer()
		} catch (error) {
			console.error("[Main] IPC 卸载失败:", error)
		}
		appState.ipcDisposer = null
	}

	// 扫描 Worker 兜底终止（IPC disposer 之外的双保险，幂等）
	void terminateScan()

	if (appState.tray) {
		try {
			appState.tray.destroy()
		} catch (error) {
			console.error("[Main] 托盘销毁失败:", error)
		}
		appState.tray = null
	}

	try {
		closeDb()
	} catch (error) {
		console.error("[Main] 数据库关闭失败:", error)
	}
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

		registerAudioProtocol()

		validateSongFiles().catch((err: Error) => {
			console.error("文件验证失败:", err)
		})

		appState.tray = createTray()

		appState.mainWindow = createWindow()

		appState.ipcDisposer = setupIpcHandlers(appState.mainWindow, {
			get: () => appState.closeWindowBehavior,
			set: setCloseWindowBehavior,
		})

		if (appState.pendingFileToOpen) {
			appState.mainWindow.webContents.once("did-finish-load", () => {
				setTimeout(() => {
					appState.mainWindow!.webContents.send(
						CHANNELS.OPEN_AUDIO_FILE,
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
		if (appState.mainWindow && !appState.mainWindow.isDestroyed()) {
			if (appState.mainWindow.isMinimized()) appState.mainWindow.restore()
			appState.mainWindow.show()
			appState.mainWindow.focus()
		}

		const filePath = extractAudioFilePath(commandLine)
		if (filePath) {
			handleFileOpen(filePath)
		}
	})

	app.whenReady().then(() => {
		const filePath = extractAudioFilePath(process.argv)

		if (filePath) {
			appState.pendingFileToOpen = filePath
		}

		initializeApp()
	})
}

/**
 * 重建主窗口（macOS activate）：
 * 先 dispose 持有旧 window 引用的 IPC handlers，再创建新窗口并重新注册
 */
function recreateWindow(): void {
	if (appState.ipcDisposer) {
		try {
			appState.ipcDisposer()
		} catch (error) {
			console.error("[Main] IPC 卸载失败:", error)
		}
		appState.ipcDisposer = null
	}

	appState.mainWindow = createWindow()

	appState.ipcDisposer = setupIpcHandlers(appState.mainWindow, {
		get: () => appState.closeWindowBehavior,
		set: setCloseWindowBehavior,
	})
}

// 应用激活事件（macOS）：窗口存活（含隐藏态）直接显示，销毁时才重建
app.on("activate", () => {
	if (appState.mainWindow && !appState.mainWindow.isDestroyed()) {
		appState.mainWindow.show()
		return
	}
	recreateWindow()
})

// 所有窗口关闭事件
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit()
	}
})

// 应用退出前事件：
// cleanup 型工作（IPC 卸载、扫描 Worker 终止、托盘销毁、数据库关闭）在任何退出路径都执行一次；
// 仅"等待后端子进程退出"保留 preventDefault + 异步 quit 的模式
app.on("before-quit", (event: Electron.Event) => {
	isQuitting = true
	cleanup()

	const backendManaged = !!process.env.LLMUSIC_BACKEND_MANAGED
	if (!backendManaged && backendProcess && !isWaitingBackendStop) {
		event.preventDefault()
		isWaitingBackendStop = true
		stopBackend().finally(() => app.quit())
	}
})
