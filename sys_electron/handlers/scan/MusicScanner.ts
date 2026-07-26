/**
 * 音乐扫描模块 - 负责扫描本地音乐文件并解析元数据
 */
import fssync from "fs"
import path from "path"
import { Worker } from "worker_threads"
import { addSongs, clearSongsByLibrary, getLibraryById, getSongsByLibrary } from "../data/Database"
import type { ProgressCallback, ScanProgress } from "../../types"

/** 扫描失败文件记录（由 worker 收集并透传） */
export interface FailedFile {
	path: string
	reason: string
}

/**
 * 扫描状态管理
 * generation：每次扫描自增，延迟 timer 回调必须校验 generation 匹配，防止误杀后续新扫描的 worker
 */
const scanState = {
	cancelRequested: false,
	currentWorker: null as Worker | null,
	timeoutTimer: null as ReturnType<typeof setTimeout> | null,
	generation: 0,
	SCAN_TIMEOUT: 3600000,

	reset(): void {
		this.cancelRequested = false
		this.currentWorker = null
		this.clearTimeoutTimer()
	},

	setTimeoutTimer(onTimeout: () => void): void {
		this.clearTimeoutTimer()
		this.timeoutTimer = setTimeout(() => {
			console.warn("扫描操作超时，自动取消")
			onTimeout()
		}, this.SCAN_TIMEOUT)
	},

	clearTimeoutTimer(): void {
		if (this.timeoutTimer) {
			clearTimeout(this.timeoutTimer)
			this.timeoutTimer = null
		}
	},
}

/**
 * 安全终止工作线程：先发取消消息，等待宽限期后强制 terminate
 * 只 terminate 传入的实例，绝不通过 scanState.currentWorker 间接取（宽限期内可能已是新 worker）
 */
async function safeTerminateWorker(worker: Worker | null, timeout = 1000): Promise<void> {
	if (!worker) return

	try {
		worker.postMessage({ type: "cancel" })

		await new Promise((resolve) => setTimeout(resolve, timeout))

		await worker.terminate()
	} catch (error) {
		console.error("终止工作线程时出错:", error)
	}
}

interface WorkerMessage {
	type: string
	data?: Record<string, unknown>
}

/**
 * 扫描音乐文件
 */
async function scanMusic(
	libraryId: string,
	clearExisting = false,
	progressCallback: ProgressCallback = () => {}
): Promise<{ success: boolean; canceled?: boolean; count?: number; failedCount?: number; error?: string }> {
	if (!libraryId || typeof libraryId !== "string") {
		throw new Error("必须提供有效的音乐库ID")
	}

	return new Promise(async (resolve, reject) => {
		try {
			const library = await getLibraryById(libraryId)
			if (!library) {
				return reject(new Error(`未找到ID为 ${libraryId} 的音乐库`))
			}

			const dirPath = library.path
			if (!dirPath || !fssync.existsSync(dirPath)) {
				return reject(new Error(`音乐库路径 "${dirPath}" 不存在或无法访问`))
			}

			await cancelCurrentScan()

			scanState.reset()
			const generation = ++scanState.generation

			scanState.setTimeoutTimer(() => {
				if (scanState.generation !== generation) return
				cancelScan()
				reject(new Error("扫描操作超时"))
			})

			// 增量扫描：非全量重扫时，将库中已有 {filePath → {id, modifiedAt}} 映射传给 worker，
			// worker 对 mtime 未变化的文件跳过解析
			let existingFiles: Record<string, { id: string; modifiedAt: number | null }> | undefined
			if (clearExisting) {
				await clearSongsByLibrary(libraryId)
				progressCallback({
					phase: "prepare",
					message: "已清除现有歌曲数据，准备开始扫描...",
					processed: 0,
					total: 0,
				})
			} else {
				const existingSongs = await getSongsByLibrary(libraryId)
				existingFiles = {}
				for (const song of existingSongs) {
					if (song.filePath) {
						existingFiles[song.filePath] = {
							id: song.id,
							modifiedAt: song.modifiedAt ?? null,
						}
					}
				}
			}

			scanState.currentWorker = new Worker(path.join(__dirname, "ScannerWorker.js"), {
				workerData: existingFiles ? { existingFiles } : {},
			})

			const worker = scanState.currentWorker

			worker.on("message", handleWorkerMessage(generation, progressCallback, resolve, reject))

			worker.on("error", (error: Error) => {
				if (scanState.generation !== generation) return
				const errorMessage = `扫描工作线程发生严重错误: ${error.message}`
				progressCallback({
					phase: "error",
					message: errorMessage,
				})

				scanState.clearTimeoutTimer()
				scanState.currentWorker = null
				reject(error)
			})

			worker.on("exit", (code: number) => {
				if (scanState.generation !== generation) return
				if (code !== 0 && !scanState.cancelRequested) {
					const errorMessage = `工作线程以退出码 ${code} 异常退出`
					progressCallback({
						phase: "error",
						message: errorMessage,
					})

					scanState.clearTimeoutTimer()
					scanState.currentWorker = null
					reject(new Error(errorMessage))
				} else if (scanState.cancelRequested) {
					console.log("工作线程已成功取消并退出。")
					scanState.currentWorker = null
				}
			})

			worker.postMessage({
				type: "start",
				libraryId,
				dirPath,
				clearExisting,
			})

			progressCallback({
				phase: "start",
				message: `开始扫描音乐库: ${library.name || dirPath}`,
				processed: 0,
				total: 0,
			})
		} catch (error) {
			scanState.clearTimeoutTimer()
			scanState.currentWorker = null
			reject(error)
		}
	})
}

