// 支持的音频格式定义

export interface AudioFormatInfo {
	extension: string
	mimeType: string
	description: string
	lossy: boolean
	maxBitrate: number | null
	commonBitrates: (number | string)[]
}

export interface CoverFormatInfo {
	extension: string
	mimeType: string
	description: string
}

export interface LyricsFormatInfo {
	extension: string
	description: string
	timed: boolean
}

// 支持的音频文件扩展名
export const SUPPORTED_AUDIO_EXTENSIONS: string[] = [
	".mp3",
	".flac",
	".wav",
	".m4a",
	".aac",
	".ogg",
	".opus",
	".wma",
	".ape",
	".tta",
	".dsd",
	".dsf",
	".dff",
]

// 音频格式详细信息
export const AUDIO_FORMATS: Record<string, AudioFormatInfo> = {
	mp3: {
		extension: ".mp3",
		mimeType: "audio/mpeg",
		description: "MPEG Audio Layer 3",
		lossy: true,
		maxBitrate: 320,
		commonBitrates: [128, 192, 256, 320],
	},
	flac: {
		extension: ".flac",
		mimeType: "audio/flac",
		description: "Free Lossless Audio Codec",
		lossy: false,
		maxBitrate: null,
		commonBitrates: ["variable"],
	},
	wav: {
		extension: ".wav",
		mimeType: "audio/wav",
		description: "Waveform Audio File Format",
		lossy: false,
		maxBitrate: null,
		commonBitrates: ["uncompressed"],
	},
	m4a: {
		extension: ".m4a",
		mimeType: "audio/mp4",
		description: "MPEG-4 Audio",
		lossy: true,
		maxBitrate: 320,
		commonBitrates: [128, 192, 256, 320],
	},
	aac: {
		extension: ".aac",
		mimeType: "audio/aac",
		description: "Advanced Audio Coding",
		lossy: true,
		maxBitrate: 320,
		commonBitrates: [128, 192, 256, 320],
	},
	ogg: {
		extension: ".ogg",
		mimeType: "audio/ogg",
		description: "Ogg Vorbis",
		lossy: true,
		maxBitrate: 500,
		commonBitrates: [128, 192, 256, 320],
	},
	opus: {
		extension: ".opus",
		mimeType: "audio/opus",
		description: "Opus Audio Codec",
		lossy: true,
		maxBitrate: 510,
		commonBitrates: [96, 128, 160, 192],
	},
	wma: {
		extension: ".wma",
		mimeType: "audio/x-ms-wma",
		description: "Windows Media Audio",
		lossy: true,
		maxBitrate: 320,
		commonBitrates: [128, 192, 256, 320],
	},
	ape: {
		extension: ".ape",
		mimeType: "audio/x-ape",
		description: "Monkey's Audio",
		lossy: false,
		maxBitrate: null,
		commonBitrates: ["variable"],
	},
	tta: {
		extension: ".tta",
		mimeType: "audio/x-tta",
		description: "True Audio",
		lossy: false,
		maxBitrate: null,
		commonBitrates: ["variable"],
	},
}

// 封面图片格式
export const COVER_IMAGE_FORMATS: Record<string, CoverFormatInfo> = {
	jpeg: {
		extension: ".jpg",
		mimeType: "image/jpeg",
		description: "JPEG Image",
	},
	png: {
		extension: ".png",
		mimeType: "image/png",
		description: "PNG Image",
	},
	webp: {
		extension: ".webp",
		mimeType: "image/webp",
		description: "WebP Image",
	},
}

// 支持的封面图片扩展名
export const SUPPORTED_COVER_EXTENSIONS: string[] = [".jpg", ".jpeg", ".png", ".webp"]

// 歌词格式
export const LYRICS_FORMATS: Record<string, LyricsFormatInfo> = {
	lrc: {
		extension: ".lrc",
		description: "LRC Timed Lyrics",
		timed: true,
	},
	txt: {
		extension: ".txt",
		description: "Plain Text Lyrics",
		timed: false,
	},
	srt: {
		extension: ".srt",
		description: "SubRip Subtitle",
		timed: true,
	},
}

/**
 * 检查文件是否为支持的音频格式
 */
export function isSupportedAudioFile(filePath: string): boolean {
	if (!filePath || typeof filePath !== "string") return false
	const ext = filePath.toLowerCase().split(".").pop()
	return SUPPORTED_AUDIO_EXTENSIONS.includes(`.${ext}`)
}

/**
 * 检查文件是否为支持的封面图片格式
 */
export function isSupportedCoverFile(filePath: string): boolean {
	if (!filePath || typeof filePath !== "string") return false
	const ext = filePath.toLowerCase().split(".").pop()
	return SUPPORTED_COVER_EXTENSIONS.includes(`.${ext}`)
}

/**
 * 获取音频格式信息
 */
export function getAudioFormatInfo(extension: string): AudioFormatInfo | null {
	const cleanExt = extension.toLowerCase().replace(".", "")
	return AUDIO_FORMATS[cleanExt] || null
}
