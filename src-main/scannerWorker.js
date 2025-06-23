const { parentPort } = require("worker_threads");
const fs = require("fs").promises;
const path = require("path");
const { parseFile } = require("music-metadata");
const { v4: uuidv4 } = require("uuid");

/**
 * 支持的音频文件扩展名
 * @type {string[]}
 */
const SUPPORTED_EXTENSIONS = [".mp3", ".flac", ".wav", ".ogg", ".m4a", ".aac"];

/**
 * 扫描状态控制
 * @type {Object}
 */
const scanState = {
	isCanceled: false,
	batchSize: {
		fileReporting: 100, // 每找到多少文件报告一次
		metadataParsing: 20, // 每批处理多少文件的元数据
	},
};

/**
 * 进度报告函数
 * @param {string} phase - 当前阶段
 * @param {string} message - 进度消息
 * @param {Object} [additionalData={}] - 附加数据
 */
function reportProgress(phase, message, additionalData = {}) {
	parentPort.postMessage({
		type: "progress",
		data: {
			phase,
			message,
			...additionalData,
		},
	});
}

// 监听来自主线程的消息
parentPort.on("message", async (message) => {
	try {
		switch (message.type) {
			case "start":
				await scanDirectory(message.dirPath, message.libraryId);
				break;
			case "cancel":
				scanState.isCanceled = true;
				reportProgress("canceled", "扫描已取消");
				break;
			default:
				throw new Error(`未知的消息类型: ${message.type}`);
		}
	} catch (error) {
		parentPort.postMessage({
			type: "error",
			data: { message: error.message, stack: error.stack },
		});
	}
});

/**
 * 递归扫描目录中的音频文件
 * @param {string} dirPath - 目录路径
 * @param {string} libraryId - 音乐库ID
 */
async function scanDirectory(dirPath, libraryId) {
	if (!dirPath || typeof dirPath !== "string") {
		throw new Error("无效的目录路径");
	}

	if (!libraryId || typeof libraryId !== "string") {
		throw new Error("无效的音乐库ID");
	}

	// 重置取消状态
	scanState.isCanceled = false;

	// 发送开始扫描进度
	reportProgress("starting", `开始扫描目录: ${dirPath}`);

	try {
		// 查找所有音频文件
		const allFiles = await findAllAudioFiles(dirPath);

		// 如果没有找到音频文件
		if (allFiles.length === 0) {
			parentPort.postMessage({
				type: "complete",
				data: { songs: [] },
			});
			return;
		}

		// 发送准备解析进度
		reportProgress(
			"preparing",
			`找到 ${allFiles.length} 个音频文件，开始解析...`,
			{
				total: allFiles.length,
			}
		);

		// 解析所有音频文件
		const songs = await parseAudioFiles(allFiles, libraryId);

		// 发送完成消息
		parentPort.postMessage({
			type: "complete",
			data: { songs },
		});
	} catch (error) {
		parentPort.postMessage({
			type: "error",
			data: {
				message: error.message,
				stack: error.stack,
			},
		});
	}
}

/**
 * 递归查找目录中所有音频文件
 * @param {string} dirPath - 目录路径
 * @returns {Promise<string[]>} 音频文件路径列表
 */
