// 音乐库数据仓库：音乐库的增删改查与歌曲数量统计
import { v4 as uuidv4 } from "uuid"
import type { Library } from "../../types"
import { getDb, stmt } from "./db"

/**
 * 获取所有音乐库（songCount 通过 COUNT 聚合）
 */
async function getLibraries(): Promise<Library[]> {
	const rows = stmt(
		`SELECT l.id, l.name, l.path, l.createdAt,
			(SELECT COUNT(*) FROM songs s WHERE s.libraryId = l.id) AS songCount
		FROM libraries l`
	).all() as Array<Library & { songCount: number }>
	return rows
}

/**
 * 根据ID获取单个音乐库
 */
async function getLibraryById(libraryId: string): Promise<Library | undefined> {
	const row = stmt("SELECT id, name, path, createdAt FROM libraries WHERE id = ?").get(libraryId) as Library | undefined
	return row
}

interface AddLibraryData {
	name: string
	path: string
}

/**
 * 添加一个新的音乐库
 */
async function addLibrary(libraryData: AddLibraryData): Promise<Library> {
	const newLibrary: Library = {
		id: uuidv4(),
		name: libraryData.name,
		path: libraryData.path,
		createdAt: new Date().toISOString(),
	}
	stmt("INSERT INTO libraries (id, name, path, createdAt) VALUES (@id, @name, @path, @createdAt)").run(newLibrary)
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
	const library = stmt("SELECT id, name, path, createdAt FROM libraries WHERE id = ?").get(libraryId) as Library | undefined
	if (!library) {
		return null
	}
	if (updates.name) library.name = updates.name
	if (updates.path) library.path = updates.path
	stmt("UPDATE libraries SET name = @name, path = @path WHERE id = @id").run({
		id: library.id,
		name: library.name,
		path: library.path,
	})
	return library
}

/**
 * 移除一个音乐库（同时删除该库下的所有歌曲）
 */
async function removeLibrary(libraryId: string): Promise<boolean> {
	const runRemove = getDb().transaction(() => {
		stmt("DELETE FROM songs WHERE libraryId = ?").run(libraryId)
		return stmt("DELETE FROM libraries WHERE id = ?").run(libraryId).changes
	})
	const success = runRemove() > 0

	if (success) {
		console.log(`已成功移除音乐库 ${libraryId}`)
	}
	return success
}

export { getLibraries, getLibraryById, addLibrary, updateLibrary, removeLibrary }
