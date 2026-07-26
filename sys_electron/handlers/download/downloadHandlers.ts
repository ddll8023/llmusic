import { dialog, net } from "electron"
import { createWriteStream, promises as fs } from "fs"
import path from "path"
import os from "os"
import { randomUUID } from "crypto"
import { Readable } from "stream"
import { pipeline } from "stream/promises"
import NodeID3 from "node-id3"
import { ffmpeg } from "../../utils/ffmpeg"
import { isSafeFilename } from "../../utils/sanitizePath"
import { CHANNELS } from "../../constants/ipcChannels"
import type { IpcHandlerModule, SongDownloadMetadata } from "../../types"

// 主进程侧下载并发上限（不信任渲染层限流）
const MAX_CONCURRENT_DOWNLOADS = 3
// 网络请求失败后的自动重试次数
const DOWNLOAD_RETRY_COUNT = 2

let activeDownloads = 0
const waitQueue: Array<() => void> = []

function acquireSlot(): Promise<void> {
	if (activeDownloads < MAX_CONCURRENT_DOWNLOADS) {
		activeDownloads++
		return Promise.resolve()
	}
	return new Promise((resolve) => {
		waitQueue.push(() => {
			activeDownloads++
			resolve()
		})
	})
}

function releaseSlot(): void {
	activeDownloads--
	const next = waitQueue.shift()
	if (next) next()
}

/**
 * 判断文件是否存在（异步）
 */
async function fileExists(p: string): Promise<boolean> {
	try {
		await fs.access(p)
		return true
	} catch {
		return false
	}
}

function createTagHandlers(mainWindow: Electron.BrowserWindow): IpcHandlerModule {
	const handlers = [
		{
			channel: CHANNELS.DOWNLOAD_SONG_WITH_METADATA,
			handler: async (
				_event: Electron.IpcMainInvokeEvent,
				options: { url: string; filename: string; metadata: SongDownloadMetadata }
			) => {
				const { url, filename, metadata } = options
				const saveResult = await dialog.showSaveDialog(mainWindow, {
					defaultPath: filename,
				})
				if (saveResult.canceled) {
					return { success: true, canceled: true }
				}

				return downloadToPath(url, saveResult.filePath!, metadata)
			},
		},
		{
			channel: CHANNELS.DOWNLOAD_SONG_TO_DIR,
			handler: async (
				_event: Electron.IpcMainInvokeEvent,
				options: { url: string; filename: string; metadata: SongDownloadMetadata; targetDir: string }
			) => {
				const { url, filename, metadata, targetDir } = options

				// 路径安全：filename 不得含分隔符/..，targetDir 必须为绝对路径
				if (!isSafeFilename(filename) || typeof targetDir !== "string" || !path.isAbsolute(targetDir)) {
					return { success: false, error: "非法路径" }
				}

				// 确保目标目录存在
				await fs.mkdir(targetDir, { recursive: true })

				// 处理文件名冲突：追加 (1) (2) 序号
				let finalFilename = filename
				const ext = path.extname(filename).toLowerCase()
				const baseName = path.basename(filename, ext)
				let counter = 0
				while (await fileExists(path.join(targetDir, finalFilename))) {
					counter++
					finalFilename = `${baseName}(${counter})${ext}`
				}

				const outputPath = path.join(targetDir, finalFilename)
				return downloadToPath(url, outputPath, metadata)
			},
		},
	]
	return { handlers, cleanup: () => {} }
}

/**
 * 带并发上限的下载入口
 */
async function downloadToPath(
	url: string,
	outputPath: string,
	metadata: SongDownloadMetadata
): Promise<{ success: boolean; filePath?: string | null; error?: string; warning?: string }> {
	await acquireSlot()
	try {
		return await performDownload(url, outputPath, metadata)
	} finally {
		releaseSlot()
	}
}

/**
 * 将网络响应流式写入本地文件（避免整文件驻留内存）
 */
async function saveResponseToFile(response: Response, filePath: string): Promise<void> {
	if (response.body) {
		const nodeStream = Readable.fromWeb(response.body as unknown as import("stream/web").ReadableStream)
		await pipeline(nodeStream, createWriteStream(filePath))
		return
	}
	// 极端兜底：无 body 流时退回一次性缓冲
	await fs.writeFile(filePath, Buffer.from(await response.arrayBuffer()))
}

/**
 * 下载音频 → 写入元数据 → 保存到指定路径
 * 元数据写入失败时降级保留纯音频文件
 */
