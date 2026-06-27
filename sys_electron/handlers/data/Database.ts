import path from "path"
import { app } from "electron"
import { Low } from "lowdb"
import { JSONFile } from "lowdb/node"
import { promises as fs } from "fs"
import { parseFile } from "music-metadata"
import { v4 as uuidv4 } from "uuid"
import type { Song } from "../../types/song"
import type { DbData, Library, Playlist } from "../../types"

// 数据库文件路径
const dbPath = path.join(app.getPath("userData"), "db.json")

// 默认数据结构 - 存储完整的歌曲对象
const defaultData: DbData = {
	songs: [],
	libraries: [],
	playlists: [],
	settings: {},
}

// 创建数据库适配器和实例
const adapter = new JSONFile<DbData>(dbPath)
const db = new Low<DbData>(adapter, defaultData)

// === 内存索引 ===
// 通过 Map 提供 O(1) 查询性能
const songById: Map<string, Song> = new Map()
const songByPath: Map<string, Song> = new Map()

// 数据库初始化
async function initDb(): Promise<Low<DbData>> {
	try {
		await db.read()

		// 确保数据结构完整
		db.data.songs ||= []
		db.data.playlists ||= []
		db.data.settings ||= { lastScanPath: "" }
		db.data.libraries ||= []

		// 数据迁移：从旧的 songIndex 结构迁移到新的 songs 结构
		const dbAny = db.data as unknown as Record<string, unknown>
		if (dbAny.songIndex && Array.isArray(dbAny.songIndex)) {
			console.log("检测到旧的 songIndex 数据结构，开始迁移...")
			const songIndex = dbAny.songIndex as Array<{
				id: string
				filePath: string
				hasCover?: boolean
				fileExists?: boolean
			}>
			const migratedSongs: Song[] = songIndex.map((index) => ({
				id: index.id,
				filePath: index.filePath,
				title: path.basename(index.filePath, path.extname(index.filePath)),
				artist: "未知艺术家",
				album: "未知专辑",
				duration: 0,
				hasCover: index.hasCover || false,
				fileExists: index.fileExists,
			}))

			db.data.songs = migratedSongs
			delete dbAny.songIndex
			console.log(`数据迁移完成，迁移了 ${migratedSongs.length} 首歌曲。建议用户重新扫描音乐库以获取完整信息。`)
		}

		await db.write()

		// 构建内存索引
		buildIndices()

		console.log("数据库初始化完成:", dbPath)
		return db
	} catch (error) {
		console.error("数据库初始化错误:", error)
		throw error
	}
}

/**
 * 从文件解析歌曲元数据
 */
