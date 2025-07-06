const { registerIPC, unregisterAll } = require("../utils/ipcWrapper");
const { createWindowHandlers } = require("./windowHandlers");
const { createScanHandlers } = require("./scanHandlers");
const { createSongHandlers } = require("./songHandlers");
const { createPlaylistHandlers } = require("./playlistHandlers");
const { createLibraryHandlers } = require("./libraryHandlers");
const { createTagHandlers } = require("./tagHandlers");

/**
 * setupIpcHandlers(mainWindow)
 * 调用后注册所有 IPC 处理，并返回一个 disposer() 便于在应用退出时卸载
 * @param {Electron.BrowserWindow} mainWindow
 */
function setupIpcHandlers(mainWindow) {
	// 收集各模块 handlers
	const modules = [
		createWindowHandlers(mainWindow),
		createScanHandlers(mainWindow),
		createSongHandlers(mainWindow),
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
