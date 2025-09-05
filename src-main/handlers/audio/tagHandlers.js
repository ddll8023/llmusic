/**
 * 标签编辑相关的 IPC 处理器
 *
 * 处理来自渲染进程的标签编辑请求，包括：
 * - 获取歌曲标签信息
 * - 更新歌曲标签
 * - 验证标签数据
 */

const { CHANNELS } = require("../../constants/ipcChannels");
const {
	getSongById,
	parseSongFromFile,
} = require("../data/Database");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const ffprobePath = require("ffprobe-static").path;
const { parseFile } = require("music-metadata");
const fs = require("fs").promises;
const path = require("path");
const os = require("os");

// 修正打包后的二进制文件路径
const correctedFfmpegPath = ffmpegPath.replace("app.asar", "app.asar.unpacked");
const correctedFfprobePath = ffprobePath.replace(
	"app.asar",
	"app.asar.unpacked"
);

// 设置ffmpeg路径
ffmpeg.setFfmpegPath(correctedFfmpegPath);
ffmpeg.setFfprobePath(correctedFfprobePath);

// 支持的音频格式
const SUPPORTED_FORMATS = [".mp3", ".flac", ".m4a", ".aac", ".ogg", ".wav"];

/**
 * 获取音频文件的元数据标签
 * @param {string} filePath 音频文件路径
 * @returns {Promise<Object>} 标签数据对象
 */
async function getSongTags(filePath) {
	try {
		// 检查文件是否存在
		await fs.access(filePath);

		// 检查文件格式是否支持
		const ext = path.extname(filePath).toLowerCase();
		if (!SUPPORTED_FORMATS.includes(ext)) {
			throw new Error(`不支持的音频格式: ${ext}`);
		}

		// 使用 music-metadata 解析元数据
		const metadata = await parseFile(filePath, {
			skipCovers: true, // 跳过封面数据，只获取标签
			skipPostHeaders: true,
		});

		// 提取标准标签字段
		const tags = {
			title: metadata.common.title || "",
			artist: metadata.common.artist || "",
			album: metadata.common.album || "",
			year: metadata.common.year || "",

			// 技术信息 (只读)
			duration: metadata.format.duration || 0,
			bitrate: metadata.format.bitrate || 0,
			sampleRate: metadata.format.sampleRate || 0,
			format: metadata.format.container || "",
			codec: metadata.format.codec || "",
		};

		return {
			success: true,
			tags,
			filePath,
			format: ext.substring(1), // 移除点号
		};
	} catch (error) {
		console.error("获取歌曲标签失败:", error);
		return {
			success: false,
			error: error.message,
			filePath,
		};
	}
}

/**
 * 验证标签数据的有效性
 * @param {Object} tags 标签数据对象
 * @returns {Object} 验证结果
 */
function validateTagChanges(tags) {
	const errors = [];
	const warnings = [];

	// 验证必填字段
	if (!tags.title || tags.title.trim() === "") {
		errors.push("歌曲标题不能为空");
	}

	// 验证年份格式
	if (tags.year && tags.year !== "") {
		const year = parseInt(tags.year);
		if (isNaN(year) || year < 1900 || year > new Date().getFullYear() + 1) {
			errors.push(
				"年份格式不正确，应为1900-" +
					(new Date().getFullYear() + 1) +
					"之间的数字"
			);
		}
	}

	// 验证字符串长度
	const maxLengths = {
		title: 255,
		artist: 255,
		album: 255,
	};

	Object.entries(maxLengths).forEach(([field, maxLength]) => {
		if (tags[field] && tags[field].length > maxLength) {
			errors.push(`${field}字段长度不能超过${maxLength}个字符`);
		}
	});

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}

/**
 * 更新音频文件的元数据标签
 * @param {string} filePath 音频文件路径
 * @param {Object} tags 新的标签数据
 * @returns {Promise<Object>} 更新结果
 */
