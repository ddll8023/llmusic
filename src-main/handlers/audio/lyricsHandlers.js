const fs = require("fs").promises;
const { CHANNELS } = require("../../constants/ipcChannels");
const { getSongById } = require("../../services/data/Database");
const { parseLrc } = require("../../services/audio/LyricsParser");

/**
 * 获取歌曲歌词（支持多种格式：内嵌LRC、JSON同步歌词、纯文本、外部LRC文件）
 * @param {string} songId - 歌曲ID
 * @returns {Object} 包含歌词数据的结果对象
 */
async function getLyrics(songId) {
	const song = await getSongById(songId);
	if (!song) return { success: false, error: "歌曲不存在" };
	// 内嵌歌词
	if (song.hasLyrics && song.lyrics) {
		const text = song.lyrics;

		// 1. 检查 LRC 格式
		if (/\[\d{2}:\d{2}\.\d{2,3}\]/.test(text)) {
			const parsed = parseLrc(text);
			return {
				success: true,
				lyrics: parsed.lyrics,
				metadata: parsed.metadata,
				format: "lrc",
				source: "embedded",
			};
		}

		// 2. 检查类 QQ 音乐的 JSON 格式
		if (
			typeof text === "string" &&
			text.trim().startsWith("{") &&
			text.includes("syncText")
		) {
			try {
				const jsonData = JSON.parse(text);
				if (jsonData && Array.isArray(jsonData.syncText)) {
					const parsedLines = jsonData.syncText
						.map((item) => {
							if (
								item &&
								typeof item.timestamp === "number" &&
								typeof item.text === "string"
							) {
								return {
									time: item.timestamp, // keep ms for frontend formatter
									text: item.text,
								};
							}
							return null;
						})
						.filter(Boolean);

					// 按时间排序
					parsedLines.sort((a, b) => a.time - b.time);

					return {
						success: true,
						lyrics: parsedLines,
						format: "json-synced",
						source: "embedded",
					};
				}
			} catch (e) {
				// 解析失败，则继续按纯文本处理
				console.warn("解析内嵌JSON歌词失败，将作为纯文本处理:", e.message);
			}
		}

		// 3. 作为纯文本处理
		return {
			success: true,
			lyrics: text.split(/\r?\n/).map((t) => ({ time: -1, text: t.trim() })),
			format: "text",
		};
	}
	// 尝试外部 LRC
	const lrcPath = (song.filePath || "").replace(/\.[^.]+$/, ".lrc");
	try {
		const raw = await fs.readFile(lrcPath, "utf-8");
		const parsed = parseLrc(raw);
		return {
			success: true,
			lyrics: parsed.lyrics,
			metadata: parsed.metadata,
			format: "lrc",
			source: "external",
		};
	} catch (_) {
		return { success: false, error: "歌曲没有可用歌词" };
	}
}

/**
 * 创建歌词相关的IPC处理器
 * @returns {{ handlers: Array<{channel:string, handler:Function}>, cleanup: Function }}
 */
function createLyricsHandlers() {
	const handlers = [
		{
			channel: CHANNELS.GET_LYRICS,
			handler: (event, songId) => getLyrics(songId),
		},
	];

	return {
		handlers,
		cleanup: () => {
			// 暂时无需清理操作
		},
	};
}

module.exports = { createLyricsHandlers };
