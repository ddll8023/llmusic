import { promises as fs } from "fs"
import { parseFile } from "music-metadata"
import LRUCache from "../../utils/cache/LRUCache"
import { extractLyrics } from "../../utils/lyrics"
import { CHANNELS } from "../../constants/ipcChannels"
import { getSongById } from "../data/Database"
import type { IpcHandlerModule } from "../../types"
import type { LyricLine, LyricWord, Song } from "../../types/song"

// 正则统一在函数内局部创建，避免模块级共享 g 正则的 lastIndex 隐患
const METADATA_REGEX = /\[([a-zA-Z]+):(.*?)\]/
const KNOWN_METADATA_TAGS = new Set(["ar", "ti", "al", "by", "offset"])
/** LRC 时间戳检测（无 g 标志，仅 test 用） */
const LRC_DETECT_REGEX = /\[\d{2}:\d{2}[.:]\d{2,3}\]/

/** 创建行时间戳匹配正则：[mm:ss.xx] */
function createTimestampRegex(): RegExp {
	return /\[(\d{2}):(\d{2})[.:]([\d]{2,3})\]/g
}

/** 创建逐字歌词匹配正则：<mm:ss.xx>字 */
function createWordLevelRegex(): RegExp {
	return /<(\d{2}):(\d{2})[.:](\d{2,3})>([^<]+)/g
}

// ---- 歌词解析结果缓存（按 songId，上限 200 条） ----
const LYRICS_CACHE_CAPACITY = 200
const lyricsCache = new LRUCache<string, LyricResult>(LYRICS_CACHE_CAPACITY)

/**
 * 失效指定歌曲的歌词缓存（标签写回可能改写歌词后调用）
 */
function invalidateLyricsCache(songId: string): void {
	lyricsCache.delete(songId)
}

interface ParsedLrc {
	metadata: Record<string, string>
	lyrics: LyricLine[]
}

interface LyricResult {
	success: boolean
	lyrics?: LyricLine[]
	metadata?: Record<string, string>
	format?: string
	source?: string
	error?: string
}

/**
 * 将时间戳正则匹配结果转换为毫秒
 */
function _parseTimestamp(match: RegExpExecArray): number | null {
	if (!match) return null

	const minutes = parseInt(match[1], 10)
	const seconds = parseInt(match[2], 10)
	const millisecondsPart = match[3]
	const milliseconds = parseInt(millisecondsPart, 10) * (millisecondsPart.length === 2 ? 10 : 1)

	if (isNaN(minutes) || isNaN(seconds) || isNaN(milliseconds)) {
		return null
	}

	return minutes * 60 * 1000 + seconds * 1000 + milliseconds
}

/**
 * 格式化时间为 mm:ss.xx 格式
 */
function formatTime(ms: number): string {
	if (typeof ms !== "number" || ms < 0 || isNaN(ms)) {
		return "00:00.00"
	}
	const totalSeconds = Math.floor(ms / 1000)
	const minutes = Math.floor(totalSeconds / 60)
	const seconds = totalSeconds % 60
	const milliseconds = ms % 1000

	return `${minutes.toString().padStart(2, "0")}:${seconds
		.toString()
		.padStart(2, "0")}.${Math.floor(milliseconds / 10)
		.toString()
		.padStart(2, "0")}`
}

/**
 * 解析逐字歌词格式，返回 LyricWord[] 和纯文本
 *
 * 输入：[00:12.34] <00:00.12>素<00:00.08>敵<00:00.10>な<00:00.09>世<00:00.08>界
 * 输出：words=[{word:'素',time:12340,duration:120}, ...], text='素敵な世界'
 *
 * @param lineText 移除时间戳后的文本行内容
 * @param lineStartTime 该行的起始时间 (ms)
 */
