// 歌曲数据仓库：歌曲元数据解析、CRUD、批量写入与文件校验
import path from "path"
import { promises as fs } from "fs"
import { parseFile } from "music-metadata"
import { v4 as uuidv4 } from "uuid"
import type { Song } from "../../types/song"
import { extractLyrics } from "../../utils/lyrics"
import { getDb, stmt } from "./db"

// songs 表行结构
interface SongRow {
	id: string
	filePath: string
	libraryId: string | null
	title: string
	artist: string
	album: string
	albumArtist: string | null
	year: number | null
	duration: number
	fileSize: number | null
	hasCover: number
	hasLyrics: number
	lyrics: string | null
	modifiedAt: number | null
	format: string | null
	bitrate: number | null
	sampleRate: number | null
	channels: number | null
	playCount: number
	cover: string | null
	fileExists: number | null
	genre: string | null
	trackNumber: number | null
	discNumber: number | null
	addedAt: string | null
}

const SONG_COLUMNS =
	"id, filePath, libraryId, title, artist, album, albumArtist, year, duration, fileSize, hasCover, hasLyrics, lyrics, modifiedAt, format, bitrate, sampleRate, channels, playCount, cover, fileExists, genre, trackNumber, discNumber, addedAt"

const SONG_PARAMS =
	"@id, @filePath, @libraryId, @title, @artist, @album, @albumArtist, @year, @duration, @fileSize, @hasCover, @hasLyrics, @lyrics, @modifiedAt, @format, @bitrate, @sampleRate, @channels, @playCount, @cover, @fileExists, @genre, @trackNumber, @discNumber, @addedAt"

const INSERT_SONG_SQL = `INSERT INTO songs (${SONG_COLUMNS}) VALUES (${SONG_PARAMS})`

const UPDATE_SONG_SQL = `UPDATE songs SET
	filePath = @filePath, libraryId = @libraryId, title = @title, artist = @artist,
	album = @album, albumArtist = @albumArtist, year = @year, duration = @duration, fileSize = @fileSize,
	hasCover = @hasCover, hasLyrics = @hasLyrics, lyrics = @lyrics, modifiedAt = @modifiedAt, format = @format,
	bitrate = @bitrate, sampleRate = @sampleRate, channels = @channels, playCount = @playCount, cover = @cover,
	fileExists = @fileExists, genre = @genre, trackNumber = @trackNumber, discNumber = @discNumber, addedAt = @addedAt
	WHERE id = @id`

// Song 对象 -> SQL 命名参数（undefined 统一转 null，布尔转 0/1）
function songToParams(song: Song): Record<string, unknown> {
	return {
		id: song.id,
		filePath: song.filePath,
		libraryId: song.libraryId ?? null,
		title: song.title,
		artist: song.artist,
		album: song.album,
		albumArtist: song.albumArtist ?? null,
		year: song.year ?? null,
		duration: song.duration ?? 0,
		fileSize: song.fileSize ?? null,
		hasCover: song.hasCover ? 1 : 0,
		hasLyrics: song.hasLyrics ? 1 : 0,
		lyrics: song.lyrics ?? null,
		modifiedAt: song.modifiedAt ?? null,
		format: song.format ?? null,
		bitrate: song.bitrate ?? null,
		sampleRate: song.sampleRate ?? null,
		channels: song.channels ?? null,
		playCount: song.playCount ?? 0,
		cover: song.cover ?? null,
		fileExists: song.fileExists === undefined ? null : song.fileExists ? 1 : 0,
		genre: song.genre ?? null,
		trackNumber: song.trackNumber ?? null,
		discNumber: song.discNumber ?? null,
		addedAt: song.addedAt ?? null,
	}
}

