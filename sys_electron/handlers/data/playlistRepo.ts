// 歌单数据仓库：歌单 CRUD 与歌单-歌曲关联管理（playlist_songs 按 position 排序组装 songs 数组）
import { v4 as uuidv4 } from "uuid"
import type { Playlist } from "../../types"
import { getDb, stmt } from "./db"

// playlists 表行结构
interface PlaylistRow {
	id: string
	name: string
	description: string
	coverImgId: string | null
	createTime: number
	updateTime: number
}

// 组装歌单对象（songs 数组按 position 排序）
function assemblePlaylist(row: PlaylistRow): Playlist {
	const songRows = stmt("SELECT songId FROM playlist_songs WHERE playlistId = ? ORDER BY position").all(row.id) as Array<{
		songId: string
	}>
	return {
		id: row.id,
		name: row.name,
		description: row.description,
		coverImgId: row.coverImgId,
		songs: songRows.map((s) => s.songId),
		createTime: row.createTime,
		updateTime: row.updateTime,
	}
}

/**
 * 获取所有歌单列表
 */
async function getPlaylists(): Promise<{ success: boolean; playlists?: Playlist[]; error?: string }> {
	try {
		const rows = stmt("SELECT * FROM playlists").all() as PlaylistRow[]
		return { success: true, playlists: rows.map(assemblePlaylist) }
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
		const row = stmt("SELECT * FROM playlists WHERE id = ?").get(playlistId) as PlaylistRow | undefined
		if (!row) {
			return { success: false, error: "歌单不存在" }
		}
		return { success: true, playlist: assemblePlaylist(row) }
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
		const newPlaylist: Playlist = {
			id: uuidv4(),
			name: playlistData.name || "未命名歌单",
			description: playlistData.description || "",
			coverImgId: playlistData.coverImgId || null,
			songs: playlistData.songs || [],
			createTime: Date.now(),
			updateTime: Date.now(),
		}

		const insertSong = stmt("INSERT OR IGNORE INTO playlist_songs (playlistId, songId, position) VALUES (?, ?, ?)")
		const runCreate = getDb().transaction(() => {
			stmt(
				"INSERT INTO playlists (id, name, description, coverImgId, createTime, updateTime) VALUES (@id, @name, @description, @coverImgId, @createTime, @updateTime)"
			).run({
				id: newPlaylist.id,
				name: newPlaylist.name,
				description: newPlaylist.description,
				coverImgId: newPlaylist.coverImgId,
				createTime: newPlaylist.createTime,
				updateTime: newPlaylist.updateTime,
			})
			newPlaylist.songs.forEach((songId, position) => {
				insertSong.run(newPlaylist.id, songId, position)
			})
		})
		runCreate()

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
		const row = stmt("SELECT * FROM playlists WHERE id = ?").get(playlistId) as PlaylistRow | undefined
		if (!row) {
			return { success: false, error: "歌单不存在" }
		}

		if (playlistData.name !== undefined) {
			row.name = playlistData.name
		}
		if (playlistData.description !== undefined) {
			row.description = playlistData.description
		}
		if (playlistData.coverImgId !== undefined) {
			row.coverImgId = playlistData.coverImgId
		}
		row.updateTime = Date.now()

		stmt(
			"UPDATE playlists SET name = @name, description = @description, coverImgId = @coverImgId, updateTime = @updateTime WHERE id = @id"
		).run({
			id: row.id,
			name: row.name,
			description: row.description,
			coverImgId: row.coverImgId,
			updateTime: row.updateTime,
		})

		return { success: true, playlist: assemblePlaylist(row) }
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
		const runDelete = getDb().transaction(() => {
			stmt("DELETE FROM playlist_songs WHERE playlistId = ?").run(playlistId)
			return stmt("DELETE FROM playlists WHERE id = ?").run(playlistId).changes
		})
		if (runDelete() === 0) {
			return { success: false, error: "歌单不存在" }
		}
		return { success: true, message: "歌单已删除" }
	} catch (error) {
		const err = error as Error
		console.error(`删除歌单(ID: ${playlistId})出错:`, error)
		return { success: false, error: err.message }
	}
}

/**
 * 向歌单添加歌曲（仅添加存在于曲库且不在歌单中的歌曲）
 */
async function addSongsToPlaylist(
	playlistId: string,
	songIds: string | string[]
): Promise<{ success: boolean; message?: string; addedCount?: number; error?: string }> {
	try {
		const playlistExists = stmt("SELECT 1 FROM playlists WHERE id = ?").get(playlistId)
		if (!playlistExists) {
			return { success: false, error: "歌单不存在" }
		}

		const songIdArray = Array.isArray(songIds) ? songIds : [songIds]
		let addedCount = 0

		const songExistsStmt = stmt("SELECT 1 FROM songs WHERE id = ?")
		const inPlaylistStmt = stmt("SELECT 1 FROM playlist_songs WHERE playlistId = ? AND songId = ?")
		const nextPositionStmt = stmt("SELECT COALESCE(MAX(position), -1) + 1 AS position FROM playlist_songs WHERE playlistId = ?")
		const insertStmt = stmt("INSERT INTO playlist_songs (playlistId, songId, position) VALUES (?, ?, ?)")

		const runAdd = getDb().transaction(() => {
			for (const songId of songIdArray) {
				const songExists = songExistsStmt.get(songId)
				const alreadyIn = inPlaylistStmt.get(playlistId, songId)
				if (songExists && !alreadyIn) {
					const { position } = nextPositionStmt.get(playlistId) as { position: number }
					insertStmt.run(playlistId, songId, position)
					addedCount++
				}
			}
			stmt("UPDATE playlists SET updateTime = ? WHERE id = ?").run(Date.now(), playlistId)
		})
		runAdd()

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
		const playlistExists = stmt("SELECT 1 FROM playlists WHERE id = ?").get(playlistId)
		if (!playlistExists) {
			return { success: false, error: "歌单不存在" }
		}

		const songIdArray = Array.isArray(songIds) ? songIds : [songIds]
		let removedCount = 0

		const deleteStmt = stmt("DELETE FROM playlist_songs WHERE playlistId = ? AND songId = ?")
		const runRemove = getDb().transaction(() => {
			for (const songId of songIdArray) {
				removedCount += deleteStmt.run(playlistId, songId).changes
			}
			stmt("UPDATE playlists SET updateTime = ? WHERE id = ?").run(Date.now(), playlistId)
		})
		runRemove()

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

export { getPlaylists, getPlaylistById, createPlaylist, updatePlaylist, deletePlaylist, addSongsToPlaylist, removeSongsFromPlaylist }
