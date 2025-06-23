/**
 * @module lyricsParser
 * @description
 * 提供了对LRC格式歌词进行解析、处理和时间同步的功能。
 * 该模块经过优化，能够高效、健壮地处理标准及增强型LRC歌词文本。
 */

const TIMESTAMP_REGEX = /\[(\d{2}):(\d{2})[.:](\d{2,3})\]/g;
const METADATA_REGEX = /\[([a-zA-Z]+):(.*?)\]/;
const KNOWN_METADATA_TAGS = new Set(["ar", "ti", "al", "by", "offset"]);

/**
 * LRC格式歌词解析器
 * 支持常见的LRC格式和增强的LRC格式
 */

/**
 * 将时间戳正则匹配结果转换为毫秒。
 * @private
 * @param {RegExpExecArray} match - 正则表达式 `TIMESTAMP_REGEX` 的匹配结果。
 * @returns {number|null} 转换后的总毫秒数，如果输入无效则返回 null。
 */
function _parseTimestamp(match) {
	if (!match) return null;

	const minutes = parseInt(match[1], 10);
	const seconds = parseInt(match[2], 10);
	const millisecondsPart = match[3];
	// 兼容2位或3位毫秒
	const milliseconds =
		parseInt(millisecondsPart, 10) * (millisecondsPart.length === 2 ? 10 : 1);

	if (isNaN(minutes) || isNaN(seconds) || isNaN(milliseconds)) {
		return null;
	}

	return minutes * 60 * 1000 + seconds * 1000 + milliseconds;
}

/**
 * 解析LRC格式的歌词文本。
 * 此函数会解析包含元数据和多时间戳的LRC文件。
 *
 * @param {string} lrcText - 要解析的LRC格式的字符串。
 * @returns {{metadata: object, lyrics: Array<{time: number, text: string, timeText: string}>}}
 *   一个包含元数据和歌词数组的对象。
 *   - `metadata`: 包含如 `offset`, `ar` (艺术家), `ti` (标题) 等键值对。
 *   - `lyrics`: 一个已排序的歌词对象数组，每个对象包含 `time` (毫秒), `text` (歌词内容), 和 `timeText` (格式化时间)。
 */
function parseLrc(lrcText) {
	if (typeof lrcText !== "string") {
		return { metadata: {}, lyrics: [] };
	}

	const lines = lrcText.split(/\r?\n/);
	const metadata = {};
	const lyrics = [];

	for (const line of lines) {
		const trimmedLine = line.trim();
		if (!trimmedLine) continue;

		// 尝试解析为元数据
		const metadataMatch = trimmedLine.match(METADATA_REGEX);
		if (
			metadataMatch &&
			KNOWN_METADATA_TAGS.has(metadataMatch[1].toLowerCase())
		) {
			metadata[metadataMatch[1].toLowerCase()] = metadataMatch[2].trim();
			continue;
		}

		// 尝试解析为歌词行
		const timestamps = [];
		let lyricText = trimmedLine;
		let match;

		// 重置正则表达式的 lastIndex
		TIMESTAMP_REGEX.lastIndex = 0;
		while ((match = TIMESTAMP_REGEX.exec(trimmedLine)) !== null) {
			const time = _parseTimestamp(match);
			if (time !== null) {
				timestamps.push(time);
			}
		}

		if (timestamps.length > 0) {
			// 从行中移除所有时间戳以获得纯文本
			lyricText = trimmedLine.replace(TIMESTAMP_REGEX, "").trim();

			for (const time of timestamps) {
				lyrics.push({
					time,
					text: lyricText,
					timeText: formatTime(time),
				});
			}
		}
	}

	lyrics.sort((a, b) => a.time - b.time);

	return { metadata, lyrics };
}

/**
 * 格式化时间为 `mm:ss.xx` 格式。
 *
 * @param {number} ms - 需要格式化的毫秒时间。
 * @returns {string} 格式化的时间字符串，如 "01:23.45"。若输入无效则返回 "00:00.00"。
 */
function formatTime(ms) {
	if (typeof ms !== "number" || ms < 0 || isNaN(ms)) {
		return "00:00.00";
	}
	const totalSeconds = Math.floor(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	const milliseconds = ms % 1000;

	return `${minutes.toString().padStart(2, "0")}:${seconds
		.toString()
		.padStart(2, "0")}.${Math.floor(milliseconds / 10)
		.toString()
		.padStart(2, "0")}`;
}

/**
 * 在已排序的歌词数组中，通过二分查找找到当前时间点应高亮的歌词索引。
 *
 * @param {Array<{time: number, text: string}>} lyrics - 已按时间升序排序的歌词对象数组。
 * @param {number} currentTime - 当前的播放时间（毫秒）。
 * @param {number} [offset=0] - 时间偏移量（毫秒），用于歌词同步微调。
 * @returns {number} 匹配到的当前歌词行的索引。如果时间早于第一句歌词或无匹配，则返回 -1。
 */
function findCurrentLyricIndex(lyrics, currentTime, offset = 0) {
	if (!Array.isArray(lyrics) || lyrics.length === 0) {
		return -1;
	}

	const adjustedTime = currentTime + offset;

	let low = 0;
	let high = lyrics.length - 1;
	let result = -1;

	while (low <= high) {
		const mid = low + Math.floor((high - low) / 2);
		const midTime = lyrics[mid].time;

		if (midTime <= adjustedTime) {
			// mid 是一个可能的候选，我们记录它，并尝试在右侧寻找更接近的
			result = mid;
			low = mid + 1;
		} else {
			// mid 时间偏大，需要在左侧寻找
			high = mid - 1;
		}
	}

	return result;
}

module.exports = {
	parseLrc,
	findCurrentLyricIndex,
};
