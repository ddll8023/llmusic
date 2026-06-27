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
}

/** 封面信息 */
export interface CoverInfo {
	data: string
	format: string
	source: string
}
