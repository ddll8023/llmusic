const { join } = require("path");
const { app } = require("electron");
const { Low } = require("lowdb");
const { JSONFile } = require("lowdb/node");
const fs = require("fs").promises;
const fsStat = require("fs").promises.stat;
const { parseFile } = require("music-metadata");

// 数据库文件路径
const dbPath = join(app.getPath("userData"), "db.json");

// 默认数据结构 - 存储完整的歌曲对象
const defaultData = {
	songs: [], // 直接存储完整歌曲对象的数组
	libraries: [], // 音乐库列表
	playlists: [],
	settings: {
		// lastScanPath 将被废弃，由 libraries 结构管理
		// 可以考虑在这里存储 lastActiveLibraryId 等
	},
};

// 创建数据库适配器和实例
const adapter = new JSONFile(dbPath);
const db = new Low(adapter, defaultData);

// 内存缓存 - 用于存储最近访问过的歌曲完整信息
const songCache = new Map();
const MAX_SONG_CACHE_SIZE = 200; // 最多缓存200首歌曲的元数据

// === 新增：内存索引 ===
// 通过 Map 提供 O(1) 查询性能
const songById = new Map();
const songByPath = new Map();

// 初始化数据库
async function initDb() {
	try {
		// 读取数据库文件，如果不存在则使用默认数据
		await db.read();

		// 确保数据结构完整
		db.data.songs ||= [];
		db.data.playlists ||= [];
		db.data.settings ||= { lastScanPath: "" };
		db.data.libraries ||= []; // 确保libraries数组存在

		// 数据迁移：从旧的 songIndex 结构迁移到新的 songs 结构
		if (db.data.songIndex && Array.isArray(db.data.songIndex)) {
			console.log("检测到旧的 songIndex 数据结构，开始迁移...");
			// 简单地将旧索引数据作为基础，完整的歌曲信息将在下次扫描时填充
			// 这里我们不能重新解析所有文件，因为那会回到原来的性能问题
			// 用户需要重新扫描一次音乐库来获取完整的元数据
			const migratedSongs = db.data.songIndex.map((index) => ({
				id: index.id,
				filePath: index.filePath,
				title: require("path").basename(
					index.filePath,
					require("path").extname(index.filePath)
				),
				artist: "未知艺术家",
				album: "未知专辑",
				duration: 0,
				hasCover: index.hasCover || false,
				fileExists: index.fileExists,
			}));

			db.data.songs = migratedSongs;
			delete db.data.songIndex; // 删除旧的索引
			console.log(
				`数据迁移完成，迁移了 ${migratedSongs.length} 首歌曲。建议用户重新扫描音乐库以获取完整信息。`
			);
		}

		await db.write();

		// 构建内存索引
		buildIndices();

		console.log("数据库初始化完成:", dbPath);
		return db;
	} catch (error) {
		console.error("数据库初始化错误:", error);
		throw error;
	}
}

/**
 * 从文件解析歌曲元数据
 * @param {string} filePath 音乐文件路径
 * @param {string} id 歌曲ID（可选，如果不提供会生成新ID）
 * @param {string} libraryId 歌曲所属的音乐库ID
 * @returns {Promise<Object|null>} 歌曲元数据对象，解析失败返回null
 */
