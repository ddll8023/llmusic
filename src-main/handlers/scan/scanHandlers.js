const { scanMusic, cancelScan } = require("../../services/scan/MusicScanner");
const { CHANNELS } = require("../../constants/ipcChannels");
const throttle = require("../../utils/async/throttle");

// 扫描状态
let _isScanActive = false;
let _lastProgressTime = 0;
const PROGRESS_THROTTLE_MS = 100; // 节流间隔

/**
 * 提供外部读取扫描状态
 */
function isScanRunning() {
	return _isScanActive;
}

/**
 * 创建扫描相关 IPC 处理程序
 * @param {Electron.BrowserWindow} mainWindow
 */
function createScanHandlers(mainWindow) {
	/**
	 * 向渲染进程推送进度（带节流）
	 * @param {*} progress
	 */
	const pushProgress = throttle((progress) => {
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send(CHANNELS.SCAN_PROGRESS, progress);
		}
	}, PROGRESS_THROTTLE_MS);

	const handlers = [
		{
			channel: CHANNELS.SCAN_MUSIC_START,
			handler: async (event, { libraryId, clearExisting = false }) => {
				if (_isScanActive) {
					return { success: false, error: "已有扫描任务正在进行中" };
				}
				if (!libraryId) {
					return { success: false, error: "未提供有效的 libraryId" };
				}
				_isScanActive = true;
				try {
					const result = await scanMusic(
						libraryId,
						clearExisting,
						(progress) => {
							const now = Date.now();
							const isFinal = ["complete", "error", "canceled"].includes(
								progress.phase
							);
							if (isFinal || now - _lastProgressTime >= PROGRESS_THROTTLE_MS) {
								_lastProgressTime = now;
								pushProgress(progress);
							}
						}
					);
					return result; // result 应当包含 success 字段
				} catch (err) {
					pushProgress({ phase: "error", message: err.message || "扫描失败" });
					return { success: false, error: err.message };
				} finally {
					_isScanActive = false;
				}
			},
		},
		{
			channel: CHANNELS.SCAN_MUSIC_CANCEL,
			handler: async () => {
				if (!_isScanActive) {
					// 仍向 UI 推送取消事件防止卡 UI
					pushProgress({ phase: "canceled", message: "扫描已取消" });
					return { success: true, message: "无扫描任务" };
				}
				try {
					const ok = cancelScan();
					return ok
						? { success: true, message: "取消请求已发送" }
						: { success: false, error: "无法取消扫描" };
				} catch (err) {
					return { success: false, error: err.message };
				}
			},
		},
	];

	// 无需要额外 cleanup，此模块无事件监听
	return { handlers, cleanup: () => {} };
}

module.exports = {
	createScanHandlers,
	isScanRunning,
};