async function parseSongFromFile(filePath: string, id: string | null = null, libraryId: string | null = null): Promise<Song | null> {
	try {
		const stats = await fs.stat(filePath)
		const metadata = await parseFile(filePath, {
			skipCovers: false,
			skipPostHeaders: true,
			includeChapters: false,
		})

		const { common, format } = metadata
		const hasCover = !!(common.picture && common.picture.length > 0)

		let lyrics: string | null = null
		let hasLyrics = false

		// 尝试提取嵌入式歌词 (USLT)
		const nativeNative = metadata.native as any
		if (nativeNative?.ID3v2) {
			const usltFrames = nativeNative.ID3v2.filter((frame: { id: string }) => (frame.id as string) === "USLT")
			if (usltFrames && usltFrames.length > 0) {
				for (const frame of usltFrames) {
					const val = (frame as any).value as { text?: string | { text?: string } } | undefined
					if (val?.text) {
						if (typeof val.text === "object") {
							const textObj = val.text as { text?: string }
							lyrics = textObj.text ? String(textObj.text) : JSON.stringify(val.text)
						} else {
							lyrics = String(val.text)
						}
						hasLyrics = true
						break
					}
				}
			}
		}

		// 检查 FLAC 或其他格式的歌词
		if (!hasLyrics && common.lyrics) {
			const rawLyrics = common.lyrics
			if (Array.isArray(rawLyrics) && rawLyrics.length > 0) {
				const lyricsArray: string[] = []
				for (const lyricItem of rawLyrics) {
					if (typeof lyricItem === "string") {
						lyricsArray.push(lyricItem)
					} else if (typeof lyricItem === "object" && lyricItem !== null) {
						lyricsArray.push((lyricItem as { text?: string }).text || JSON.stringify(lyricItem))
					}
				}
				lyrics = lyricsArray.join("\n")
				hasLyrics = lyrics.length > 0
			} else if (typeof rawLyrics === "string" && (rawLyrics as string).trim()) {
				lyrics = rawLyrics
				hasLyrics = true
			} else if (typeof rawLyrics === "object" && rawLyrics !== null) {
				const lyricsObj = rawLyrics as { text?: string }
				lyrics = lyricsObj.text || JSON.stringify(rawLyrics)
				hasLyrics = true
			}
		}

		// 尝试在相同目录查找 LRC 文件
		if (!hasLyrics) {
			const lrcPath = filePath.substring(0, filePath.lastIndexOf(".")) + ".lrc"
			try {
				const lrcStat = await fs.stat(lrcPath)
				if (lrcStat.isFile()) {
					lyrics = await fs.readFile(lrcPath, "utf-8")
					hasLyrics = !!lyrics
				}
			} catch {
				// LRC 文件不存在，忽略
			}
		}

		const song: Song = {
			id: id || uuidv4(),
			libraryId: libraryId || undefined,
			title: common.title || path.basename(filePath, path.extname(filePath)),
			artist: common.artist || "未知艺术家",
			album: common.album || "未知专辑",
			albumArtist: common.albumartist || common.artist || "未知艺术家",
			year: common.year || null,
			duration: format.duration || 0,
			filePath: filePath,
			fileSize: stats.size,
			hasCover: hasCover,
			hasLyrics: hasLyrics,
			lyrics: hasLyrics ? lyrics : null,
			modifiedAt: stats.mtime.getTime(),
			format: format.container || path.extname(filePath).slice(1),
			bitrate: format.bitrate || 0,
			sampleRate: format.sampleRate || 0,
			channels: format.numberOfChannels || 0,
			playCount: 0,
		}

		return song
	} catch (error) {
		console.error(`解析文件 ${filePath} 时出错:`, error)
		return null
	}
}

/**
 * 根据音乐库ID获取歌曲
 */
async function getSongsByLibrary(libraryId: string): Promise<Song[]> {
	await db.read()
	if (!libraryId || libraryId === "all") {
		return db.data.songs
	}
	return db.data.songs.filter((song) => song.libraryId === libraryId)
}

/**
 * 获取一首歌曲的完整信息（O(1) 查询）
 */
async function getSongById(id: string): Promise<Song | undefined> {
	return songById.get(id)
}

interface AddSongsResult {
	addedCount: number
	updatedCount: number
	failedPaths: string[]
}

/**
 * 批量添加歌曲到数据库，支持进度回调
 */
async function addSongs(
	newSongs: Song[],
	progressCallback: ((data: { processed: number; total: number }) => void) | null = null
): Promise<AddSongsResult> {
	if (!Array.isArray(newSongs) || newSongs.length === 0) {
		return { addedCount: 0, updatedCount: 0, failedPaths: [] }
	}

	await db.read()

	const total = newSongs.length
	let processed = 0
	let addedCount = 0
	let updatedCount = 0
	const failedPaths: string[] = []

	const songMap = new Map<string, Song>(db.data.songs.map((song: Song) => [song.filePath, song]))

	for (const song of newSongs) {
		processed++
		if (progressCallback) {
			progressCallback({ processed, total })
		}

		if (!song || !song.filePath) {
			console.warn("发现无效的歌曲对象，已跳过:", song)
			continue
		}

		const existingSong = songByPath.get(song.filePath)
		if (existingSong) {
			if (existingSong.modifiedAt !== song.modifiedAt) {
				const updatedSong = { ...song, id: existingSong.id }
				songMap.set(song.filePath, updatedSong)
				updateSongInIndices(updatedSong)
				updatedCount++
			}
		} else {
			songMap.set(song.filePath, song)
			updateSongInIndices(song)
			addedCount++
		}
	}

	db.data.songs = Array.from(songMap.values())
	await db.write()
	buildIndices()
	console.log(`批量添加歌曲完成，已添加: ${addedCount}, 已更新: ${updatedCount}, 索引已重建`)

	return { addedCount, updatedCount, failedPaths }
}

/**
 * 清空指定音乐库的所有歌曲记录
 */
async function clearSongsByLibrary(libraryId: string): Promise<void> {
	if (!libraryId) {
		console.warn("尝试清空歌曲但未提供 libraryId")
		return
	}
	await db.read()
	db.data.songs = db.data.songs.filter((song: Song) => song.libraryId !== libraryId)
	buildIndices()
	console.log(`从音乐库 ${libraryId} 中清除了歌曲。`)
}

