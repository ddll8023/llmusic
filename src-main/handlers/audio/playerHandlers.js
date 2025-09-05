const { CHANNELS } = require("../../constants/ipcChannels");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const ffprobePath = require("ffprobe-static").path;
const { EventEmitter } = require("events");
const path = require("path");
const { AUDIO_CONFIG } = require("../../constants/config");
const { AUDIO_ERRORS, createError } = require("../../constants/errors");

// 修正打包后的二进制文件路径
const correctedFfmpegPath = ffmpegPath.replace("app.asar", "app.asar.unpacked");
const correctedFfprobePath = ffprobePath.replace(
	"app.asar",
	"app.asar.unpacked"
);

// 设置ffmpeg路径
ffmpeg.setFfmpegPath(correctedFfmpegPath);
ffmpeg.setFfprobePath(correctedFfprobePath);

// 使用配置常量中的定义
const ProcessingState = AUDIO_CONFIG.PROCESSING_STATES;
const ErrorType = AUDIO_ERRORS;
const DEFAULT_PROCESSING_OPTIONS = AUDIO_CONFIG.DEFAULT_OPTIONS;

/**
 * 音频处理服务类
 * 提供音频文件处理、转换和元数据提取功能
 */
class AudioProcessor extends EventEmitter {
	/**
	 * 创建音频处理器实例
	 * @param {Object} options 全局配置选项
	 */
	constructor(options = {}) {
		super();
		this.currentProcess = null;
		this.state = ProcessingState.IDLE;
		this.filePath = null;
		this.duration = 0;
		this.processingTimeout = null;

		// 合并默认选项和用户选项
		this.options = { ...DEFAULT_PROCESSING_OPTIONS, ...options };

		// 绑定方法以保持正确的 this 上下文
		this.handleCancel = this.handleCancel.bind(this);
		this.processAudio = this.processAudio.bind(this);
		this.cancelProcessing = this.cancelProcessing.bind(this);
		this.getStatus = this.getStatus.bind(this);
	}

	/**
	 * 处理音频文件
	 * @param {string} filePath 文件路径
	 * @param {Object} options 处理选项
	 * @returns {Promise<Buffer>} 处理结果Promise，返回音频数据Buffer
	 */
	processAudio(filePath, options = {}) {
		// 如果已经在处理中，拒绝新请求
		if (this.state === ProcessingState.PROCESSING) {
			return Promise.reject(
				createError("已有处理任务正在进行中", ErrorType.ALREADY_PROCESSING)
			);
		}

		// 合并默认选项和调用时的选项
		const processingOptions = { ...this.options, ...options };

		return new Promise(async (resolve, reject) => {
			try {
				// 清理之前的状态
				this.cleanup();

				// 设置处理超时
				if (processingOptions.timeout > 0) {
					this.processingTimeout = setTimeout(() => {
						this.cancelProcessing();
						reject(
							createError(
								`处理超时 (${processingOptions.timeout}ms)`,
								ErrorType.TIMEOUT
							)
						);
					}, processingOptions.timeout);
				}

				// 直接设置状态
				this.state = ProcessingState.PROCESSING;
				this.filePath = filePath;
				this.duration = 0;

				const startPosition = options.position || 0;

				// 处理音频
				const chunks = [];
				let totalSize = 0;

				this.currentProcess = ffmpeg(filePath)
					.seekInput(startPosition)
					.noVideo()
					.audioCodec(processingOptions.audioCodec)
					.audioChannels(processingOptions.audioChannels)
					.audioFrequency(processingOptions.audioFrequency)
					.format(processingOptions.format)
					.on("error", (err) => {
						this.cleanup();

						if (err.message.includes("SIGKILL")) {
							this.state = ProcessingState.ERROR;
							reject(createError("处理已取消", ErrorType.UNKNOWN_ERROR));
						} else {
							console.error("音频处理错误:", err.message);
							this.state = ProcessingState.ERROR;
							reject(
								createError(
									`音频处理错误: ${err.message}`,
									ErrorType.PROCESSING_ERROR
								)
							);
						}
					})
					.on("end", () => {
						this.cleanup();

						console.log("音频处理完成");
						const buffer = Buffer.concat(chunks, totalSize);
						this.state = ProcessingState.COMPLETED;

						this.emit("processing:complete", {
							filePath: this.filePath,
							duration: this.duration,
							bufferSize: buffer.length,
						});

						resolve(buffer);
					});

				const stream = this.currentProcess.pipe();
				stream.on("data", (chunk) => {
					chunks.push(chunk);
					totalSize += chunk.length;
				});
			} catch (error) {
				this.cleanup();
				this.state = ProcessingState.ERROR;

				// 确保错误对象有正确的代码
				if (!error.code) {
					error.code = ErrorType.UNKNOWN_ERROR;
				}

				this.emit("error", error);
				reject(error);
			}
		});
	}

	/**
	 * 清理资源
	 * @private
	 */
	cleanup() {
		// 清除超时定时器
		if (this.processingTimeout) {
			clearTimeout(this.processingTimeout);
			this.processingTimeout = null;
		}
	}

	/**
	 * 取消当前处理任务
	 * @returns {Promise<Object>} 取消结果Promise
	 */
	cancelProcessing() {
		return new Promise((resolve) => {
			if (this.currentProcess && this.state === ProcessingState.PROCESSING) {
				this.currentProcess.kill("SIGKILL");
				this.handleCancel();
				resolve({ cancelled: true, message: "处理已取消" });
			} else {
				resolve({ cancelled: false, message: "没有正在进行的处理任务" });
			}
		});
	}

	/**
	 * 获取处理状态
	 * @returns {Object} 处理状态
	 */
	getStatus() {
		return {
			state: this.state,
			filePath: this.filePath,
			duration: this.duration,
		};
	}

	/**
	 * 内部取消处理
	 * @private
	 */
	handleCancel() {
		this.cleanup();
		this.state = ProcessingState.ERROR;
		this.currentProcess = null;
	}
}

// 创建单例实例
const audioProcessor = new AudioProcessor();

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
