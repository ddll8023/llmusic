/**
 * QQ 音乐 API（统一入口）
 * 涵盖歌曲搜索、登录认证、用户歌单等所有 QQ 音乐相关接口
 */
import axios from 'axios'
import type { AxiosInstance } from 'axios'
import type { ApiResponse, OnlineSong, QMPlaylistItem, SongDownloadBundle } from '@/types'

const qqmusicClient: AxiosInstance = axios.create({
  baseURL: `${__BACKEND_BASE_URL__}/api/v1/qqmusic`,
  timeout: 300000,
  headers: { 'Content-Type': 'application/json' },
})

// 后端错误码：凭证失效相关
const CODE_NOT_LOGGED_IN = 2001
const CODE_TOKEN_EXPIRED = 2002

/** 业务错误：携带后端错误码，供调用方按 code 分流处理 */
export class ApiError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

qqmusicClient.interceptors.response.use(
  async (response) => {
    const res = response.data as ApiResponse
    if (res.code === 0) return res as never

    // 凭证失效：先向后端查询一次登录状态（后端会尝试自动刷新），成功则重试原请求一次
    const config = response.config as typeof response.config & { _retried?: boolean }
    if ((res.code === CODE_NOT_LOGGED_IN || res.code === CODE_TOKEN_EXPIRED) && !config._retried) {
      config._retried = true
      try {
        const statusRes = await getLoginStatus()
        if (statusRes.data.is_logged_in && !statusRes.data.is_expired) {
          return qqmusicClient.request(config) as never
        }
      } catch {
        // 刷新状态失败时继续走失效处理
      }
    }

    // 仍然失效：同步登录状态，引导用户重新扫码
    if (res.code === CODE_NOT_LOGGED_IN || res.code === CODE_TOKEN_EXPIRED) {
      const { useAuthStore } = await import('@/store/auth')
      const authStore = useAuthStore()
      authStore.isLoggedIn = false
      authStore.isExpired = res.code === CODE_TOKEN_EXPIRED
    }
    return Promise.reject(new ApiError(res.code, res.message || '请求失败'))
  },
  (error) => Promise.reject(error)
)

/**
 * 类型化请求入口：响应拦截器已把 AxiosResponse 解包为 ApiResponse，
 * 此处将返回值修正为真实的运行时类型
 */
function post<T>(url: string, body?: unknown): Promise<ApiResponse<T>> {
  return qqmusicClient.post(url, body) as unknown as Promise<ApiResponse<T>>
}

// ========== 响应数据结构 ==========

export interface SearchResultData {
  result: OnlineSong[]
  total: number
  requestId: string
}

export interface LoginStatusData {
  is_logged_in: boolean
  is_expired: boolean
  music_id: number
  encrypt_uin: string
  login_type: number
}

export interface QRCodeData {
  session_id: string
  qrcode_base64: string
}

export interface QRCheckData {
  status: string
  message?: string
}

export interface UserPlaylistsData {
  playlists: QMPlaylistItem[]
  total: number
}

// ========== 歌曲搜索 ==========

export function searchSongs(params: Record<string, unknown>) {
  return post<SearchResultData>('/song/search', params)
}

export function getAlbumImages(requestId: string, albumIdList: string[]) {
  return post<{ requestId: string; result: string[] }>('/song/album-img', { requestId, albumIdList })
}

export function getSongUrls(requestId: string, songIdList: string[]) {
  return post<{ requestId: string; result: { url: string; urlType: string }[] }>('/song/song-url', { requestId, songIdList })
}

export function searchByKeyword(keyword: string, page: number, pageSize: number) {
  return post<SearchResultData>('/song/search-by-keyword', {
    requestId: String(Date.now()),
    keyword,
    page,
    pageSize,
  })
}

// ========== 登录认证 ==========

export function getLoginStatus() {
  return post<LoginStatusData>('/auth/status')
}

export function createQRCode(loginType = 'qq') {
  return post<QRCodeData>('/auth/qrcode', { login_type: loginType })
}

export function checkQRCode(sessionId: string) {
  return post<QRCheckData>('/auth/check', { session_id: sessionId })
}

export function logout() {
  return post<null>('/auth/logout')
}

// ========== 用户歌单 ==========

/** 获取当前登录用户创建的歌单列表 */
export function getUserPlaylists() {
  return post<UserPlaylistsData>('/user/playlists')
}

/** 获取当前登录用户喜欢的歌曲列表 */
export function getUserLikedSongs(page = 1, pageSize = 20) {
  return post<{ result: OnlineSong[]; total: number }>('/user/liked', { page, pageSize })
}

/** 获取 QQ 音乐歌单内的全部歌曲（后端自动翻页，一次性返回） */
export function getPlaylistSongsAll(playlistId: number) {
  return post<SearchResultData>(`/playlist/${playlistId}/songs/all`, { requestId: String(Date.now()) })
}

/** 获取 QQ 音乐歌单内的歌曲（单页，用于轻量一致性检查） */
export function getPlaylistSongs(playlistId: number, page: number, pageSize: number) {
  return post<SearchResultData>(`/playlist/${playlistId}/songs`, {
    page,
    pageSize,
    requestId: String(Date.now()),
  })
}

// ========== 下载元数据 ==========

/** 获取歌曲下载元数据包（详情+封面+歌词+下载链接） */
export function getSongDownloadBundle(requestId: string, songMid: string) {
  return post<SongDownloadBundle>('/song/download-bundle', { requestId, songMid })
}
