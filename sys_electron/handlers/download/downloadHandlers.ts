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

				const ext = path.extname(filename).toLowerCase().replace(".", "") || "mp3"
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

					fs.copyFileSync(tempOutput, saveResult.filePath!)

					return {
						success: true,
						filePath: saveResult.filePath ?? null,
					}
				} catch (e) {
					const err = e as Error
					return { success: false, error: `下载失败: ${err.message}` }
				} finally {
					for (const f of [tempAudio, tempCover, tempOutput]) {
						try { fs.unlinkSync(f) } catch { /* ignore */ }
					}
				}
			},
		},
	]
	return { handlers, cleanup: () => {} }
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
