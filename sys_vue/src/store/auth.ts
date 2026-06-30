import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getLoginStatus, createQRCode, checkQRCode, logout as logoutApi } from '@/api/qqmusic'
import type { UserInfo, QRStatus } from '@/types'

export const useAuthStore = defineStore('auth', () => {
	const isLoggedIn = ref(false)
	const userInfo = ref<UserInfo>({
		music_id: 0,
		encrypt_uin: '',
		login_type: 0,
	})
	const isExpired = ref(false)

	const qrCodeBase64 = ref('')
	const sessionId = ref('')
	const loginType = ref('qq')
	const qrStatus = ref<QRStatus>('')
	const qrMessage = ref('')

	let pollTimer: ReturnType<typeof setInterval> | null = null

	async function initAuth() {
		try {
			const res = await getLoginStatus()
			const data = res.data as unknown as {
				is_logged_in: boolean
				is_expired: boolean
				music_id: number
				encrypt_uin: string
				login_type: number
			}
			isLoggedIn.value = data.is_logged_in
			isExpired.value = data.is_expired || false
			if (data.is_logged_in) {
				userInfo.value = {
					music_id: data.music_id,
					encrypt_uin: data.encrypt_uin,
					login_type: data.login_type,
				}
			}
		} catch {
			isLoggedIn.value = false
			isExpired.value = false
		}
	}

	async function startQRLogin(type = 'qq') {
		stopPolling()
		loginType.value = type
		qrStatus.value = 'loading'
		qrMessage.value = ''
		qrCodeBase64.value = ''

		try {
			const res = await createQRCode(type)
			const data = res.data as unknown as {
				session_id: string
				qrcode_base64: string
			}
			sessionId.value = data.session_id
			qrCodeBase64.value = data.qrcode_base64
			qrStatus.value = 'waiting'
			startPolling()
		} catch (e) {
			qrStatus.value = 'error'
			qrMessage.value = e instanceof Error ? e.message : '获取二维码失败'
		}
	}

	function startPolling() {
		stopPolling()
		pollTimer = setInterval(async () => {
			try {
				const res = await checkQRCode(sessionId.value)
				const data = res.data as unknown as {
					status: string
					message?: string
				}
				qrStatus.value = data.status as QRStatus
				qrMessage.value = data.message || ''

				if (['done', 'expired', 'error'].includes(data.status)) {
					stopPolling()
				}

				if (data.status === 'done') {
					await initAuth()
				}
			} catch {
				qrStatus.value = 'error'
				qrMessage.value = '查询登录状态失败'
				stopPolling()
			}
		}, 1500)
	}

	function stopPolling() {
		if (pollTimer) {
			clearInterval(pollTimer)
			pollTimer = null
		}
	}

	async function logout() {
		stopPolling()
		try {
			await logoutApi()
		} catch {
			// 忽略
		}
		isLoggedIn.value = false
		isExpired.value = false
		userInfo.value = { music_id: 0, encrypt_uin: '', login_type: 0 }
		qrCodeBase64.value = ''
		sessionId.value = ''
		qrStatus.value = ''
		qrMessage.value = ''
	}

	function resetQRState() {
		stopPolling()
		qrCodeBase64.value = ''
		sessionId.value = ''
		qrStatus.value = ''
		qrMessage.value = ''
	}

	return {
		isLoggedIn,
		userInfo,
		isExpired,
		qrCodeBase64,
		qrStatus,
		qrMessage,
		loginType,
		initAuth,
		startQRLogin,
		logout,
		resetQRState,
	}
})