async function parseSongFromFile(filePath, id = null, libraryId = null) {
	try {
		// 检查文件是否存在
		const stats = await fsStat(filePath);

		// 解析音乐文件元数据
		const metadata = await parseFile(filePath, {
			skipCovers: false, // 需要检测封面是否存在
			skipPostHeaders: true,
			includeChapters: false,
		});

		// 提取有用的元数据
		const { common, format } = metadata;

		// 检查是否有封面
		const hasCover = !!(common.picture && common.picture.length > 0);

		// 提取歌词信息
		let lyrics = null;
		let hasLyrics = false;

		// 尝试提取嵌入式歌词 (USLT - 非同步歌词标签)
		if (metadata.native && metadata.native.ID3v2) {
			const usltFrames = metadata.native.ID3v2.filter(
				(frame) => frame.id === "USLT"
			);

			if (usltFrames && usltFrames.length > 0) {
				for (const frame of usltFrames) {
					if (frame.value && frame.value.text) {
						// 确保歌词内容是字符串
						if (typeof frame.value.text === "object") {
							// 对象类型，尝试合理提取文本
							if (frame.value.text.text) {
								lyrics = frame.value.text.text;
							} else {
								// 尝试将对象转换为JSON字符串
								try {
									lyrics = JSON.stringify(frame.value.text);
								} catch (e) {
									lyrics = "无法解析的歌词对象";
								}
							}
						} else {
							lyrics = frame.value.text;
						}
						hasLyrics = true;
						break; // 使用找到的第一个歌词
					}
				}
			}
		}

		// 检查FLAC或其他格式的歌词
		if (!hasLyrics && common.lyrics) {
			if (Array.isArray(common.lyrics) && common.lyrics.length > 0) {
				// 如果是数组，拼接每一项
				const lyricsArray = [];

				for (const lyricItem of common.lyrics) {
					// 每个元素可能是字符串或对象
					if (typeof lyricItem === "string") {
						lyricsArray.push(lyricItem);
					} else if (typeof lyricItem === "object" && lyricItem !== null) {
						// 对象时，尝试获取text属性
						if (lyricItem.text) {
							lyricsArray.push(lyricItem.text);
						} else {
							try {
								lyricsArray.push(JSON.stringify(lyricItem));
							} catch (e) {
								lyricsArray.push("无法解析的歌词项");
							}
						}
					}
				}

				lyrics = lyricsArray.join("\n");
				hasLyrics = lyrics.length > 0;
			} else if (typeof common.lyrics === "string" && common.lyrics.trim()) {
				lyrics = common.lyrics;
				hasLyrics = true;
			} else if (typeof common.lyrics === "object" && common.lyrics !== null) {
				// 处理对象类型的歌词
				try {
					if (common.lyrics.text) {
						lyrics = common.lyrics.text;
					} else {
						lyrics = JSON.stringify(common.lyrics);
					}
					hasLyrics = true;
				} catch (e) {
					console.error(`解析对象类型歌词失败:`, e);
				}
			}
		}

		// 尝试在相同目录查找LRC文件作为备选
		if (!hasLyrics) {
			const lrcPath = filePath.substring(0, filePath.lastIndexOf(".")) + ".lrc";
			try {
				const lrcStat = await require("fs").promises.stat(lrcPath);
				if (lrcStat.isFile()) {
					const lrcContent = await require("fs").promises.readFile(
						lrcPath,
						"utf-8"
					);
					lyrics = lrcContent;
					hasLyrics = true;
				}
			} catch (lrcError) {
				// LRC文件不存在，忽略错误
			}
		}

		// 创建歌曲对象
		const song = {
			id: id || require("uuid").v4(), // 使用提供的ID或生成新ID
			libraryId: libraryId, // 歌曲所属的音乐库ID
			title:
				common.title ||
				require("path").basename(filePath, require("path").extname(filePath)),
			artist: common.artist || "未知艺术家",
			album: common.album || "未知专辑",
			albumArtist: common.albumartist || common.artist || "未知艺术家",
			year: common.year || null,
			duration: format.duration || 0,
			filePath: filePath,
			fileSize: stats.size,
			hasCover: hasCover, // 标记是否有封面
			hasLyrics: hasLyrics, // 标记是否有歌词
			lyrics: hasLyrics ? lyrics : null, // 歌词内容
			modifiedAt: stats.mtime.getTime(), // 文件修改时间
			format: format.container || require("path").extname(filePath).slice(1),
			bitrate: format.bitrate || 0,
			sampleRate: format.sampleRate || 0,
			channels: format.numberOfChannels || 0,
			playCount: 0, // 新增：播放次数
		};

		return song;
	} catch (error) {
		console.error(`解析文件 ${filePath} 时出错:`, error);
		// 文件不存在或解析失败
		return null;
	}
}

