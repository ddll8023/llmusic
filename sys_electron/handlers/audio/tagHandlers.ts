/**
 * 标签编辑相关的 IPC 处理器
 */

import { CHANNELS } from "../../constants/ipcChannels"
import { getSongById, parseSongFromFile } from "../data/Database"
import { sanitizeAudioPath } from "../../utils/sanitizePath"
import ffmpeg from "fluent-ffmpeg"
import ffmpegPath from "ffmpeg-static"
import ffprobeStatic from "ffprobe-static"
import { parseFile } from "music-metadata"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import type { IpcHandlerModule } from "../../types"

// 修正打包后的二进制文件路径
const correctedFfmpegPath = (ffmpegPath as string).replace("app.asar", "app.asar.unpacked")
const correctedFfprobePath = ffprobeStatic.path.replace("app.asar", "app.asar.unpacked")

ffmpeg.setFfmpegPath(correctedFfmpegPath)
ffmpeg.setFfprobePath(correctedFfprobePath)

// 支持的音频格式
const SUPPORTED_FORMATS = [".mp3", ".flac", ".m4a", ".aac", ".ogg", ".wav"]

interface TagData {
	title?: string
	artist?: string
	album?: string
	year?: number | string
	duration?: number
	bitrate?: number
	sampleRate?: number
	format?: string
	codec?: string
	[key: string]: unknown
}

interface TagResult {
	success: boolean
	tags?: TagData
	filePath: string
	format?: string
	error?: string
}

interface ValidationResult {
	valid: boolean
	errors: string[]
	warnings: string[]
}

interface UpdateResult {
	success: boolean
	error?: string
	message?: string
	filePath?: string
	validation?: ValidationResult
}

/**
 * 获取音频文件的元数据标签
 */
async function getSongTags(filePath: string): Promise<TagResult> {
	try {
		await fs.access(filePath)

		const ext = path.extname(filePath).toLowerCase()
		if (!SUPPORTED_FORMATS.includes(ext)) {
			throw new Error(`不支持的音频格式: ${ext}`)
		}

		const metadata = await parseFile(filePath, {
			skipCovers: true,
			skipPostHeaders: true,
		})

		const tags: TagData = {
			title: metadata.common.title || "",
			artist: metadata.common.artist || "",
			album: metadata.common.album || "",
			year: metadata.common.year || "",
			duration: metadata.format.duration || 0,
			bitrate: metadata.format.bitrate || 0,
			sampleRate: metadata.format.sampleRate || 0,
			format: metadata.format.container || "",
			codec: metadata.format.codec || "",
		}

		return {
			success: true,
			tags,
			filePath,
			format: ext.substring(1),
		}
	} catch (error) {
		const err = error as Error
		console.error("获取歌曲标签失败:", error)
		return {
			success: false,
			error: err.message,
			filePath,
		}
	}
}

/**
 * 验证标签数据的有效性
 */
function validateTagChanges(tags: TagData): ValidationResult {
	const errors: string[] = []
	const warnings: string[] = []

	if (!tags.title || tags.title.trim() === "") {
		errors.push("歌曲标题不能为空")
	}

	if (tags.year && tags.year !== "") {
		const year = parseInt(String(tags.year))
		if (isNaN(year) || year < 1900 || year > new Date().getFullYear() + 1) {
			errors.push(
				"年份格式不正确，应为1900-" + (new Date().getFullYear() + 1) + "之间的数字"
			)
		}
	}

	const maxLengths: Record<string, number> = {
		title: 255,
		artist: 255,
		album: 255,
	}

	Object.entries(maxLengths).forEach(([field, maxLength]) => {
		if (tags[field] && String(tags[field]).length > maxLength) {
			errors.push(`${field}字段长度不能超过${maxLength}个字符`)
		}
	})

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	}
}

/**
 * 更新音频文件的元数据标签
 */
