/**
 * QQ 音乐登录认证 API
 */
import axios from 'axios'
import type { AxiosInstance, AxiosResponse } from 'axios'
import type { ApiResponse } from '@/types'

const authClient: AxiosInstance = axios.create({
	baseURL: 'http://localhost:9752/api/v1/auth',
	timeout: 30000,
	headers: { 'Content-Type': 'application/json' },
})

authClient.interceptors.response.use(
	(response: AxiosResponse<ApiResponse>) => {
		const res = response.data
		if (res.code === 0) return res as any
		return Promise.reject(new Error(res.message || '请求失败'))
	},
	(error) => Promise.reject(error)
)

export function getLoginStatus() {
	return authClient.get<ApiResponse>('/status')
}

export function createQRCode(loginType = 'qq') {
	return authClient.post<ApiResponse>('/qrcode', { login_type: loginType })
}

export function checkQRCode(sessionId: string) {
	return authClient.get<ApiResponse>('/check', { params: { session_id: sessionId } })
}

export function logout() {
	return authClient.post<ApiResponse>('/logout')
}
