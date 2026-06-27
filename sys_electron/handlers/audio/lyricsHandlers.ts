import { promises as fs } from "fs"
import { CHANNELS } from "../../constants/ipcChannels"
import { getSongById } from "../data/Database"
import type { IpcHandlerModule } from "../../types"
import type { LyricLine, Song } from "../../types/song"

const TIMESTAMP_REGEX = /\[(\d{2}):(\d{2})[.:]([\d]{2,3})\]/g
const METADATA_REGEX = /\[([a-zA-Z]+):(.*?)\]/
const KNOWN_METADATA_TAGS = new Set(["ar", "ti", "al", "by", "offset"])

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
 * 解析LRC格式的歌词文本
 */
function parseLrc(lrcText: string): ParsedLrc {
	if (typeof lrcText !== "string") {
		return { metadata: {}, lyrics: [] }
	}

	const lines = lrcText.split(/\r?\n/)
	const metadata: Record<string, string> = {}
	const lyrics: LyricLine[] = []

	for (const line of lines) {
		const trimmedLine = line.trim()
		if (!trimmedLine) continue

		const metadataMatch = trimmedLine.match(METADATA_REGEX)
		if (metadataMatch && KNOWN_METADATA_TAGS.has(metadataMatch[1].toLowerCase())) {
			metadata[metadataMatch[1].toLowerCase()] = metadataMatch[2].trim()
			continue
		}

		const timestamps: number[] = []
		let lyricText = trimmedLine
		let match: RegExpExecArray | null

		TIMESTAMP_REGEX.lastIndex = 0
		while ((match = TIMESTAMP_REGEX.exec(trimmedLine)) !== null) {
			const time = _parseTimestamp(match)
			if (time !== null) {
				timestamps.push(time)
			}
		}

		if (timestamps.length > 0) {
			lyricText = trimmedLine.replace(TIMESTAMP_REGEX, "").trim()

			for (const time of timestamps) {
				lyrics.push({
					time,
					text: lyricText,
					timeText: formatTime(time),
				})
			}
		}
	}

	lyrics.sort((a, b) => a.time - b.time)

	return { metadata, lyrics }
}

/**
 * 获取歌曲歌词
 */
async function getLyrics(songId: string): Promise<LyricResult> {
	const song: Song | undefined = await getSongById(songId)
	if (!song) return { success: false, error: "歌曲不存在" }

	// 内嵌歌词
	if (song.hasLyrics && song.lyrics) {
		const text = song.lyrics

		// 1. 检查 LRC 格式
		if (/\[\d{2}:\d{2}\.\d{2,3}\]/.test(text)) {
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

		// 3. 作为纯文本处理
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

function createLyricsHandlers(): IpcHandlerModule {
	const handlers = [
		{
			channel: CHANNELS.GET_LYRICS,
			handler: (_event: Electron.IpcMainInvokeEvent, songId: string) => getLyrics(songId),
		},
	]

	return {
		handlers,
		cleanup: () => {},
	}
}

export { createLyricsHandlers }
