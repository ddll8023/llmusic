/**
 * 音频文件标签编辑器模块
 *
 * 该模块提供音频文件元数据标签的读取和写入功能，包括：
 * - 读取音频文件的元数据标签
 * - 验证标签数据的有效性
 * - 将修改后的标签写入音频文件
 * - 支持多种音频格式 (MP3, FLAC, M4A, OGG等)
 */

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

module.exports = {
	getSongTags,
	updateSongTags,
	validateTagChanges,
	SUPPORTED_FORMATS,
};