/**
 * 清理歌曲缓存
 * 当缓存超过最大大小时，删除最早访问的歌曲
 */
function cleanupSongCache() {
	if (songCache.size <= MAX_SONG_CACHE_SIZE) return;

	// 根据最后访问时间排序
	const songs = Array.from(songCache.entries()).sort(
		(a, b) => (a[1]._lastAccessed || 0) - (b[1]._lastAccessed || 0)
	);

	// 删除最早访问的1/4
	const deleteCount = Math.floor(songCache.size / 4);
	for (let i = 0; i < deleteCount; i++) {
		songCache.delete(songs[i][0]);
	}

	// console.log(`已清理歌曲缓存，移除了 ${deleteCount} 首歌曲`);
}

/**
 * 获取所有歌曲。
 * 这是一个非常快速的操作，直接从内存返回数据。
 * @returns {Promise<Array>} 歌曲数组
 */
async function getAllSongs() {
	await db.read();
	return db.data.songs;
}

/**
 * 根据音乐库ID获取歌曲。
 * @param {string} libraryId 音乐库ID。如果为 'all', 则返回所有歌曲。
 * @returns {Promise<Array>} 歌曲数组
 */
async function getSongsByLibrary(libraryId) {
	await db.read();
	if (!libraryId || libraryId === "all") {
		return db.data.songs;
	}
	return db.data.songs.filter((song) => song.libraryId === libraryId);
}

/**
 * 获取一首歌曲的完整信息（O(1) 查询）
 * @param {string} id 歌曲ID
 * @returns {Promise<Object|null>} 歌曲完整信息，如果不存在返回null
 */
async function getSongById(id) {
	// 直接从 Map 获取，无需线性扫描
	return songById.get(id) || null;
}

/**
 * 添加一首歌曲到数据库
 * @param {Object} song 完整的歌曲对象
 * @returns {Promise<boolean>} 是否成功添加
 */
async function addSong(song) {
	// 检查歌曲是否已存在（通过文件路径）
	const existingSong = songByPath.get(song.filePath);

	if (existingSong) {
		// 歌曲已存在，更新元数据，保留旧ID
		const oldId = existingSong.id;
		const mergedSong = { ...song, id: oldId };

		// 更新数组
		const index = db.data.songs.findIndex((s) => s.id === oldId);
		if (index !== -1) {
			db.data.songs[index] = mergedSong;
		}

		updateSongInIndices(mergedSong);
		console.log(`更新歌曲: ${mergedSong.title}`);
	} else {
		// 新歌曲
		db.data.songs.push(song);
		updateSongInIndices(song);
		console.log(`添加新歌曲: ${song.title}`);
	}

	await db.write();
	return true;
}

/**
 * 批量添加歌曲到数据库，支持进度回调
 * @param {Array<Object>} newSongs 完整的歌曲对象数组
 * @param {function} progressCallback 进度回调函数
 * @returns {Promise<{addedCount: number, updatedCount: number, failedPaths: Array<string>}>}
 */
