import path from "path"

/** 音乐文件扩展名白名单 */
const ALLOWED_AUDIO_EXTENSIONS = new Set([
	".mp3", ".flac", ".wav", ".m4a", ".aac", ".ogg",
	".opus", ".wma", ".ape", ".tta",
])

/** 封面图片扩展名白名单 */
const ALLOWED_COVER_EXTENSIONS = new Set([
	".jpg", ".jpeg", ".png", ".webp",
])

/**
 * 安全化文件路径：归一化、阻断目录遍历、校验扩展名
 * @param inputPath 用户传入的原始路径
 * @param allowedExts 允许的扩展名集合（不传则只做基础安全校验）
 * @returns 安全化后的绝对路径，校验不通过返回 null
 */
export function sanitizeFilePath(
	inputPath: string,
	allowedExts?: Set<string>
): string | null {
	if (!inputPath || typeof inputPath !== "string") return null

	// 归一化路径
	const normalized = path.resolve(inputPath)

	// 阻断目录遍历：检查归一化后的路径是否包含 ..
	if (normalized.includes("..")) return null

	// 阻断空路径
	if (normalized === "." || normalized === "/") return null

	// 可选：校验扩展名
	if (allowedExts) {
		const ext = path.extname(normalized).toLowerCase()
		if (!allowedExts.has(ext)) return null
	}

	return normalized
}

/**
 * 安全化文件路径（音频文件）
 */
export function sanitizeAudioPath(inputPath: string): string | null {
	return sanitizeFilePath(inputPath, ALLOWED_AUDIO_EXTENSIONS)
}

/**
 * 安全化文件路径（封面图片）
 */
export function sanitizeCoverPath(inputPath: string): string | null {
	return sanitizeFilePath(inputPath, ALLOWED_COVER_EXTENSIONS)
}

/**
 * 安全化目录路径：仅做归一化和遍历阻断，不校验扩展名
 */
export function sanitizeDirPath(inputPath: string): string | null {
	return sanitizeFilePath(inputPath)
}
