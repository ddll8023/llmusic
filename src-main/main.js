/**
 * LLMusic 本地音乐播放器 - 主进程入口
 * 负责应用生命周期管理、窗口创建、托盘集成和IPC通信设置
 */
const {
	app,
	BrowserWindow,
	Menu,
	Tray,
	nativeImage,
	ipcMain,
	session,
} = require("electron");
const path = require("path");
const { initDb, validateSongFiles } = require("./handlers/data/Database");
const { setupIpcHandlers } = require("./handlers");
const { CHANNELS } = require("./constants/ipcChannels");

// 应用全局状态
const appState = {
	mainWindow: null,
	tray: null,
	closeWindowBehavior: "exit", // 'exit' 或 'minimize'
	ipcDisposer: null,
	pendingFileToOpen: null, // 待打开的文件路径
};

/**
 * 创建并配置主窗口
 * @returns {BrowserWindow} 创建的窗口实例
 */
function createWindow() {
	// 移除菜单栏
	Menu.setApplicationMenu(null);

	// 创建窗口
	const mainWindow = new BrowserWindow({
		width: 1200,
		height: 800,
		minWidth: 1000,
		minHeight: 700,
		frame: false, // 使用自定义标题栏
		backgroundColor: "#121212", // 防止白屏闪烁
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			nodeIntegration: false,
			contextIsolation: true,
		},
	});

	// 设置窗口关闭事件处理
	mainWindow.on("close", (event) => {
		if (appState.closeWindowBehavior === "minimize" && mainWindow) {
			event.preventDefault();
			mainWindow.hide();

			// 显示通知气泡（仅Windows平台）
			if (process.platform === "win32" && appState.tray) {
				appState.tray.displayBalloon({
					title: "LLMusic 已最小化",
					content: "应用程序正在后台运行，点击托盘图标恢复。",
					iconType: "info",
				});
			}
			return false;
		}
		// 默认行为：退出应用
	});

	// 加载页面
	if (app.isPackaged) {
		// 生产环境，加载打包后的文件
		mainWindow.loadFile(
			path.join(__dirname, "../src-renderer/dist/index.html")
		);
	} else {
		// 开发环境，加载 Vite 开发服务器
		mainWindow.loadURL("http://localhost:5173"); // Vite 默认端口
	}

	// 开发环境打开开发者工具
	mainWindow.webContents.openDevTools();

	return mainWindow;
}

/**
 * 创建系统托盘图标及菜单
 * @returns {Tray} 创建的托盘实例
 */
function createTray() {
	// 创建托盘图标
	const iconPath = path.join(__dirname, "../src-renderer/assets/tray-icon.png");
	const icon = nativeImage
		.createFromPath(iconPath)
		.resize({ width: 16, height: 16 });

	const tray = new Tray(icon);
	tray.setToolTip("LLMusic 本地音乐播放器");

	// 创建托盘菜单
	const updateTrayMenu = () => {
		const contextMenu = Menu.buildFromTemplate([
			{
				label: "显示主界面",
				click: () => {
					if (appState.mainWindow && !appState.mainWindow.isDestroyed()) {
						appState.mainWindow.show();
					}
				},
			},
			{ type: "separator" },
			{
				label: "退出",
				click: () => {
					app.quit();
				},
			},
		]);
		tray.setContextMenu(contextMenu);
	};

	// 初始化菜单
	updateTrayMenu();

	// 点击托盘图标显示主界面
	tray.on("click", () => {
		if (appState.mainWindow && !appState.mainWindow.isDestroyed()) {
			appState.mainWindow.show();
		}
	});

	return tray;
}

/**
 * 设置内容安全策略 (CSP)
 */
function setupContentSecurityPolicy() {
	const ses = session.defaultSession;

	ses.webRequest.onHeadersReceived((details, callback) => {
		// 构建CSP策略
		const csp = [
			"default-src 'self'",
			"script-src 'self' 'unsafe-inline' 'unsafe-eval'",
			"style-src 'self' 'unsafe-inline' https://rsms.me",
			"font-src 'self' data: https://rsms.me",
			"connect-src 'self' http://localhost:* ws://localhost:*",
			"img-src 'self' data: blob:",
		].join("; ");

		// 移除已有的CSP头并添加新的
		const responseHeaders = { ...details.responseHeaders };
		delete responseHeaders["content-security-policy"];

		callback({
			responseHeaders: {
				...responseHeaders,
				"Content-Security-Policy": [csp],
			},
		});
	});
}

/**
 * 设置窗口关闭行为
 * @param {string} behavior - 'exit' 或 'minimize'
 * @returns {boolean} 设置是否成功
 */
function setCloseWindowBehavior(behavior) {
	if (behavior === "exit" || behavior === "minimize") {
		appState.closeWindowBehavior = behavior;
		return true;
	}
	return false;
}

/**
 * 处理文件打开请求
 * @param {string} filePath - 要打开的文件路径
 */
function handleFileOpen(filePath) {
	if (!filePath) return;

	// 检查文件是否存在
	const fs = require("fs");
	if (!fs.existsSync(filePath)) {
		return;
	}

	// 检查文件是否为支持的音频格式
	const supportedExtensions = [".mp3", ".flac", ".wav", ".m4a", ".ogg", ".aac"];
	const ext = path.extname(filePath).toLowerCase();

	if (!supportedExtensions.includes(ext)) {
		return;
	}

	if (appState.mainWindow && !appState.mainWindow.isDestroyed()) {
		// 窗口已存在，直接发送文件路径
		appState.mainWindow.webContents.send("open-audio-file", filePath);
		appState.mainWindow.show();
		appState.mainWindow.focus();
	} else {
		// 窗口不存在，保存文件路径待窗口创建后处理
		appState.pendingFileToOpen = filePath;
	}
}

