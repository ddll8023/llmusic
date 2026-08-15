import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getUserPlaylists, getUserLikedSongs, getPlaylistSongsAll, getPlaylistSongs, getSongUrls } from '@/api/qqmusic'
import { useDownloadManager } from '@/composables/useDownloadManager'
import { useAuthStore } from './auth'
import type { OnlineSong, QMPlaylistItem } from '@/types'

interface PlaylistCacheEntry {
  songs: OnlineSong[]
  total: number
}

const PLAYLIST_CACHE_VERSION = 1
const PLAYLIST_CACHE_TTL_MS = 10 * 60 * 1000

export const useQqmusicStore = defineStore('qqmusic', () => {
  // ========== 用户创建的歌单 ==========
  const userPlaylists = ref<QMPlaylistItem[]>([])
  const playlistsTotal = ref(0)
  const playlistsLoading = ref(false)
  const likedPlaylistId = ref<number | null>(null)

  // ========== 缓存层（内部，不导出） ==========
  const playlistCache = ref(new Map<number, PlaylistCacheEntry>())
  // 歌单加载代次，防止旧响应覆盖新歌单
  let loadSeq = 0

  function getCurrentUserKey(): string {
    const auth = useAuthStore()
    return String(auth.userInfo.music_id || auth.userInfo.encrypt_uin || 'anonymous')
  }

  function stripSongUrls(songs: OnlineSong[]): OnlineSong[] {
    return songs.map((s) => ({ ...s, songUrl: null }))
  }

  function applyUserPlaylists(list: QMPlaylistItem[], total?: number) {
    userPlaylists.value = list
    playlistsTotal.value = total ?? list.length

    // 识别"我喜欢的音乐"歌单 ID
    const liked = list.find((p) => p.title === '我喜欢的音乐') || list.find((p) => p.title.includes('喜欢'))
    likedPlaylistId.value = liked?.id ?? null
  }

  async function refreshUserPlaylistsRemote(userKey: string) {
    playlistsLoading.value = true

    try {
      const res = await getUserPlaylists()
      // 账号已切换/退出时丢弃本次结果，避免把旧账号数据写回缓存
      if (getCurrentUserKey() !== userKey) return
      const list = res.data.playlists || []
      applyUserPlaylists(list, res.data.total || 0)

      try {
        await window.electronAPI.saveQQUserPlaylistsCache({
          userKey,
          playlists: list,
          total: res.data.total || 0,
        })
      } catch (e) {
        console.error('保存 QQ 用户歌单列表缓存失败:', e)
      }
    } catch (e) {
      if (getCurrentUserKey() !== userKey) return
      // 若已有缓存展示，保留缓存；仅记录失败，避免后台刷新失败清空可见列表
      console.error('加载用户歌单失败:', e)
    } finally {
      if (getCurrentUserKey() === userKey) {
        playlistsLoading.value = false
      }
    }
  }

  // ========== Actions：用户歌单 ==========

  async function loadUserPlaylists() {
    const userKey = getCurrentUserKey()
    playlistsLoading.value = true

    // 优先读本地缓存，秒开侧边栏；随后后台刷新远端数据
    try {
      const cached = await window.electronAPI.getQQUserPlaylistsCache({ userKey })
      if (cached.success && cached.payload && cached.payload.version === PLAYLIST_CACHE_VERSION) {
        applyUserPlaylists(cached.payload.playlists, cached.payload.total)
        playlistsLoading.value = false
        void refreshUserPlaylistsRemote(userKey)
        return
      }
    } catch (e) {
      console.error('读取 QQ 用户歌单列表缓存失败:', e)
    }

    await refreshUserPlaylistsRemote(userKey)
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

  async function refreshPlaylistUrls(playlistId: number, songs: OnlineSong[]) {
    const songsNeedUrl = songs.filter((s) => !s.songUrl?.url)
    const mids = songsNeedUrl.map((s) => s.songMid).filter(Boolean)
    if (mids.length === 0) return

    try {
      const urlRes = await getSongUrls(String(Date.now()), mids)
      const urlList = urlRes.data.result || []
      songsNeedUrl.forEach((song, idx) => {
        if (urlList[idx]) {
          song.songUrl = { url: urlList[idx].url, urlType: urlList[idx].urlType || 'mp3' }
        }
      })
      if (currentPlaylistId.value === playlistId) {
        currentPlaylistSongs.value = [...songs]
      }
    } catch {
      // URL 获取失败不阻塞歌单展示
    }
  }

  async function checkPlaylistRemoteConsistency(
    playlistId: number,
    userKey: string,
    cachedTotal: number,
    cachedSongs: OnlineSong[]
  ) {
    try {
      let remoteTotal = 0
      let remoteSongs: OnlineSong[] = []

      if (playlistId === likedPlaylistId.value) {
        const res = await getUserLikedSongs(1, 20)
        remoteTotal = res.data.total || 0
        remoteSongs = res.data.result || []
      } else {
        const res = await getPlaylistSongs(playlistId, 1, 20)
        remoteTotal = res.data.total || 0
        remoteSongs = res.data.result || []
      }

      if (getCurrentUserKey() !== userKey) return

      const remoteMids = new Set(remoteSongs.map((s) => s.songMid).filter(Boolean))
      const cachedMids = cachedSongs.slice(0, Math.max(remoteSongs.length, 1)).map((s) => s.songMid).filter(Boolean)
      const countChanged = remoteTotal !== cachedTotal
      const firstPageChanged =
        cachedMids.length > 0 &&
        (cachedMids.length !== remoteMids.size || cachedMids.some((mid) => !remoteMids.has(mid)))

      if (countChanged || firstPageChanged) {
        console.log(`QQ 歌单缓存与远端不一致，后台刷新: playlist=${playlistId}`)
        if (currentPlaylistId.value === playlistId) {
          await loadAllPlaylistSongs(playlistId, true)
        }
      }
    } catch (e) {
      // 一致性检查失败不打扰用户，保留本地缓存
      console.error('QQ 歌单一致性检查失败:', e)
    }
  }

  async function loadAllPlaylistSongs(playlistId: number, force = false) {
    const seq = ++loadSeq
    if (!force) {
      const cached = playlistCache.value.get(playlistId)
      if (cached) {
        currentPlaylistId.value = playlistId
        currentPlaylistSongs.value = cached.songs
        currentPlaylistTotal.value = cached.total
        return
      }

      const userKey = getCurrentUserKey()

      // 优先读持久化缓存，秒开歌单；URL 在后台异步补齐
      try {
        const cachedRes = await window.electronAPI.getQQPlaylistCache({ userKey, playlistId })
        if (cachedRes.success && cachedRes.payload && cachedRes.payload.version === PLAYLIST_CACHE_VERSION) {
          if (seq !== loadSeq) return
          const songs = cachedRes.payload.songs || []
          playlistCache.value.set(playlistId, { songs, total: cachedRes.payload.total })
          currentPlaylistId.value = playlistId
          currentPlaylistSongs.value = songs
          currentPlaylistTotal.value = cachedRes.payload.total
          currentPlaylistLoading.value = false
          loadingError.value = ''
          void refreshPlaylistUrls(playlistId, songs)
          // 缓存超过 TTL 时做轻量一致性检查，不一致才后台刷新，不阻塞当前展示
          if (Date.now() - cachedRes.payload.cachedAt > PLAYLIST_CACHE_TTL_MS) {
            void checkPlaylistRemoteConsistency(playlistId, userKey, cachedRes.payload.total, songs)
          }
          return
        }
      } catch (e) {
        console.error('读取 QQ 歌单缓存失败:', e)
      }
    }

    const userKey = getCurrentUserKey()
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

      if (seq !== loadSeq) return
      if (getCurrentUserKey() !== userKey) return

      // 批量获取播放 URL
      const songsNeedUrl = songs.filter((s) => !s.songUrl?.url)
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

      if (seq !== loadSeq || getCurrentUserKey() !== userKey) return

      // 持久化只存歌单元数据，不存易失效的播放 URL
      try {
        await window.electronAPI.saveQQPlaylistCache({
          userKey,
          playlistId,
          total,
          songs: stripSongUrls(songs),
        })
      } catch (e) {
        console.error('保存 QQ 歌单缓存失败:', e)
      }

      if (seq !== loadSeq || getCurrentUserKey() !== userKey) return

      playlistCache.value.set(playlistId, { songs, total })
      currentPlaylistSongs.value = songs
      currentPlaylistTotal.value = total
      isRefreshing.value = false
    } catch (e) {
      if (seq !== loadSeq || getCurrentUserKey() !== userKey) return
      currentPlaylistSongs.value = []
      currentPlaylistTotal.value = 0
      loadingError.value = '加载失败'
      isRefreshing.value = false
      console.error('加载歌单全部歌曲失败:', e)
    } finally {
      if (seq === loadSeq) {
        currentPlaylistLoading.value = false
      }
    }
  }

  async function refreshPlaylistSongs(playlistId: number) {
    playlistCache.value.delete(playlistId)
    const userKey = getCurrentUserKey()
    try {
      await window.electronAPI.deleteQQPlaylistCache({ userKey, playlistId })
    } catch (e) {
      console.error('删除 QQ 歌单缓存失败:', e)
    }
    isRefreshing.value = true
    await loadAllPlaylistSongs(playlistId)
  }

  async function clearAllCache(userKey?: string) {
    playlistCache.value.clear()
    userPlaylists.value = []
    playlistsTotal.value = 0
    currentPlaylistSongs.value = []
    currentPlaylistTotal.value = 0
    currentPlaylistId.value = null
    likedPlaylistId.value = null

    const key = userKey || getCurrentUserKey()
    try {
      await window.electronAPI.clearQQOnlineCache({ userKey: key })
    } catch (e) {
      console.error('清空 QQ 在线歌单缓存失败:', e)
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
