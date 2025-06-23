/**
 * 主进程音频处理服务
 *
 * 该模块提供音频文件处理功能，包括：
 * - 音频文件格式验证
 * - 音频元数据提取
 * - 音频转换处理（使用ffmpeg）
 * - 错误处理和状态管理
 *
 * 注意：实际的音频播放逻辑已移至渲染进程，使用Web Audio API实现
 */

const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const ffprobePath = require("ffprobe-static").path;
const { EventEmitter } = require("events");
const path = require("path");
const fs = require("fs");
const os = require("os");

// 修正打包后的二进制文件路径
const correctedFfmpegPath = ffmpegPath.replace("app.asar", "app.asar.unpacked");
const correctedFfprobePath = ffprobePath.replace(
	"app.asar",
	"app.asar.unpacked"
);

// 设置ffmpeg路径
ffmpeg.setFfmpegPath(correctedFfmpegPath);
ffmpeg.setFfprobePath(correctedFfprobePath);

// 处理状态枚举
const ProcessingState = {
	IDLE: "idle",
	PROCESSING: "processing",
	COMPLETED: "completed",
	ERROR: "error",
	CANCELLED: "cancelled",
};

// 错误类型枚举
const ErrorType = {
	FILE_NOT_FOUND: "file_not_found",
	INVALID_FORMAT: "invalid_format",
	PROCESSING_ERROR: "processing_error",
	NO_AUDIO_STREAM: "no_audio_stream",
	PERMISSION_DENIED: "permission_denied",
	ALREADY_PROCESSING: "already_processing",
	MEMORY_ERROR: "memory_error",
	TIMEOUT: "timeout",
	UNKNOWN_ERROR: "unknown_error",
};

// 默认处理配置
const DEFAULT_PROCESSING_OPTIONS = {
	audioCodec: "pcm_s16le", // 标准PCM编码
	audioChannels: 2, // 立体声
	audioFrequency: 44100, // CD质量
	format: "wav", // 输出格式
	chunkSize: 1024 * 1024, // 1MB 块大小，用于流处理
	maxBufferSize: 100 * 1024 * 1024, // 100MB 最大缓冲区大小
	timeout: 60000, // 处理超时时间 (ms)
	logLevel: "info", // 日志级别
};

/**
 * 创建自定义错误对象
 * @param {string} message 错误消息
 * @param {string} code 错误代码
 * @param {Error} originalError 原始错误对象（可选）
 * @returns {Error} 增强的错误对象
 */