/**
 * @deprecated 清空所有歌曲记录。这是一个危险操作。
 */
async function _clearAllSongs_DANGEROUS(): Promise<void> {
	await db.read()
	db.data.songs = []
	buildIndices()
	await db.write()
}

interface ValidateResult {
	total: number
	missing: number
	updated: number
}

/**
 * 验证所有歌曲文件是否存在（后台任务）
 */
async function validateSongFiles(): Promise<ValidateResult> {
	await db.read()
	const songs = db.data.songs
	let missingCount = 0
	let updatedCount = 0
	let writeNeeded = false

	const validSongs: Song[] = []

	for (let i = 0; i < songs.length; i++) {
		const song = songs[i]
		try {
			const stats = await fs.stat(song.filePath)
			if (stats.mtime.getTime() !== song.modifiedAt) {
				console.log(`文件已修改，重新解析: ${song.filePath}`)
				const updatedSong = await parseSongFromFile(song.filePath, song.id, song.libraryId || null)
				if (updatedSong) {
					validSongs.push(updatedSong)
					updatedCount++
					writeNeeded = true
				} else {
					missingCount++
					writeNeeded = true
				}
			} else {
				validSongs.push(song)
			}
		} catch {
			missingCount++
			writeNeeded = true
			console.log(`文件不存在，标记为待移除: ${song.filePath}`)
		}
	}

	if (writeNeeded) {
		db.data.songs = validSongs
		await db.write()
		buildIndices()
	}

	return {
		total: songs.length,
		missing: missingCount,
		updated: updatedCount,
	}
}

// ============ 歌单管理函数 ============

/**
 * 获取所有歌单列表
 */
async function getPlaylists(): Promise<{ success: boolean; playlists?: Playlist[]; error?: string }> {
	try {
		await db.read()
		return { success: true, playlists: db.data.playlists || [] }
	} catch (error) {
		const err = error as Error
		console.error("获取歌单列表出错:", error)
		return { success: false, error: err.message }
	}
}

/**
 * 获取指定ID的歌单
 */
async function getPlaylistById(playlistId: string): Promise<{ success: boolean; playlist?: Playlist; error?: string }> {
	try {
		await db.read()
		const playlist = db.data.playlists.find((p: Playlist) => p.id === playlistId)
		if (!playlist) {
			return { success: false, error: "歌单不存在" }
		}
		return { success: true, playlist }
	} catch (error) {
		const err = error as Error
		console.error(`获取歌单(ID: ${playlistId})出错:`, error)
		return { success: false, error: err.message }
	}
}

/**
 * 创建新歌单
 */
async function createPlaylist(playlistData: {
	name?: string
	description?: string
	coverImgId?: string
	songs?: string[]
}): Promise<{ success: boolean; playlist?: Playlist; error?: string }> {
	try {
		await db.read()
		const playlistId = uuidv4()

		const newPlaylist: Playlist = {
			id: playlistId,
			name: playlistData.name || "未命名歌单",
			description: playlistData.description || "",
			coverImgId: playlistData.coverImgId || null,
			songs: playlistData.songs || [],
			createTime: Date.now(),
			updateTime: Date.now(),
		}

		db.data.playlists.push(newPlaylist)
		await db.write()

		return { success: true, playlist: newPlaylist }
	} catch (error) {
		const err = error as Error
		console.error("创建歌单出错:", error)
		return { success: false, error: err.message }
	}
}

/**
 * 更新歌单信息
 */
async function updatePlaylist(
	playlistId: string,
	playlistData: { name?: string; description?: string; coverImgId?: string }
): Promise<{ success: boolean; playlist?: Playlist; error?: string }> {
	try {
		await db.read()
		const playlistIndex = db.data.playlists.findIndex((p: Playlist) => p.id === playlistId)
		if (playlistIndex === -1) {
			return { success: false, error: "歌单不存在" }
		}

		const playlist = db.data.playlists[playlistIndex]

		if (playlistData.name !== undefined) {
			playlist.name = playlistData.name
		}
		if (playlistData.description !== undefined) {
			playlist.description = playlistData.description
		}
		if (playlistData.coverImgId !== undefined) {
			playlist.coverImgId = playlistData.coverImgId
		}

		playlist.updateTime = Date.now()
		await db.write()

		return { success: true, playlist }
	} catch (error) {
		const err = error as Error
		console.error(`更新歌单(ID: ${playlistId})出错:`, error)
		return { success: false, error: err.message }
	}
}