async function addSongs(newSongs, progressCallback = null) {
	if (!Array.isArray(newSongs) || newSongs.length === 0) {
		return { addedCount: 0, updatedCount: 0, failedPaths: [] };
	}

	await db.read(); // 在操作前读取最新数据

	const total = newSongs.length;
	let processed = 0;
	let addedCount = 0;
	let updatedCount = 0;
	const failedPaths = [];

	// 创建一个从文件路径到现有歌曲的映射，以便快速查找
	const songMap = new Map(db.data.songs.map((song) => [song.filePath, song]));

	for (const song of newSongs) {
		processed++;
		if (progressCallback) {
			progressCallback({ processed, total });
		}

		if (!song || !song.filePath) {
			console.warn("发现无效的歌曲对象，已跳过:", song);
			continue;
		}

		const existingSong = songByPath.get(song.filePath);
		if (existingSong) {
			if (existingSong.modifiedAt !== song.modifiedAt) {
				const updatedSong = { ...song, id: existingSong.id };
				songMap.set(song.filePath, updatedSong);
				updateSongInIndices(updatedSong);
				updatedCount++;
			}
		} else {
			songMap.set(song.filePath, song);
			updateSongInIndices(song);
			addedCount++;
		}
	}

	db.data.songs = Array.from(songMap.values());
	await db.write();

	// 确保在批量添加歌曲后重建索引，防止索引不一致
	buildIndices();
	console.log(
		`批量添加歌曲完成，已添加: ${addedCount}, 已更新: ${updatedCount}, 索引已重建`
	);

	return { addedCount, updatedCount, failedPaths };
}

/**
 * 清空指定音乐库的所有歌曲记录。
 * @param {string} libraryId 要清空的音乐库ID
 * @returns {Promise<void>}
 */
async function clearSongsByLibrary(libraryId) {
	if (!libraryId) {
		console.warn("尝试清空歌曲但未提供 libraryId");
		return;
	}
	await db.read();
	const initialCount = db.data.songs.length;
	db.data.songs = db.data.songs.filter((song) => song.libraryId !== libraryId);
	buildIndices(); // 重建索引
	const removedCount = initialCount - db.data.songs.length;
	console.log(`从音乐库 ${libraryId} 中清除了 ${removedCount} 首歌曲。`);
}

/**
 * @deprecated The method should not be used
 * 清空所有歌曲记录。这是一个危险操作。
 * @returns {Promise<void>}
 */
async function _clearAllSongs_DANGEROUS() {
	await db.read();
	db.data.songs = [];
	buildIndices(); // 重建索引
	await db.write();
}

/**
 * 废弃：这个函数的功能由 libraries 结构替代。
 * @param {string} path 路径
 */
async function saveLastScanPath(path) {
	// Deprecated
}

/**
 * 废弃：这个函数的功能由 libraries 结构替代。
 * @param {string} path 路径
 */
function setLastScanPath(path) {
	// Deprecated
}

/**
 * 废弃：这个函数的功能由 libraries 结构替代。
 * @returns {Promise<string|null>}
 */
async function getLastScanPath() {
	// Deprecated, return null to avoid breaking old code paths
	return null;
}

/**
 * 验证所有歌曲文件是否存在（后台任务）
 * @returns {Promise<Object>} 验证结果
 */
async function validateSongFiles() {
	await db.read();
	const songs = db.data.songs;
	let missingCount = 0;
	let updatedCount = 0;
	let writeNeeded = false;

	const validSongs = [];

	for (let i = 0; i < songs.length; i++) {
		const song = songs[i];
		try {
			const stats = await fs.stat(song.filePath);
			if (stats.mtime.getTime() !== song.modifiedAt) {
				// 文件已修改，重新解析
				console.log(`文件已修改，重新解析: ${song.filePath}`);
				const updatedSong = await parseSongFromFile(
					song.filePath,
					song.id,
					song.libraryId // 修正：传递 libraryId
				);
				if (updatedSong) {
					validSongs.push(updatedSong);
					updatedCount++;
					writeNeeded = true;
				} else {
					// 解析失败，当作丢失处理
					missingCount++;
					writeNeeded = true;
				}
			} else {
				validSongs.push(song);
			}
		} catch (error) {
			// 文件不存在
			missingCount++;
			writeNeeded = true;
			console.log(`文件不存在，标记为待移除: ${song.filePath}`);
		}
	}

	if (writeNeeded) {
		db.data.songs = validSongs;
		await db.write();
		buildIndices(); // 更新索引
	}

	return {
		total: songs.length,
		missing: missingCount,
		updated: updatedCount,
	};
}