function parseWordLevel(lineText: string, lineStartTime: number): { words: LyricWord[]; cleanText: string } | null {
	const words: LyricWord[] = []
	const wordLevelRegex = createWordLevelRegex()
	let match: RegExpExecArray | null

	while ((match = wordLevelRegex.exec(lineText)) !== null) {
		const wordOffset = _parseTimestamp(match)
		if (wordOffset === null) continue
		words.push({
			word: match[4].trim(),
			time: lineStartTime + wordOffset,
			duration: 0, // 由后续字的时间差推算
		})
	}

	if (words.length === 0) return null

	// 推算每个字的持续时间：本字的 duration = 下字 time - 本字 time
	for (let i = 0; i < words.length - 1; i++) {
		words[i].duration = words[i + 1].time - words[i].time
	}
	// 最后一个字使用默认时长 200ms
	if (words.length > 0) {
		words[words.length - 1].duration = 200
	}

	// 提取纯文本
	const cleanText = words.map((w) => w.word).join("")

	return { words, cleanText }
}

/**
 * 解析并增强的LRC格式歌词文本
 *
 * 增强功能：
 * 1. 标准 LRC 时间戳解析
 * 2. 同时间戳多行自动合并翻译（第二行→translation，第三行→roma）
 * 3. 逐字歌词解析（<time>字 格式）
 */
function parseLrc(lrcText: string): ParsedLrc {
	if (typeof lrcText !== "string") {
		return { metadata: {}, lyrics: [] }
	}

	const lines = lrcText.split(/\r?\n/)
	const metadata: Record<string, string> = {}
	/** 按时间戳分组：key 为时间戳 ms，value 为对应行的文本列表 */
	const timeMap = new Map<number, string[]>()

	for (const line of lines) {
		const trimmedLine = line.trim()
		if (!trimmedLine) continue

		const metadataMatch = trimmedLine.match(METADATA_REGEX)
		if (metadataMatch && KNOWN_METADATA_TAGS.has(metadataMatch[1].toLowerCase())) {
			metadata[metadataMatch[1].toLowerCase()] = metadataMatch[2].trim()
			continue
		}

		const timestamps: number[] = []
		const timestampRegex = createTimestampRegex()
		let match: RegExpExecArray | null

		while ((match = timestampRegex.exec(trimmedLine)) !== null) {
			const time = _parseTimestamp(match)
			if (time !== null) {
				timestamps.push(time)
			}
		}

		if (timestamps.length > 0) {
			const lyricText = trimmedLine.replace(createTimestampRegex(), "").trim()
			for (const time of timestamps) {
				if (!timeMap.has(time)) {
					timeMap.set(time, [])
				}
				timeMap.get(time)!.push(lyricText)
			}
		}
	}

	// 将 timeMap 转为 LyricLine[]，合并同时间戳的多行
	const lyrics: LyricLine[] = []
	for (const [time, texts] of timeMap) {
		const primary = texts[0] || ""

		// 检测逐字歌词格式
		const wordResult = parseWordLevel(primary, time)
		const text = wordResult ? wordResult.cleanText : primary
		const words = wordResult ? wordResult.words : undefined

		const line: LyricLine = {
			time,
			text,
			timeText: formatTime(time),
			words,
			// 第二行文本较短时视为翻译
			translation: texts.length > 1 && texts[1].length < 200 ? texts[1] : undefined,
			// 第三行视为罗马音/音译
			roma: texts.length > 2 && texts[2].length < 200 ? texts[2] : undefined,
		}
		lyrics.push(line)
	}

	lyrics.sort((a, b) => a.time - b.time)

	return { metadata, lyrics }
}

/**
 * 尝试从文件直接重新提取歌词（共享 utils/lyrics 实现）
 * 用于兜底修复入库时丢失时间戳的存量数据
 */
