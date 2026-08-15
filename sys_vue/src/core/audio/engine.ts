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
	private audioContext: AudioContext | null = null
	private analyser: AnalyserNode | null = null

	setCallbacks(callbacks: EngineCallbacks): void {
		this.callbacks = callbacks
	}

	/** 加载音源；autoPlay 为 true 时加载后立即播放 */
	load(url: string, autoPlay = true): void {
		const audio = this.ensureAudio()
		if (audio.src !== url) {
			// 本地 llmusic:// 流需开启 CORS 才能被 Web Audio 频谱分析；
			// 在线 CDN 通常无 CORS 头，保持默认（不影响播放，仅分析数据不可用）
			audio.crossOrigin = url.startsWith('llmusic://') ? 'anonymous' : ''
			audio.src = url
		}
		if (autoPlay) {
			void this.play()
		}
	}

	/**
	 * 获取频谱分析器（懒创建）。
	 * 通过 MediaElementSource 将音频接入 AudioContext，供可视化读取频域数据；
	 * 跨域且无 CORS 头的音源（部分在线 CDN）分析数据恒为 0，调用方需自行兜底。
	 */
	getAnalyser(): AnalyserNode | null {
		try {
			const audio = this.ensureAudio()
			if (!this.analyser) {
				const Ctor =
					window.AudioContext ||
					(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
				if (!Ctor) return null
				const ctx = new Ctor()
				const source = ctx.createMediaElementSource(audio)
				const analyser = ctx.createAnalyser()
				analyser.fftSize = 256
				analyser.smoothingTimeConstant = 0.82
				source.connect(analyser)
				analyser.connect(ctx.destination)
				this.audioContext = ctx
				this.analyser = analyser
			}
			return this.analyser
		} catch (e) {
			console.warn('[audio] 频谱分析器创建失败:', e)
			return null
		}
	}

	/** 恢复 AudioContext（浏览器自动播放策略要求，需在用户交互后调用） */
	resumeAudioContext(): void {
		if (this.audioContext && this.audioContext.state === 'suspended') {
			this.audioContext.resume().catch(() => {})
		}
	}

	async play(): Promise<void> {
		const audio = this.audio
		if (!audio || !audio.src) return
		this.resumeAudioContext()
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
		this.analyser?.disconnect()
		this.analyser = null
		if (this.audioContext) {
			this.audioContext.close().catch(() => {})
			this.audioContext = null
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