async function updateSongTags(filePath, tags) {
	try {
		// 验证标签数据
		const validation = validateTagChanges(tags);
		if (!validation.valid) {
			return {
				success: false,
				error: "标签数据验证失败: " + validation.errors.join(", "),
				validation,
			};
		}

		// 检查文件是否存在
		await fs.access(filePath);

		// 检查文件格式是否支持
		const ext = path.extname(filePath).toLowerCase();
		if (!SUPPORTED_FORMATS.includes(ext)) {
			throw new Error(`不支持的音频格式: ${ext}`);
		}

		// 创建临时文件路径
		const tempDir = os.tmpdir();
		const tempFileName = `temp_${Date.now()}_${path.basename(filePath)}`;
		const tempFilePath = path.join(tempDir, tempFileName);

		// 构建ffmpeg命令
		const command = ffmpeg(filePath);

		// 复制所有流但不重新编码
		command.outputOptions(["-c", "copy"]);

		// 添加元数据标签
		if (tags.title) command.outputOptions(["-metadata", `title=${tags.title}`]);
		if (tags.artist)
			command.outputOptions(["-metadata", `artist=${tags.artist}`]);
		if (tags.album) command.outputOptions(["-metadata", `album=${tags.album}`]);
		if (tags.year) command.outputOptions(["-metadata", `date=${tags.year}`]);

		// 执行ffmpeg命令
		await new Promise((resolve, reject) => {
			command.output(tempFilePath).on("end", resolve).on("error", reject).run();
		});

		// 备份原文件
		const backupPath = filePath + ".backup";
		await fs.copyFile(filePath, backupPath);

		try {
			// 用临时文件替换原文件
			await fs.copyFile(tempFilePath, filePath);

			// 删除临时文件和备份文件
			await fs.unlink(tempFilePath);
			await fs.unlink(backupPath);

			return {
				success: true,
				message: "标签更新成功",
				filePath,
				validation,
			};
		} catch (replaceError) {
			// 如果替换失败，恢复备份文件
			try {
				await fs.copyFile(backupPath, filePath);
				await fs.unlink(backupPath);
			} catch (restoreError) {
				console.error("恢复备份文件失败:", restoreError);
			}
			throw replaceError;
		}
	} catch (error) {
		console.error("更新歌曲标签失败:", error);
		return {
			success: false,
			error: error.message,
			filePath,
		};
	}
}

/**
 * 创建标签编辑相关的 IPC 处理器
 * @returns {{ handlers: Array<{channel:string, handler:Function}>, cleanup: Function }}
 */
function createTagHandlers() {
	const handlers = [
		{
			channel: CHANNELS.GET_SONG_TAGS,
			handler: async (event, songId) => {
				try {
					if (!songId) {
						return { success: false, error: "歌曲ID不能为空" };
					}

					// 从数据库获取歌曲信息
					const song = await getSongById(songId);
					if (!song) {
						return { success: false, error: "未找到指定的歌曲" };
					}

					// 从文件读取最新的标签信息
					const tagResult = await getSongTags(song.filePath);
					if (!tagResult.success) {
						return {
							success: false,
							error: `读取标签失败: ${tagResult.error}`,
							songId,
						};
					}

					return {
						success: true,
						songId,
						song: {
							id: song.id,
							title: song.title,
							artist: song.artist,
							album: song.album,
							filePath: song.filePath,
						},
						tags: tagResult.tags,
						format: tagResult.format,
					};
				} catch (error) {
					console.error("获取歌曲标签失败:", error);
					return {
						success: false,
						error: error.message,
						songId,
					};
				}
			},
		},

		{
			channel: CHANNELS.UPDATE_SONG_TAGS,
			handler: async (event, { songId, tags }) => {
				try {
					if (!songId) {
						return { success: false, error: "歌曲ID不能为空" };
					}

					if (!tags || typeof tags !== "object") {
						return { success: false, error: "标签数据不能为空" };
					}

					// 从数据库获取歌曲信息
					const song = await getSongById(songId);
					if (!song) {
						return { success: false, error: "未找到指定的歌曲" };
					}

					// 更新文件标签
					const updateResult = await updateSongTags(song.filePath, tags);
					if (!updateResult.success) {
						return {
							success: false,
							error: updateResult.error,
							validation: updateResult.validation,
							songId,
						};
					}

					// 重新解析文件以获取更新后的元数据
					try {
						const updatedSong = await parseSongFromFile(
							song.filePath,
							song.id,
							song.libraryId
						);
						if (updatedSong) {
							// 数据库会在 parseSongFromFile 中自动更新
							return {
								success: true,
								message: "标签更新成功",
								songId,
								updatedSong,
								validation: updateResult.validation,
							};
						} else {
							// 文件标签更新成功，但数据库更新失败
							return {
								success: true,
								message: "标签更新成功，但数据库同步失败",
								songId,
								validation: updateResult.validation,
								warning: "请重新扫描音乐库以同步数据库",
							};
						}
					} catch (parseError) {
						console.error("重新解析歌曲文件失败:", parseError);
						return {
							success: true,
							message: "标签更新成功，但数据库同步失败",
							songId,
							validation: updateResult.validation,
							warning: "请重新扫描音乐库以同步数据库",
						};
					}
				} catch (error) {
					console.error("更新歌曲标签失败:", error);
					return {
						success: false,
						error: error.message,
						songId,
					};
				}
			},
		},

		{
			channel: CHANNELS.VALIDATE_TAG_CHANGES,
			handler: async (event, tags) => {
				try {
					if (!tags || typeof tags !== "object") {
						return { success: false, error: "标签数据不能为空" };
					}

					const validation = validateTagChanges(tags);

					return {
						success: true,
						validation,
					};
				} catch (error) {
					console.error("验证标签数据失败:", error);
					return {
						success: false,
						error: error.message,
					};
				}
			},
		},
	];

	return {
		handlers,
		cleanup: () => {
			// 清理资源（如果需要）
			console.log("标签编辑处理器已清理");
		},
	};
}

module.exports = {
	createTagHandlers,
	getSongTags,
	updateSongTags,
	validateTagChanges,
	SUPPORTED_FORMATS,
};