async function updateSongTags(filePath: string, tags: TagData): Promise<UpdateResult> {
	try {
		const validation = validateTagChanges(tags)
		if (!validation.valid) {
			return {
				success: false,
				error: "标签数据验证失败: " + validation.errors.join(", "),
				validation,
			}
		}

		await fs.access(filePath)

		const ext = path.extname(filePath).toLowerCase()
		if (!SUPPORTED_FORMATS.includes(ext)) {
			throw new Error(`不支持的音频格式: ${ext}`)
		}

		const tempDir = os.tmpdir()
		const tempFileName = `temp_${Date.now()}_${path.basename(filePath)}`
		const tempFilePath = path.join(tempDir, tempFileName)

			const command = ffmpeg(filePath)
			command.outputOptions(["-c", "copy"])

			const escapeMeta = (v: unknown): string => String(v).replace(/[;]/g, " ")
			if (tags.title) command.outputOptions(["-metadata", `title=${escapeMeta(tags.title)}`])
			if (tags.artist) command.outputOptions(["-metadata", `artist=${escapeMeta(tags.artist)}`])
			if (tags.album) command.outputOptions(["-metadata", `album=${escapeMeta(tags.album)}`])
			if (tags.year) command.outputOptions(["-metadata", `date=${escapeMeta(tags.year)}`])

			await new Promise<void>((resolve, reject) => {
			command.output(tempFilePath).on("end", resolve).on("error", reject).run()
		})

		const backupPath = filePath + ".backup"
		await fs.copyFile(filePath, backupPath)

		try {
			await fs.copyFile(tempFilePath, filePath)
			await fs.unlink(tempFilePath)
			await fs.unlink(backupPath)

			return {
				success: true,
				message: "标签更新成功",
				filePath,
				validation,
			}
		} catch (replaceError) {
			try {
				await fs.copyFile(backupPath, filePath)
				await fs.unlink(backupPath)
			} catch (restoreError) {
				console.error("恢复备份文件失败:", restoreError)
			}
			throw replaceError
		}
	} catch (error) {
		const err = error as Error
		console.error("更新歌曲标签失败:", error)
		return {
			success: false,
			error: err.message,
			filePath,
		}
	}
}

/**
 * 直接从文件路径获取标签
 */
async function getTagsFromFile(filePath: string): Promise<{ success: boolean; error?: string; filePath?: string; tags?: TagData; format?: string }> {
	if (!filePath) {
		return { success: false, error: "文件路径不能为空" }
	}

	try {
		const result = await getSongTags(filePath)
		if (result.success) {
			return {
				success: true,
				filePath,
				tags: result.tags,
				format: result.format,
			}
		} else {
			return {
				success: false,
				error: result.error,
				filePath,
			}
		}
	} catch (error) {
		const err = error as Error
		console.error("从文件获取标签失败")
		return {
			success: false,
			error: err.message,
			filePath,
		}
	}
}

/**
 * 直接更新文件的标签
 */
async function updateTagsToFile(filePath: string, tags: TagData): Promise<{ success: boolean; error?: string; filePath?: string; updatedTags?: TagData | null }> {
	if (!filePath) {
		return { success: false, error: "文件路径不能为空" }
	}

	if (!tags || typeof tags !== "object") {
		return { success: false, error: "标签数据无效" }
	}

	try {
		const validationResult = validateTagChanges(tags)
		if (validationResult.errors.length > 0) {
			return {
				success: false,
				error: `标签验证失败: ${validationResult.errors.join(", ")}`,
				filePath,
			}
		}

		const result = await updateSongTags(filePath, tags)

		return {
			success: result.success,
			error: result.error,
			filePath,
			updatedTags: result.success ? tags : null,
		}
	} catch (error) {
		const err = error as Error
		console.error("更新文件标签失败:", error)
		return {
			success: false,
			error: err.message,
			filePath,
		}
	}
}

