import { defineStore } from 'pinia'
import { ref, nextTick } from 'vue'
import { searchSongs, searchByKeyword, getAlbumImages, getSongUrls } from '@/api/qqmusic'
import type { OnlineSong } from '@/types'

type SearchMode = 'link' | 'keyword'
type SearchStep = '' | 'searching' | 'covers' | 'urls' | 'done'


export const useDiscoverStore = defineStore('discover', () => {
	const searchUrl = ref('')
	const urlType = ref('song')
	const keyword = ref('')
	const searchMode = ref<SearchMode>('link')
	const searchResults = ref<OnlineSong[]>([])
	const total = ref(0)
	const page = ref(1)
	const pageSize = ref(10)
	const requestId = ref('0')
	const loading = ref(false)
	const errorMsg = ref('')

	const downloadingIds = ref(new Set<string>())

	const searchStep = ref<SearchStep>('')

	async function handleSearch() {
		if (searchMode.value === 'link' && !searchUrl.value.trim()) return

		loading.value = true
		errorMsg.value = ''
		searchResults.value = []
		total.value = 0
		searchStep.value = 'searching'
		const currentRequestId = String(Date.now())
		requestId.value = currentRequestId

		await nextTick()

		try {
			let songs: OnlineSong[] = []
			let totalCount = 0

			if (searchMode.value === 'keyword') {
				if (!keyword.value.trim()) return
				const searchRes = await searchByKeyword(keyword.value.trim(), page.value, pageSize.value)
				songs = (searchRes.data as { result?: OnlineSong[]; total?: number }).result || []
				totalCount = (searchRes.data as { result?: OnlineSong[]; total?: number }).total || 0
			} else {
				if (!searchUrl.value.trim()) return
				const searchRes = await searchSongs({
					requestId: currentRequestId,
					urlType: urlType.value,
					searchUrl: searchUrl.value.trim(),
					page: page.value,
					pageSize: pageSize.value,
				})
				songs = (searchRes.data as { result?: OnlineSong[]; total?: number }).result || []
				totalCount = (searchRes.data as { result?: OnlineSong[]; total?: number }).total || 0
			}

			total.value = totalCount

			if (songs.length === 0) {
				searchStep.value = 'done'
				return
			}

			// 步骤 2：获取专辑封面
			searchStep.value = 'covers'
			const albumMids = songs.map((s) => s.album?.albumMid).filter(Boolean) as string[]
			if (albumMids.length > 0) {
				try {
					const coverRes = await getAlbumImages(currentRequestId, albumMids)
					const coverUrls = (coverRes.data as { result?: string[] }).result || []
					songs.forEach((song, idx) => {
						if (song.album?.albumMid && coverUrls[idx]) {
							song.album.albumCoverUrl = coverUrls[idx]
						}
					})
				} catch {
					// 封面获取失败不阻塞
				}
			}

			// 步骤 3：获取下载链接
			searchStep.value = 'urls'
			const songMids = songs.map((s) => s.songMid).filter(Boolean)
			if (songMids.length > 0) {
				try {
					const urlRes = await getSongUrls(currentRequestId, songMids)
					const urlList = (urlRes.data as { result?: Array<{ url: string; urlType?: string }> }).result || []
					songs.forEach((song, idx) => {
						if (urlList[idx]) {
							song.songUrl = { url: urlList[idx].url, urlType: urlList[idx].urlType || 'mp3' }
						}
					})
				} catch {
					// 下载链接获取失败不阻塞
				}
			}

			searchResults.value = songs
			searchStep.value = 'done'
		} catch (e) {
			errorMsg.value = e instanceof Error ? e.message : '搜索失败'
			searchStep.value = ''
		} finally {
			loading.value = false
		}
	}

	async function downloadSong(song: OnlineSong) {
		if (!song.songUrl?.url) return
		const id = song.songMid || song.songId
		if (id) downloadingIds.value.add(id)

		try {
			const ext = song.songUrl?.urlType || 'mp3'
			const filename = `${song.songName?.replace(/[/:*?"<>|]/g, "_") || "未知"} - ${song.singer?.replace(/[/:*?"<>|]/g, "_") || "未知"}.${ext}`
			const result = await window.electronAPI.downloadFile({ url: song.songUrl.url, filename })
			return result
		} finally {
			if (id) downloadingIds.value.delete(id)
		}
	}

	async function batchDownload(songs: OnlineSong[]) {
		const validSongs = songs.filter((s) => s.songUrl?.url)
		if (validSongs.length === 0) return
		validSongs.forEach((s) => {
			const id = s.songMid || s.songId
			if (id) downloadingIds.value.add(id)
		})
		try {
			await window.electronAPI.batchDownloadFiles({
				songs: validSongs.map((s) => ({
					url: s.songUrl!.url,
					filename: `${s.songName} - ${s.singer}.${s.songUrl!.urlType || 'mp3'}`,
				})),
			})
		} finally {
			validSongs.forEach((s) => {
				const id = s.songMid || s.songId
				if (id) downloadingIds.value.delete(id)
			})
		}
	}

	function setPage(n: number) {
		page.value = n
		handleSearch()
	}

	function setPageSize(size: number) {
		pageSize.value = size
		page.value = 1
		handleSearch()
	}

	function playOnline(song: OnlineSong) {
		return {
			songName: song.songName,
			singer: song.singer,
			coverUrl: song.album?.albumCoverUrl || '',
			url: song.songUrl?.url || '',
			urlType: song.songUrl?.urlType || 'mp3',
		}
	}

	return {
		searchUrl,
		urlType,
		keyword,
		searchMode,
		searchResults,
		total,
		page,
		pageSize,
		requestId,
		loading,
		errorMsg,
		downloadingIds,
		searchStep,
		handleSearch,
		downloadSong,
		batchDownload,
		setPage,
		setPageSize,
		playOnline,
	}
})
