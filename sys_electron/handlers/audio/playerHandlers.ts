import { EventEmitter } from "events"
import path from "path"
import ffmpeg, { type FfmpegCommand } from "fluent-ffmpeg"
import ffmpegPath from "ffmpeg-static"
import ffprobeStatic from "ffprobe-static"
import { CHANNELS } from "../../constants/ipcChannels"
import { AUDIO_CONFIG } from "../../constants/config"
import { AUDIO_ERRORS, createError } from "../../constants/errors"
import type { IpcHandlerModule } from "../../types"
import type { AudioProcessingOptions, ProcessingStatus } from "../../types"

// 修正打包后的二进制文件路径
const correctedFfmpegPath = (ffmpegPath as string).replace("app.asar", "app.asar.unpacked")
const correctedFfprobePath = ffprobeStatic.path.replace("app.asar", "app.asar.unpacked")

// 设置ffmpeg路径
ffmpeg.setFfmpegPath(correctedFfmpegPath)
ffmpeg.setFfprobePath(correctedFfprobePath)

// 使用配置常量中的定义
const ProcessingState = AUDIO_CONFIG.PROCESSING_STATES
const DEFAULT_PROCESSING_OPTIONS = AUDIO_CONFIG.DEFAULT_OPTIONS

/**
 * 音频处理服务类
 */
class AudioProcessor extends EventEmitter {
	currentProcess: ffmpeg.FfmpegCommand | null = null
	state: string = ProcessingState.IDLE
	filePath: string | null = null
	duration: number = 0
	private processingTimeout: ReturnType<typeof setTimeout> | null = null
	private options: AudioProcessingOptions

	constructor(options: AudioProcessingOptions = {}) {
		super()
		this.currentProcess = null
		this.state = ProcessingState.IDLE
		this.filePath = null
		this.duration = 0
		this.processingTimeout = null

		this.options = { ...DEFAULT_PROCESSING_OPTIONS, ...options }

		this.handleCancel = this.handleCancel.bind(this)
		this.processAudio = this.processAudio.bind(this)
		this.cancelProcessing = this.cancelProcessing.bind(this)
		this.getStatus = this.getStatus.bind(this)
	}

	/**
	 * 处理音频文件
	 */
	processAudio(filePath: string, options: AudioProcessingOptions = {}): Promise<Buffer> {
		if (this.state === ProcessingState.PROCESSING) {
			return Promise.reject(createError("已有处理任务正在进行中", AUDIO_ERRORS.ALREADY_PROCESSING))
		}

		const processingOptions = { ...this.options, ...options }

		return new Promise<Buffer>(async (resolve, reject) => {
			try {
				this.cleanup()

				if (processingOptions.timeout && processingOptions.timeout > 0) {
					this.processingTimeout = setTimeout(() => {
						this.cancelProcessing()
						reject(createError(`处理超时 (${processingOptions.timeout}ms)`, AUDIO_ERRORS.TIMEOUT))
					}, processingOptions.timeout)
				}

				this.state = ProcessingState.PROCESSING
				this.filePath = filePath
				this.duration = 0

				const startPosition = options.position || 0

				const chunks: Buffer[] = []
				let totalSize = 0

				this.currentProcess = ffmpeg(filePath)
					.seekInput(startPosition)
					.noVideo()
					.audioCodec(processingOptions.audioCodec || "pcm_s16le")
					.audioChannels(processingOptions.audioChannels || 2)
					.audioFrequency(processingOptions.audioFrequency || 44100)
					.format(processingOptions.format || "wav")
					.on("error", (err: Error) => {
						this.cleanup()

						if (err.message.includes("SIGKILL")) {
							this.state = ProcessingState.ERROR
							reject(createError("处理已取消", AUDIO_ERRORS.UNKNOWN_ERROR))
						} else {
							console.error("音频处理错误:", err.message)
							this.state = ProcessingState.ERROR
							reject(createError(`音频处理错误: ${err.message}`, AUDIO_ERRORS.PROCESSING_ERROR))
						}
					})
					.on("end", () => {
						this.cleanup()

						console.log("音频处理完成")
						const buffer = Buffer.concat(chunks, totalSize)
						this.state = ProcessingState.COMPLETED

						this.emit("processing:complete", {
							filePath: this.filePath,
							duration: this.duration,
							bufferSize: buffer.length,
						})

						resolve(buffer)
					})

				const stream = this.currentProcess.pipe()
				stream.on("data", (chunk: Buffer) => {
					chunks.push(chunk)
					totalSize += chunk.length
				})
			} catch (error) {
				this.cleanup()
				this.state = ProcessingState.ERROR

				const err = error as Error & { code?: string }
				if (!err.code) {
					err.code = AUDIO_ERRORS.UNKNOWN_ERROR
				}

				this.emit("error", err)
				reject(err)
			}
		})
	}