async function tryReadFileLyrics(filePath: string | undefined): Promise<LyricResult | null> {
	if (!filePath) return null
	try {
		const meta = await parseFile(filePath, { skipCovers: true, skipPostHeaders: true })
		const extracted = await extractLyrics(meta, filePath)
		if (extracted.hasLyrics && extracted.lyrics && LRC_DETECT_REGEX.test(extracted.lyrics)) {
			const parsed = parseLrc(extracted.lyrics)
			if (parsed.lyrics.length > 0) {
				console.log(`[lyricsHandler] 从文件 ${filePath} 成功提取 LRC 歌词（${parsed.lyrics.length} 行）`)
				return {
					success: true,
					lyrics: parsed.lyrics,
					metadata: parsed.metadata,
					format: "lrc",
					source: "file-reextract",
				}
			}
		}
	} catch (e) {
		const err = e as Error
		console.warn(`[lyricsHandler] 从文件读取歌词失败: ${filePath}`, err.message)
	}
	return null
}

/**
 * 获取歌曲歌词（不含缓存逻辑）
 */
async function resolveLyrics(songId: string): Promise<LyricResult> {
	const song: Song | undefined = await getSongById(songId)
	if (!song) return { success: false, error: "歌曲不存在" }

	// 内嵌歌词
	if (song.hasLyrics && song.lyrics) {
		const text = song.lyrics

		// 1. 检查 LRC 格式
		if (LRC_DETECT_REGEX.test(text)) {
			const parsed = parseLrc(text)
			return {
				success: true,
				lyrics: parsed.lyrics,
				metadata: parsed.metadata,
				format: "lrc",
				source: "embedded",
			}
		}

		// 2. 检查类 QQ 音乐的 JSON 格式
		if (typeof text === "string" && text.trim().startsWith("{") && text.includes("syncText")) {
			try {
				const jsonData = JSON.parse(text) as { syncText?: Array<{ timestamp: number; text: string }> }
				if (jsonData && Array.isArray(jsonData.syncText)) {
					const parsedLines = jsonData.syncText
						.map((item) => {
							if (item && typeof item.timestamp === "number" && typeof item.text === "string") {
								return {
									time: item.timestamp,
									text: item.text,
									timeText: formatTime(item.timestamp),
								}
							}
							return null
						})
						.filter((item): item is LyricLine => item !== null)

					parsedLines.sort((a, b) => a.time - b.time)

					return {
						success: true,
						lyrics: parsedLines,
						format: "json-synced",
						source: "embedded",
					}
				}
			} catch (e) {
				const error = e as Error
				console.warn("解析内嵌JSON歌词失败，将作为纯文本处理:", error.message)
			}
		}

		// 3. 作为纯文本处理 — 尝试从文件读取原生歌词元数据
		// 处理入库时丢失时间戳的存量数据（ScannerWorker 曾只提取 item.text 丢弃了 syncText）
		const fileLyrics = await tryReadFileLyrics(song.filePath)
		if (fileLyrics) return fileLyrics

		return {
			success: true,
			lyrics: text.split(/\r?\n/).map((t: string) => ({ time: -1, text: t.trim(), timeText: "" })),
			format: "text",
		}
	}

	// 尝试外部 LRC
	const lrcPath = (song.filePath || "").replace(/\.[^.]+$/, ".lrc")
	try {
		const raw = await fs.readFile(lrcPath, "utf-8")
		const parsed = parseLrc(raw)
		return {
			success: true,
			lyrics: parsed.lyrics,
			metadata: parsed.metadata,
			format: "lrc",
			source: "external",
		}
	} catch {
		return { success: false, error: "歌曲没有可用歌词" }
	}
}

/**
 * 获取歌曲歌词（带 LRU 缓存，仅缓存成功结果）
 */
async function getLyrics(songId: string): Promise<LyricResult> {
	const cached = lyricsCache.get(songId)
	if (cached) return cached

	const result = await resolveLyrics(songId)
	if (result.success) {
		lyricsCache.set(songId, result)
	}
	return result
}

function createLyricsHandlers(): IpcHandlerModule {
	const handlers = [
		{
			channel: CHANNELS.GET_LYRICS,
			handler: (_event: Electron.IpcMainInvokeEvent, songId: string) => getLyrics(songId),
		},
	]

	return {
		handlers,
		cleanup: () => {
			lyricsCache.clear()
		},
	}
}

export { createLyricsHandlers, invalidateLyricsCache }
