const { CHANNELS } = require("../../constants/ipcChannels");
const { audioProcessor } = require("../../services/audio/AudioProcessor");

/**
 * 创建播放控制相关的IPC处理器
 * @param {Electron.BrowserWindow} mainWindow - 主窗口实例
 * @returns {{ handlers: Array<{channel:string, handler:Function}>, cleanup: Function }}
 */
function createPlayerHandlers(mainWindow) {
	// 定义事件处理器函数，以便后续清理
	const processingCompleteHandler = (result) => {
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send(CHANNELS.PLAYER_ENDED, result);
		}
	};

	const processingErrorHandler = (error) => {
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send(CHANNELS.PLAYER_ERROR, {
				message: error.message,
				code: error.code,
			});
		}
	};

	// 注册 audioProcessor 事件监听器
	audioProcessor.on("processing:complete", processingCompleteHandler);
	audioProcessor.on("error", processingErrorHandler);

	const handlers = [
		{
			channel: CHANNELS.PLAYER_PLAY,
			handler: async (event, options) => {
				try {
					const result = await audioProcessor.processAudio(
						options.filePath,
						options
					);
					mainWindow.webContents.send(CHANNELS.PLAYER_AUDIO_DATA, result);
					return { success: true };
				} catch (err) {
					return {
						success: false,
						error: err.message,
						code: err.code || "UNKNOWN_ERROR",
					};
				}
			},
		},
		{
			channel: CHANNELS.PLAYER_STOP,
			handler: () => {
				audioProcessor.cancelProcessing();
				return { success: true };
			},
		},
		{
			channel: CHANNELS.PLAYER_SEEK,
			handler: async (event, { position }) => {
				try {
					if (audioProcessor.filePath) {
						await audioProcessor.cancelProcessing();
						return { success: true, action: "REPROCESS_NEEDED" };
					}
					return { success: false, error: "没有正在处理的音频" };
				} catch (err) {
					return { success: false, error: err.message };
				}
			},
		},
		{
			channel: CHANNELS.PLAYER_GET_STATUS,
			handler: () => {
				try {
					const status = audioProcessor.getStatus();
					return { success: true, ...status };
				} catch (err) {
					return { success: false, error: err.message };
				}
			},
		},
	];

	return {
		handlers,
		cleanup: () => {
			// 清理 audioProcessor 事件监听器，防止内存泄漏
			audioProcessor.removeListener(
				"processing:complete",
				processingCompleteHandler
			);
			audioProcessor.removeListener("error", processingErrorHandler);
		},
	};
}

module.exports = { createPlayerHandlers };
