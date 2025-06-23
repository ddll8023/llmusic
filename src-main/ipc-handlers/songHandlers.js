const path = require("path");
const fs = require("fs").promises;
const { parseFile } = require("music-metadata");
const LRUCache = require("../utils/lruCache");
const { CHANNELS } = require("../constants/ipcChannels");
const {
	getSongsByLibrary,
	getSongById,
	parseSongFromFile,
	validateSongFiles,
	_clearAllSongs_DANGEROUS,
	incrementPlayCount,
} = require("../database");
const { audioProcessor } = require("../audioProcessor");
const { parseLrc } = require("../lyricsParser");
const { isScanRunning } = require("./scanHandlers");

// ---- 封面缓存 ----
const coverCache = new LRUCache(100);

// 提取封面：从文件内嵌或目录图片
async function extractCoverFromMusicFile(filePath) {
	try {
		await fs.access(filePath);
		const metadata = await parseFile(filePath, {
			skipCovers: false,
		});
		if (metadata.common.picture && metadata.common.picture.length > 0) {
			const pic = metadata.common.picture[0];
			const buf = Buffer.isBuffer(pic.data) ? pic.data : Buffer.from(pic.data);
			if (buf.length === 0) return null;
			return {
				data: buf.toString("base64"),
				format: pic.format || "image/jpeg",
				source: "music_file",
			};
		}
		return null;
	} catch (err) {
		return null;
	}
}

async function findCoverInDirectory(songPath, song) {
	const dir = path.dirname(songPath);
	const nameBase = path.basename(songPath, path.extname(songPath));
	const candidates = [
		`${nameBase}.jpg`,
		`${nameBase}.png`,
		"cover.jpg",
		"cover.png",
		"folder.jpg",
		"folder.png",
		`${(song.album || "").replace(/[/\\?%*:|"<>]/g, "_")}.jpg`,
		`${(song.album || "").replace(/[/\\?%*:|"<>]/g, "_")}.png`,
	];
	for (const file of candidates) {
		const full = path.join(dir, file);
		try {
			await fs.access(full);
			const buf = await fs.readFile(full);
			if (!Buffer.isBuffer(buf) || buf.length === 0) continue;
			const format =
				path.extname(full).toLowerCase() === ".png"
					? "image/png"
					: "image/jpeg";
			return { data: buf.toString("base64"), format, source: "directory" };
		} catch (_) {
			continue;
		}
	}
	return null;
}

async function getCover(songId) {
	if (coverCache.has(songId)) {
		return {
			success: true,
			cover: coverCache.get(songId).data,
			format: coverCache.get(songId).format,
			source: "memory-cache",
		};
	}
	const song = await getSongById(songId);
	if (!song) return { success: false, error: "歌曲未找到" };
	const filePath = song.filePath || song.path;
	if (!filePath) return { success: false, error: "歌曲路径缺失" };
	let info = await extractCoverFromMusicFile(filePath);
	if (!info) info = await findCoverInDirectory(filePath, song);
	if (info) {
		coverCache.set(songId, { data: info.data, format: info.format });
		return {
			success: true,
			cover: info.data,
			format: info.format,
			source: info.source,
		};
	}
	return { success: false, error: "未找到封面" };
}

// ---- 歌词处理 ----
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

