import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getUserPlaylists, getUserLikedSongs, getPlaylistSongsAll, getSongUrls, getSongDownloadBundle } from '@/api/qqmusic'
import type { OnlineSong, QMPlaylistItem, SongDownloadBundle } from '@/types'

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
      const data = res.data as { playlists?: QMPlaylistItem[]; total?: number }
      const list = data.playlists || []
      userPlaylists.value = list
      playlistsTotal.value = data.total || 0

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
  const downloadingIds = ref(new Set<string>())

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
        const data = res.data as { result?: OnlineSong[]; total?: number }
        songs = data.result || []
        total = data.total || 0
      } else {
        const res = await getPlaylistSongsAll(playlistId)
        const data = res.data as { result?: OnlineSong[]; total?: number }
        songs = data.result || []
        total = data.total || 0
      }

      // 批量获取播放 URL
      const songsNeedUrl = songs.filter(s => !s.songUrl?.url)
      const mids = songsNeedUrl.map((s) => s.songMid).filter(Boolean)
      if (mids.length > 0) {
        try {
          const urlRes = await getSongUrls(String(Date.now()), mids)
          const urlList = (urlRes.data as { result?: Array<{ url: string; urlType?: string }> }).result || []
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

  async function downloadSong(song: OnlineSong) {
    if (!song.songUrl?.url) return
    const id = song.songMid || song.songId
    if (id) downloadingIds.value.add(String(id))

    try {
      const ext = song.songUrl?.urlType || 'mp3'
      const filename = `${(song.songName || '未知').replace(/[/:*?"<>|]/g, '_')} - ${(song.singer || '未知').replace(/[/:*?"<>|]/g, '_')}.${ext}`

      let bundle
      try {
        const res = await getSongDownloadBundle(String(Date.now()), song.songMid)
        bundle = (res as any).data as SongDownloadBundle
      } catch {
        await window.electronAPI.downloadSongWithMetadata({
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
        return
      }

      await window.electronAPI.downloadSongWithMetadata({
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
    } finally {
      if (id) downloadingIds.value.delete(String(id))
    }
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
    loadUserPlaylists,
    setCurrentPlaylistId,
    loadAllPlaylistSongs,
    refreshPlaylistSongs,
    clearAllCache,
    downloadSong,
    clearCurrentPlaylist,
  }
})