/**
 * 获取所有歌单列表
 * @returns {Promise<Array>} 歌单列表
 */
async function getPlaylists() {
	try {
		await db.read();
		return { success: true, playlists: db.data.playlists || [] };
	} catch (error) {
		console.error("获取歌单列表出错:", error);
		return { success: false, error: error.message };
	}
}

/**
 * 获取指定ID的歌单
 * @param {string} playlistId 歌单ID
 * @returns {Promise<Object>} 歌单对象
 */
async function getPlaylistById(playlistId) {
	try {
		await db.read();
		const playlist = db.data.playlists.find((p) => p.id === playlistId);
		if (!playlist) {
			return { success: false, error: "歌单不存在" };
		}
		return { success: true, playlist };
	} catch (error) {
		console.error(`获取歌单(ID: ${playlistId})出错:`, error);
		return { success: false, error: error.message };
	}
}

/**
 * 创建新歌单
 * @param {Object} playlistData 歌单数据
 * @returns {Promise<Object>} 创建结果
 */
async function createPlaylist(playlistData) {
	try {
		await db.read();

		// 生成唯一ID
		const { v4: uuidv4 } = require("uuid");
		const playlistId = uuidv4();

		// 创建歌单对象
		const newPlaylist = {
			id: playlistId,
			name: playlistData.name || "未命名歌单",
			description: playlistData.description || "",
			coverImgId: playlistData.coverImgId || null,
			songs: playlistData.songs || [],
			createTime: Date.now(),
			updateTime: Date.now(),
		};

		// 添加到数据库
		db.data.playlists.push(newPlaylist);
		await db.write();

		return { success: true, playlist: newPlaylist };
	} catch (error) {
		console.error("创建歌单出错:", error);
		return { success: false, error: error.message };
	}
}

/**
 * 更新歌单信息
 * @param {string} playlistId 歌单ID
 * @param {Object} playlistData 更新的歌单数据
 * @returns {Promise<Object>} 更新结果
 */
async function updatePlaylist(playlistId, playlistData) {
	try {
		await db.read();

		// 查找歌单
		const playlistIndex = db.data.playlists.findIndex(
			(p) => p.id === playlistId
		);
		if (playlistIndex === -1) {
			return { success: false, error: "歌单不存在" };
		}

		// 更新歌单信息
		const playlist = db.data.playlists[playlistIndex];

		if (playlistData.name !== undefined) {
			playlist.name = playlistData.name;
		}

		if (playlistData.description !== undefined) {
			playlist.description = playlistData.description;
		}

		if (playlistData.coverImgId !== undefined) {
			playlist.coverImgId = playlistData.coverImgId;
		}

		// 记录更新时间
		playlist.updateTime = Date.now();

		await db.write();

		return { success: true, playlist };
	} catch (error) {
		console.error(`更新歌单(ID: ${playlistId})出错:`, error);
		return { success: false, error: error.message };
	}
}

/**
 * 删除歌单
 * @param {string} playlistId 歌单ID
 * @returns {Promise<Object>} 删除结果
 */
async function deletePlaylist(playlistId) {
	try {
		await db.read();

		// 查找并删除歌单
		const initialLength = db.data.playlists.length;
		db.data.playlists = db.data.playlists.filter((p) => p.id !== playlistId);

		// 检查是否找到并删除了歌单
		if (db.data.playlists.length === initialLength) {
			return { success: false, error: "歌单不存在" };
		}

		await db.write();

		return { success: true, message: "歌单已删除" };
	} catch (error) {
		console.error(`删除歌单(ID: ${playlistId})出错:`, error);
		return { success: false, error: error.message };
	}
}

/**
 * 向歌单添加歌曲
 * @param {string} playlistId 歌单ID
 * @param {string|Array} songIds 歌曲ID或ID数组
 * @returns {Promise<Object>} 操作结果
 */
