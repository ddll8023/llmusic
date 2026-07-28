import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getUserPlaylists, getUserLikedSongs, getPlaylistSongsAll, getSongUrls } from '@/api/qqmusic'
import { useDownloadManager } from '@/composables/useDownloadManager'
import type { OnlineSong, QMPlaylistItem } from '@/types'

interface PlaylistCacheEntry {
  songs: OnlineSong[]
  total: number
}

export const useQqmusicStore = defineStore('qqmusic', () => {
  // ========== 用户创建的歌单 ==========
  const userPlaylists = ref<QMPlaylistItem[]>([])
  const playlistsTotal = ref(0)
  const playlistsLoading = ref(false)
  const likedPlaylistId = ref<number | null>(null)

  // ========== 缓存层（内部，不导出） ==========
  const playlistCache = ref(new Map<number, PlaylistCacheEntry>())

  // ========== Actions：用户歌单 ==========

  async function loadUserPlaylists() {
    playlistsLoading.value = true

    try {
      const res = await getUserPlaylists()
      const list = res.data.playlists || []
      userPlaylists.value = list
      playlistsTotal.value = res.data.total || 0

      // 识别"我喜欢的音乐"歌单 ID
      const liked = list.find((p) => p.title === '我喜欢的音乐') || list.find((p) => p.title.includes('喜欢'))
      likedPlaylistId.value = liked?.id ?? null
    } catch (e) {
      userPlaylists.value = []
      playlistsTotal.value = 0
      console.error('加载用户歌单失败:', e)
    } finally {
      playlistsLoading.value = false
    }
  }

  // ========== 歌单详情（从缓存派生） ==========
  const currentPlaylistId = ref<number | null>(null)
  const currentPlaylistSongs = ref<OnlineSong[]>([])
  const currentPlaylistTotal = ref(0)
  const currentPlaylistLoading = ref(false)
  const isRefreshing = ref(false)
  const loadingError = ref('')
  // 下载逻辑复用共享 composable
  const { downloadingIds, batchProgress, downloadSong, batchDownload, retryFailed } = useDownloadManager()

  function setCurrentPlaylistId(id: number | null) {
    currentPlaylistId.value = id
    currentPlaylistSongs.value = []
    currentPlaylistTotal.value = 0
    loadingError.value = ''
  }

  async function loadAllPlaylistSongs(playlistId: number) {
    const cached = playlistCache.value.get(playlistId)
    if (cached) {
      currentPlaylistId.value = playlistId
      currentPlaylistSongs.value = cached.songs
      currentPlaylistTotal.value = cached.total
      return
    }

    currentPlaylistLoading.value = true
    loadingError.value = ''

    try {
      let songs: OnlineSong[] = []
      let total = 0

      if (playlistId === likedPlaylistId.value) {
        const res = await getUserLikedSongs(1, 100)
        songs = res.data.result || []
        total = res.data.total || 0
      } else {
        const res = await getPlaylistSongsAll(playlistId)
        songs = res.data.result || []
        total = res.data.total || 0
      }

      // 批量获取播放 URL
      const songsNeedUrl = songs.filter(s => !s.songUrl?.url)
      const mids = songsNeedUrl.map((s) => s.songMid).filter(Boolean)
      if (mids.length > 0) {
        try {
          const urlRes = await getSongUrls(String(Date.now()), mids)
          const urlList = urlRes.data.result || []
          songsNeedUrl.forEach((song, idx) => {
            if (urlList[idx]) {
              song.songUrl = { url: urlList[idx].url, urlType: urlList[idx].urlType || 'mp3' }
            }
          })
        } catch {
          // URL 获取失败不阻塞
        }
      }

      playlistCache.value.set(playlistId, { songs, total })
      currentPlaylistSongs.value = songs
      currentPlaylistTotal.value = total
      isRefreshing.value = false
    } catch (e) {
      currentPlaylistSongs.value = []
      currentPlaylistTotal.value = 0
      loadingError.value = '加载失败'
      isRefreshing.value = false
      console.error('加载歌单全部歌曲失败:', e)
    } finally {
      currentPlaylistLoading.value = false
    }
  }

  async function refreshPlaylistSongs(playlistId: number) {
    playlistCache.value.delete(playlistId)
    isRefreshing.value = true
    await loadAllPlaylistSongs(playlistId)
  }

  function clearAllCache() {
    playlistCache.value.clear()
    userPlaylists.value = []
    playlistsTotal.value = 0
    currentPlaylistSongs.value = []
    currentPlaylistTotal.value = 0
    currentPlaylistId.value = null
    likedPlaylistId.value = null
  }

  function clearCurrentPlaylist() {
    currentPlaylistId.value = null
    currentPlaylistSongs.value = []
    currentPlaylistTotal.value = 0
    loadingError.value = ''
  }

  return {
    userPlaylists,
    playlistsTotal,
    playlistsLoading,
    likedPlaylistId,
    currentPlaylistId,
    currentPlaylistSongs,
    currentPlaylistTotal,
    currentPlaylistLoading,
    isRefreshing,
    loadingError,
    downloadingIds,
    batchProgress,
    loadUserPlaylists,
    setCurrentPlaylistId,
    loadAllPlaylistSongs,
    refreshPlaylistSongs,
    clearAllCache,
    downloadSong,
    batchDownload,
    retryFailed,
    clearCurrentPlaylist,
  }
})
