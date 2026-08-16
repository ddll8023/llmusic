import fs from "fs"
import path from "path"
import { app } from "electron"
import { v4 as uuidv4 } from "uuid"
import type { Database as SqliteDatabase } from "better-sqlite3"
import type { DbData, Library, Playlist } from "../../types"
import type { Song } from "../../types/song"

interface LegacyRecord {
	[key: string]: unknown
}

interface NormalizedLegacyData extends DbData {}

export class LegacyDataMigrationError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "LegacyDataMigrationError"
	}
}

function isRecord(value: unknown): value is LegacyRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asString(value: unknown, fallback = ""): string {
	return typeof value === "string" && value.trim() ? value : fallback
}

function asNullableString(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value : null
}

function asNumber(value: unknown, fallback = 0): number {
	if (typeof value === "number" && Number.isFinite(value)) return value
	if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value)
	return fallback
}

function asNullableNumber(value: unknown): number | null {
	if (value === null || value === undefined || value === "") return null
	const number = asNumber(value, Number.NaN)
	return Number.isFinite(number) ? number : null
}

function asBoolean(value: unknown): boolean | undefined {
	if (typeof value === "boolean") return value
	if (value === 1 || value === "1" || value === "true") return true
	if (value === 0 || value === "0" || value === "false") return false
	return undefined
}

function getArray(container: LegacyRecord, key: string): LegacyRecord[] {
	const value = container[key]
	if (value === undefined) return []
	if (!Array.isArray(value) || value.some((item) => !isRecord(item))) {
		throw new LegacyDataMigrationError(`旧数据库字段 ${key} 不是对象数组`)
	}
	return value as LegacyRecord[]
}

function normalizeSong(value: LegacyRecord): Song {
	const filePath = asString(value.filePath) || asString(value.path)
	if (!filePath) throw new LegacyDataMigrationError("旧歌曲记录缺少 filePath/path")

	return {
		id: asString(value.id, uuidv4()),
		filePath,
		path: asNullableString(value.path) ?? undefined,
		libraryId: asNullableString(value.libraryId) ?? undefined,
		title: asString(value.title, path.basename(filePath, path.extname(filePath))),
		artist: asString(value.artist, "未知艺术家"),
		album: asString(value.album, "未知专辑"),
		albumArtist: asNullableString(value.albumArtist) ?? undefined,
		year: asNullableNumber(value.year),
		duration: asNumber(value.duration),
		fileSize: asNullableNumber(value.fileSize) ?? undefined,
		hasCover: asBoolean(value.hasCover),
		hasLyrics: asBoolean(value.hasLyrics),
		lyrics: typeof value.lyrics === "string" ? value.lyrics : null,
		modifiedAt: asNullableNumber(value.modifiedAt) ?? undefined,
		format: asNullableString(value.format) ?? undefined,
		bitrate: asNullableNumber(value.bitrate) ?? undefined,
		sampleRate: asNullableNumber(value.sampleRate) ?? undefined,
		channels: asNullableNumber(value.channels) ?? undefined,
		playCount: asNumber(value.playCount),
		cover: asNullableString(value.cover) ?? undefined,
		fileExists: asBoolean(value.fileExists),
		genre: asNullableString(value.genre),
		trackNumber: asNullableNumber(value.trackNumber),
		discNumber: asNullableNumber(value.discNumber),
		addedAt: asNullableString(value.addedAt) ?? undefined,
	}
}

function normalizeLibrary(value: LegacyRecord): Library {
	return {
		id: asString(value.id, uuidv4()),
		name: asString(value.name, "未命名音乐库"),
		path: asString(value.path),
		createdAt: asString(value.createdAt, new Date().toISOString()),
	}
}

function normalizePlaylist(value: LegacyRecord): Playlist {
	const rawSongs = value.songs
	if (rawSongs !== undefined && !Array.isArray(rawSongs)) {
		throw new LegacyDataMigrationError("旧歌单的 songs 字段不是数组")
	}

	const songs = (rawSongs ?? []).map((song) => {
		if (typeof song === "string" && song.trim()) return song
		if (isRecord(song) && typeof song.id === "string" && song.id.trim()) return song.id
		throw new LegacyDataMigrationError("旧歌单包含无法识别的歌曲 ID")
	})

	return {
		id: asString(value.id, uuidv4()),
		name: asString(value.name, "未命名歌单"),
		description: asString(value.description),
		coverImgId: asNullableString(value.coverImgId),
		songs,
		createTime: asNumber(value.createTime ?? value.createdAt, Date.now()),
		updateTime: asNumber(value.updateTime ?? value.updatedAt, Date.now()),
	}
}

