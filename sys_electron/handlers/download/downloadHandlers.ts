import { dialog, net } from "electron"
import fs from "fs"
import path from "path"
import os from "os"
import NodeID3 from "node-id3"
import { CHANNELS } from "../../constants/ipcChannels"
import type { IpcHandlerModule, SongDownloadMetadata } from "../../types"

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

				// 确保目标目录存在
				if (!fs.existsSync(targetDir)) {
					fs.mkdirSync(targetDir, { recursive: true })
				}

				// 处理文件名冲突：追加 (1) (2) 序号
				let finalFilename = filename
				const ext = path.extname(filename).toLowerCase()
				const baseName = path.basename(filename, ext)
				let counter = 0
				while (fs.existsSync(path.join(targetDir, finalFilename))) {
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
 * 下载音频 → 写入元数据 → 保存到指定路径
 */
async function downloadToPath(
	url: string,
	outputPath: string,
	metadata: SongDownloadMetadata
): Promise<{ success: boolean; filePath?: string | null; error?: string }> {
	const ext = path.extname(outputPath).toLowerCase().replace(".", "") || "mp3"
	const tempDir = os.tmpdir()
	const tempAudio = path.join(tempDir, `dl_audio_${Date.now()}.${ext}`)
	const tempCover = path.join(tempDir, `dl_cover_${Date.now()}.jpg`)
	const tempOutput = path.join(tempDir, `dl_output_${Date.now()}.${ext}`)

	try {
		const audioResponse = await net.fetch(url)
		if (!audioResponse.ok) {
			return { success: false, error: "音频下载失败" }
		}
		fs.writeFileSync(tempAudio, Buffer.from(await audioResponse.arrayBuffer()))

		if (metadata.coverUrl) {
			try {
				const coverResponse = await net.fetch(metadata.coverUrl)
				if (coverResponse.ok) {
					fs.writeFileSync(tempCover, Buffer.from(await coverResponse.arrayBuffer()))
				}
			} catch {
				// 封面下载失败不阻塞
			}
		}

		if (ext === "mp3" || ext === "flac") {
			await _writeTags(tempAudio, tempOutput, metadata, tempCover)
		} else {
			fs.copyFileSync(tempAudio, tempOutput)
		}

		fs.copyFileSync(tempOutput, outputPath)

		return {
			success: true,
			filePath: outputPath,
		}
	} catch (e) {
		const err = e as Error
		return { success: false, error: `下载失败: ${err.message}` }
	} finally {
		for (const f of [tempAudio, tempCover, tempOutput]) {
			try { fs.unlinkSync(f) } catch { /* ignore */ }
		}
	}
}

async function _writeTags(
	inputPath: string,
	outputPath: string,
	meta: SongDownloadMetadata,
	coverPath: string
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

	if (coverPath && fs.existsSync(coverPath)) {
		tags.image = {
			mime: "image/jpeg",
			type: { id: 3, name: "front cover" },
			description: "Album cover",
			imageBuffer: fs.readFileSync(coverPath),
		}
	}

	const writeResult = NodeID3.write(tags, inputPath)
	if (writeResult instanceof Error) {
		throw writeResult
	}
	if (inputPath !== outputPath) {
		fs.copyFileSync(inputPath, outputPath)
	}
}



export { createTagHandlers as createDownloadHandlers }