function handleWorkerMessage(
	generation: number,
	progressCallback: ProgressCallback,
	resolve: (value: { success: boolean; canceled?: boolean; count?: number; failedCount?: number }) => void,
	reject: (reason: Error) => void
): (message: WorkerMessage) => Promise<void> {
	return async (message: WorkerMessage) => {
		// 旧 worker 的滞后消息一律忽略
		if (scanState.generation !== generation) return

		if (scanState.cancelRequested) {
			const worker = scanState.currentWorker
			if (worker) {
				await safeTerminateWorker(worker)
				if (scanState.generation === generation) {
					scanState.currentWorker = null
				}
			}
			scanState.clearTimeoutTimer()
			resolve({ success: false, canceled: true })
			return
		}

		switch (message.type) {
			case "progress":
				progressCallback(message.data as unknown as ScanProgress)
				break

			case "complete":
				await handleScanComplete(
					message.data as { songs?: unknown[]; failedFiles?: FailedFile[]; skippedCount?: number },
					progressCallback,
					resolve,
					reject
				)
				break

			case "error": {
				const errorMessage = `扫描工作线程报告错误: ${(message.data as { message?: string })?.message}`
				progressCallback({
					phase: "error",
					message: errorMessage,
				})

				scanState.clearTimeoutTimer()
				scanState.currentWorker = null
				reject(new Error(errorMessage))
				break
			}

			default:
				console.warn(`收到未知类型的工作线程消息: ${message.type}`)
		}
	}
}

async function handleScanComplete(
	data: { songs?: unknown[]; failedFiles?: FailedFile[]; skippedCount?: number },
	progressCallback: ProgressCallback,
	resolve: (value: { success: boolean; count?: number; failedCount?: number }) => void,
	reject: (reason: Error) => void
): Promise<void> {
	const songs = data?.songs
	const failedFiles = Array.isArray(data?.failedFiles) ? data.failedFiles : []
	const skippedCount = data?.skippedCount ?? 0

	if (!Array.isArray(songs)) {
		const errorMessage = "扫描结果无效: 未返回歌曲数组"
		progressCallback({ phase: "error", message: errorMessage })

		scanState.clearTimeoutTimer()
		scanState.currentWorker = null
		reject(new Error(errorMessage))
		return
	}

	progressCallback({
		phase: "saving_to_db",
		message: `正在保存 ${songs.length} 首歌曲到数据库...`,
		processed: 0,
		total: songs.length,
	})

	try {
		await addSongs(songs as Parameters<typeof addSongs>[0], ({ processed, total }) => {
			progressCallback({
				phase: "saving_to_db",
				message: `正在保存到数据库... ${processed}/${total}`,
				processed,
				total,
			})
		})

		progressCallback({
			phase: "complete",
			message:
				`扫描完成，新增/更新 ${songs.length} 首歌曲` +
				(skippedCount > 0 ? `，跳过 ${skippedCount} 个未变更文件` : "") +
				(failedFiles.length > 0 ? `，${failedFiles.length} 个文件失败` : ""),
			processed: songs.length,
			total: songs.length,
			skippedCount,
			failedCount: failedFiles.length,
			failedFiles,
		})

		scanState.clearTimeoutTimer()
		scanState.currentWorker = null
		resolve({
			success: true,
			count: songs.length,
			failedCount: failedFiles.length,
		})
	} catch (error) {
		const err = error as Error
		const errorMessage = `添加歌曲到数据库时出错: ${err.message}`
		progressCallback({ phase: "error", message: errorMessage })

		scanState.clearTimeoutTimer()
		scanState.currentWorker = null
		reject(new Error(errorMessage))
	}
}

function cancelScan(): boolean {
	if (!scanState.currentWorker) {
		console.log("没有正在进行的扫描任务可以取消。")
		return false
	}

	console.log("请求取消扫描...")
	scanState.cancelRequested = true
	scanState.currentWorker.postMessage({ type: "cancel" })

	const generation = scanState.generation
	const workerAtCancel = scanState.currentWorker
	setTimeout(async () => {
		// generation 校验：若期间已启动新扫描，绝不能操作 scanState / 终止新 worker
		if (scanState.generation !== generation) return
		if (scanState.currentWorker && scanState.cancelRequested) {
			await safeTerminateWorker(workerAtCancel)
			if (scanState.generation === generation) {
				scanState.currentWorker = null
			}
			console.log("已强制终止扫描工作线程")
		}
	}, 3000)

	return true
}

async function cancelCurrentScan(): Promise<void> {
	if (scanState.currentWorker) {
		console.log("发现正在进行的扫描任务，正在取消...")
		cancelScan()
		await new Promise((resolve) => setTimeout(resolve, 1500))
	}
}

/**
 * 立即终止当前扫描 worker（应用退出/IPC 卸载时调用，幂等）
 */
async function terminateScan(): Promise<void> {
	scanState.clearTimeoutTimer()
	const worker = scanState.currentWorker
	if (!worker) return
	scanState.cancelRequested = true
	scanState.currentWorker = null
	try {
		await worker.terminate()
		console.log("扫描工作线程已终止（退出清理）")
	} catch (error) {
		console.error("退出清理时终止扫描工作线程失败:", error)
	}
}

export { scanMusic, cancelScan, terminateScan }