function normalizeData(parsed: unknown, sourcePath: string): NormalizedLegacyData {
	if (!isRecord(parsed)) {
		throw new LegacyDataMigrationError(`旧数据库不是 JSON 对象: ${sourcePath}`)
	}

	// lowdb 旧版本可能将业务数据包在 data 字段中。
	const container = isRecord(parsed.data) ? parsed.data : parsed
	const songs = getArray(container, "songs").map(normalizeSong)
	const libraries = getArray(container, "libraries").map(normalizeLibrary)
	const playlists = getArray(container, "playlists").map(normalizePlaylist)
	const rawSettings = container.settings
	if (rawSettings !== undefined && !isRecord(rawSettings)) {
		throw new LegacyDataMigrationError("旧数据库字段 settings 不是对象")
	}

	const ids = new Set<string>()
	for (const song of songs) {
		if (ids.has(song.id)) throw new LegacyDataMigrationError(`旧歌曲 ID 重复: ${song.id}`)
		ids.add(song.id)
	}

	const libraryIds = new Set<string>()
	for (const library of libraries) {
		if (libraryIds.has(library.id)) throw new LegacyDataMigrationError(`旧音乐库 ID 重复: ${library.id}`)
		libraryIds.add(library.id)
	}

	const playlistIds = new Set<string>()
	for (const playlist of playlists) {
		if (playlistIds.has(playlist.id)) throw new LegacyDataMigrationError(`旧歌单 ID 重复: ${playlist.id}`)
		playlistIds.add(playlist.id)
		for (const songId of playlist.songs) {
			if (!ids.has(songId)) {
				throw new LegacyDataMigrationError(`歌单 ${playlist.id} 引用了不存在的歌曲: ${songId}`)
			}
		}
	}

	return {
		songs,
		libraries,
		playlists,
		settings: rawSettings ?? {},
	}
}

function getLegacyCandidates(): string[] {
	const cwd = process.cwd()
	const appDataRoot = app.getPath("appData")
	const roots = [cwd, path.resolve(cwd, ".."), path.resolve(cwd, "..", "..")]
	const candidates = [
		process.env.LLMUSIC_LEGACY_DB_PATH,
		path.join(app.getPath("userData"), "db.json"),
		path.join(appDataRoot, "LLMusic", "db.json"),
		path.join(appDataRoot, "llmusic-electron", "db.json"),
		path.join(appDataRoot, "Electron", "db.json"),
		path.join(process.env.HOME || "", "Library", "Application Support", "LLMusic", "db.json"),
		path.join(cwd, "db.json"),
		path.join(cwd, "backend", "db.json"),
		path.join(cwd, "backend", "app", "db.json"),
		...roots.flatMap((root) => [
			path.join(root, "db.json"),
			path.join(root, "backend", "db.json"),
			path.join(root, "backend", "app", "db.json"),
		]),
	]

	return [...new Set(candidates.filter((candidate): candidate is string => !!candidate).map((candidate) => path.resolve(candidate)))]
}

function findLegacyDatabase(): string | null {
	const existing = getLegacyCandidates().filter((candidate) => fs.existsSync(candidate))
	if (existing.length > 1) {
		throw new LegacyDataMigrationError(`检测到多个旧数据库，请保留一个后重试:\n${existing.join("\n")}`)
	}
	return existing[0] ?? null
}

