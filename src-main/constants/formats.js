// 支持的音频格式定义

// 支持的音频文件扩展名
const SUPPORTED_AUDIO_EXTENSIONS = [
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
];

// 音频格式详细信息
const AUDIO_FORMATS = {
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
};

// 封面图片格式
const COVER_IMAGE_FORMATS = {
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
};

// 支持的封面图片扩展名
const SUPPORTED_COVER_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

// 歌词格式
const LYRICS_FORMATS = {
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
};

/**
 * 检查文件是否为支持的音频格式
 * @param {string} filePath - 文件路径
 * @returns {boolean} 是否为支持的音频格式
 */
function isSupportedAudioFile(filePath) {
	if (!filePath || typeof filePath !== "string") return false;
	const ext = filePath.toLowerCase().split(".").pop();
	return SUPPORTED_AUDIO_EXTENSIONS.includes(`.${ext}`);
}

/**
 * 检查文件是否为支持的封面图片格式
 * @param {string} filePath - 文件路径
 * @returns {boolean} 是否为支持的封面格式
 */
function isSupportedCoverFile(filePath) {
	if (!filePath || typeof filePath !== "string") return false;
	const ext = filePath.toLowerCase().split(".").pop();
	return SUPPORTED_COVER_EXTENSIONS.includes(`.${ext}`);
}

/**
 * 获取音频格式信息
 * @param {string} extension - 文件扩展名
 * @returns {Object|null} 格式信息对象
 */
function getAudioFormatInfo(extension) {
	const cleanExt = extension.toLowerCase().replace(".", "");
	return AUDIO_FORMATS[cleanExt] || null;
}

module.exports = {
	SUPPORTED_AUDIO_EXTENSIONS,
	AUDIO_FORMATS,
	COVER_IMAGE_FORMATS,
	SUPPORTED_COVER_EXTENSIONS,
	LYRICS_FORMATS,
	isSupportedAudioFile,
	isSupportedCoverFile,
	getAudioFormatInfo,
};