async function performDownload(
	url: string,
	outputPath: string,
	metadata: SongDownloadMetadata
): Promise<{ success: boolean; filePath?: string | null; error?: string; warning?: string }> {
	const ext = path.extname(outputPath).toLowerCase().replace(".", "") || "mp3"
	const tempDir = os.tmpdir()
	const tempId = randomUUID()
	const tempAudio = path.join(tempDir, `dl_audio_${tempId}.${ext}`)
	const tempCover = path.join(tempDir, `dl_cover_${tempId}.jpg`)
	const tempOutput = path.join(tempDir, `dl_output_${tempId}.${ext}`)

	try {
		const audioResponse = await fetchWithRetry(url)
		if (!audioResponse) {
			return { success: false, error: "音频下载失败" }
		}
		await saveResponseToFile(audioResponse, tempAudio)

		let hasCover = false
		if (metadata.coverUrl) {
			const coverResponse = await fetchWithRetry(metadata.coverUrl)
			if (coverResponse) {
				await saveResponseToFile(coverResponse, tempCover)
				hasCover = true
			}
		}

		let warning: string | undefined
		if (ext === "mp3" || ext === "flac") {
			try {
				if (ext === "mp3") {
					await _writeId3Tags(tempAudio, tempOutput, metadata, hasCover ? tempCover : null)
				} else {
					await _writeVorbisTags(tempAudio, tempOutput, metadata, hasCover ? tempCover : null)
				}
			} catch (tagError) {
				console.error("元数据写入失败，降级保存纯音频:", tagError)
				await fs.copyFile(tempAudio, tempOutput)
				warning = "元数据写入失败，已保存纯音频文件"
			}
		} else {
			await fs.copyFile(tempAudio, tempOutput)
		}

		await fs.copyFile(tempOutput, outputPath)

		return {
			success: true,
			filePath: outputPath,
			warning,
		}
	} catch (e) {
		const err = e as Error
		return { success: false, error: `下载失败: ${err.message}` }
	} finally {
		for (const f of [tempAudio, tempCover, tempOutput]) {
			await fs.unlink(f).catch(() => { /* 临时文件不存在则忽略 */ })
		}
	}
}

/**
 * 带重试的网络请求，全部失败返回 null
 */
async function fetchWithRetry(url: string): Promise<Response | null> {
	for (let attempt = 0; attempt <= DOWNLOAD_RETRY_COUNT; attempt++) {
		try {
			const response = await net.fetch(url)
			if (response.ok) return response
		} catch {
			// 网络异常，进入下一次重试
		}
	}
	return null
}

/**
 * MP3：使用 node-id3 写入 ID3v2 标签（含 USLT 歌词 / APIC 封面）
 */
async function _writeId3Tags(
	inputPath: string,
	outputPath: string,
	meta: SongDownloadMetadata,
	coverPath: string | null
): Promise<void> {
	const tags: NodeID3.Tags = {
		title: meta.title || undefined,
		artist: meta.artist || undefined,
		album: meta.album || undefined,
		trackNumber: meta.trackNumber ? String(meta.trackNumber) : undefined,
		genre: meta.genre || undefined,
		year: meta.year || undefined,
		unsynchronisedLyrics: meta.lyrics ? {
			language: "chi",
			text: meta.lyrics,
		} : undefined,
	}

	if (coverPath && await fileExists(coverPath)) {
		tags.image = {
			mime: "image/jpeg",
			type: { id: 3, name: "front cover" },
			description: "Album cover",
			imageBuffer: await fs.readFile(coverPath),
		}
	}

	const writeResult = NodeID3.write(tags, inputPath)
	if (writeResult instanceof Error) {
		throw writeResult
	}
	if (inputPath !== outputPath) {
		await fs.copyFile(inputPath, outputPath)
	}
}

/**
 * FLAC：使用 ffmpeg 写入 Vorbis Comment 标签与封面（attached_pic）
 */
async function _writeVorbisTags(
	inputPath: string,
	outputPath: string,
	meta: SongDownloadMetadata,
	coverPath: string | null
): Promise<void> {
	const command = ffmpeg(inputPath)

	if (coverPath && await fileExists(coverPath)) {
		command.input(coverPath)
		command.outputOptions(["-map", "0:a", "-map", "1", "-disposition:v:0", "attached_pic"])
	}
	command.outputOptions(["-c", "copy"])

	const setMeta = (key: string, value: unknown): void => {
		if (value !== undefined && value !== null && String(value) !== "") {
			command.outputOptions(["-metadata", `${key}=${String(value)}`])
		}
	}
	setMeta("title", meta.title)
	setMeta("artist", meta.artist)
	setMeta("album", meta.album)
	setMeta("date", meta.year)
	setMeta("genre", meta.genre)
	setMeta("track", meta.trackNumber)
	setMeta("LYRICS", meta.lyrics)

	await new Promise<void>((resolve, reject) => {
		command.output(outputPath).on("end", () => resolve()).on("error", reject).run()
	})
}

export { createTagHandlers as createDownloadHandlers }
