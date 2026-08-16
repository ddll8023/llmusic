import path from "path"
import { promises as fs } from "fs"
import { parseFile } from "music-metadata"
import { isAudioPath } from "../../utils/sanitizePath"
import { CHANNELS } from "../../constants/ipcChannels"
import { getSongById } from "../data/Database"
import type { IpcHandlerModule } from "../../types"
import type { CoverInfo, Song } from "../../types/song"

// ---- 封面缓存（按字节上限的 LRU，含"无封面"负缓存） ----

/** 封面缓存总字节上限 */
const COVER_CACHE_MAX_BYTES = 50 * 1024 * 1024
/** 负缓存条目（无封面标记）的记账成本 */
const NEGATIVE_ENTRY_COST = 64

interface CoverCacheEntry {
	data: string
	format: string
}

/**
 * 按累计 base64 字节数（而非条目数）淘汰的 LRU 缓存。
 * value 为 null 表示"确认无封面"的负缓存，避免反复整文件解析 + 目录探测。
 * get 返回 undefined = 未缓存；null = 负缓存命中。
 */
class CoverLruCache {
	private map = new Map<string, CoverCacheEntry | null>()
	private bytes = 0

	private costOf(value: CoverCacheEntry | null): number {
		return value === null ? NEGATIVE_ENTRY_COST : value.data.length
	}

	get(key: string): CoverCacheEntry | null | undefined {
		if (!this.map.has(key)) return undefined
		const value = this.map.get(key) as CoverCacheEntry | null
		// 刷新 LRU 顺序（Map 按插入序迭代）
		this.map.delete(key)
		this.map.set(key, value)
		return value
	}

	set(key: string, value: CoverCacheEntry | null): void {
		const existing = this.map.get(key)
		if (this.map.has(key)) {
			this.bytes -= this.costOf(existing as CoverCacheEntry | null)
			this.map.delete(key)
		}
		this.map.set(key, value)
		this.bytes += this.costOf(value)
		this.evict()
	}

	delete(key: string): boolean {
		if (!this.map.has(key)) return false
		this.bytes -= this.costOf(this.map.get(key) as CoverCacheEntry | null)
		this.map.delete(key)
		return true
	}

	clear(): void {
		this.map.clear()
		this.bytes = 0
	}

	get size(): number {
		return this.map.size
	}

	private evict(): void {
		while (this.bytes > COVER_CACHE_MAX_BYTES && this.map.size > 0) {
			const oldestKey = this.map.keys().next().value as string
			this.bytes -= this.costOf(this.map.get(oldestKey) as CoverCacheEntry | null)
			this.map.delete(oldestKey)
		}
	}
}

const coverCache = new CoverLruCache()

/**
 * 从音乐文件中提取内嵌封面
 */
async function extractCoverFromMusicFile(filePath: string): Promise<CoverInfo | null> {
	try {
		await fs.access(filePath)
		const metadata = await parseFile(filePath, {
			skipCovers: false,
			skipPostHeaders: true,
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
 * 提取封面并写入缓存（含负缓存），返回统一结果
 */
async function resolveCover(cacheKey: string, filePath: string, song: Song): Promise<CoverResult> {
	const cached = coverCache.get(cacheKey)
	if (cached !== undefined) {
		if (cached === null) {
			return { success: false, error: "未找到封面" }
		}
		return {
			success: true,
			cover: cached.data,
			format: cached.format,
			source: "memory-cache",
		}
	}

	let info = await extractCoverFromMusicFile(filePath)
	if (!info) info = await findCoverInDirectory(filePath, song)

	if (info) {
		coverCache.set(cacheKey, { data: info.data, format: info.format })
		return {
			success: true,
			cover: info.data,
			format: info.format,
			source: info.source,
		}
	}

	// 负缓存：记录"无封面"，避免下次重复整文件解析 + 目录探测
	coverCache.set(cacheKey, null)
	return { success: false, error: "未找到封面" }
}

/**
 * 获取歌曲封面（带缓存）
 */
async function getCover(songId: string): Promise<CoverResult> {
	const cached = coverCache.get(songId)
	if (cached !== undefined) {
		if (cached === null) {
			return { success: false, error: "未找到封面" }
		}
		return {
			success: true,
			cover: cached.data,
			format: cached.format,
			source: "memory-cache",
		}
	}
	const song = await getSongById(songId)
	if (!song) return { success: false, error: "歌曲未找到" }
	const filePath = song.filePath
	if (!filePath) return { success: false, error: "歌曲路径缺失" }
	return resolveCover(songId, filePath, song)
}

/**
 * 直接从文件路径获取封面（不依赖数据库，与歌曲封面共用同一缓存）
 */
async function getCoverFromFile(filePath: string): Promise<CoverResult> {
	if (!isAudioPath(filePath)) {
		return { success: false, error: "非法路径" }
	}

	try {
		const tempSong = {
			album: path.basename(filePath, path.extname(filePath)),
		} as Song
		return await resolveCover(`file:${filePath}`, filePath, tempSong)
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
