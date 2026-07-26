// 路径安全校验：音频路径白名单校验与文件名逃逸防护
import path from "path"
import { SUPPORTED_AUDIO_EXTENSIONS } from "../constants/formats"

/**
 * 校验是否为合法的音频文件路径：
 * - 必须是绝对路径
 * - 扩展名必须在 SUPPORTED_AUDIO_EXTENSIONS 白名单内（单一来源 constants/formats.ts）
 */
export function isAudioPath(p: unknown): p is string {
	if (typeof p !== "string" || p.length === 0) return false
	if (!path.isAbsolute(p)) return false
	const ext = path.extname(p).toLowerCase()
	return SUPPORTED_AUDIO_EXTENSIONS.includes(ext)
}

/**
 * 校验文件名是否安全（用于 path.join(targetDir, filename) 前的防逃逸检查）：
 * - 非空字符串
 * - 不含路径分隔符（/ 与 \）
 * - 不含 ".." 片段
 */
export function isSafeFilename(name: unknown): name is string {
	if (typeof name !== "string" || name.length === 0) return false
	if (name.includes("/") || name.includes("\\")) return false
	if (name.includes("..")) return false
	if (name === ".") return false
	return true
}

/**
 * 断言文件名安全，不安全时抛出错误
 */
export function assertSafeFilename(name: unknown): asserts name is string {
	if (!isSafeFilename(name)) {
		throw new Error("非法路径")
	}
}
