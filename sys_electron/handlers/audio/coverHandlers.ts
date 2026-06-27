import path from "path"
import { promises as fs } from "fs"
import { parseFile } from "music-metadata"
import LRUCache from "../../utils/cache/LRUCache"
import { sanitizeCoverPath } from "../../utils/sanitizePath"
import { CHANNELS } from "../../constants/ipcChannels"
import { getSongById } from "../data/Database"
import type { IpcHandlerModule } from "../../types"
import type { CoverInfo, Song } from "../../types/song"

// ---- 封面缓存 ----
const coverCache = new LRUCache<string, { data: string; format: string }>(100)

/**
 * 从音乐文件中提取内嵌封面
 */
async function extractCoverFromMusicFile(filePath: string): Promise<CoverInfo | null> {
	try {
		await fs.access(filePath)
		const metadata = await parseFile(filePath, {
			skipCovers: false,
		})
		if (metadata.common.picture && metadata.common.picture.length > 0) {
			const pic = metadata.common.picture[0]
			const buf = Buffer.isBuffer(pic.data) ? pic.data : Buffer.from(pic.data)
			if (buf.length === 0) return null
			return {
				data: buf.toString("base64"),
				format: pic.format || "image/jpeg",
				source: "music_file",
			}
		}
		return null
	} catch {
		return null
	}
}

/**
 * 在歌曲文件所在目录中查找封面图片
 */
async function findCoverInDirectory(songPath: string, song: Song): Promise<CoverInfo | null> {
	const dir = path.dirname(songPath)
	const nameBase = path.basename(songPath, path.extname(songPath))
	const candidates = [
		`${nameBase}.jpg`,
		`${nameBase}.png`,
		"cover.jpg",
		"cover.png",
		"folder.jpg",
		"folder.png",
		`${(song.album || "").replace(/[/\\?%*:|"<>]/g, "_")}.jpg`,
		`${(song.album || "").replace(/[/\\?%*:|"<>]/g, "_")}.png`,
	]
	for (const file of candidates) {
		const full = path.join(dir, file)
		try {
			await fs.access(full)
			const buf = await fs.readFile(full)
			if (!Buffer.isBuffer(buf) || buf.length === 0) continue
			const format = path.extname(full).toLowerCase() === ".png" ? "image/png" : "image/jpeg"
			return { data: buf.toString("base64"), format, source: "directory" }
		} catch {
			continue
		}
	}
	return null
}

interface CoverResult {
	success: boolean
	cover?: string
	format?: string
	source?: string
	error?: string
}

/**
 * 获取歌曲封面（带缓存）
 */
async function getCover(songId: string): Promise<CoverResult> {
	const cached = coverCache.get(songId)
	if (cached) {
		return {
			success: true,
			cover: cached.data,
			format: cached.format,
			source: "memory-cache",
		}
	}
	const song = await getSongById(songId)
	if (!song) return { success: false, error: "歌曲未找到" }
	const filePath = song.filePath || song.path
	if (!filePath) return { success: false, error: "歌曲路径缺失" }
	let info = await extractCoverFromMusicFile(filePath)
	if (!info) info = await findCoverInDirectory(filePath, song)
	if (info) {
		coverCache.set(songId, { data: info.data, format: info.format })
		return {
			success: true,
			cover: info.data,
			format: info.format,
			source: info.source,
		}
	}
	return { success: false, error: "未找到封面" }
}

/**
 * 直接从文件路径获取封面（不依赖数据库）
 */
async function getCoverFromFile(filePath: string): Promise<CoverResult> {
	if (!filePath) {
		return { success: false, error: "文件路径不能为空" }
	}

	try {
		let info = await extractCoverFromMusicFile(filePath)

		if (!info) {
			const tempSong: Partial<Song> = {
				album: require("path").basename(filePath, require("path").extname(filePath)),
			} as Song
			info = await findCoverInDirectory(filePath, tempSong as Song)
		}

		if (info) {
			return {
				success: true,
				cover: info.data,
				format: info.format,
				source: info.source,
			}
		} else {
			return { success: false, error: "未找到封面" }
		}
	} catch (err) {
		const error = err as Error
		console.error("从文件获取封面失败")
		return { success: false, error: error.message }
	}
}

function createCoverHandlers(): IpcHandlerModule {
	const handlers = [
		{
			channel: CHANNELS.GET_SONG_COVER,
			handler: (_event: Electron.IpcMainInvokeEvent, songId: string) => getCover(songId),
		},
		{
			channel: CHANNELS.FORCE_EXTRACT_COVER,
			handler: async (_event: Electron.IpcMainInvokeEvent, songId: string) => {
				coverCache.delete(songId)
				return await getCover(songId)
			},
		},
		{
			channel: CHANNELS.GET_COVER_FROM_FILE,
			handler: (_event: Electron.IpcMainInvokeEvent, filePath: string) => getCoverFromFile(filePath),
		},
	]

	return {
		handlers,
		cleanup: () => {
			coverCache.clear()
		},
	}
}

export { createCoverHandlers, coverCache }