async function addSongsToPlaylist(playlistId, songIds) {
	try {
		await db.read();

		// 查找歌单
		const playlist = db.data.playlists.find((p) => p.id === playlistId);
		if (!playlist) {
			return { success: false, error: "歌单不存在" };
		}

		// 确保songIds是数组
		const songIdArray = Array.isArray(songIds) ? songIds : [songIds];

		// 添加不重复的歌曲ID
		let addedCount = 0;
		for (const songId of songIdArray) {
			// 检查歌曲是否存在
			const songExists = db.data.songs.some((s) => s.id === songId);
			if (songExists && !playlist.songs.includes(songId)) {
				playlist.songs.push(songId);
				addedCount++;
			}
		}

		// 更新修改时间
		playlist.updateTime = Date.now();

		await db.write();

		return {
			success: true,
			message: `已添加 ${addedCount} 首歌曲到歌单`,
			addedCount,
		};
	} catch (error) {
		console.error(`向歌单添加歌曲出错:`, error);
		return { success: false, error: error.message };
	}
}

/**
 * 从歌单移除歌曲
 * @param {string} playlistId 歌单ID
 * @param {string|Array} songIds 歌曲ID或ID数组
 * @returns {Promise<Object>} 操作结果
 */
async function removeSongsFromPlaylist(playlistId, songIds) {
	try {
		await db.read();

		// 查找歌单
		const playlist = db.data.playlists.find((p) => p.id === playlistId);
		if (!playlist) {
			return { success: false, error: "歌单不存在" };
		}

		// 确保songIds是数组
		const songIdArray = Array.isArray(songIds) ? songIds : [songIds];

		// 移除指定的歌曲
		const initialCount = playlist.songs.length;
		playlist.songs = playlist.songs.filter((id) => !songIdArray.includes(id));
		const removedCount = initialCount - playlist.songs.length;

		// 更新修改时间
		playlist.updateTime = Date.now();

		await db.write();

		return {
			success: true,
			message: `已从歌单移除 ${removedCount} 首歌曲`,
			removedCount,
		};
	} catch (error) {
		console.error(`从歌单移除歌曲出错:`, error);
		return { success: false, error: error.message };
	}
}

// --- 音乐库管理函数 ---

/**
 * 获取所有音乐库
 * @returns {Promise<Array>}
 */
async function getLibraries() {
	await db.read();
	const { libraries, songs } = db.data;

	if (!libraries) return [];

	// 创建一个map来高效地统计每个库的歌曲数量
	const songCounts = songs.reduce((counts, song) => {
		if (song.libraryId) {
			counts.set(song.libraryId, (counts.get(song.libraryId) || 0) + 1);
		}
		return counts;
	}, new Map());

	// 将歌曲数量附加到每个库对象上
	return libraries.map((lib) => ({
		...lib,
		songCount: songCounts.get(lib.id) || 0,
	}));
}

/**
 * 根据ID获取单个音乐库
 * @param {string} libraryId
 * @returns {Promise<Object|null>}
 */
async function getLibraryById(libraryId) {
	await db.read();
	return db.data.libraries.find((lib) => lib.id === libraryId);
}

/**
 * 添加一个新的音乐库
 * @param {{name: string, path: string}} libraryData
 * @returns {Promise<Object>} 新创建的音乐库对象
 */
async function addLibrary({ name, path }) {
	await db.read();
	const newLibrary = {
		id: require("uuid").v4(),
		name,
		path,
		createdAt: new Date().toISOString(),
	};
	db.data.libraries.push(newLibrary);
	await db.write();
	return newLibrary;
}

/**
 * 更新一个音乐库的信息
 * @param {string} libraryId
 * @param {{name?: string, path?: string}} updates
 * @returns {Promise<Object|null>} 更新后的音乐库对象
 */
