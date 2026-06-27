import { parentPort } from "worker_threads"
import { promises as fs } from "fs"
import path from "path"
import { parseFile, type IAudioMetadata } from "music-metadata"
import { v4 as uuidv4 } from "uuid"
import { SUPPORTED_AUDIO_EXTENSIONS } from "../../constants/formats"

/**
 * 扫描状态控制
 */
const scanState = {
	isCanceled: false,
	batchSize: {
		fileReporting: 100,
		metadataParsing: 20,
	},
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

	reportProgress("starting", `开始扫描目录: ${dirPath}`)

	try {
		const allFiles = await findAllAudioFiles(dirPath)

		if (allFiles.length === 0) {
			if (parentPort) {
				parentPort.postMessage({
					type: "complete",
					data: { songs: [] },
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
				data: { songs },
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
		} catch {
			// 继续处理其他目录
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

		try {
			const batchResults = await Promise.allSettled(
				batch.map((filePath) => parseAudioFile(filePath, libraryId))
			)

			for (const result of batchResults) {
				if (result.status === "fulfilled" && result.value) {
					songs.push(result.value)
				}
			}

			processed += batch.length
			const progressPercentage = Math.round((processed / total) * 100)
			reportProgress("parsing_metadata", `正在解析元数据... ${processed}/${total} (${progressPercentage}%)`, {
				processed,
				total,
			})
		} catch (error) {
			console.error("批量处理文件时出错:", error)
		}
	}

	return songs
}

/**
 * 解析单个音频文件
 */
async function parseAudioFile(filePath: string, libraryId: string): Promise<ParsedSong | null> {
	if (!filePath || typeof filePath !== "string") {
		console.error("无效的文件路径")
		return null
	}

	try {
		const metadata = await parseFile(filePath, {
			skipCovers: false,
			skipPostHeaders: true,
			includeChapters: false,
		})

		const stats = await fs.stat(filePath)

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
		console.error(`解析文件失败: ${filePath}`, (error as Error).message)
		return null
	}
}

interface LyricsExtractResult {
	lyrics: string | null
	hasLyrics: boolean
}

/**
 * 从元数据中提取歌词
 */
async function extractLyrics(metadata: IAudioMetadata, filePath: string): Promise<LyricsExtractResult> {
	let lyrics: string | null = null
	let hasLyrics = false

	// 1. 尝试提取嵌入式歌词 (ID3v2 USLT标签)
	if (metadata.native?.ID3v2) {
		const usltFrames = metadata.native.ID3v2.filter((frame: { id: string }) => frame.id === "USLT")
		if (usltFrames && usltFrames.length > 0) {
			lyrics = extractTextFromFrame(usltFrames[0])
			if (lyrics) {
				hasLyrics = true
				return { lyrics, hasLyrics }
			}
		}
	}

	// 2. 检查其他格式的歌词
	const common = metadata.common
	if (!hasLyrics && common.lyrics) {
		lyrics = extractLyricsFromCommon(common.lyrics)
		if (lyrics) {
			hasLyrics = true
			return { lyrics, hasLyrics }
		}
	}

	// 3. 尝试在相同目录查找LRC文件
	if (!hasLyrics) {
		const lrcPath = filePath.substring(0, filePath.lastIndexOf(".")) + ".lrc"
		try {
			const lrcStat = await fs.stat(lrcPath)
			if (lrcStat.isFile()) {
				lyrics = await fs.readFile(lrcPath, "utf-8")
				hasLyrics = !!lyrics
			}
		} catch {
			// LRC文件不存在，忽略
		}
	}

	return { lyrics, hasLyrics }
}

/**
 * 从ID3v2帧中提取文本
 */
function extractTextFromFrame(frame: any): string | null {
	if (!frame || !frame.value) return null

	if (typeof frame.value.text === "string") {
		return frame.value.text
	} else if (typeof frame.value.text === "object" && frame.value.text !== null) {
		const textObj = frame.value.text as { text?: string }
		if (textObj.text) {
			return textObj.text
		} else {
			try {
				return JSON.stringify(textObj)
			} catch {
				return "无法解析的歌词对象"
			}
		}
	}
	return null
}

/**
 * 从common.lyrics中提取歌词
 */
function extractLyricsFromCommon(lyrics: string | unknown[] | Record<string, unknown>): string | null {
	if (!lyrics) return null

	if (Array.isArray(lyrics)) {
		const lyricsArray = lyrics
			.map((item) => {
				if (typeof item === "string") {
					return item
				} else if (typeof item === "object" && item !== null) {
					const itemObj = item as { text?: string }
					if (itemObj.text) return itemObj.text
					try {
						return JSON.stringify(item)
					} catch {
						return "无法解析的歌词项"
					}
				}
				return ""
			})
			.filter(Boolean)

		return lyricsArray.length > 0 ? lyricsArray.join("\n") : null
	}

	if (typeof lyrics === "string") {
		return lyrics.trim() || null
	}

	if (typeof lyrics === "object" && lyrics !== null) {
		const lyricsObj = lyrics as { text?: string }
		try {
			if (lyricsObj.text) return lyricsObj.text
			return JSON.stringify(lyrics)
		} catch {
			return "无法解析的歌词对象"
		}
	}

	return null
}