	/**
	 * 清理资源
	 */
	private cleanup(): void {
		if (this.processingTimeout) {
			clearTimeout(this.processingTimeout)
			this.processingTimeout = null
		}
	}

	/**
	 * 取消当前处理任务
	 */
	cancelProcessing(): Promise<{ cancelled: boolean; message: string }> {
		return new Promise((resolve) => {
			if (this.currentProcess && this.state === ProcessingState.PROCESSING) {
				this.currentProcess.kill("SIGKILL")
				this.handleCancel()
				resolve({ cancelled: true, message: "处理已取消" })
			} else {
				resolve({ cancelled: false, message: "没有正在进行的处理任务" })
			}
		})
	}

	/**
	 * 获取处理状态
	 */
	getStatus(): ProcessingStatus {
		return {
			state: this.state,
			filePath: this.filePath,
			duration: this.duration,
		}
	}

	/**
	 * 内部取消处理
	 */
	private handleCancel(): void {
		this.cleanup()
		this.state = ProcessingState.ERROR
		this.currentProcess = null
	}
}

// 创建单例实例
const audioProcessor = new AudioProcessor()

function createPlayerHandlers(mainWindow: Electron.BrowserWindow): IpcHandlerModule {
	const processingCompleteHandler = (result: Record<string, unknown>): void => {
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send(CHANNELS.PLAYER_ENDED, result)
		}
	}

	const processingErrorHandler = (error: Error & { code?: string }): void => {
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send(CHANNELS.PLAYER_ERROR, {
				message: error.message,
				code: error.code,
			})
		}
	}

	audioProcessor.on("processing:complete", processingCompleteHandler)
	audioProcessor.on("error", processingErrorHandler)

	const handlers = [
		{
			channel: CHANNELS.PLAYER_PLAY,
			handler: async (_event: Electron.IpcMainInvokeEvent, options: AudioProcessingOptions) => {
				try {
					const result = await audioProcessor.processAudio(options.filePath || "", options)
					mainWindow.webContents.send(CHANNELS.PLAYER_AUDIO_DATA, result)
					return { success: true }
				} catch (err) {
					const error = err as Error
					return {
						success: false,
						error: error.message,
						code: (error as Error & { code?: string }).code || "UNKNOWN_ERROR",
					}
				}
			},
		},
		{
			channel: CHANNELS.PLAYER_STOP,
			handler: () => {
				audioProcessor.cancelProcessing()
				return { success: true }
			},
		},
		{
			channel: CHANNELS.PLAYER_SEEK,
			handler: async (_event: Electron.IpcMainInvokeEvent, { position }: { position?: number }) => {
				try {
					if (audioProcessor.filePath) {
						await audioProcessor.cancelProcessing()
						return { success: true, action: "REPROCESS_NEEDED" }
					}
					return { success: false, error: "没有正在处理的音频" }
				} catch (err) {
					const error = err as Error
					return { success: false, error: error.message }
				}
			},
		},
		{
			channel: CHANNELS.PLAYER_GET_STATUS,
			handler: () => {
				try {
					const status = audioProcessor.getStatus()
					return { success: true, ...status }
				} catch (err) {
					const error = err as Error
					return { success: false, error: error.message }
				}
			},
		},
	]

	return {
		handlers,
		cleanup: () => {
			audioProcessor.removeListener("processing:complete", processingCompleteHandler)
			audioProcessor.removeListener("error", processingErrorHandler)
		},
	}
}

export { createPlayerHandlers }