async function findAllAudioFiles(dirPath) {
	const audioFiles = [];
	let fileCount = 0;

	/**
	 * 递归遍历目录
	 * @param {string} currentPath - 当前目录路径
	 * @returns {Promise<void>}
	 */
	async function traverse(currentPath) {
		// 如果已取消，则中断
		if (scanState.isCanceled) return;

		try {
			// 读取目录内容
			const items = await fs.readdir(currentPath, { withFileTypes: true });

			// 遍历目录项
			for (const item of items) {
				// 如果已取消，则中断
				if (scanState.isCanceled) return;

				const itemPath = path.join(currentPath, item.name);

				if (item.isDirectory()) {
					// 递归处理子目录
					await traverse(itemPath);
				} else if (item.isFile()) {
					// 检查文件扩展名
					const ext = path.extname(item.name).toLowerCase();
					if (SUPPORTED_EXTENSIONS.includes(ext)) {
						audioFiles.push(itemPath);
						fileCount++;

						// 定期报告进度
						if (fileCount % scanState.batchSize.fileReporting === 0) {
							reportProgress(
								"finding_files",
								`已找到 ${fileCount} 个音频文件...`,
								{
									processed: fileCount,
								}
							);
						}
					}
				}
			}
		} catch (error) {
			console.error(`遍历目录 ${currentPath} 失败:`, error);
			// 继续处理其他目录，不中断整个扫描过程
		}
	}

	// 开始递归
	await traverse(dirPath);

	// 最后报告一次总数
	if (fileCount > 0 && fileCount % scanState.batchSize.fileReporting !== 0) {
		reportProgress("finding_files", `共找到 ${fileCount} 个音频文件`, {
			processed: fileCount,
		});
	}

	return audioFiles;
}

/**
 * 解析音频文件
 * @param {string[]} filePaths - 文件路径列表
 * @param {string} libraryId - 音乐库ID
 * @returns {Promise<Object[]>} 解析后的歌曲信息列表
 */
async function parseAudioFiles(filePaths, libraryId) {
	if (!Array.isArray(filePaths)) {
		throw new Error("文件路径必须是数组");
	}

	const songs = [];
	let processed = 0;
	const total = filePaths.length;
	const batchSize = scanState.batchSize.metadataParsing;

	// 分批处理文件
	for (let i = 0; i < total; i += batchSize) {
		// 如果已取消，则中断
		if (scanState.isCanceled) {
			reportProgress("canceled", "扫描已取消");
			return songs;
		}

		// 当前批次的文件
		const batch = filePaths.slice(i, i + batchSize);

		try {
			// 并行解析当前批次的文件
			const batchResults = await Promise.allSettled(
				batch.map((filePath) => parseAudioFile(filePath, libraryId))
			);

			// 处理解析结果
			for (const result of batchResults) {
				if (result.status === "fulfilled" && result.value) {
					songs.push(result.value);
				}
				// 错误的文件会被忽略，但可以考虑记录日志
			}

			// 更新进度
			processed += batch.length;
			const progressPercentage = Math.round((processed / total) * 100);
			reportProgress(
				"parsing_metadata",
				`正在解析元数据... ${processed}/${total} (${progressPercentage}%)`,
				{
					processed,
					total,
				}
			);
		} catch (error) {
			console.error("批量处理文件时出错:", error);
			// 继续处理下一批，不中断整个过程
		}
	}

	return songs;
}

/**
 * 解析单个音频文件
 * @param {string} filePath - 文件路径
 * @param {string} libraryId - 音乐库ID
 * @returns {Promise<Object|null>} 解析后的歌曲信息
 */
async function parseAudioFile(filePath, libraryId) {
	if (!filePath || typeof filePath !== "string") {
		console.error("无效的文件路径");
		return null;
	}

	try {
		// 解析音频文件元数据
		const metadata = await parseFile(filePath, {
			skipCovers: false,
			skipPostHeaders: true,
			includeChapters: false,
		});

		// 获取文件状态
		const stats = await fs.stat(filePath);

		// 提取专辑封面信息
		const hasCover = !!(
			metadata.common.picture && metadata.common.picture.length > 0
		);

		// 提取歌词
		const lyricsResult = await extractLyrics(metadata, filePath);

		// 构建歌曲对象
		return {
			id: uuidv4(),
			title:
				metadata.common.title ||
				path.basename(filePath, path.extname(filePath)),
			artist: metadata.common.artist || "未知艺术家",
			album: metadata.common.album || "未知专辑",
			duration: metadata.format.duration || 0,
			filePath: filePath,
			cover: hasCover ? "embedded" : "none",
			lyrics: lyricsResult.lyrics,
			hasLyrics: lyricsResult.hasLyrics,
			libraryId: libraryId,
			bitrate: metadata.format.bitrate || 0,
			sampleRate: metadata.format.sampleRate || 0,
			format:
				metadata.format.container ||
				path.extname(filePath).substring(1) ||
				"未知格式",
			fileSize: stats.size || 0,
			year: metadata.common.year || null,
			genre:
				Array.isArray(metadata.common.genre) && metadata.common.genre.length > 0
					? metadata.common.genre[0]
					: metadata.common.genre || null,
			trackNumber: metadata.common.track?.no || null,
			discNumber: metadata.common.disk?.no || null,
			addedAt: new Date().toISOString(),
		};
	} catch (error) {
		console.error(`解析文件失败: ${filePath}`, error.message);
		return null;
	}
}

