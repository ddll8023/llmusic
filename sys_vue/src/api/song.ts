/**
 * 歌曲搜索下载 API
 */
import axios from 'axios'
import type { AxiosInstance, AxiosResponse } from 'axios'
import type { ApiResponse } from '@/types'

const apiClient: AxiosInstance = axios.create({
	baseURL: 'http://localhost:9752/api/v1/song',
	timeout: 300000,
	headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.response.use(
	(response: AxiosResponse<ApiResponse>) => {
		const res = response.data
		if (res.code === 0) return res as any
		return Promise.reject(new Error(res.message || '请求失败'))
	},
	(error) => Promise.reject(error)
)

export function searchSongs(params: Record<string, unknown>) {
	return apiClient.post<ApiResponse>('/search', params)
}

export function getAlbumImages(requestId: string, albumIdList: string[]) {
	return apiClient.post<ApiResponse>('/albumImg', { requestId, albumIdList })
}

export function getSongUrls(requestId: string, songIdList: string[]) {
	return apiClient.post<ApiResponse>('/songUrl', { requestId, songIdList })
}

export function searchByKeyword(keyword: string, page: number, pageSize: number) {
	return apiClient.post<ApiResponse>('/searchByKeyword', {
		requestId: String(Date.now()),
		keyword,
		page,
		pageSize,
	})
}
