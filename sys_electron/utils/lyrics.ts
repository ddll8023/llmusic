// 歌词提取共享模块：从音频元数据 / 外部 LRC 文件中提取歌词文本
// 覆盖 ID3v2 USLT、VorbisComment LYRICS、common.lyrics（含 syncText 时间戳重建）、同目录 .lrc
import { promises as fs } from "fs"
import type { IAudioMetadata } from "music-metadata"

export interface LyricsExtractResult {
	lyrics: string | null
	hasLyrics: boolean
}

interface SyncTextItem {
	timestamp: number
	text: string
}

/**
 * 将 syncText 数组重建为 LRC 格式文本（保留时间戳）
 */
function syncTextToLrc(syncText: SyncTextItem[]): string {
	return syncText
		.map((st) => {
			const ts = st.timestamp ?? 0
			const min = Math.floor(ts / 60000)
			const sec = Math.floor((ts % 60000) / 1000)
			const ms = Math.floor((ts % 1000) / 10)
			return `[${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms).padStart(2, "0")}]${st.text}`
		})
		.join("\n")
}

/**
 * 从 ID3v2 帧中提取文本
 */
function extractTextFromFrame(frame: unknown): string | null {
	const f = frame as { value?: { text?: string | { text?: string } } } | null
	if (!f || !f.value) return null

	if (typeof f.value.text === "string") {
		return f.value.text
	} else if (typeof f.value.text === "object" && f.value.text !== null) {
		const textObj = f.value.text as { text?: string }
		if (textObj.text) {
			return textObj.text
		}
		try {
			return JSON.stringify(textObj)
		} catch {
			return "无法解析的歌词对象"
		}
	}
	return null
}

/**
 * 从 common.lyrics 中提取歌词
 */
function extractLyricsFromCommon(lyrics: string | unknown[] | Record<string, unknown>): string | null {
	if (!lyrics) return null

	if (Array.isArray(lyrics)) {
		const lyricsArray = lyrics
			.map((item) => {
				if (typeof item === "string") {
					return item
				} else if (typeof item === "object" && item !== null) {
					const itemObj = item as { text?: string; syncText?: SyncTextItem[] }
					// 如果有 syncText，重建 LRC 格式（保留时间戳）
					if (itemObj.syncText && Array.isArray(itemObj.syncText) && itemObj.syncText.length > 0) {
						return syncTextToLrc(itemObj.syncText)
					}
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
		const lyricsObj = lyrics as { text?: string; syncText?: SyncTextItem[] }
		if (lyricsObj.syncText && Array.isArray(lyricsObj.syncText) && lyricsObj.syncText.length > 0) {
			return syncTextToLrc(lyricsObj.syncText)
		}
		try {
			if (lyricsObj.text) return lyricsObj.text
			return JSON.stringify(lyrics)
		} catch {
			return "无法解析的歌词对象"
		}
	}

	return null
}

/**
 * 从已解析的音频元数据中提取歌词，依次尝试：
 * 1. ID3v2 USLT 帧
 * 2. VorbisComment LYRICS 标签（FLAC/OGG 等）
 * 3. common.lyrics（含 syncText 时间戳重建）
 * 4. 同目录同名 .lrc 文件
 */
export async function extractLyrics(metadata: IAudioMetadata, filePath: string): Promise<LyricsExtractResult> {
	let lyrics: string | null = null

	// 1. 嵌入式歌词 (ID3v2 USLT 标签)
	if (metadata.native?.ID3v2) {
		const usltFrames = metadata.native.ID3v2.filter((frame: { id: string }) => frame.id === "USLT")
		if (usltFrames && usltFrames.length > 0) {
			lyrics = extractTextFromFrame(usltFrames[0])
			if (lyrics) {
				return { lyrics, hasLyrics: true }
			}
		}
	}

	// 2. VorbisComment 原生歌词 (FLAC/OGG 等)
	if (metadata.native?.vorbis) {
		const lyricsFrames = metadata.native.vorbis.filter((frame: { id: string }) => frame.id === "LYRICS")
		if (lyricsFrames && lyricsFrames.length > 0) {
			lyrics = String(lyricsFrames[0].value)
			if (lyrics) {
				return { lyrics, hasLyrics: true }
			}
		}
	}

	// 3. 其他格式的歌词 (common.lyrics)
	if (metadata.common?.lyrics) {
		lyrics = extractLyricsFromCommon(metadata.common.lyrics)
		if (lyrics) {
			return { lyrics, hasLyrics: true }
		}
	}

	// 4. 同目录同名 LRC 文件
	const lrcPath = filePath.substring(0, filePath.lastIndexOf(".")) + ".lrc"
	try {
		const lrcStat = await fs.stat(lrcPath)
		if (lrcStat.isFile()) {
			lyrics = await fs.readFile(lrcPath, "utf-8")
			if (lyrics) {
				return { lyrics, hasLyrics: true }
			}
		}
	} catch {
		// LRC 文件不存在，忽略
	}

	return { lyrics: null, hasLyrics: false }
}
