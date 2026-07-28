/**
 * 在线歌曲下载共享逻辑：单曲下载 + 批量下载（并发 3）
 * 供 discover 与 qqmusic 两个 store 复用，消除原先的逐字重复实现
 */
import { ref } from 'vue'
import { getSongDownloadBundle } from '@/api/qqmusic'
import type { SongDownloadBundle, SongItem } from '@/types'

/** 批量下载进度项 */
export interface BatchDownloadItem {
	songName: string
	singer: string
	status: 'pending' | 'downloading' | 'success' | 'failed'
	error?: string
}

/** 批量下载进度 */
export interface BatchDownloadProgress {
	total: number
	completed: number
	succeeded: number
	failed: number
	items: BatchDownloadItem[]
	active: boolean
}

/** 文件名非法字符正则 */
const INVALID_FILENAME_CHARS = /[/:*?"<>|]/g

export function sanitizeFilename(name: string): string {
	return name.replace(INVALID_FILENAME_CHARS, '_') || '未知'
}

/** 批量下载并发上限（与主进程侧限流一致） */
const BATCH_CONCURRENCY = 3

export function useDownloadManager() {
	const downloadingIds = ref(new Set<string>())
	const batchProgress = ref<BatchDownloadProgress>({
		total: 0,
		completed: 0,
		succeeded: 0,
		failed: 0,
		items: [],
		active: false,
	})

	/** 获取下载元数据包，失败返回 undefined（降级为裸下载） */
	async function fetchBundle(songMid: string): Promise<SongDownloadBundle | undefined> {
		try {
			const res = await getSongDownloadBundle(String(Date.now()), songMid)
			return res.data
		} catch {
			return undefined
		}
	}

	function buildFilename(song: SongItem, ext: string): string {
		return `${sanitizeFilename(song.songName || '未知')} - ${sanitizeFilename(song.singer || '未知')}.${ext}`
	}

	function buildMetadata(song: SongItem, bundle: SongDownloadBundle | undefined, ext: string) {
		const albumObj = typeof song.album === 'object' && song.album ? song.album : null
		return {
			title: bundle?.songName || song.songName || '',
			artist: bundle?.singer || song.singer || '',
			album: bundle?.album?.albumName || '',
			trackNumber: bundle?.trackNumber || 0,
			genre: bundle?.genre || '',
			year: bundle?.year || '',
			lyrics: bundle?.lyrics || '',
			coverUrl: bundle?.album?.albumCoverUrl || albumObj?.albumCoverUrl || '',
			format: ext,
		}
	}

	/** 单曲下载（弹保存对话框），返回主进程下载结果 */
	async function downloadSong(song: SongItem) {
		if (!song.songUrl?.url) return
		const id = String(song.songMid || song.songId || '')
		if (id) downloadingIds.value.add(id)

		try {
			const ext = song.songUrl.urlType || 'mp3'
			const bundle = song.songMid ? await fetchBundle(song.songMid) : undefined
			return await window.electronAPI.downloadSongWithMetadata({
				url: bundle?.songUrl?.url || song.songUrl.url,
				filename: buildFilename(song, ext),
				metadata: buildMetadata(song, bundle, ext),
			})
		} finally {
			if (id) downloadingIds.value.delete(id)
		}
	}

	// 最近一批下载的歌曲与目标目录（供失败重试复用）
	let lastBatchSongs: SongItem[] = []
	let lastTargetDir = ''

	/** 批量下载中的单曲执行体（idx 为进度项索引） */
	async function downloadOne(song: SongItem, idx: number, targetDir: string) {
		const id = String(song.songMid || song.songId || '')
		if (id) downloadingIds.value.add(id)

		batchProgress.value.items[idx].status = 'downloading'

		try {
			const ext = song.songUrl?.urlType || 'mp3'
			const bundle = song.songMid ? await fetchBundle(song.songMid) : undefined

			const result = await window.electronAPI.downloadSongToDir({
				url: bundle?.songUrl?.url || song.songUrl!.url,
				filename: buildFilename(song, ext),
				targetDir,
				metadata: buildMetadata(song, bundle, ext),
			})

			if (result.success) {
				batchProgress.value.items[idx].status = 'success'
				batchProgress.value.succeeded++
			} else {
				batchProgress.value.items[idx].status = 'failed'
				batchProgress.value.items[idx].error = result.error || '下载失败'
				batchProgress.value.failed++
			}
		} catch (e) {
			batchProgress.value.items[idx].status = 'failed'
			batchProgress.value.items[idx].error = e instanceof Error ? e.message : '未知错误'
			batchProgress.value.failed++
		} finally {
			batchProgress.value.completed++
			if (id) downloadingIds.value.delete(id)
		}
	}

	/** 按并发上限分块执行指定索引的下载 */
	async function runBatch(indices: number[], targetDir: string) {
		for (let i = 0; i < indices.length; i += BATCH_CONCURRENCY) {
			const chunk = indices.slice(i, i + BATCH_CONCURRENCY)
			await Promise.allSettled(chunk.map((idx) => downloadOne(lastBatchSongs[idx], idx, targetDir)))
		}
	}

	/** 批量下载 — 选目录 + 分块并发 */
	async function batchDownload(songs: SongItem[]) {
		const validSongs = songs.filter((s) => s.songUrl?.url)
		if (validSongs.length === 0) return

		const dirResult = await window.electronAPI.selectDirectory()
		if (!dirResult || !dirResult.path || dirResult.canceled) return

		lastBatchSongs = validSongs
		lastTargetDir = dirResult.path

		batchProgress.value = {
			total: validSongs.length,
			completed: 0,
			succeeded: 0,
			failed: 0,
			items: validSongs.map((s) => ({
				songName: s.songName || '未知',
				singer: s.singer || '未知',
				status: 'pending' as const,
			})),
			active: true,
		}

		await runBatch(validSongs.map((_, i) => i), lastTargetDir)

		batchProgress.value.active = false
	}

	/** 重试上一批中失败的歌曲（复用已选目录） */
	async function retryFailed() {
		const indices = batchProgress.value.items
			.map((item, idx) => (item.status === 'failed' ? idx : -1))
			.filter((idx) => idx >= 0)
		if (indices.length === 0 || !lastTargetDir) return

		for (const idx of indices) {
			batchProgress.value.items[idx].status = 'pending'
			batchProgress.value.items[idx].error = undefined
		}
		batchProgress.value.failed -= indices.length
		batchProgress.value.completed -= indices.length
		batchProgress.value.active = true

		await runBatch(indices, lastTargetDir)

		batchProgress.value.active = false
	}

	return { downloadingIds, batchProgress, downloadSong, batchDownload, retryFailed }
}
