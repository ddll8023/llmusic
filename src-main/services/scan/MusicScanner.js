/**
 * 音乐扫描模块 - 负责扫描本地音乐文件并解析元数据
 * @module musicScanner
 */
const fssync = require("fs");
const path = require("path");
const { Worker } = require("worker_threads");
const {
	addSongs,
	clearSongsByLibrary,
	getLibraryById,
	rebuildIndices,
} = require("../data/Database");

/**
 * 扫描状态管理
 * @type {Object}
 */
const ScanState = {
	// 当前扫描任务的取消标志
	cancelRequested: false,

	// 当前扫描工作线程
	currentWorker: null,

	// 扫描超时计时器
	timeoutTimer: null,

	// 扫描超时时间 (毫秒)
	SCAN_TIMEOUT: 3600000, // 1小时

	/**
	 * 重置扫描状态
	 */
	reset() {
		this.cancelRequested = false;
		this.currentWorker = null;
		this.clearTimeoutTimer();
	},

	/**
	 * 设置扫描超时计时器
	 * @param {Function} onTimeout - 超时回调函数
	 */
	setTimeoutTimer(onTimeout) {
		this.clearTimeoutTimer();
		this.timeoutTimer = setTimeout(() => {
			console.warn("扫描操作超时，自动取消");
			onTimeout();
		}, this.SCAN_TIMEOUT);
	},

	/**
	 * 清除扫描超时计时器
	 */
	clearTimeoutTimer() {
		if (this.timeoutTimer) {
			clearTimeout(this.timeoutTimer);
			this.timeoutTimer = null;
		}
	},
};

/**
 * 安全终止工作线程
 * @param {Worker} worker - 工作线程实例
 * @param {number} [timeout=1000] - 等待超时时间(毫秒)
 * @returns {Promise<void>}
 */
async function safeTerminateWorker(worker, timeout = 1000) {
	if (!worker) return;

	try {
		// 尝试发送取消信号
		worker.postMessage({ type: "cancel" });

		// 给工作线程一些时间来优雅地退出
		await new Promise((resolve) => setTimeout(resolve, timeout));

		// 如果工作线程仍在运行，强制终止
		if (worker.threadId) {
			worker.terminate();
		}
	} catch (error) {
		console.error("终止工作线程时出错:", error);
	}
}

/**
 * 扫描音乐文件
 * @param {string} libraryId - 要扫描的音乐库ID
 * @param {boolean} [clearExisting=false] - 是否清除现有歌曲
 * @param {Function} [progressCallback=()=>{}] - 进度回调函数
 * @returns {Promise<Object>} 扫描结果
 */
async function scanMusic(
	libraryId,
	clearExisting = false,
	progressCallback = () => {}
) {
	// 参数验证
	if (!libraryId || typeof libraryId !== "string") {
		throw new Error("必须提供有效的音乐库ID");
	}

	return new Promise(async (resolve, reject) => {
		try {
			// 获取音乐库信息
			const library = await getLibraryById(libraryId);
			if (!library) {
				return reject(new Error(`未找到ID为 ${libraryId} 的音乐库`));
			}

			const dirPath = library.path;
			if (!dirPath || !fssync.existsSync(dirPath)) {
				return reject(new Error(`音乐库路径 "${dirPath}" 不存在或无法访问`));
			}

			// 如果有正在运行的扫描，先终止它
			await cancelCurrentScan();

			// 重置扫描状态
			ScanState.reset();

			// 设置超时保护
			ScanState.setTimeoutTimer(() => {
				cancelScan();
				reject(new Error("扫描操作超时"));
			});

			// 如果需要清除现有歌曲
			if (clearExisting) {
				await clearSongsByLibrary(libraryId);
				progressCallback({
					phase: "prepare",
					message: "已清除现有歌曲数据，准备开始扫描...",
					processed: 0,
					total: 0,
				});
			}

			// 创建工作线程进行扫描
			ScanState.currentWorker = new Worker(
				path.join(__dirname, "ScannerWorker.js")
			);
			const worker = ScanState.currentWorker;

			// 监听工作线程消息
			worker.on(
				"message",
				handleWorkerMessage(progressCallback, resolve, reject)
			);

			// 监听工作线程错误
			worker.on("error", (error) => {
				const errorMessage = `扫描工作线程发生严重错误: ${error.message}`;
				progressCallback({
					phase: "error",
					message: errorMessage,
				});

				ScanState.clearTimeoutTimer();
				ScanState.currentWorker = null;
				reject(error);
			});

			// 监听工作线程退出
			worker.on("exit", (code) => {
				// 如果不是正常退出且没有被取消，则报告错误
				if (code !== 0 && !ScanState.cancelRequested) {
					const errorMessage = `工作线程以退出码 ${code} 异常退出`;
					progressCallback({
						phase: "error",
						message: errorMessage,
					});

					ScanState.clearTimeoutTimer();
					ScanState.currentWorker = null;
					reject(new Error(errorMessage));
				} else if (ScanState.cancelRequested) {
					console.log("工作线程已成功取消并退出。");
					ScanState.currentWorker = null;
				}
			});

			// 发送开始扫描消息
			worker.postMessage({
				type: "start",
				libraryId,
				dirPath,
				clearExisting,
			});

			progressCallback({
				phase: "start",
				message: `开始扫描音乐库: ${library.name || dirPath}`,
				processed: 0,
				total: 0,
			});
		} catch (error) {
			ScanState.clearTimeoutTimer();
			ScanState.currentWorker = null;
			reject(error);
		}
	});
}

