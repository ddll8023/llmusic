// 在线歌单持久化缓存仓库：按用户 + 歌单 ID 存储歌单元数据，按用户存储歌单列表
// 播放 URL 有时效性，不写入本缓存；渲染层在缓存命中后另行批量获取
import { getDb, stmt } from "./db"

const CACHE_VERSION = 1
const MAX_PLAYLIST_CACHE_PER_USER = 50

interface PlaylistCacheRow {
	user_key: string
	playlist_id: number
	total: number
	data: string
	cached_at: number
}

interface UserPlaylistsCacheRow {
	user_key: string
	data: string
	cached_at: number
}

export interface PlaylistCachePayload {
	version: number
	cachedAt: number
	total: number
	songs: unknown[]
}

export interface UserPlaylistsCachePayload {
	version: number
	cachedAt: number
	total: number
	playlists: unknown[]
}

function parseJson<T>(raw: string): T | null {
	try {
		return JSON.parse(raw) as T
	} catch {
		return null
	}
}

/**
 * 读取单个歌单缓存；不存在或数据损坏时返回 null
 */
function getPlaylistCache(
	userKey: string,
	playlistId: number
): { success: true; payload: PlaylistCachePayload | null } | { success: false; error: string } {
	try {
		const row = stmt(
			"SELECT user_key, playlist_id, total, data, cached_at FROM qq_playlist_cache WHERE user_key = ? AND playlist_id = ?"
		).get(userKey, playlistId) as PlaylistCacheRow | undefined

		if (!row) return { success: true, payload: null }

		const parsed = parseJson<{ version?: number; songs?: unknown[] }>(row.data)
		if (!parsed || !Array.isArray(parsed.songs)) {
			return { success: true, payload: null }
		}

		return {
			success: true,
			payload: {
				version: parsed.version ?? CACHE_VERSION,
				cachedAt: row.cached_at,
				total: row.total,
				songs: parsed.songs,
			},
		}
	} catch (error) {
		const err = error as Error
		console.error(`读取 QQ 歌单缓存失败: user=${userKey} playlist=${playlistId}`, error)
		return { success: false, error: err.message }
	}
}

/**
 * 保存单个歌单缓存（整体覆盖）
 */
function savePlaylistCache(
	userKey: string,
	playlistId: number,
	total: number,
	songs: unknown[]
): { success: true } | { success: false; error: string } {
	try {
		const data = JSON.stringify({ version: CACHE_VERSION, songs })
		const upsert = stmt(
			`INSERT INTO qq_playlist_cache (user_key, playlist_id, total, data, cached_at)
			 VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT(user_key, playlist_id) DO UPDATE SET
			   total = excluded.total,
			   data = excluded.data,
			   cached_at = excluded.cached_at`
		)
		// 每个用户最多保留最近 MAX_PLAYLIST_CACHE_PER_USER 个歌单缓存，防止无限增长
		const cleanup = stmt(
			`DELETE FROM qq_playlist_cache
			 WHERE user_key = ?
			   AND playlist_id NOT IN (
			     SELECT playlist_id FROM (
			       SELECT playlist_id FROM qq_playlist_cache
			       WHERE user_key = ?
			       ORDER BY cached_at DESC
			       LIMIT ?
			     )
			   )`
		)
		const runSave = getDb().transaction(() => {
			upsert.run(userKey, playlistId, total, data, Date.now())
			cleanup.run(userKey, userKey, MAX_PLAYLIST_CACHE_PER_USER)
		})
		runSave()
		return { success: true }
	} catch (error) {
		const err = error as Error
		console.error(`保存 QQ 歌单缓存失败: user=${userKey} playlist=${playlistId}`, error)
		return { success: false, error: err.message }
	}
}

/**
 * 删除单个歌单缓存；playlistId 为空时删除该用户全部歌单缓存
 */
function deletePlaylistCache(
	userKey: string,
	playlistId?: number
): { success: true } | { success: false; error: string } {
	try {
		if (playlistId === undefined) {
			stmt("DELETE FROM qq_playlist_cache WHERE user_key = ?").run(userKey)
		} else {
			stmt("DELETE FROM qq_playlist_cache WHERE user_key = ? AND playlist_id = ?").run(userKey, playlistId)
		}
		return { success: true }
	} catch (error) {
		const err = error as Error
		console.error(`删除 QQ 歌单缓存失败: user=${userKey} playlist=${playlistId ?? "all"}`, error)
		return { success: false, error: err.message }
	}
}

/**
 * 读取用户歌单列表缓存；不存在或数据损坏时返回 null
 */
function getUserPlaylistsCache(
	userKey: string
): { success: true; payload: UserPlaylistsCachePayload | null } | { success: false; error: string } {
	try {
		const row = stmt(
			"SELECT user_key, data, cached_at FROM qq_user_playlists_cache WHERE user_key = ?"
		).get(userKey) as UserPlaylistsCacheRow | undefined

		if (!row) return { success: true, payload: null }

		const parsed = parseJson<{ version?: number; total?: number; playlists?: unknown[] }>(row.data)
		if (!parsed || !Array.isArray(parsed.playlists)) {
			return { success: true, payload: null }
		}

		return {
			success: true,
			payload: {
				version: parsed.version ?? CACHE_VERSION,
				cachedAt: row.cached_at,
				total: parsed.total ?? parsed.playlists.length,
				playlists: parsed.playlists,
			},
		}
	} catch (error) {
		const err = error as Error
		console.error(`读取 QQ 用户歌单列表缓存失败: user=${userKey}`, error)
		return { success: false, error: err.message }
	}
}

/**
 * 保存用户歌单列表缓存（整体覆盖）
 */
function saveUserPlaylistsCache(
	userKey: string,
	playlists: unknown[],
	total: number
): { success: true } | { success: false; error: string } {
	try {
		const data = JSON.stringify({ version: CACHE_VERSION, total, playlists })
		stmt(
			`INSERT INTO qq_user_playlists_cache (user_key, data, cached_at)
			 VALUES (?, ?, ?)
			 ON CONFLICT(user_key) DO UPDATE SET
			   data = excluded.data,
			   cached_at = excluded.cached_at`
		).run(userKey, data, Date.now())
		return { success: true }
	} catch (error) {
		const err = error as Error
		console.error(`保存 QQ 用户歌单列表缓存失败: user=${userKey}`, error)
		return { success: false, error: err.message }
	}
}

/**
 * 清空某用户全部在线歌单缓存（歌单列表 + 歌单详情）
 */
function clearUserOnlineCache(userKey: string): { success: true } | { success: false; error: string } {
	try {
		const runClear = getDb().transaction(() => {
			stmt("DELETE FROM qq_playlist_cache WHERE user_key = ?").run(userKey)
			stmt("DELETE FROM qq_user_playlists_cache WHERE user_key = ?").run(userKey)
		})
		runClear()
		return { success: true }
	} catch (error) {
		const err = error as Error
		console.error(`清空 QQ 在线歌单缓存失败: user=${userKey}`, error)
		return { success: false, error: err.message }
	}
}

export {
	getPlaylistCache,
	savePlaylistCache,
	deletePlaylistCache,
	getUserPlaylistsCache,
	saveUserPlaylistsCache,
	clearUserOnlineCache,
}
