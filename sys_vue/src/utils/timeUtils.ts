/**
 * 时间格式化工具函数
 * 统一管理所有时间相关的格式化逻辑
 */

/** 格式化秒数为 mm:ss 格式 */
export const formatTime = (seconds: number): string => {
	if (isNaN(seconds) || seconds === null || seconds === undefined) return '0:00'
	const mins = Math.floor(seconds / 60)
	const secs = Math.floor(seconds % 60)
	return `${mins}:${secs.toString().padStart(2, '0')}`
}

/** 格式化毫秒为 mm:ss 格式 */
export const formatTimeFromMs = (ms: number): string => {
	if (ms < 0 || isNaN(ms) || ms === null || ms === undefined) return '--:--'
	const totalSeconds = Math.floor(ms / 1000)
	const minutes = Math.floor(totalSeconds / 60)
	const seconds = totalSeconds % 60
	return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/** 格式化时长（秒数）为 mm:ss 格式（与 formatTime 同义，保留语义化别名） */
export const formatDuration = formatTime
