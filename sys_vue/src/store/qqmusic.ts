import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getUserPlaylists, getUserLikedSongs, getPlaylistSongs, getSongUrls } from '@/api/qqmusic'
import type { OnlineSong, QMPlaylistItem } from '@/types'

export const useQqmusicStore = defineStore('qqmusic', () => {
  // ========== 用户创建的歌单 ==========
  const userPlaylists = ref<QMPlaylistItem[]>([])
  const playlistsTotal = ref(0)
  const playlistsLoading = ref(false)
  const likedPlaylistId = ref<number | null>(null)

  // ========== 歌单详情 ==========
  const currentPlaylistId = ref<number | null>(null)
  const currentPlaylistSongs = ref<OnlineSong[]>([])
  const currentPlaylistTotal = ref(0)
  const currentPlaylistPage = ref(1)
  const currentPlaylistPageSize = ref(20)
  const currentPlaylistLoading = ref(false)
  const downloadingIds = ref(new Set<string>())

  // ========== Actions ==========

  async function loadUserPlaylists() {
    playlistsLoading.value = true

    try {
      const res = await getUserPlaylists()
      const data = res.data as { playlists?: QMPlaylistItem[]; total?: number }
      const list = data.playlists || []
      userPlaylists.value = list
      playlistsTotal.value = data.total || 0

      // 识别"我喜欢的音乐"歌单 ID
      const liked = list.find((p) => p.title.includes('喜欢'))
      likedPlaylistId.value = liked?.id ?? null
    } catch (e) {
      userPlaylists.value = []
      playlistsTotal.value = 0
      console.error('加载用户歌单失败:', e)
    } finally {
      playlistsLoading.value = false
    }
  }

  function setCurrentPlaylistId(id: number | null) {
    currentPlaylistId.value = id
    currentPlaylistSongs.value = []
    currentPlaylistTotal.value = 0
    currentPlaylistPage.value = 1
  }

  async function loadPlaylistSongs(playlistId: number, page = 1, pageSize = 20) {
    currentPlaylistLoading.value = true
    currentPlaylistId.value = playlistId
    currentPlaylistPage.value = page
    currentPlaylistPageSize.value = pageSize

    try {
      let songs: OnlineSong[] = []
      let total = 0

      if (playlistId === likedPlaylistId.value) {
        // "我喜欢的音乐"调专用接口
        const res = await getUserLikedSongs(page, pageSize)
        const data = res.data as { result?: OnlineSong[]; total?: number }
        songs = data.result || []
        total = data.total || 0
      } else {
        const res = await getPlaylistSongs(playlistId, page, pageSize)
        const data = res.data as { result?: OnlineSong[]; total?: number }
        songs = data.result || []
        total = data.total || 0
      }

      currentPlaylistTotal.value = total

      // 第二步：获取歌曲播放 URL
      const mids = songs.map((s) => s.songMid).filter(Boolean)
      if (mids.length > 0) {
        try {
          const urlRes = await getSongUrls(String(Date.now()), mids)
          const urlList = (urlRes.data as { result?: Array<{ url: string; urlType?: string }> }).result || []
          songs.forEach((song, idx) => {
            if (urlList[idx]) {
              song.songUrl = { url: urlList[idx].url, urlType: urlList[idx].urlType || 'mp3' }
            }
          })
        } catch {
          // URL 获取失败不阻塞
        }
      }

      currentPlaylistSongs.value = songs
    } catch (e) {
      currentPlaylistSongs.value = []
      currentPlaylistTotal.value = 0
      console.error('加载歌单歌曲失败:', e)
    } finally {
      currentPlaylistLoading.value = false
    }
  }

  async function downloadSong(song: OnlineSong) {
    if (!song.songUrl?.url) return
    const id = song.songMid || song.songId
    if (id) downloadingIds.value.add(String(id))

    try {
      const ext = song.songUrl?.urlType || 'mp3'
      const filename = `${(song.songName || '未知').replace(/[/:*?"<>|]/g, '_')} - ${(song.singer || '未知').replace(/[/:*?"<>|]/g, '_')}.${ext}`
      await window.electronAPI.downloadFile({ url: song.songUrl.url, filename })
    } finally {
      if (id) downloadingIds.value.delete(String(id))
    }
  }

  function clearCurrentPlaylist() {
    currentPlaylistId.value = null
    currentPlaylistSongs.value = []
    currentPlaylistTotal.value = 0
    currentPlaylistPage.value = 1
  }

  return {
    userPlaylists,
    playlistsTotal,
    playlistsLoading,
    likedPlaylistId,
    currentPlaylistId,
    currentPlaylistSongs,
    currentPlaylistTotal,
    currentPlaylistPage,
    currentPlaylistPageSize,
    currentPlaylistLoading,
    downloadingIds,
    loadUserPlaylists,
    setCurrentPlaylistId,
    loadPlaylistSongs,
    downloadSong,
    clearCurrentPlaylist,
  }
})
