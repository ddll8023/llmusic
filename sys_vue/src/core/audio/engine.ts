/**
 * 统一音频引擎
 *
 * 本地歌曲通过 llmusic:// 自定义协议流式播放（主进程负责 Range 响应与
 * 不支持格式的 ffmpeg 转码兜底），在线歌曲直接使用 HTTP URL。
 * 两者均由同一个 HTML5 Audio 元素驱动，对外提供统一控制接口，
 * 取代旧版 Web Audio API + window 全局变量的双引擎实现。
 */

export interface EngineCallbacks {
	onEnded?: () => void
	onTimeUpdate?: (time: number) => void
	onDurationChange?: (duration: number) => void
	onError?: (message: string) => void
}

// 播放进度上报间隔（歌词逐字高亮需要比 timeupdate 事件更高的频率）
const TIME_REPORT_INTERVAL_MS = 100

class AudioEngine {
	private audio: HTMLAudioElement | null = null
	private callbacks: EngineCallbacks = {}
	private timer: ReturnType<typeof setInterval> | null = null
	private volume = 0.7
	private muted = false

	setCallbacks(callbacks: EngineCallbacks): void {
		this.callbacks = callbacks
	}

	/** 加载音源；autoPlay 为 true 时加载后立即播放 */
	load(url: string, autoPlay = true): void {
		const audio = this.ensureAudio()
		if (audio.src !== url) {
			audio.src = url
		}
		if (autoPlay) {
			void this.play()
		}
	}

	async play(): Promise<void> {
		const audio = this.audio
		if (!audio || !audio.src) return
		try {
			await audio.play()
			this.startTimer()
		} catch (e: unknown) {
			// 切歌导致的 AbortError 属正常流程，不上报
			if (e instanceof DOMException && e.name === 'AbortError') return
			console.error('音频播放启动失败:', e)
			this.callbacks.onError?.('音频播放启动失败')
		}
	}

	pause(): void {
		this.audio?.pause()
		this.stopTimer()
	}

	seek(time: number): void {
		const audio = this.audio
		if (!audio || !isFinite(time)) return
		const duration = this.getDuration()
		audio.currentTime = duration > 0 ? Math.min(Math.max(0, time), duration) : Math.max(0, time)
		this.callbacks.onTimeUpdate?.(audio.currentTime)
	}

	setVolume(volume: number): void {
		this.volume = Math.max(0, Math.min(1, volume))
		this.applyVolume()
	}

	setMuted(muted: boolean): void {
		this.muted = muted
		this.applyVolume()
	}

	getCurrentTime(): number {
		return this.audio?.currentTime || 0
	}

	getDuration(): number {
		const d = this.audio?.duration
		return d && isFinite(d) ? d : 0
	}

	/** 停止播放并卸载音源 */
	stop(): void {
		this.stopTimer()
		if (this.audio) {
			this.audio.pause()
			this.audio.removeAttribute('src')
			this.audio.load()
		}
	}

	/** 组件卸载时释放资源 */
	dispose(): void {
		this.stop()
		if (this.audio) {
			this.audio.onended = null
			this.audio = null
		}
		this.callbacks = {}
	}

	private ensureAudio(): HTMLAudioElement {
		if (!this.audio) {
			const audio = new Audio()
			audio.preload = 'auto'
			audio.addEventListener('ended', () => {
				this.stopTimer()
				this.callbacks.onEnded?.()
			})
			audio.addEventListener('loadedmetadata', () => {
				if (isFinite(audio.duration)) {
					this.callbacks.onDurationChange?.(audio.duration)
				}
			})
			audio.addEventListener('error', () => {
				// 卸载音源（src 置空）触发的 error 不上报
				if (!audio.src) return
				this.stopTimer()
				this.callbacks.onError?.('音频加载失败')
			})
			this.audio = audio
			this.applyVolume()
		}
		return this.audio
	}

	private applyVolume(): void {
		if (this.audio) {
			this.audio.volume = this.muted ? 0 : this.volume
		}
	}

	private startTimer(): void {
		this.stopTimer()
		this.timer = setInterval(() => {
			const audio = this.audio
			if (audio && !audio.paused) {
				this.callbacks.onTimeUpdate?.(audio.currentTime)
			}
		}, TIME_REPORT_INTERVAL_MS)
	}

	private stopTimer(): void {
		if (this.timer) {
			clearInterval(this.timer)
			this.timer = null
		}
	}
}

export const audioEngine = new AudioEngine()

/** 本地歌曲的协议 URL（主进程按 songId 查库并流式返回音频） */
export function localSongUrl(songId: string): string {
	return `llmusic://audio/${encodeURIComponent(songId)}`
}
