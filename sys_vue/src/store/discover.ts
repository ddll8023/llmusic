import { defineStore } from 'pinia'
import { ref, nextTick } from 'vue'
import { searchSongs, searchByKeyword, getAlbumImages, getSongUrls } from '@/api/qqmusic'
import { useDownloadManager } from '@/composables/useDownloadManager'
import type { OnlineSong, SongItem } from '@/types'

type SearchMode = 'link' | 'keyword'
type SearchStep = '' | 'searching' | 'covers' | 'urls' | 'done'

/** 搜索缓存条目 */
interface SearchCacheEntry {
  songs: OnlineSong[]
  total: number
  coversLoaded: boolean
  urlsLoaded: boolean
}

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

	// 下载逻辑复用共享 composable
	const { downloadingIds, batchProgress, downloadSong, batchDownload, retryFailed } = useDownloadManager()

	const searchStep = ref<SearchStep>('')

	/** 搜索缓存：key=页码，每次新搜索时清空 */
	const searchCache = ref(new Map<string, SearchCacheEntry>())

	function getCacheKey(): string {
	  if (searchMode.value === 'keyword') {
	    return `kw:${keyword.value}:${page.value}:${pageSize.value}`
	  }
	  return `url:${searchUrl.value}:${urlType.value}:${page.value}:${pageSize.value}`
	}

	/** 是否为新搜索（非翻页），新搜索时清空缓存 */
	function isNewSearch(): boolean {
	  return searchResults.value.length === 0
	}

	async function handleSearch() {
		if (searchMode.value === 'link' && !searchUrl.value.trim()) return

		loading.value = true
		errorMsg.value = ''
		searchStep.value = 'searching'
		const currentRequestId = String(Date.now())
		requestId.value = currentRequestId

		// 新搜索 → 清空缓存
		if (isNewSearch()) {
		  searchCache.value.clear()
		}

		// 检查缓存
		const cacheKey = getCacheKey()
		const cached = searchCache.value.get(cacheKey)
		if (cached) {
		  searchResults.value = cached.songs
		  total.value = cached.total
		  loading.value = false

		  // 异步补全封面/URL
		  if (!cached.coversLoaded) {
		    searchStep.value = 'covers'
		    await loadCoversForSongs(cached.songs, cacheKey)
		  }
		  if (!cached.urlsLoaded) {
		    searchStep.value = 'urls'
		    await loadUrlsForSongs(cached.songs, cacheKey)
		  }
		  searchStep.value = 'done'
		  return
		}

		await nextTick()

		try {
			let songs: OnlineSong[] = []
			let totalCount = 0

			if (searchMode.value === 'keyword') {
				if (!keyword.value.trim()) return
				const searchRes = await searchByKeyword(keyword.value.trim(), page.value, pageSize.value)
				songs = searchRes.data.result || []
				totalCount = searchRes.data.total || 0
			} else {
				if (!searchUrl.value.trim()) return
				const searchRes = await searchSongs({
					requestId: currentRequestId,
					urlType: urlType.value,
					searchUrl: searchUrl.value.trim(),
					page: page.value,
					pageSize: pageSize.value,
				})
				songs = searchRes.data.result || []
				totalCount = searchRes.data.total || 0
			}

			total.value = totalCount

			if (songs.length === 0) {
				searchStep.value = 'done'
				return
			}

			// 缓存基础搜索数据（无封面无URL）
			const cacheEntry: SearchCacheEntry = {
			  songs: songs.map(s => ({ ...s, album: typeof s.album === 'object' && s.album ? { ...s.album } : s.album })),
			  total: totalCount,
			  coversLoaded: false,
			  urlsLoaded: false,
			}
			searchCache.value.set(cacheKey, cacheEntry)

			// 先展示基础结果（骨架屏替换为真实数据）
			searchResults.value = songs

			// 异步加载封面 + URL（不阻塞渲染）
			loadCoversForSongs(songs, cacheKey)
			loadUrlsForSongs(songs, cacheKey)

			searchStep.value = 'done'
		} catch (e) {
			errorMsg.value = e instanceof Error ? e.message : '搜索失败'
			searchStep.value = ''
		} finally {
			loading.value = false
		}
	}

	// ── 异步加载封面 ──
	async function loadCoversForSongs(songs: OnlineSong[], cacheKey: string) {
	  const albumMids = songs.map((s) => s.album?.albumMid).filter(Boolean) as string[]
	  if (albumMids.length === 0) return
	  try {
	    const coverRes = await getAlbumImages(requestId.value, albumMids)
	    const coverUrls = coverRes.data.result || []
	    songs.forEach((song, idx) => {
	      if (song.album?.albumMid && coverUrls[idx]) {
	        song.album.albumCoverUrl = coverUrls[idx]
	      }
	    })
	    // 更新缓存标记
	    const entry = searchCache.value.get(cacheKey)
	    if (entry) entry.coversLoaded = true
	  } catch {
	    // 封面获取失败不阻塞
	  }
	}

	// ── 异步加载播放 URL ──
	async function loadUrlsForSongs(songs: OnlineSong[], cacheKey: string) {
	  const songMids = songs.map((s) => s.songMid).filter(Boolean)
	  if (songMids.length === 0) return
	  try {
	    const urlRes = await getSongUrls(requestId.value, songMids)
	    const urlList = urlRes.data.result || []
	    songs.forEach((song, idx) => {
	      if (urlList[idx]) {
	        song.songUrl = { url: urlList[idx].url, urlType: urlList[idx].urlType || 'mp3' }
	      }
	    })
	    // 更新缓存标记
	    const entry = searchCache.value.get(cacheKey)
	    if (entry) entry.urlsLoaded = true
	  } catch {
	    // 下载链接获取失败不阻塞
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

	function playOnline(song: SongItem) {
		const album = typeof song.album === 'object' && song.album ? song.album : null
		return {
			songMid: song.songMid || '',
			songName: song.songName || '',
			singer: song.singer || '',
			coverUrl: album?.albumCoverUrl || '',
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
		batchProgress,
		searchStep,
		searchCache,
		handleSearch,
		downloadSong,
		batchDownload,
		retryFailed,
		setPage,
		setPageSize,
		playOnline,
	}
})