async function updateLibrary(libraryId, updates) {
	await db.read();
	const library = db.data.libraries.find((lib) => lib.id === libraryId);
	if (library) {
		if (updates.name) library.name = updates.name;
		if (updates.path) library.path = updates.path;
		await db.write();
		return library;
	}
	return null;
}

/**
 * 移除一个音乐库
 * @param {string} libraryId
 * @returns {Promise<boolean>} 是否成功移除
 */
async function removeLibrary(libraryId) {
	await db.read();
	const initialLibrariesCount = db.data.libraries.length;
	const initialSongsCount = db.data.songs.length;

	db.data.libraries = db.data.libraries.filter((lib) => lib.id !== libraryId);
	db.data.songs = db.data.songs.filter((song) => song.libraryId !== libraryId);

	const success = db.data.libraries.length < initialLibrariesCount;

	if (success) {
		await db.write();
		console.log(
			`已成功移除音乐库 ${libraryId} 及其 ${
				initialSongsCount - db.data.songs.length
			} 首歌曲。`
		);
	}
	return success;
}

// === 新增：索引构建与维护函数 ===
function buildIndices() {
	songById.clear();
	songByPath.clear();
	for (const song of db.data.songs) {
		songById.set(song.id, song);
		songByPath.set(song.filePath, song);
	}
}

function updateSongInIndices(song) {
	if (!song) return;
	songById.set(song.id, song);
	songByPath.set(song.filePath, song);
}

function removeSongFromIndices(id, filePath) {
	if (id) songById.delete(id);
	if (filePath) songByPath.delete(filePath);
}

// 对外导出，用于极端情况下重建索引
function rebuildIndices() {
	buildIndices();
}

/**
 * 增加歌曲播放次数
 * @param {string} songId 歌曲ID
 * @returns {Promise<Object>} 更新后的歌曲对象
 */
async function incrementPlayCount(songId) {
	try {
		await db.read();
		const songIndex = db.data.songs.findIndex((song) => song.id === songId);

		if (songIndex === -1) {
			throw new Error("歌曲不存在");
		}

		// 如果播放次数字段不存在，初始化为1，否则加1
		if (typeof db.data.songs[songIndex].playCount !== "number") {
			db.data.songs[songIndex].playCount = 1;
		} else {
			db.data.songs[songIndex].playCount += 1;
		}

		// 更新内存索引
		if (songById.has(songId)) {
			const song = songById.get(songId);
			song.playCount = db.data.songs[songIndex].playCount;
		}

		// 更新缓存
		if (songCache.has(songId)) {
			const song = songCache.get(songId);
			song.playCount = db.data.songs[songIndex].playCount;
		}

		await db.write();
		return db.data.songs[songIndex];
	} catch (error) {
		console.error(`增加歌曲 ${songId} 播放次数时出错:`, error);
		throw error;
	}
}

// 导出模块
module.exports = {
	initDb,
	db,
	parseSongFromFile,
	getSongById,
	getAllSongs,
	getSongsByLibrary,
	addSong,
	addSongs,
	clearSongsByLibrary,
	_clearAllSongs_DANGEROUS,
	validateSongFiles,
	// 歌单函数
	getPlaylists,
	getPlaylistById,
	createPlaylist,
	updatePlaylist,
	deletePlaylist,
	addSongsToPlaylist,
	removeSongsFromPlaylist,
	// 音乐库函数
	getLibraries,
	getLibraryById,
	addLibrary,
	updateLibrary,
	removeLibrary,
	rebuildIndices, // 新增导出
	incrementPlayCount,
};

// 废弃的函数导出，以防万一
module.exports.getLastScanPath = getLastScanPath;
module.exports.saveLastScanPath = saveLastScanPath;
module.exports.setLastScanPath = setLastScanPath;
module.exports.clearSongs = _clearAllSongs_DANGEROUS; // 将旧的clearSongs指向危险函数