/**
 * 解析命令行参数获取文件路径
 * @returns {string|null} 文件路径或null
 */
function getFilePathFromArgs() {
	const args = process.argv;

	// 在打包后的应用中，文件路径通常是最后一个参数
	// 开发环境: electron . [file]
	// 生产环境: app.exe [file]
	for (let i = 1; i < args.length; i++) {
		const arg = args[i];

		// 跳过electron相关参数
		if (arg === "." || arg.includes("electron") || arg.includes("main.js")) {
			continue;
		}

		// 检查是否为文件路径
		if (arg && !arg.startsWith("-")) {
			// 对于Windows，也检查相对路径或者包含文件扩展名的路径
			const supportedExtensions = [
				".mp3",
				".flac",
				".wav",
				".m4a",
				".ogg",
				".aac",
			];
			const ext = path.extname(arg).toLowerCase();

			if (path.isAbsolute(arg) || supportedExtensions.includes(ext)) {
				return arg;
			}
		}
	}

	return null;
}

/**
 * 注册IPC处理程序
 */
function registerIpcHandlers() {
	// 处理窗口关闭行为设置
	ipcMain.handle(CHANNELS.SET_CLOSE_BEHAVIOR, (event, behavior) => {
		return setCloseWindowBehavior(behavior);
	});

	// 获取当前窗口关闭行为
	ipcMain.handle(CHANNELS.GET_CLOSE_BEHAVIOR, () => {
		return appState.closeWindowBehavior;
	});
}

/**
 * 清理资源
 */
function cleanup() {
	// 清理IPC处理程序
	if (appState.ipcDisposer) {
		appState.ipcDisposer();
		appState.ipcDisposer = null;
	}

	// 移除自定义IPC处理程序
	ipcMain.removeHandler(CHANNELS.SET_CLOSE_BEHAVIOR);
	ipcMain.removeHandler(CHANNELS.GET_CLOSE_BEHAVIOR);
}

/**
 * 初始化应用
 */
async function initializeApp() {
	try {
		// 初始化数据库
		await initDb();
		console.log("数据库已成功初始化。");

		// 在后台启动文件验证，不阻塞主流程
		validateSongFiles().catch((err) => {
			console.error("文件验证失败:", err);
		});

		// 设置内容安全策略
		setupContentSecurityPolicy();

		// 创建托盘图标
		appState.tray = createTray();

		// 创建主窗口
		appState.mainWindow = createWindow();

		// 注册自定义IPC处理程序
		registerIpcHandlers();

		// 设置主进程IPC处理程序
		appState.ipcDisposer = setupIpcHandlers(appState.mainWindow);

		// 处理待打开的文件
		if (appState.pendingFileToOpen) {
			// 等待窗口完全加载后再发送文件
			appState.mainWindow.webContents.once("did-finish-load", () => {
				setTimeout(() => {
					appState.mainWindow.webContents.send(
						"open-audio-file",
						appState.pendingFileToOpen
					);
					appState.pendingFileToOpen = null;
				}, 2000); // 延迟2秒确保渲染进程完全准备好
			});
		}
	} catch (error) {
		console.error("应用初始化失败:", error);
		// 在生产环境可以显示错误对话框
	}
}

// 单实例锁定
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
	// 如果获取锁失败，说明已有实例运行，退出当前实例
	app.quit();
} else {
	// 处理第二个实例尝试启动的情况
	app.on("second-instance", (event, commandLine, workingDirectory) => {
		// 有人试图运行第二个实例，我们应该聚焦到我们的窗口
		if (appState.mainWindow) {
			if (appState.mainWindow.isMinimized()) appState.mainWindow.restore();
			appState.mainWindow.focus();
		}

		// 检查是否有文件要打开
		const filePath = getFilePathFromCommandLine(commandLine);
		if (filePath) {
			handleFileOpen(filePath);
		}
	});

	// 应用启动事件
	app.whenReady().then(() => {
		// 检查启动时是否有文件要打开
		const filePath = getFilePathFromArgs();

		if (filePath) {
			appState.pendingFileToOpen = filePath;
		}

		initializeApp();
	});
}

/**
 * 从命令行参数中提取文件路径
 * @param {string[]} commandLine - 命令行参数数组
 * @returns {string|null} 文件路径或null
 */
function getFilePathFromCommandLine(commandLine) {
	for (let i = 1; i < commandLine.length; i++) {
		const arg = commandLine[i];

		// 跳过electron相关参数
		if (arg === "." || arg.includes("electron") || arg.includes("main.js")) {
			continue;
		}

		// 检查是否为文件路径
		if (arg && !arg.startsWith("-")) {
			// 对于Windows，也检查相对路径或者包含文件扩展名的路径
			const supportedExtensions = [
				".mp3",
				".flac",
				".wav",
				".m4a",
				".ogg",
				".aac",
			];
			const ext = path.extname(arg).toLowerCase();

			if (path.isAbsolute(arg) || supportedExtensions.includes(ext)) {
				return arg;
			}
		}
	}

	return null;
}

// 应用激活事件（macOS）
app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		appState.mainWindow = createWindow();
	}
});

// 所有窗口关闭事件
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

// 应用退出前事件
app.on("before-quit", () => {
	cleanup();
});