// SQL 行 -> Song 对象
function rowToSong(row: SongRow): Song {
	return {
		id: row.id,
		filePath: row.filePath,
		libraryId: row.libraryId ?? undefined,
		title: row.title,
		artist: row.artist,
		album: row.album,
		albumArtist: row.albumArtist ?? undefined,
		year: row.year,
		duration: row.duration,
		fileSize: row.fileSize ?? undefined,
		hasCover: !!row.hasCover,
		hasLyrics: !!row.hasLyrics,
		lyrics: row.lyrics,
		modifiedAt: row.modifiedAt ?? undefined,
		format: row.format ?? undefined,
		bitrate: row.bitrate ?? undefined,
		sampleRate: row.sampleRate ?? undefined,
		channels: row.channels ?? undefined,
		playCount: row.playCount,
		cover: row.cover ?? undefined,
		fileExists: row.fileExists === null ? undefined : !!row.fileExists,
		genre: row.genre,
		trackNumber: row.trackNumber,
		discNumber: row.discNumber,
		addedAt: row.addedAt ?? undefined,
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

		// 歌词提取：统一走共享模块（USLT / VorbisComment / syncText / 外部 .lrc）
		const { lyrics, hasLyrics } = await extractLyrics(metadata, filePath)

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
	if (!libraryId || libraryId === "all") {
		const rows = stmt("SELECT * FROM songs").all() as SongRow[]
		return rows.map(rowToSong)
	}
	const rows = stmt("SELECT * FROM songs WHERE libraryId = ?").all(libraryId) as SongRow[]
	return rows.map(rowToSong)
}

/**
 * 获取一首歌曲的完整信息
 */
async function getSongById(id: string): Promise<Song | undefined> {
	const row = stmt("SELECT * FROM songs WHERE id = ?").get(id) as SongRow | undefined
	return row ? rowToSong(row) : undefined
}

interface AddSongsResult {
	addedCount: number
	updatedCount: number
	failedPaths: string[]
}

/**
 * 批量添加歌曲到数据库（事务批量 upsert），支持进度回调
 */
async function addSongs(
	newSongs: Song[],
	progressCallback: ((data: { processed: number; total: number }) => void) | null = null
): Promise<AddSongsResult> {
	if (!Array.isArray(newSongs) || newSongs.length === 0) {
		return { addedCount: 0, updatedCount: 0, failedPaths: [] }
	}

	const total = newSongs.length
	let processed = 0
	let addedCount = 0
	let updatedCount = 0
	const failedPaths: string[] = []

	const selectByPath = stmt("SELECT id, modifiedAt FROM songs WHERE filePath = ?")
	const insertStmt = stmt(INSERT_SONG_SQL)
	const updateStmt = stmt(UPDATE_SONG_SQL)

	const runBatch = getDb().transaction((songs: Song[]) => {
		for (const song of songs) {
			processed++
			if (progressCallback) {
				progressCallback({ processed, total })
			}

			if (!song || !song.filePath) {
				console.warn("发现无效的歌曲对象，已跳过:", song)
				continue
			}

			try {
				const existing = selectByPath.get(song.filePath) as { id: string; modifiedAt: number | null } | undefined
				if (existing) {
					if (existing.modifiedAt !== (song.modifiedAt ?? null)) {
						updateStmt.run(songToParams({ ...song, id: existing.id }))
						updatedCount++
					}
				} else {
					insertStmt.run(songToParams(song))
					addedCount++
				}
			} catch (error) {
				console.error(`写入歌曲失败: ${song.filePath}`, error)
				failedPaths.push(song.filePath)
			}
		}
	})

	runBatch(newSongs)
	console.log(`批量添加歌曲完成，已添加: ${addedCount}, 已更新: ${updatedCount}, 写入失败: ${failedPaths.length}`)

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
	stmt("DELETE FROM songs WHERE libraryId = ?").run(libraryId)
	console.log(`从音乐库 ${libraryId} 中清除了歌曲。`)
}

/**
 * @deprecated 清空所有歌曲记录。这是一个危险操作。
 */
async function _clearAllSongs_DANGEROUS(): Promise<void> {
	stmt("DELETE FROM songs").run()
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
	const rows = stmt("SELECT * FROM songs").all() as SongRow[]
	let missingCount = 0
	let updatedCount = 0
	const toDeleteIds: string[] = []
	const toUpdate: Song[] = []

	for (const row of rows) {
		try {
			const stats = await fs.stat(row.filePath)
			if (stats.mtime.getTime() !== row.modifiedAt) {
				console.log(`文件已修改，重新解析: ${row.filePath}`)
				const updatedSong = await parseSongFromFile(row.filePath, row.id, row.libraryId)
				if (updatedSong) {
					toUpdate.push(updatedSong)
					updatedCount++
				} else {
					toDeleteIds.push(row.id)
					missingCount++
				}
			}
		} catch {
			toDeleteIds.push(row.id)
			missingCount++
			console.log(`文件不存在，标记为待移除: ${row.filePath}`)
		}
	}

	if (toDeleteIds.length > 0 || toUpdate.length > 0) {
		const deleteStmt = stmt("DELETE FROM songs WHERE id = ?")
		const updateStmt = stmt(UPDATE_SONG_SQL)
		const applyChanges = getDb().transaction(() => {
			for (const id of toDeleteIds) {
				deleteStmt.run(id)
			}
			for (const song of toUpdate) {
				updateStmt.run(songToParams(song))
			}
		})
		applyChanges()
	}

	return {
		total: rows.length,
		missing: missingCount,
		updated: updatedCount,
	}
}

/**
 * 增加歌曲播放次数
 */
async function incrementPlayCount(songId: string): Promise<Song> {
	try {
		const result = stmt("UPDATE songs SET playCount = playCount + 1 WHERE id = ?").run(songId)
		if (result.changes === 0) {
			throw new Error("歌曲不存在")
		}
		const row = stmt("SELECT * FROM songs WHERE id = ?").get(songId) as SongRow
		return rowToSong(row)
	} catch (error) {
		console.error(`增加歌曲 ${songId} 播放次数时出错:`, error)
		throw error
	}
}

/**
 * 更新单个歌曲的数据库记录（按 id 整体替换）
 */
async function updateSong(song: Song): Promise<boolean> {
	try {
		const result = stmt(UPDATE_SONG_SQL).run(songToParams(song))
		return result.changes > 0
	} catch (error) {
		console.error(`更新歌曲记录失败(ID: ${song.id}):`, error)
		return false
	}
}

interface DeleteSongResult {
	success: boolean
	message?: string
	error?: string
	warning?: string
	deletedSong?: { id: string; title: string; artist: string; filePath: string }
	removedFromPlaylists?: number
}

/**
 * 删除单个歌曲（同时从所有歌单中移除引用）
 */
async function deleteSong(songId: string): Promise<DeleteSongResult> {
	try {
		if (!songId) {
			return { success: false, error: "歌曲ID不能为空" }
		}

		const row = stmt("SELECT * FROM songs WHERE id = ?").get(songId) as SongRow | undefined
		if (!row) {
			return { success: false, error: "歌曲不存在" }
		}

		const affectedPlaylists = stmt("SELECT DISTINCT playlistId FROM playlist_songs WHERE songId = ?").all(songId) as Array<{
			playlistId: string
		}>
		const removedFromPlaylists = affectedPlaylists.length

		const touchPlaylist = stmt("UPDATE playlists SET updateTime = ? WHERE id = ?")
		const runDelete = getDb().transaction(() => {
			stmt("DELETE FROM playlist_songs WHERE songId = ?").run(songId)
			const now = Date.now()
			for (const playlist of affectedPlaylists) {
				touchPlaylist.run(now, playlist.playlistId)
			}
			stmt("DELETE FROM songs WHERE id = ?").run(songId)
		})
		runDelete()

		console.log(`已删除歌曲: ${row.title} (ID: ${songId})`)
		if (removedFromPlaylists > 0) {
			console.log(`从 ${removedFromPlaylists} 个播放列表中移除了该歌曲`)
		}

		return {
			success: true,
			message: "歌曲已删除",
			deletedSong: {
				id: row.id,
				title: row.title,
				artist: row.artist,
				filePath: row.filePath,
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
	parseSongFromFile,
	getSongById,
	getSongsByLibrary,
	addSongs,
	clearSongsByLibrary,
	_clearAllSongs_DANGEROUS,
	validateSongFiles,
	incrementPlayCount,
	updateSong,
	deleteSong,
}
