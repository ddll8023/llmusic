/**
 * llmusic:// 音频流协议
 *
 * 渲染进程通过 llmusic://audio/<songId> 以 HTML5 Audio 直接流式播放本地歌曲，
 * 主进程负责按 songId 查库、Range 分段响应；浏览器不支持的音频格式
 * 用 ffmpeg 转码为 mp3 缓存后再提供（转码结果按文件 mtime 缓存复用）。
 */
import { app, protocol } from "electron"
import fs from "fs"
import path from "path"
import { Readable } from "stream"
import { randomUUID } from "crypto"
import { ffmpeg } from "../../utils/ffmpeg"
import { getSongById } from "../data/Database"
import type { Song } from "../../types/song"

// Chromium 可直接播放的音频格式 → MIME
const STREAMABLE_MIME: Record<string, string> = {
	".mp3": "audio/mpeg",
	".flac": "audio/flac",
	".wav": "audio/wav",
	".ogg": "audio/ogg",
	".opus": "audio/ogg",
	".m4a": "audio/mp4",
	".aac": "audio/aac",
	".webm": "audio/webm",
}

// 不支持格式的转码参数与超时
const TRANSCODE_BITRATE_KBPS = 320
const TRANSCODE_TIMEOUT_MS = 120000

function registerAudioProtocol(): void {
	protocol.handle("llmusic", async (request) => {
		try {
			const url = new URL(request.url)
			if (url.host !== "audio") {
				return new Response("Not Found", { status: 404 })
			}
			const songId = decodeURIComponent(url.pathname.replace(/^\//, ""))
			const result = await getSongById(songId)
			const song: Song | null = result && "id" in (result as object) ? (result as Song) : null
			if (!song || !song.filePath) {
				return new Response("Not Found", { status: 404 })
			}

			const ext = path.extname(song.filePath).toLowerCase()
			let filePath = song.filePath
			let mime = STREAMABLE_MIME[ext]
			if (!mime) {
				filePath = await ensureTranscoded(song)
				mime = "audio/mpeg"
			}
			return respondWithRange(request, filePath, mime)
		} catch (e) {
			console.error("llmusic 协议处理失败:", e)
			return new Response("Internal Error", { status: 500 })
		}
	})
}

/**
 * 按 HTTP Range 语义响应文件流（HTML5 Audio seek 依赖 206 分段响应）
 */
async function respondWithRange(request: Request, filePath: string, mime: string): Promise<Response> {
	const stat = await fs.promises.stat(filePath)
	const total = stat.size
	const rangeHeader = request.headers.get("range")

	const baseHeaders: Record<string, string> = {
		"Content-Type": mime,
		"Accept-Ranges": "bytes",
	}

	if (rangeHeader) {
		const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader)
		if (match) {
			const start = match[1] ? parseInt(match[1], 10) : 0
			const end = match[2] ? Math.min(parseInt(match[2], 10), total - 1) : total - 1
			if (start >= total || start > end) {
				return new Response(null, {
					status: 416,
					headers: { ...baseHeaders, "Content-Range": `bytes */${total}` },
				})
			}
			const stream = fs.createReadStream(filePath, { start, end })
			return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
				status: 206,
				headers: {
					...baseHeaders,
					"Content-Range": `bytes ${start}-${end}/${total}`,
					"Content-Length": String(end - start + 1),
				},
			})
		}
	}

	const stream = fs.createReadStream(filePath)
	return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
		status: 200,
		headers: { ...baseHeaders, "Content-Length": String(total) },
	})
}

/**
 * 浏览器不支持的格式：转码为 mp3 并按 (songId, mtime) 缓存
 */
async function ensureTranscoded(song: Song): Promise<string> {
	const cacheDir = path.join(app.getPath("userData"), "transcode-cache")
	await fs.promises.mkdir(cacheDir, { recursive: true })

	const stat = await fs.promises.stat(song.filePath)
	const cachePath = path.join(cacheDir, `${song.id}-${Math.floor(stat.mtimeMs)}.mp3`)
	try {
		await fs.promises.access(cachePath)
		return cachePath
	} catch {
		// 缓存未命中，执行转码
	}

	// 清理该歌曲的旧缓存（源文件已变更）
	try {
		const entries = await fs.promises.readdir(cacheDir)
		for (const entry of entries) {
			if (entry.startsWith(`${song.id}-`)) {
				await fs.promises.unlink(path.join(cacheDir, entry)).catch(() => {})
			}
		}
	} catch {
		// 清理失败不影响转码
	}

	const tmpPath = path.join(cacheDir, `tmp_${randomUUID()}.mp3`)
	await new Promise<void>((resolve, reject) => {
		const command = ffmpeg(song.filePath)
			.noVideo()
			.audioCodec("libmp3lame")
			.audioBitrate(TRANSCODE_BITRATE_KBPS)
			.format("mp3")
		const timer = setTimeout(() => {
			command.kill("SIGKILL")
			reject(new Error("转码超时"))
		}, TRANSCODE_TIMEOUT_MS)
		command
			.output(tmpPath)
			.on("end", () => { clearTimeout(timer); resolve() })
			.on("error", (err: Error) => { clearTimeout(timer); reject(err) })
			.run()
	}).catch(async (err) => {
		await fs.promises.unlink(tmpPath).catch(() => {})
		throw err
	})

	await fs.promises.rename(tmpPath, cachePath)
	return cachePath
}

export { registerAudioProtocol }
