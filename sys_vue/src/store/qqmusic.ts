import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getUserPlaylists, getUserLikedSongs, getPlaylistSongs } from '@/api/qqmusic'
import type { OnlineSong, QMPlaylistItem } from '@/types'

export const useQqmusicStore = defineStore('qqmusic', () => {
  // ========== 我喜欢的音乐 ==========
  const likedSongs = ref<OnlineSong[]>([])
  const likedTotal = ref(0)
  const likedPage = ref(1)
  const likedPageSize = ref(20)
  const likedLoading = ref(false)

  // ========== 用户创建的歌单 ==========
  const userPlaylists = ref<QMPlaylistItem[]>([])
  const playlistsTotal = ref(0)
  const playlistsLoading = ref(false)

  // ========== 歌单详情 ==========
  const currentPlaylistId = ref<number | null>(null)
  const currentPlaylistSongs = ref<OnlineSong[]>([])
  const currentPlaylistTotal = ref(0)
  const currentPlaylistPage = ref(1)
  const currentPlaylistPageSize = ref(20)
  const currentPlaylistLoading = ref(false)

  // ========== Actions ==========

  async function loadLikedSongs(page = 1, pageSize = 20) {
    likedLoading.value = true
    likedPage.value = page
    likedPageSize.value = pageSize

    try {
      const res = await getUserLikedSongs(page, pageSize)
      const data = res.data as { result?: OnlineSong[]; total?: number }
      likedSongs.value = data.result || []
      likedTotal.value = data.total || 0
    } catch (e) {
      likedSongs.value = []
      likedTotal.value = 0
      console.error('加载喜欢歌曲失败:', e)
    } finally {
      likedLoading.value = false
    }
  }

  async function loadUserPlaylists() {
    playlistsLoading.value = true

    try {
      const res = await getUserPlaylists()
      const data = res.data as { playlists?: QMPlaylistItem[]; total?: number }
      userPlaylists.value = data.playlists || []
      playlistsTotal.value = data.total || 0
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
  }

  async function loadPlaylistSongs(playlistId: number, page = 1, pageSize = 20) {
    currentPlaylistLoading.value = true
    currentPlaylistId.value = playlistId
    currentPlaylistPage.value = page
    currentPlaylistPageSize.value = pageSize

    try {
      const res = await getPlaylistSongs(playlistId, page, pageSize)
      const data = res.data as { result?: OnlineSong[]; total?: number }
      currentPlaylistSongs.value = data.result || []
      currentPlaylistTotal.value = data.total || 0
    } catch (e) {
      currentPlaylistSongs.value = []
      currentPlaylistTotal.value = 0
      console.error('加载歌单歌曲失败:', e)
    } finally {
      currentPlaylistLoading.value = false
    }
  }

  function clearCurrentPlaylist() {
    currentPlaylistId.value = null
    currentPlaylistSongs.value = []
    currentPlaylistTotal.value = 0
    currentPlaylistPage.value = 1
  }

  return {
    likedSongs,
    likedTotal,
    likedPage,
    likedPageSize,
    likedLoading,
    userPlaylists,
    playlistsTotal,
    playlistsLoading,
    currentPlaylistId,
    currentPlaylistSongs,
    currentPlaylistTotal,
    currentPlaylistPage,
    currentPlaylistPageSize,
    currentPlaylistLoading,
    loadLikedSongs,
    loadUserPlaylists,
    setCurrentPlaylistId,
    loadPlaylistSongs,
    clearCurrentPlaylist,
  }
})
