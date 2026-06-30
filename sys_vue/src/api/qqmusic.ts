/**
 * QQ 音乐 API（统一入口）
 * 涵盖歌曲搜索、登录认证、用户歌单等所有 QQ 音乐相关接口
 */
import axios from 'axios'
import type { AxiosInstance, AxiosResponse } from 'axios'
import type { ApiResponse } from '@/types'

const qqmusicClient: AxiosInstance = axios.create({
  baseURL: 'http://localhost:9752/api/v1/qqmusic',
  timeout: 300000,
  headers: { 'Content-Type': 'application/json' },
})

qqmusicClient.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    const res = response.data
    if (res.code === 0) return res as any
    return Promise.reject(new Error(res.message || '请求失败'))
  },
  (error) => Promise.reject(error)
)

// ========== 歌曲搜索 ==========

export function searchSongs(params: Record<string, unknown>) {
  return qqmusicClient.post<ApiResponse>('/song/search', params)
}

export function getAlbumImages(requestId: string, albumIdList: string[]) {
  return qqmusicClient.post<ApiResponse>('/song/album-img', { requestId, albumIdList })
}

export function getSongUrls(requestId: string, songIdList: string[]) {
  return qqmusicClient.post<ApiResponse>('/song/song-url', { requestId, songIdList })
}

export function searchByKeyword(keyword: string, page: number, pageSize: number) {
  return qqmusicClient.post<ApiResponse>('/song/search-by-keyword', {
    requestId: String(Date.now()),
    keyword,
    page,
    pageSize,
  })
}

// ========== 登录认证 ==========

export function getLoginStatus() {
  return qqmusicClient.post<ApiResponse>('/auth/status')
}

export function createQRCode(loginType = 'qq') {
  return qqmusicClient.post<ApiResponse>('/auth/qrcode', { login_type: loginType })
}

export function checkQRCode(sessionId: string) {
  return qqmusicClient.post<ApiResponse>('/auth/check', { session_id: sessionId })
}

export function logout() {
  return qqmusicClient.post<ApiResponse>('/auth/logout')
}

// ========== 用户歌单 ==========

/** 获取当前登录用户创建的歌单列表 */
export function getUserPlaylists() {
  return qqmusicClient.post<ApiResponse>('/user/playlists')
}

/** 获取当前登录用户喜欢的歌曲列表 */
export function getUserLikedSongs(page = 1, pageSize = 20) {
  return qqmusicClient.post<ApiResponse>('/user/liked', { page, pageSize })
}

/** 获取 QQ 音乐歌单内的歌曲列表 */
export function getPlaylistSongs(playlistId: number, page = 1, pageSize = 20) {
  return qqmusicClient.post<ApiResponse>(`/playlist/${playlistId}/songs`, { page, pageSize })
}
