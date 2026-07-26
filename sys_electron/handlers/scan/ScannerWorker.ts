import { parentPort, workerData } from "worker_threads"
import { promises as fs } from "fs"
import path from "path"
import { parseFile } from "music-metadata"
import { v4 as uuidv4 } from "uuid"
import { SUPPORTED_AUDIO_EXTENSIONS } from "../../constants/formats"
import { extractLyrics } from "../../utils/lyrics"

/** 增量扫描：库中已有文件映射（filePath → { id, modifiedAt }），全量重扫时为 undefined */
interface ExistingFileEntry {
	id: string
	modifiedAt: number | null
}

const existingFiles: Record<string, ExistingFileEntry> | undefined = (
	workerData as { existingFiles?: Record<string, ExistingFileEntry> } | undefined
)?.existingFiles

/** 扫描失败文件记录 */
interface FailedFile {
	path: string
	reason: string
}

/**
 * 扫描状态控制
 */
const scanState = {
	isCanceled: false,
	batchSize: {
		fileReporting: 100,
		metadataParsing: 20,
	},
	failedFiles: [] as FailedFile[],
	skippedCount: 0,
}

/**
 * 进度报告函数
 */
function reportProgress(phase: string, message: string, additionalData: Record<string, unknown> = {}): void {
	if (parentPort) {
		parentPort.postMessage({
			type: "progress",
			data: {
				phase,
				message,
				...additionalData,
			},
		})
	}
}

// 监听来自主线程的消息
if (parentPort) {
	parentPort.on("message", async (message: { type: string; dirPath?: string; libraryId?: string }) => {
		try {
			switch (message.type) {
				case "start":
					await scanDirectory(message.dirPath!, message.libraryId!)
					break
				case "cancel":
					scanState.isCanceled = true
					reportProgress("canceled", "扫描已取消")
					break
				default:
					throw new Error(`未知的消息类型: ${message.type}`)
			}
		} catch (error) {
			const err = error as Error
			if (parentPort) {
				parentPort.postMessage({
					type: "error",
					data: { message: err.message, stack: err.stack },
				})
			}
		}
	})
}

/**
 * 递归扫描目录中的音频文件
 */
async function scanDirectory(dirPath: string, libraryId: string): Promise<void> {
	if (!dirPath || typeof dirPath !== "string") {
		throw new Error("无效的目录路径")
	}

	if (!libraryId || typeof libraryId !== "string") {
		throw new Error("无效的音乐库ID")
	}

	scanState.isCanceled = false
	scanState.failedFiles = []
	scanState.skippedCount = 0

	reportProgress("starting", `开始扫描目录: ${dirPath}`)

	try {
		const allFiles = await findAllAudioFiles(dirPath)

		if (allFiles.length === 0) {
			if (parentPort) {
				parentPort.postMessage({
					type: "complete",
					data: { songs: [], failedFiles: scanState.failedFiles, skippedCount: 0 },
				})
			}
			return
		}

		reportProgress("preparing", `找到 ${allFiles.length} 个音频文件，开始解析...`, {
			total: allFiles.length,
		})

		const songs = await parseAudioFiles(allFiles, libraryId)

		if (parentPort) {
			parentPort.postMessage({
				type: "complete",
				data: {
					songs,
					failedFiles: scanState.failedFiles,
					skippedCount: scanState.skippedCount,
				},
			})
		}
	} catch (error) {
		const err = error as Error
		if (parentPort) {
			parentPort.postMessage({
				type: "error",
				data: {
					message: err.message,
					stack: err.stack,
				},
			})
		}
	}
}

/**
 * 递归查找目录中所有音频文件
 */
async function findAllAudioFiles(dirPath: string): Promise<string[]> {
	const audioFiles: string[] = []
	let fileCount = 0

	async function traverse(currentPath: string): Promise<void> {
		if (scanState.isCanceled) return

		try {
			const items = await fs.readdir(currentPath, { withFileTypes: true })

			for (const item of items) {
				if (scanState.isCanceled) return

				const itemPath = path.join(currentPath, item.name)

				if (item.isDirectory()) {
					await traverse(itemPath)
				} else if (item.isFile()) {
					const ext = path.extname(item.name).toLowerCase()
					if (SUPPORTED_AUDIO_EXTENSIONS.includes(ext)) {
						audioFiles.push(itemPath)
						fileCount++

						if (fileCount % scanState.batchSize.fileReporting === 0) {
							reportProgress("finding_files", `已找到 ${fileCount} 个音频文件...`, {
								processed: fileCount,
							})
						}
					}
				}
			}
		} catch (error) {
			// 目录读取失败：记录后继续处理其他目录
			scanState.failedFiles.push({
				path: currentPath,
				reason: `目录读取失败: ${(error as Error).message}`,
			})
		}
	}

	await traverse(dirPath)

	if (fileCount > 0 && fileCount % scanState.batchSize.fileReporting !== 0) {
		reportProgress("finding_files", `共找到 ${fileCount} 个音频文件`, {
			processed: fileCount,
		})
	}

	return audioFiles
}

