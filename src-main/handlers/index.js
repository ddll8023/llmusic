const { registerIPC, unregisterAll } = require("../utils/ipc/ipcWrapper");

// 系统相关处理器
const { createWindowHandlers } = require("./system/windowHandlers");

// 扫描相关处理器
const { createScanHandlers } = require("./scan/scanHandlers");

// 音频相关处理器
const { createSongHandlers } = require("./audio/songHandlers");
const { createCoverHandlers } = require("./audio/coverHandlers");
const { createLyricsHandlers } = require("./audio/lyricsHandlers");
const { createPlayerHandlers } = require("./audio/playerHandlers");

// 数据相关处理器
const { createPlaylistHandlers } = require("./data/playlistHandlers");
const { createLibraryHandlers } = require("./data/libraryHandlers");
const { createTagHandlers } = require("./data/tagHandlers");

/**
 * setupIpcHandlers(mainWindow)
 * 调用后注册所有 IPC 处理，并返回一个 disposer() 便于在应用退出时卸载
 * @param {Electron.BrowserWindow} mainWindow
 */
function setupIpcHandlers(mainWindow) {
	// 收集各模块 handlers
	const modules = [
		// 系统相关
		createWindowHandlers(mainWindow),

		// 扫描相关
		createScanHandlers(mainWindow),

		// 音频相关
		createSongHandlers(),
		createCoverHandlers(),
		createLyricsHandlers(),
		createPlayerHandlers(mainWindow),

		// 数据相关
		createPlaylistHandlers(),
		createLibraryHandlers(),
		createTagHandlers(),
	];

	// 注册
	modules.forEach((m) => {
		m.handlers.forEach(({ channel, handler, options }) => {
			registerIPC(channel, handler, options);
		});
	});

	// 返回卸载函数
	return () => {
		unregisterAll();
		// 调用每个模块的 cleanup
		modules.forEach((m) => m.cleanup && m.cleanup());
	};
}

module.exports = {
	setupIpcHandlers,
};