/**
 * 从元数据中提取歌词
 * @param {Object} metadata - 音频元数据
 * @param {string} filePath - 文件路径
 * @returns {Promise<{lyrics: string|null, hasLyrics: boolean}>} 歌词内容和状态
 */
async function extractLyrics(metadata, filePath) {
	let lyrics = null;
	let hasLyrics = false;

	// 1. 尝试提取嵌入式歌词 (ID3v2 USLT标签)
	if (metadata.native && metadata.native.ID3v2) {
		const usltFrames = metadata.native.ID3v2.filter(
			(frame) => frame.id === "USLT"
		);

		if (usltFrames && usltFrames.length > 0) {
			lyrics = extractTextFromFrame(usltFrames[0]);
			if (lyrics) {
				hasLyrics = true;
				return { lyrics, hasLyrics };
			}
		}
	}

	// 2. 检查其他格式的歌词
	if (!hasLyrics && metadata.common.lyrics) {
		lyrics = extractLyricsFromCommon(metadata.common.lyrics);
		if (lyrics) {
			hasLyrics = true;
			return { lyrics, hasLyrics };
		}
	}

	// 3. 尝试在相同目录查找LRC文件
	if (!hasLyrics) {
		const lrcPath = filePath.substring(0, filePath.lastIndexOf(".")) + ".lrc";
		try {
			const lrcStat = await fs.stat(lrcPath);
			if (lrcStat.isFile()) {
				lyrics = await fs.readFile(lrcPath, "utf-8");
				hasLyrics = !!lyrics;
			}
		} catch (lrcError) {
			// LRC文件不存在，忽略错误
		}
	}

	return { lyrics, hasLyrics };
}

/**
 * 从ID3v2帧中提取文本
 * @param {Object} frame - ID3v2帧
 * @returns {string|null} 提取的文本
 */
function extractTextFromFrame(frame) {
	if (!frame || !frame.value) return null;

	if (typeof frame.value.text === "string") {
		return frame.value.text;
	} else if (
		typeof frame.value.text === "object" &&
		frame.value.text !== null
	) {
		if (frame.value.text.text) {
			return frame.value.text.text;
		} else {
			try {
				return JSON.stringify(frame.value.text);
			} catch (e) {
				return "无法解析的歌词对象";
			}
		}
	}
	return null;
}

/**
 * 从common.lyrics中提取歌词
 * @param {string|Array|Object} lyrics - 元数据中的歌词
 * @returns {string|null} 处理后的歌词文本
 */
function extractLyricsFromCommon(lyrics) {
	if (!lyrics) return null;

	// 处理数组类型
	if (Array.isArray(lyrics)) {
		const lyricsArray = lyrics
			.map((item) => {
				if (typeof item === "string") {
					return item;
				} else if (typeof item === "object" && item !== null) {
					if (item.text) return item.text;
					try {
						return JSON.stringify(item);
					} catch (e) {
						return "无法解析的歌词项";
					}
				}
				return "";
			})
			.filter(Boolean);

		return lyricsArray.length > 0 ? lyricsArray.join("\n") : null;
	}

	// 处理字符串类型
	if (typeof lyrics === "string") {
		return lyrics.trim() || null;
	}

	// 处理对象类型
	if (typeof lyrics === "object" && lyrics !== null) {
		try {
			if (lyrics.text) return lyrics.text;
			return JSON.stringify(lyrics);
		} catch (e) {
			return "无法解析的歌词对象";
		}
	}

	return null;
}