function createTagHandlers(): IpcHandlerModule {
	const handlers = [
		{
			channel: CHANNELS.GET_SONG_TAGS,
			handler: async (_event: Electron.IpcMainInvokeEvent, songId: string) => {
				try {
					if (!songId) {
						return { success: false, error: "歌曲ID不能为空" }
					}

					const song = await getSongById(songId)
					if (!song) {
						return { success: false, error: "未找到指定的歌曲" }
					}

					const tagResult = await getSongTags(song.filePath)
					if (!tagResult.success) {
						return {
							success: false,
							error: `读取标签失败: ${tagResult.error}`,
							songId,
						}
					}

					return {
						success: true,
						songId,
						song: {
							id: song.id,
							title: song.title,
							artist: song.artist,
							album: song.album,
							filePath: song.filePath,
						},
						tags: tagResult.tags,
						format: tagResult.format,
					}
				} catch (error) {
					const err = error as Error
					console.error("获取歌曲标签失败:", error)
					return {
						success: false,
						error: err.message,
						songId,
					}
				}
			},
		},
		{
			channel: CHANNELS.UPDATE_SONG_TAGS,
			handler: async (
				_event: Electron.IpcMainInvokeEvent,
				{ songId, tags }: { songId: string; tags: TagData }
			) => {
				try {
					if (!songId) {
						return { success: false, error: "歌曲ID不能为空" }
					}

					if (!tags || typeof tags !== "object") {
						return { success: false, error: "标签数据不能为空" }
					}

					const song = await getSongById(songId)
					if (!song) {
						return { success: false, error: "未找到指定的歌曲" }
					}

					const updateResult = await updateSongTags(song.filePath, tags)
					if (!updateResult.success) {
						return {
							success: false,
							error: updateResult.error,
							validation: updateResult.validation,
							songId,
						}
					}

					try {
						const updatedSong = await parseSongFromFile(song.filePath, song.id, song.libraryId || null)
						if (updatedSong) {
							return {
								success: true,
								message: "标签更新成功",
								songId,
								updatedSong,
								validation: updateResult.validation,
							}
						} else {
							return {
								success: true,
								message: "标签更新成功，但数据库同步失败",
								songId,
								validation: updateResult.validation,
								warning: "请重新扫描音乐库以同步数据库",
							}
						}
					} catch (parseError) {
						const err = parseError as Error
						console.error("重新解析歌曲文件失败:", parseError)
						return {
							success: true,
							message: "标签更新成功，但数据库同步失败",
							songId,
							validation: updateResult.validation,
							warning: "请重新扫描音乐库以同步数据库",
						}
					}
				} catch (error) {
					const err = error as Error
					console.error("更新歌曲标签失败:", error)
					return {
						success: false,
						error: err.message,
						songId,
					}
				}
			},
		},
		{
			channel: CHANNELS.VALIDATE_TAG_CHANGES,
			handler: async (_event: Electron.IpcMainInvokeEvent, tags: TagData) => {
				try {
					if (!tags || typeof tags !== "object") {
						return { success: false, error: "标签数据不能为空" }
					}

					const validation = validateTagChanges(tags)

					return {
						success: true,
						validation,
					}
				} catch (error) {
					const err = error as Error
					console.error("验证标签数据失败:", error)
					return {
						success: false,
						error: err.message,
					}
				}
			},
		},
		{
			channel: CHANNELS.GET_TAGS_FROM_FILE,
			handler: async (_event: Electron.IpcMainInvokeEvent, filePath: string) => {
				return await getTagsFromFile(filePath)
			},
		},
		{
			channel: CHANNELS.UPDATE_TAGS_TO_FILE,
			handler: async (
				_event: Electron.IpcMainInvokeEvent,
				{ filePath, tags }: { filePath: string; tags: TagData }
			) => {
				return await updateTagsToFile(filePath, tags)
			},
		},
	]

	return {
		handlers,
		cleanup: () => {
			console.log("标签编辑处理器已清理")
		},
	}
}

export { createTagHandlers, getSongTags, updateSongTags, validateTagChanges, SUPPORTED_FORMATS }