/**
 * 删除歌单
 */
async function deletePlaylist(playlistId: string): Promise<{ success: boolean; message?: string; error?: string }> {
	try {
		await db.read()
		const initialLength = db.data.playlists.length
		db.data.playlists = db.data.playlists.filter((p: Playlist) => p.id !== playlistId)

		if (db.data.playlists.length === initialLength) {
			return { success: false, error: "歌单不存在" }
		}

		await db.write()
		return { success: true, message: "歌单已删除" }
	} catch (error) {
		const err = error as Error
		console.error(`删除歌单(ID: ${playlistId})出错:`, error)
		return { success: false, error: err.message }
	}
}

/**
 * 向歌单添加歌曲
 */
async function addSongsToPlaylist(
	playlistId: string,
	songIds: string | string[]
): Promise<{ success: boolean; message?: string; addedCount?: number; error?: string }> {
	try {
		await db.read()
		const playlist = db.data.playlists.find((p: Playlist) => p.id === playlistId)
		if (!playlist) {
			return { success: false, error: "歌单不存在" }
		}

		const songIdArray = Array.isArray(songIds) ? songIds : [songIds]
		let addedCount = 0

		for (const songId of songIdArray) {
			const songExists = db.data.songs.some((s: Song) => s.id === songId)
			if (songExists && !playlist.songs.includes(songId)) {
				playlist.songs.push(songId)
				addedCount++
			}
		}

		playlist.updateTime = Date.now()
		await db.write()

		return {
			success: true,
			message: `已添加 ${addedCount} 首歌曲到歌单`,
			addedCount,
		}
	} catch (error) {
		const err = error as Error
		console.error(`向歌单添加歌曲出错:`, error)
		return { success: false, error: err.message }
	}
}

/**
 * 从歌单移除歌曲
 */
async function removeSongsFromPlaylist(
	playlistId: string,
	songIds: string | string[]
): Promise<{ success: boolean; message?: string; removedCount?: number; error?: string }> {
	try {
		await db.read()
		const playlist = db.data.playlists.find((p: Playlist) => p.id === playlistId)
		if (!playlist) {
			return { success: false, error: "歌单不存在" }
		}

		const songIdArray = Array.isArray(songIds) ? songIds : [songIds]
		const initialCount = playlist.songs.length
		playlist.songs = playlist.songs.filter((id: string) => !songIdArray.includes(id))
		const removedCount = initialCount - playlist.songs.length

		playlist.updateTime = Date.now()
		await db.write()

		return {
			success: true,
			message: `已从歌单移除 ${removedCount} 首歌曲`,
			removedCount,
		}
	} catch (error) {
		const err = error as Error
		console.error(`从歌单移除歌曲出错:`, error)
		return { success: false, error: err.message }
	}
}

// ============ 音乐库管理函数 ============

/**
 * 获取所有音乐库
 */
async function getLibraries(): Promise<Library[]> {
	await db.read()
	const { libraries, songs } = db.data

	if (!libraries) return []

	const songCounts = new Map<string, number>()
	for (const song of songs) {
		if (song.libraryId) {
			songCounts.set(song.libraryId, (songCounts.get(song.libraryId) || 0) + 1)
		}
	}

	return libraries.map((lib: Library) => ({
		...lib,
		songCount: songCounts.get(lib.id) || 0,
	}))
}

/**
 * 根据ID获取单个音乐库
 */
async function getLibraryById(libraryId: string): Promise<Library | undefined> {
	await db.read()
	return db.data.libraries.find((lib: Library) => lib.id === libraryId)
}

interface AddLibraryData {
	name: string
	path: string
}

/**
 * 添加一个新的音乐库
 */
async function addLibrary(libraryData: AddLibraryData): Promise<Library> {
	await db.read()
	const newLibrary: Library = {
		id: uuidv4(),
		name: libraryData.name,
		path: libraryData.path,
		createdAt: new Date().toISOString(),
	}
	db.data.libraries.push(newLibrary)
	await db.write()
	return newLibrary
}

interface LibraryUpdates {
	name?: string
	path?: string
}

/**
 * 更新一个音乐库的信息
 */
async function updateLibrary(libraryId: string, updates: LibraryUpdates): Promise<Library | null> {
	await db.read()
	const library = db.data.libraries.find((lib: Library) => lib.id === libraryId)
	if (library) {
		if (updates.name) library.name = updates.name
		if (updates.path) library.path = updates.path
		await db.write()
		return library
	}
	return null
}