/**
 * 处理工作线程消息的工厂函数
 * @param {Function} progressCallback - 进度回调函数
 * @param {Function} resolve - Promise resolve函数
 * @param {Function} reject - Promise reject函数
 * @returns {Function} 消息处理函数
 */
function handleWorkerMessage(progressCallback, resolve, reject) {
	return async (message) => {
		// 如果已请求取消
		if (ScanState.cancelRequested) {
			if (ScanState.currentWorker) {
				await safeTerminateWorker(ScanState.currentWorker);
				ScanState.currentWorker = null;
			}
			ScanState.clearTimeoutTimer();
			resolve({ success: false, canceled: true });
			return;
		}

		switch (message.type) {
			case "progress":
				// 进度更新
				progressCallback(message.data);
				break;

			case "complete":
				// 扫描完成，开始保存到数据库
				await handleScanComplete(
					message.data,
					progressCallback,
					resolve,
					reject
				);
				break;

			case "error":
				// 扫描错误
				const errorMessage = `扫描工作线程报告错误: ${message.data.message}`;
				progressCallback({
					phase: "error",
					message: errorMessage,
				});

				ScanState.clearTimeoutTimer();
				ScanState.currentWorker = null;
				reject(new Error(errorMessage));
				break;

			default:
				console.warn(`收到未知类型的工作线程消息: ${message.type}`);
		}
	};
}

/**
 * 处理扫描完成后的数据保存
 * @param {Object} data - 扫描结果数据
 * @param {Function} progressCallback - 进度回调函数
 * @param {Function} resolve - Promise resolve函数
 * @param {Function} reject - Promise reject函数
 */
async function handleScanComplete(data, progressCallback, resolve, reject) {
	const songs = data.songs;

	if (!Array.isArray(songs)) {
		const errorMessage = "扫描结果无效: 未返回歌曲数组";
		progressCallback({
			phase: "error",
			message: errorMessage,
		});

		ScanState.clearTimeoutTimer();
		ScanState.currentWorker = null;
		reject(new Error(errorMessage));
		return;
	}

	progressCallback({
		phase: "saving_to_db",
		message: `正在保存 ${songs.length} 首歌曲到数据库...`,
		processed: 0,
		total: songs.length,
	});

	try {
		// 带有进度回调的批量添加
		await addSongs(songs, ({ processed, total }) => {
			progressCallback({
				phase: "saving_to_db",
				message: `正在保存到数据库... ${processed}/${total}`,
				processed,
				total,
			});
		});

		// 保存完成后，发送最终的完成消息
		progressCallback({
			phase: "complete",
			message: `扫描完成，找到并保存了 ${songs.length} 首歌曲`,
			processed: songs.length,
			total: songs.length,
		});

		// 确保扫描完成后重建索引
		try {
			rebuildIndices();
			console.log("扫描完成后已重建索引");
		} catch (error) {
			console.error("扫描后重建索引失败:", error);
		}

		ScanState.clearTimeoutTimer();
		ScanState.currentWorker = null;
		resolve({
			success: true,
			count: songs.length,
		});
	} catch (error) {
		const errorMessage = `添加歌曲到数据库时出错: ${error.message}`;
		progressCallback({
			phase: "error",
			message: errorMessage,
		});

		ScanState.clearTimeoutTimer();
		ScanState.currentWorker = null;
		reject(new Error(errorMessage));
	}
}

/**
 * 取消当前扫描任务
 * @returns {Promise<boolean>} 是否成功请求取消
 */
async function cancelScan() {
	if (!ScanState.currentWorker) {
		console.log("没有正在进行的扫描任务可以取消。");
		return false;
	}

	console.log("请求取消扫描...");
	ScanState.cancelRequested = true;

	// 向工作线程发送消息，请求优雅地停止
	ScanState.currentWorker.postMessage({ type: "cancel" });

	// 设置一个超时，确保工作线程会被终止
	setTimeout(async () => {
		if (ScanState.currentWorker && ScanState.cancelRequested) {
			await safeTerminateWorker(ScanState.currentWorker);
			ScanState.currentWorker = null;
			console.log("已强制终止扫描工作线程");
		}
	}, 3000);

	return true;
}

/**
 * 取消当前正在进行的扫描任务(如果有)
 * @returns {Promise<void>}
 */
async function cancelCurrentScan() {
	if (ScanState.currentWorker) {
		console.log("发现正在进行的扫描任务，正在取消...");
		await cancelScan();

		// 等待一段时间确保工作线程被终止
		await new Promise((resolve) => setTimeout(resolve, 1500));
	}
}

module.exports = {
	scanMusic,
	cancelScan,
};
