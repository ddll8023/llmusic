const path = require("path");
const fs = require("fs").promises;
const { parseFile } = require("music-metadata");
const LRUCache = require("../../utils/cache/LRUCache");
const { CHANNELS } = require("../../constants/ipcChannels");
const { getSongById } = require("../../services/data/Database");

// ---- 封面缓存 ----
const coverCache = new LRUCache(100);

/**
 * 从音乐文件中提取内嵌封面
 * @param {string} filePath - 音乐文件路径
 * @returns {Object|null} 封面信息对象或null
 */
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

/**
 * 在歌曲文件所在目录中查找封面图片
 * @param {string} songPath - 歌曲文件路径
 * @param {Object} song - 歌曲信息对象
 * @returns {Object|null} 封面信息对象或null
 */
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

/**
 * 获取歌曲封面（带缓存）
 * @param {string} songId - 歌曲ID
 * @returns {Object} 包含封面数据的结果对象
 */
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

/**
 * 创建封面相关的IPC处理器
 * @returns {{ handlers: Array<{channel:string, handler:Function}>, cleanup: Function }}
 */
function createCoverHandlers() {
	const handlers = [
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
	];

	return {
		handlers,
		cleanup: () => {
			// 清理缓存
			coverCache.clear();
		},
	};
}

module.exports = { createCoverHandlers, coverCache };