/**
 * 移除一个音乐库
 */
async function removeLibrary(libraryId: string): Promise<boolean> {
	await db.read()
	const initialLibrariesCount = db.data.libraries.length

	db.data.libraries = db.data.libraries.filter((lib: Library) => lib.id !== libraryId)
	db.data.songs = db.data.songs.filter((song: Song) => song.libraryId !== libraryId)

	const success = db.data.libraries.length < initialLibrariesCount

	if (success) {
		await db.write()
		console.log(`已成功移除音乐库 ${libraryId}`)
	}
	return success
}

// ============ 索引构建与维护函数 ============

function buildIndices(): void {
	songById.clear()
	songByPath.clear()
	for (const song of db.data.songs) {
		songById.set(song.id, song)
		songByPath.set(song.filePath, song)
	}
}

function updateSongInIndices(song: Song): void {
	if (!song) return
	songById.set(song.id, song)
	songByPath.set(song.filePath, song)
}

function removeSongFromIndices(id?: string, filePath?: string): void {
	if (id) songById.delete(id)
	if (filePath) songByPath.delete(filePath)
}

function rebuildIndices(): void {
	buildIndices()
}

/**
 * 增加歌曲播放次数
 */
async function incrementPlayCount(songId: string): Promise<Song> {
	try {
		await db.read()
		const songIndex = db.data.songs.findIndex((song: Song) => song.id === songId)

		if (songIndex === -1) {
			throw new Error("歌曲不存在")
		}

		const song = db.data.songs[songIndex]
		if (typeof song.playCount !== "number") {
			song.playCount = 1
		} else {
			song.playCount += 1
		}

		if (songById.has(songId)) {
			const idxSong = songById.get(songId)!
			idxSong.playCount = song.playCount
		}

		await db.write()
		return db.data.songs[songIndex]
	} catch (error) {
		console.error(`增加歌曲 ${songId} 播放次数时出错:`, error)
		throw error
	}
}

interface DeleteSongResult {
	success: boolean
	message?: string
	error?: string
	deletedSong?: { id: string; title: string; artist: string }
	removedFromPlaylists?: number
}

/**
 * 删除单个歌曲
 */
async function deleteSong(songId: string): Promise<DeleteSongResult> {
	try {
		if (!songId) {
			return { success: false, error: "歌曲ID不能为空" }
		}

		await db.read()

		const songIndex = db.data.songs.findIndex((s: Song) => s.id === songId)
		if (songIndex === -1) {
			return { success: false, error: "歌曲不存在" }
		}

		const songToDelete = db.data.songs[songIndex]
		db.data.songs.splice(songIndex, 1)
		removeSongFromIndices(songToDelete.id, songToDelete.filePath)

		let removedFromPlaylists = 0
		db.data.playlists.forEach((playlist: Playlist) => {
			const initialLength = playlist.songs.length
			playlist.songs = playlist.songs.filter((id: string) => id !== songId)
			if (playlist.songs.length < initialLength) {
				removedFromPlaylists++
				playlist.updateTime = Date.now()
			}
		})

		await db.write()

		console.log(`已删除歌曲: ${songToDelete.title} (ID: ${songId})`)
		if (removedFromPlaylists > 0) {
			console.log(`从 ${removedFromPlaylists} 个播放列表中移除了该歌曲`)
		}

		return {
			success: true,
			message: "歌曲已删除",
			deletedSong: {
				id: songToDelete.id,
				title: songToDelete.title,
				artist: songToDelete.artist,
			},
			removedFromPlaylists,
		}
	} catch (error) {
		const err = error as Error
		console.error(`删除歌曲失败(ID: ${songId}):`, error)
		return { success: false, error: err.message }
	}
}

export {
	initDb,
	parseSongFromFile,
	getSongById,
	getSongsByLibrary,
	addSongs,
	clearSongsByLibrary,
	_clearAllSongs_DANGEROUS,
	validateSongFiles,
	getPlaylists,
	getPlaylistById,
	createPlaylist,
	updatePlaylist,
	deletePlaylist,
	addSongsToPlaylist,
	removeSongsFromPlaylist,
	getLibraries,
	getLibraryById,
	addLibrary,
	updateLibrary,
	removeLibrary,
	rebuildIndices,
	incrementPlayCount,
	deleteSong,
}
