/** 本地歌曲 */
export interface Song {
	/** @deprecated 兼容旧数据中的 path 字段，优先使用 filePath */
	path?: string
	id: string
	libraryId?: string
	title: string
	artist: string
	album: string
	albumArtist?: string
	year?: number | null
	duration: number
	filePath: string
	fileSize?: number
	hasCover?: boolean
	hasLyrics?: boolean
	lyrics?: string | null
	modifiedAt?: number
	format?: string
	bitrate?: number
	sampleRate?: number
	channels?: number
	playCount?: number
	cover?: string
	fileExists?: boolean
	genre?: string | null
	trackNumber?: number | null
	discNumber?: number | null
	addedAt?: string
}

/** 歌词行 */
export interface LyricLine {
	time: number
	text: string
	timeText: string
	/** 翻译歌词 — 同时间戳的第二行自动合并 */
	translation?: string
	/** 罗马音/音译 */
	roma?: string
	/** 逐字歌词数据 — LRC 内嵌 <time>字 格式解析结果 */
	words?: LyricWord[]
}

/** 逐字歌词 — 类似 KTV 内嵌时间戳的单个字 */
export interface LyricWord {
	word: string
	/** 该字的开始时间 (ms，相对于歌曲起点) */
	time: number
	/** 该字的持续时间 (ms) */
	duration: number
}

/** 封面信息 */
export interface CoverInfo {
	data: string
	format: string
	source: string
}
