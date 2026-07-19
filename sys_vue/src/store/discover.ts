import { defineStore } from 'pinia'
import { ref, nextTick } from 'vue'
import { searchSongs, searchByKeyword, getAlbumImages, getSongUrls, getSongDownloadBundle } from '@/api/qqmusic'
import type { OnlineSong, SongDownloadBundle } from '@/types'

type SearchMode = 'link' | 'keyword'
type SearchStep = '' | 'searching' | 'covers' | 'urls' | 'done'

/** 搜索缓存条目 */
interface SearchCacheEntry {
  songs: OnlineSong[]
  total: number
  coversLoaded: boolean
  urlsLoaded: boolean
}

/** 批量下载进度项 */
interface BatchDownloadItem {
  songName: string
  singer: string
  status: 'pending' | 'downloading' | 'success' | 'failed'
  error?: string
}

/** 批量下载进度 */
interface BatchDownloadProgress {
  total: number
  completed: number
  succeeded: number
  failed: number
  items: BatchDownloadItem[]
  active: boolean
}

/** 文件名非法字符正则 */
const INVALID_FILENAME_CHARS = /[/:*?"<>|]/g

function sanitizeFilename(name: string): string {
  return name.replace(INVALID_FILENAME_CHARS, '_') || '未知'
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

	const downloadingIds = ref(new Set<string>())
	const batchProgress = ref<BatchDownloadProgress>({
	  total: 0,
	  completed: 0,
	  succeeded: 0,
	  failed: 0,
	  items: [],
	  active: false,
	})

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
	    const coverUrls = (coverRes.data as { result?: string[] }).result || []
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
	    const urlList = (urlRes.data as { result?: Array<{ url: string; urlType?: string }> }).result || []
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

	async function downloadSong(song: OnlineSong) {
		if (!song.songUrl?.url) return
		const id = song.songMid || song.songId
		if (id) downloadingIds.value.add(id)

		try {
			const ext = song.songUrl?.urlType || 'mp3'
			const filename = `${sanitizeFilename(song.songName || '未知')} - ${sanitizeFilename(song.singer || '未知')}.${ext}`

			let bundle
			try {
				const res = await getSongDownloadBundle(String(Date.now()), song.songMid)
				bundle = (res as any).data as SongDownloadBundle
			} catch {
				// 元数据获取失败降级为裸下载
				const result = await window.electronAPI.downloadSongWithMetadata({
					url: song.songUrl.url,
					filename,
					metadata: {
						title: song.songName || '',
						artist: song.singer || '',
						album: '',
						trackNumber: 0,
						genre: '',
						year: '',
						lyrics: '',
						coverUrl: song.album?.albumCoverUrl || '',
						format: ext,
					},
				})
				return result
			}

			const result = await window.electronAPI.downloadSongWithMetadata({
				url: bundle.songUrl.url || song.songUrl.url,
				filename,
				metadata: {
					title: bundle.songName || '',
					artist: bundle.singer || '',
					album: bundle.album?.albumName || '',
					trackNumber: bundle.trackNumber || 0,
					genre: bundle.genre || '',
					year: bundle.year || '',
					lyrics: bundle.lyrics || '',
					coverUrl: bundle.album?.albumCoverUrl || '',
					format: ext,
				},
			})
			return result
		} finally {
			if (id) downloadingIds.value.delete(id)
		}
	}

	/**
	 * 批量下载 — 选目录 + 并发下载（同时最多 3 个）
	 */
	async function batchDownload(songs: OnlineSong[]) {
	  // 筛选有播放链接的歌曲
	  const validSongs = songs.filter(s => s.songUrl?.url)
	  if (validSongs.length === 0) return

	  // 选择目标目录
	  const dirResult = await window.electronAPI.selectDirectory()
	  if (!dirResult || !dirResult.path || dirResult.canceled) return
	  const targetDir = dirResult.path

	  // 初始化进度
	  batchProgress.value = {
	    total: validSongs.length,
	    completed: 0,
	    succeeded: 0,
	    failed: 0,
	    items: validSongs.map(s => ({
	      songName: s.songName || '未知',
	      singer: s.singer || '未知',
	      status: 'pending' as const,
	    })),
	    active: true,
	  }

	  const CONCURRENCY = 3

	  // 分块并发：每次 CONCURRENCY 首
	  for (let i = 0; i < validSongs.length; i += CONCURRENCY) {
	    const chunk = validSongs.slice(i, i + CONCURRENCY)
	    const tasks = chunk.map(async (song, offset) => {
	      const idx = i + offset
	      const id = song.songMid || song.songId
	      if (id) downloadingIds.value.add(id)

	      // 标记下载中
	      batchProgress.value.items[idx].status = 'downloading'

	      try {
	        const ext = song.songUrl?.urlType || 'mp3'
	        const filename = `${sanitizeFilename(song.songName || '未知')} - ${sanitizeFilename(song.singer || '未知')}.${ext}`

	        // 获取元数据包
	        let bundle: SongDownloadBundle | undefined
	        try {
	          const res = await getSongDownloadBundle(String(Date.now()), song.songMid)
	          bundle = (res as any).data as SongDownloadBundle
	        } catch {
	          // 降级：使用 songUrl 直接下载，无元数据
	        }

	        const result = await window.electronAPI.downloadSongToDir({
	          url: bundle?.songUrl?.url || song.songUrl!.url,
	          filename,
	          targetDir,
	          metadata: {
	            title: bundle?.songName || song.songName || '',
	            artist: bundle?.singer || song.singer || '',
	            album: bundle?.album?.albumName || '',
	            trackNumber: bundle?.trackNumber || 0,
	            genre: bundle?.genre || '',
	            year: bundle?.year || '',
	            lyrics: bundle?.lyrics || '',
	            coverUrl: bundle?.album?.albumCoverUrl || song.album?.albumCoverUrl || '',
	            format: ext,
	          },
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
	    })
	    await Promise.allSettled(tasks)
	  }

	  batchProgress.value.active = false
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
			songMid: song.songMid || '',
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
		batchProgress,
		searchStep,
		searchCache,
		handleSearch,
		downloadSong,
		batchDownload,
		setPage,
		setPageSize,
		playOnline,
	}
})