function getCounts(database: SqliteDatabase): Record<string, number> {
	const tables = ["songs", "libraries", "playlists", "playlist_songs"]
	return Object.fromEntries(
		tables.map((table) => [table, (database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count])
	)
}

function hasUserData(counts: Record<string, number>): boolean {
	return counts.songs > 0 || counts.libraries > 0 || counts.playlists > 0 || counts.playlist_songs > 0
}

function migrateRows(database: SqliteDatabase, data: NormalizedLegacyData): void {
	const insertLibrary = database.prepare(
		"INSERT INTO libraries (id, name, path, createdAt) VALUES (@id, @name, @path, @createdAt)"
	)
	const insertSong = database.prepare(`
		INSERT INTO songs (
			id, filePath, libraryId, path, title, artist, album, albumArtist, year, duration, fileSize,
			hasCover, hasLyrics, lyrics, modifiedAt, format, bitrate, sampleRate, channels, playCount,
			cover, fileExists, genre, trackNumber, discNumber, addedAt
		) VALUES (
			@id, @filePath, @libraryId, @path, @title, @artist, @album, @albumArtist, @year, @duration, @fileSize,
			@hasCover, @hasLyrics, @lyrics, @modifiedAt, @format, @bitrate, @sampleRate, @channels, @playCount,
			@cover, @fileExists, @genre, @trackNumber, @discNumber, @addedAt
		)
	`)
	const insertPlaylist = database.prepare(
		"INSERT INTO playlists (id, name, description, coverImgId, createTime, updateTime) VALUES (@id, @name, @description, @coverImgId, @createTime, @updateTime)"
	)
	const insertPlaylistSong = database.prepare(
		"INSERT INTO playlist_songs (playlistId, songId, position) VALUES (?, ?, ?)"
	)
	const upsertSetting = database.prepare(
		"INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
	)

	for (const library of data.libraries) insertLibrary.run(library)
	for (const song of data.songs) {
		insertSong.run({
			...song,
			libraryId: song.libraryId ?? null,
			path: song.path ?? null,
			hasCover: song.hasCover ? 1 : 0,
			hasLyrics: song.hasLyrics ? 1 : 0,
			lyrics: song.lyrics ?? null,
			fileExists: song.fileExists === undefined ? null : song.fileExists ? 1 : 0,
			cover: song.cover ?? null,
		})
	}
	for (const playlist of data.playlists) {
		insertPlaylist.run(playlist)
		playlist.songs.forEach((songId, position) => insertPlaylistSong.run(playlist.id, songId, position))
	}
	for (const [key, value] of Object.entries(data.settings)) upsertSetting.run(key, JSON.stringify(value ?? null))
}

function verifyMigration(database: SqliteDatabase, data: NormalizedLegacyData): void {
	const counts = getCounts(database)
	const expectedPlaylistSongs = data.playlists.reduce((total, playlist) => total + playlist.songs.length, 0)
	const expected = {
		songs: data.songs.length,
		libraries: data.libraries.length,
		playlists: data.playlists.length,
		playlist_songs: expectedPlaylistSongs,
	}

	for (const [table, expectedCount] of Object.entries(expected)) {
		if (counts[table] !== expectedCount) {
			throw new LegacyDataMigrationError(`迁移校验失败: ${table} 预期 ${expectedCount} 条，实际 ${counts[table]} 条`)
		}
	}

	for (const [key, value] of Object.entries(data.settings)) {
		const row = database.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined
		if (!row || row.value !== JSON.stringify(value ?? null)) {
			throw new LegacyDataMigrationError(`迁移校验失败: settings.${key}`)
		}
	}
}

/**
 * 将旧 lowdb JSON 导入 SQLite；只有事务和逐表校验都成功后才删除旧文件。
 */
function migrateLegacyDatabase(database: SqliteDatabase): void {
	const sourcePath = findLegacyDatabase()
	if (!sourcePath) return

	const currentCounts = getCounts(database)
	if (hasUserData(currentCounts)) {
		console.warn(`[Migration] SQLite 已有用户数据，跳过旧数据库导入并保留: ${sourcePath}`)
		return
	}

	const temporaryCopy = `${sourcePath}.migration-${process.pid}.tmp`
	try {
		fs.copyFileSync(sourcePath, temporaryCopy)
		const parsed = JSON.parse(fs.readFileSync(temporaryCopy, "utf8")) as unknown
		const data = normalizeData(parsed, sourcePath)
		const runMigration = database.transaction(() => {
			migrateRows(database, data)
			verifyMigration(database, data)
		})
		runMigration()

		try {
			fs.unlinkSync(sourcePath)
			console.log(`[Migration] 旧数据库迁移并删除成功: ${sourcePath}`)
		} catch (error) {
			console.warn(`[Migration] 数据已迁移，但旧数据库删除失败，请手动处理: ${sourcePath}`, error)
		}
	} catch (error) {
		if (error instanceof LegacyDataMigrationError) throw error
		throw new LegacyDataMigrationError(`旧数据库迁移失败，原文件已保留: ${sourcePath}; ${String(error)}`)
	} finally {
		if (fs.existsSync(temporaryCopy)) fs.unlinkSync(temporaryCopy)
	}
}

export { findLegacyDatabase, migrateLegacyDatabase }