function createError(message, code, originalError = null) {
	const error = new Error(message);
	error.code = code;
	if (originalError) {
		error.originalError = originalError;
	}
	return error;
}

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
		this.memoryWatcher = null;

		// 合并默认选项和用户选项
		this.options = { ...DEFAULT_PROCESSING_OPTIONS, ...options };

		// 命令行处理选项
		this.ffmpegOptions = ["-loglevel", this.options.logLevel];

		// 绑定方法以保持正确的 this 上下文
		this.handleCancel = this.handleCancel.bind(this);
		this.processAudio = this.processAudio.bind(this);
		this.cancelProcessing = this.cancelProcessing.bind(this);
		this.getStatus = this.getStatus.bind(this);
	}

	/**
	 * 检查文件是否是支持的音频格式
	 * @param {string} filePath 文件路径
	 * @returns {boolean} 是否支持
	 */
	static isSupportedAudioFormat(filePath) {
		if (!filePath) return false;

		const supportedExtensions = [
			".mp3",
			".wav",
			".flac",
			".ogg",
			".aac",
			".m4a",
			".wma",
			".alac",
			".aiff",
			".ape",
		];

		const ext = path.extname(filePath).toLowerCase();
		return supportedExtensions.includes(ext);
	}

	/**
	 * 验证音频文件
	 * @param {string} filePath 文件路径
	 * @returns {Promise<Object>} 验证结果，包含元数据
	 * @throws {Error} 如果文件无效或不存在
	 */
	async validateAudioFile(filePath) {
		// 验证文件是否存在
		try {
			await fs.promises.access(filePath, fs.constants.R_OK);
		} catch (err) {
			if (err.code === "ENOENT") {
				throw createError(
					`文件不存在: ${filePath}`,
					ErrorType.FILE_NOT_FOUND,
					err
				);
			} else if (err.code === "EACCES") {
				throw createError(
					`无权限访问文件: ${filePath}`,
					ErrorType.PERMISSION_DENIED,
					err
				);
			} else {
				throw createError(
					`访问文件时出错: ${filePath}`,
					ErrorType.UNKNOWN_ERROR,
					err
				);
			}
		}

		// 验证文件格式
		if (!AudioProcessor.isSupportedAudioFormat(filePath)) {
			throw createError(
				`不支持的音频格式: ${path.extname(filePath)}`,
				ErrorType.INVALID_FORMAT
			);
		}

		// 获取文件元数据
		return new Promise((resolve, reject) => {
			ffmpeg.ffprobe(filePath, (err, metadata) => {
				if (err) {
					reject(
						createError(
							`音频文件解析失败: ${err.message}`,
							ErrorType.PROCESSING_ERROR,
							err
						)
					);
					return;
				}

				// 查找音频流
				const audioStream = metadata.streams.find(
					(s) => s.codec_type === "audio"
				);
				if (!audioStream) {
					reject(createError("文件中未找到音频流", ErrorType.NO_AUDIO_STREAM));
					return;
				}

				// 获取音频时长
				const duration =
					parseFloat(audioStream.duration) ||
					parseFloat(metadata.format.duration) ||
					0;

				resolve({
					metadata,
					audioStream,
					duration,
					format: path.extname(filePath).substring(1),
					bitrate: audioStream.bit_rate || metadata.format.bit_rate,
					sampleRate: audioStream.sample_rate,
					channels: audioStream.channels,
				});
			});
		});
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

				// 验证文件并获取元数据
				const validationResult = await this.validateAudioFile(filePath);

				// 更新状态
				this.state = ProcessingState.PROCESSING;
				this.filePath = filePath;
				this.duration = validationResult.duration;

				const startPosition = options.position || 0;

				// 发送处理开始事件
				this.emit("processing:start", {
					filePath: this.filePath,
					duration: this.duration,
					format: validationResult.format,
					bitrate: validationResult.bitrate,
					sampleRate: validationResult.sampleRate,
					channels: validationResult.channels,
				});

				// 设置内存监控
				this.setupMemoryWatcher(processingOptions.maxBufferSize);

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
							// 处理被手动取消
							this.state = ProcessingState.CANCELLED;
							reject(createError("处理已取消", "PROCESSING_CANCELLED"));
						} else {
							console.error("音频处理错误:", err.message);
							this.state = ProcessingState.ERROR;
							reject(
								createError(
									`音频处理错误: ${err.message}`,
									ErrorType.PROCESSING_ERROR,
									err
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
					})
					.on("progress", (progress) => {
						// 发送处理进度事件
						this.emit("processing:progress", {
							filePath: this.filePath,
							percent: progress.percent,
							timemark: progress.timemark,
						});
					});

				const stream = this.currentProcess.pipe();
				stream.on("data", (chunk) => {
					chunks.push(chunk);
					totalSize += chunk.length;

					// 检查是否超过最大缓冲区大小
					if (totalSize > processingOptions.maxBufferSize) {
						this.cancelProcessing();
						reject(
							createError(
								`处理数据超过最大缓冲区大小 (${processingOptions.maxBufferSize} 字节)`,
								ErrorType.MEMORY_ERROR
							)
						);
					}
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
	 * 设置内存监控
	 * @param {number} maxBufferSize 最大缓冲区大小
	 * @private
	 */
	setupMemoryWatcher(maxBufferSize) {
		// 清除之前的监控
		if (this.memoryWatcher) {
			clearInterval(this.memoryWatcher);
		}

		// 每秒检查一次内存使用情况
		this.memoryWatcher = setInterval(() => {
			const memoryUsage = process.memoryUsage();
			const usedMemoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
			const totalMemoryMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);

			// 如果堆内存使用率超过80%，取消处理
			if (memoryUsage.heapUsed > memoryUsage.heapTotal * 0.8) {
				console.warn(
					`内存使用过高: ${usedMemoryMB}MB/${totalMemoryMB}MB，取消处理`
				);
				this.cancelProcessing();
				this.emit(
					"error",
					createError(
						`内存使用过高: ${usedMemoryMB}MB/${totalMemoryMB}MB`,
						ErrorType.MEMORY_ERROR
					)
				);
			}
		}, 1000);
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

		// 清除内存监控
		if (this.memoryWatcher) {
			clearInterval(this.memoryWatcher);
			this.memoryWatcher = null;
		}
	}

	/**
	 * 取消当前处理任务
	 * @returns {Promise<Object>} 取消结果Promise
	 */
	cancelProcessing() {
		return new Promise((resolve) => {
			if (this.currentProcess && this.state === ProcessingState.PROCESSING) {
				// 'end' 和 'error' 事件会处理后续逻辑
				this.currentProcess.kill("SIGKILL");
				this.handleCancel();
				resolve({ cancelled: true, message: "处理已取消" });
			} else {
				// 如果没有正在进行的处理，直接返回
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
		this.state = ProcessingState.CANCELLED;
		this.currentProcess = null;
		this.emit("processing:cancelled", { filePath: this.filePath });
	}
}

// 创建单例实例
const audioProcessorInstance = new AudioProcessor();

module.exports = {
	audioProcessor: audioProcessorInstance,
	ProcessingState,
	ErrorType,
	// 导出类以便用户可以创建自己的实例
	AudioProcessor,
};
