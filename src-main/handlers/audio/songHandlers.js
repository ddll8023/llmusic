const { CHANNELS } = require("../../constants/ipcChannels");
const {
	getSongsByLibrary,
	getSongById,
	parseSongFromFile,
	_clearAllSongs_DANGEROUS,
	incrementPlayCount,
	deleteSong,
	addSongs,
} = require("../../services/data/Database");
const { isScanRunning } = require("../scan/scanHandlers");
const { coverCache } = require("./coverHandlers");

/**
 * 创建基础歌曲相关的IPC处理器
 * @returns {{ handlers: Array<{channel:string, handler:Function}>, cleanup: Function }}
 */
function createSongHandlers() {
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
		{
			channel: CHANNELS.DELETE_SONG,
			handler: async (event, songId) => {
				if (isScanRunning()) {
					return { success: false, error: "扫描进行中，无法删除歌曲" };
				}
				try {
					const result = await deleteSong(songId);
					if (result.success) {
						// 清除该歌曲的封面缓存
						coverCache.delete(songId);
					}
					return result;
				} catch (err) {
					return { success: false, error: err.message };
				}
			},
		},
		{
			channel: CHANNELS.IMPORT_MUSIC_FILES,
			handler: async (event, filePaths) => {
				if (isScanRunning()) {
					return { success: false, error: "扫描进行中，无法导入文件" };
				}

				try {
					if (!Array.isArray(filePaths) || filePaths.length === 0) {
						return { success: false, error: "未提供有效的文件路径" };
					}

					const parsedSongs = [];
					const failedFiles = [];

					// 解析每个文件
					for (const filePath of filePaths) {
						try {
							// 使用现有的parseSongFromFile函数解析歌曲
							const song = await parseSongFromFile(filePath);
							if (song) {
								parsedSongs.push(song);
							} else {
								failedFiles.push(filePath);
							}
						} catch (err) {
							console.error(`解析文件失败: ${filePath}`, err);
							failedFiles.push(filePath);
						}
					}

					// 添加到数据库
					if (parsedSongs.length > 0) {
						const result = await addSongs(parsedSongs);
						return {
							success: true,
							importedCount: result.addedCount,
							updatedCount: result.updatedCount,
							failedFiles: failedFiles,
							message: `成功导入 ${result.addedCount} 首新歌曲，更新了 ${result.updatedCount} 首歌曲`,
						};
					} else {
						return {
							success: false,
							error: `所有文件导入失败。失败的文件：${failedFiles.join(", ")}`,
						};
					}
				} catch (err) {
					console.error("导入音乐文件失败:", err);
					return { success: false, error: err.message };
				}
			},
		},
		{
			channel: CHANNELS.SEARCH_ONLINE_METADATA,
			handler: async (event, searchParams) => {
				// TODO: 实现与Python后端API的通信
				// Python后端已有search_song.py实现，需要建立IPC通信机制
				// 相关文件：python/untils/search_song.py
				try {
					console.log("在线搜索请求:", searchParams);

					// 当前为占位符实现，返回空结果
					// 需要实现：调用Python后端的搜索API (QQ音乐API)
					return {
						code: 200,
						data: [],
						message: "在线搜索功能开发中，需要连接Python后端API",
					};
				} catch (err) {
					console.error("在线搜索失败:", err);
					return {
						code: 500,
						error: err.message,
						message: "在线搜索服务暂时不可用",
					};
				}
			},
		},
	];

	return {
		handlers,
		cleanup: () => {
			// 暂时无需特殊清理操作
		},
	};
}

module.exports = { createSongHandlers };
