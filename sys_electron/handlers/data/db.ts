// 数据库连接层：better-sqlite3 单例、WAL 模式、建表 DDL、prepared statement 缓存
import path from "path"
import { app } from "electron"
import DatabaseConstructor from "better-sqlite3"
import type { Database as SqliteDatabase, Statement } from "better-sqlite3"

function getDbPath(): string {
	return path.join(app.getPath("userData"), "llmusic.db")
}

// 建表 DDL
const DDL = `
CREATE TABLE IF NOT EXISTS songs (
	id TEXT PRIMARY KEY,
	filePath TEXT NOT NULL UNIQUE,
	libraryId TEXT,
	title TEXT NOT NULL,
	artist TEXT NOT NULL,
	album TEXT NOT NULL,
	albumArtist TEXT,
	year INTEGER,
	duration REAL NOT NULL DEFAULT 0,
	fileSize INTEGER,
	hasCover INTEGER NOT NULL DEFAULT 0,
	hasLyrics INTEGER NOT NULL DEFAULT 0,
	lyrics TEXT,
	modifiedAt INTEGER,
	format TEXT,
	bitrate REAL,
	sampleRate INTEGER,
	channels INTEGER,
	playCount INTEGER NOT NULL DEFAULT 0,
	cover TEXT,
	fileExists INTEGER,
	genre TEXT,
	trackNumber INTEGER,
	discNumber INTEGER,
	addedAt TEXT
);

CREATE INDEX IF NOT EXISTS idx_songs_libraryId ON songs(libraryId);

CREATE TABLE IF NOT EXISTS libraries (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	path TEXT NOT NULL,
	createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playlists (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	description TEXT NOT NULL DEFAULT '',
	coverImgId TEXT,
	createTime INTEGER NOT NULL,
	updateTime INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS playlist_songs (
	playlistId TEXT NOT NULL,
	songId TEXT NOT NULL,
	position INTEGER NOT NULL,
	PRIMARY KEY (playlistId, songId)
);

CREATE TABLE IF NOT EXISTS settings (
	key TEXT PRIMARY KEY,
	value TEXT
);

CREATE TABLE IF NOT EXISTS qq_playlist_cache (
	user_key TEXT NOT NULL,
	playlist_id INTEGER NOT NULL,
	total INTEGER NOT NULL DEFAULT 0,
	data TEXT NOT NULL,
	cached_at INTEGER NOT NULL,
	PRIMARY KEY (user_key, playlist_id)
);

CREATE TABLE IF NOT EXISTS qq_user_playlists_cache (
	user_key TEXT PRIMARY KEY,
	data TEXT NOT NULL,
	cached_at INTEGER NOT NULL
);
`

let db: SqliteDatabase | null = null

/**
 * 获取数据库单例（首次调用时建表）
 */
function getDb(): SqliteDatabase {
	if (db) return db

	const database = new DatabaseConstructor(getDbPath())
	try {
		database.pragma("journal_mode = WAL")
		database.exec(DDL)
		db = database
		return database
	} catch (error) {
		database.close()
		throw error
	}
}

// prepared statement 缓存，按 SQL 文本复用
const stmtCache = new Map<string, Statement>()

function stmt(sql: string): Statement {
	let prepared = stmtCache.get(sql)
	if (!prepared) {
		prepared = getDb().prepare(sql)
		stmtCache.set(sql, prepared)
	}
	return prepared
}

/**
 * 数据库初始化
 */
async function initDb(): Promise<SqliteDatabase> {
	try {
		const database = getDb()
		console.log("数据库初始化完成:", getDbPath())
		return database
	} catch (error) {
		console.error("数据库初始化错误:", error)
		throw error
	}
}

/**
 * 关闭数据库连接（应用退出时调用，幂等）
 */
function closeDb(): void {
	if (!db) return
	try {
		stmtCache.clear()
		db.close()
		console.log("数据库连接已关闭")
	} catch (error) {
		console.error("关闭数据库失败:", error)
	} finally {
		db = null
	}
}

export { getDb, stmt, initDb, closeDb }
