/**
 * 时间格式化工具函数
 * 统一管理所有时间相关的格式化逻辑
 */

/**
 * 格式化秒数为 mm:ss 格式
 * @param {number} seconds 秒数
 * @returns {string} 格式化后的时间字符串
 */
export const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds === null || seconds === undefined) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * 格式化毫秒为 mm:ss 格式
 * @param {number} ms 毫秒数
 * @returns {string} 格式化后的时间字符串
 */
export const formatTimeFromMs = (ms) => {
    if (ms < 0 || isNaN(ms) || ms === null || ms === undefined) return '--:--';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

/**
 * 格式化时长（秒数）为 mm:ss 格式
 * @param {number} seconds 秒数
 * @returns {string} 格式化后的时间字符串
 */
export const formatDuration = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

/**
 * 格式化当前时间和总时长为 "mm:ss / mm:ss" 格式
 * @param {number} currentTime 当前时间（秒）
 * @param {number} totalTime 总时长（秒）
 * @returns {string} 格式化后的时间字符串
 */
export const formatTimeProgress = (currentTime, totalTime) => {
    const current = formatTime(currentTime);
    const total = totalTime ? formatTime(totalTime) : '0:00';
    return `${current} / ${total}`;
};