interface ParsedSong {
	id: string
	title: string
	artist: string
	album: string
	duration: number
	filePath: string
	cover: string
	lyrics: string | null
	hasLyrics: boolean
	libraryId: string
	bitrate: number
	sampleRate: number
	format: string
	fileSize: number
	year: number | null
	genre: string | null
	trackNumber: number | null
	discNumber: number | null
	addedAt: string
}

/**
 * 解析音频文件
 */
async function parseAudioFiles(filePaths: string[], libraryId: string): Promise<ParsedSong[]> {
	if (!Array.isArray(filePaths)) {
		throw new Error("文件路径必须是数组")
	}

	const songs: ParsedSong[] = []
	let processed = 0
	const total = filePaths.length
	const batchSize = scanState.batchSize.metadataParsing

	for (let i = 0; i < total; i += batchSize) {
		if (scanState.isCanceled) {
			reportProgress("canceled", "扫描已取消")
			return songs
		}

		const batch = filePaths.slice(i, i + batchSize)

		const batchResults = await Promise.allSettled(
			batch.map((filePath) => parseAudioFile(filePath, libraryId))
		)

		for (let j = 0; j < batchResults.length; j++) {
			const result = batchResults[j]
			if (result.status === "fulfilled") {
				if (result.value) {
					songs.push(result.value)
				}
			} else {
				// parseAudioFile 内部已 catch，此分支为极端兜底
				scanState.failedFiles.push({
					path: batch[j],
					reason: String(result.reason),
				})
			}
		}

		processed += batch.length
		const progressPercentage = Math.round((processed / total) * 100)
		reportProgress("parsing_metadata", `正在解析元数据... ${processed}/${total} (${progressPercentage}%)`, {
			processed,
			total,
		})
	}

	return songs
}

/**
 * 解析单个音频文件
 * 增量扫描：mtime 与库中记录一致的文件跳过解析（复用已有记录，不上报）
 */
async function parseAudioFile(filePath: string, libraryId: string): Promise<ParsedSong | null> {
	if (!filePath || typeof filePath !== "string") {
		return null
	}

	try {
		const stats = await fs.stat(filePath)

		// 增量跳过：文件未变更则不重新解析
		if (existingFiles) {
			const existing = existingFiles[filePath]
			if (existing && existing.modifiedAt !== null && existing.modifiedAt === stats.mtime.getTime()) {
				scanState.skippedCount++
				return null
			}
		}

		const metadata = await parseFile(filePath, {
			skipCovers: false,
			skipPostHeaders: true,
			includeChapters: false,
		})

		const hasCover = !!(metadata.common.picture && metadata.common.picture.length > 0)

		const lyricsResult = await extractLyrics(metadata, filePath)

		return {
			id: uuidv4(),
			title:
				metadata.common.title ||
				path.basename(filePath, path.extname(filePath)),
			artist: metadata.common.artist || "未知艺术家",
			album: metadata.common.album || "未知专辑",
			duration: metadata.format.duration || 0,
			filePath: filePath,
			cover: hasCover ? "embedded" : "none",
			lyrics: lyricsResult.lyrics,
			hasLyrics: lyricsResult.hasLyrics,
			libraryId: libraryId,
			bitrate: metadata.format.bitrate || 0,
			sampleRate: metadata.format.sampleRate || 0,
			format:
				metadata.format.container ||
				path.extname(filePath).substring(1) ||
				"未知格式",
			fileSize: stats.size || 0,
			year: metadata.common.year || null,
			genre:
				(Array.isArray(metadata.common.genre) && metadata.common.genre.length > 0
					? String(metadata.common.genre[0])
					: metadata.common.genre ? String(metadata.common.genre) : null) as string | null,
			trackNumber: metadata.common.track?.no || null,
			discNumber: metadata.common.disk?.no || null,
			addedAt: new Date().toISOString(),
		}
	} catch (error) {
		const reason = (error as Error).message || String(error)
		console.error(`解析文件失败: ${filePath}`, reason)
		scanState.failedFiles.push({ path: filePath, reason })
		return null
	}
}