/** 创建歌曲/音频相关处理器 */
function createSongHandlers(mainWindow) {
	// 转发 audioProcessor 事件
	audioProcessor.on("processing:progress", (progress) => {
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send(CHANNELS.PLAYER_PROGRESS, progress);
		}
	});
	audioProcessor.on("processing:complete", (result) => {
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send(CHANNELS.PLAYER_ENDED, result);
		}
	});
	audioProcessor.on("error", (error) => {
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send(CHANNELS.PLAYER_ERROR, {
				message: error.message,
				code: error.code,
			});
		}
	});

	const handlers = [
		{
			channel: CHANNELS.GET_SONGS,
			handler: async (event, { libraryId = "all" } = {}) => {
				try {
					const songs = await getSongsByLibrary(libraryId);
					return { success: true, songs };
				} catch (err) {
					return { success: false, error: err.message };
				}
			},
		},
		{
			channel: CHANNELS.GET_SONG_BY_ID,
			handler: async (event, id) => {
				try {
					const song = await getSongById(id);
					return { success: true, song };
				} catch (err) {
					return { success: false, error: err.message };
				}
			},
		},
		{
			channel: CHANNELS.GET_LYRICS,
			handler: (event, songId) => getLyrics(songId),
		},
		{
			channel: CHANNELS.GET_SONG_COVER,
			handler: (event, songId) => getCover(songId),
		},
		{
			channel: CHANNELS.FORCE_EXTRACT_COVER,
			handler: async (event, songId) => {
				coverCache.delete(songId);
				return await getCover(songId);
			},
		},
		{
			channel: CHANNELS.VALIDATE_SONG_FILES,
			handler: async () => {
				try {
					const results = await validateSongFiles();
					return { success: true, results };
				} catch (err) {
					return { success: false, error: err.message };
				}
			},
		},
		{
			channel: CHANNELS.PARSE_SONG_FROM_FILE,
			handler: async (event, filePath) => {
				try {
					const song = await parseSongFromFile(filePath);
					return song
						? { success: true, song }
						: { success: false, error: "无法解析文件" };
				} catch (err) {
					return { success: false, error: err.message };
				}
			},
		},
		{
			channel: CHANNELS.CLEAR_ALL_SONGS,
			handler: async () => {
				if (isScanRunning())
					return { success: false, error: "扫描进行中，无法清空" };
				try {
					await _clearAllSongs_DANGEROUS();
					coverCache.clear();
					return { success: true };
				} catch (err) {
					return { success: false, error: err.message };
				}
			},
		},
		// ---- 播放控制 ----
		{
			channel: CHANNELS.PLAYER_PLAY,
			handler: async (event, options) => {
				try {
					const result = await audioProcessor.processAudio(
						options.filePath,
						options
					);
					mainWindow.webContents.send(CHANNELS.PLAYER_AUDIO_DATA, result);
					return { success: true };
				} catch (err) {
					return {
						success: false,
						error: err.message,
						code: err.code || "UNKNOWN_ERROR",
					};
				}
			},
		},
		{ channel: CHANNELS.PLAYER_PAUSE, handler: () => ({ success: true }) },
		{ channel: CHANNELS.PLAYER_RESUME, handler: () => ({ success: true }) },
		{
			channel: CHANNELS.PLAYER_STOP,
			handler: () => {
				audioProcessor.cancelProcessing();
				return { success: true };
			},
		},
		{
			channel: CHANNELS.PLAYER_SEEK,
			handler: async (event, { position }) => {
				try {
					if (audioProcessor.filePath) {
						await audioProcessor.cancelProcessing();
						return { success: true, action: "REPROCESS_NEEDED" };
					}
					return { success: false, error: "没有正在处理的音频" };
				} catch (err) {
					return { success: false, error: err.message };
				}
			},
		},
		{ channel: CHANNELS.PLAYER_SET_VOLUME, handler: () => ({ success: true }) },
		{ channel: CHANNELS.PLAYER_SET_MUTED, handler: () => ({ success: true }) },
		{
			channel: CHANNELS.PLAYER_GET_STATUS,
			handler: () => {
				try {
					const status = audioProcessor.getStatus();
					return { success: true, ...status };
				} catch (err) {
					return { success: false, error: err.message };
				}
			},
		},
		{
			channel: CHANNELS.INCREMENT_PLAY_COUNT,
			handler: async (event, songId) => {
				try {
					if (!songId) {
						return { success: false, error: "歌曲ID不能为空" };
					}
					const updatedSong = await incrementPlayCount(songId);
					return { success: true, song: updatedSong };
				} catch (err) {
					return { success: false, error: err.message };
				}
			},
		},
	];

	return { handlers, cleanup: () => {} };
}

module.exports = { createSongHandlers };
