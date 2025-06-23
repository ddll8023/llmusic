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
const { initDb, validateSongFiles } = require("./database");
const { setupIpcHandlers } = require("./ipcHandlers");
const { CHANNELS } = require("./constants/ipcChannels");

// 应用全局状态
const appState = {
	mainWindow: null,
	tray: null,
	closeWindowBehavior: "exit", // 'exit' 或 'minimize'
	ipcDisposer: null,
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
	mainWindow.loadURL("http://localhost:5173"); // Vite 默认端口

	// 开发环境打开开发者工具
	if (process.env.NODE_ENV !== "production") {
		mainWindow.webContents.openDevTools();
	}

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
 * 注册IPC处理程序
 */
function registerIpcHandlers() {
	// 处理窗口关闭行为设置
	ipcMain.handle(
		CHANNELS.SET_CLOSE_BEHAVIOR || "set-close-behavior",
		(event, behavior) => {
			return setCloseWindowBehavior(behavior);
		}
	);

	// 获取当前窗口关闭行为
	ipcMain.handle(CHANNELS.GET_CLOSE_BEHAVIOR || "get-close-behavior", () => {
		return appState.closeWindowBehavior;
	});

	// 显示窗口
	ipcMain.handle(CHANNELS.SHOW_WINDOW || "show-window", () => {
		if (appState.mainWindow && !appState.mainWindow.isDestroyed()) {
			appState.mainWindow.show();
			return true;
		}
		return false;
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
	ipcMain.removeHandler(CHANNELS.SET_CLOSE_BEHAVIOR || "set-close-behavior");
	ipcMain.removeHandler(CHANNELS.GET_CLOSE_BEHAVIOR || "get-close-behavior");
	ipcMain.removeHandler(CHANNELS.SHOW_WINDOW || "show-window");
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
	} catch (error) {
		console.error("应用初始化失败:", error);
		// 在生产环境可以显示错误对话框
	}
}

// 应用启动事件
app.whenReady().then(initializeApp);

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
