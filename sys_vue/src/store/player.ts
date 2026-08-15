import { defineStore } from 'pinia'
import type { LyricLine, Song } from '@/types'
import { audioEngine, localSongUrl } from '@/core/audio/engine'
import { useMediaStore } from './media'
import { useLyricsStore } from './lyrics'

export type PlayMode = 'sequence' | 'random' | 'repeat_one'

export const PlayMode = {
	SEQUENCE: 'sequence' as PlayMode,
	RANDOM: 'random' as PlayMode,
	REPEAT_ONE: 'repeat_one' as PlayMode,
}

export interface OnlineSongInfo {
	songMid: string
	songName: string
	singer: string
	coverUrl: string
	url: string
	urlType: string
}

function shuffleArray<T>(arr: T[]): T[] {
	const shuffled = [...arr]
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1))
		;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
	}
	return shuffled
}

export const usePlayerStore = defineStore('player', {
	state: () => ({
		currentSong: null as Song | null,
		playing: false,
		currentTime: 0,
		duration: 0,
		volume: 0.7,
		muted: false,
		playbackError: '' as string,
		playMode: PlayMode.SEQUENCE as PlayMode,
		playlist: [] as string[],
		currentListId: null as string | null,
		currentIndex: -1,
		shuffleQueue: [] as string[],
		shuffleIndex: -1,
		playHistory: [] as string[],
		showLyrics: false,
		accumulatedPlayTime: 0,
		hasBeenCounted: false,
		isOnlineSong: false,
		onlineSongName: '',
		onlineSinger: '',
		onlineSongMid: '',
		onlineCoverUrl: '',
		onlinePlayQueue: [] as OnlineSongInfo[],
		onlinePlayIndex: -1,
		onlineShuffleQueue: [] as number[],
		onlineShuffleIndex: -1,
		lastNowPlayingPushAt: 0,
	}),

	getters: {
		hasCurrentSong: (state) => state.currentSong !== null,
	},

	actions: {
		// ── 引擎接线 ──
		/** 绑定音频引擎回调并同步音量状态，应用启动时调用一次 */
		attachEngine() {
			audioEngine.setCallbacks({
				onEnded: () => { void this._handlePlaybackEnded() },
				onTimeUpdate: (time) => this.updateCurrentTime(time),
				onDurationChange: (duration) => { this.duration = duration },
				onError: (message) => {
					this.playbackError = message
					this.playing = false
				},
			})
			audioEngine.setVolume(this.volume)
			audioEngine.setMuted(this.muted)
		},

		/** 推送完整播放快照给主进程（桌面歌词等消费） */
		syncNowPlayingToMain() {
			const lyricsStore = useLyricsStore()
			const track = this.isOnlineSong
				? {
						id: this.onlineSongMid || '',
						title: this.onlineSongName,
						artist: this.onlineSinger,
						album: '',
						isOnline: true,
					}
				: this.currentSong
					? {
							id: this.currentSong.id,
							title: this.currentSong.title,
							artist: this.currentSong.artist,
							album: this.currentSong.album || '',
							isOnline: false,
						}
					: null
			// 转成纯 JSON 数据再走 IPC，避免 Vue 响应式 Proxy 无法被 Electron 结构化克隆
			const plainLyric = JSON.parse(JSON.stringify(lyricsStore.displayLines)) as LyricLine[]
			void window.electronAPI.updateNowPlaying({
				track,
				lyric: plainLyric,
				position: Math.round(this.currentTime * 1000),
				playing: this.playing,
				speed: 1,
				lyricOffsetMs: lyricsStore.syncOffset,
				showTranslation: lyricsStore.showTranslation,
				showRoma: lyricsStore.showRoma,
			})
		},

		/** 推送播放位置锚点给主进程（约 5Hz 节流） */
		syncNowPlayingPosition() {
			const now = Date.now()
			if (now - this.lastNowPlayingPushAt < 200) return
			this.lastNowPlayingPushAt = now
			void window.electronAPI.syncNowPlayingPosition({
				position: Math.round(this.currentTime * 1000),
				playing: this.playing,
				speed: 1,
			})
		},

		/** 恢复会话后按暂停状态装载上次的歌曲与进度 */
		restorePlayback() {
			if (this.isOnlineSong || !this.currentSong) return
			audioEngine.load(localSongUrl(this.currentSong.id), false)
			this.duration = this.currentSong.duration || 0
			if (this.currentTime > 0) {
				audioEngine.seek(this.currentTime)
			}
		},

		async _handlePlaybackEnded() {
			if (this.playMode === PlayMode.REPEAT_ONE) {
				await this.incrementCurrentSongPlayCount()
				this.currentTime = 0
				audioEngine.seek(0)
				void audioEngine.play()
				return
			}
			this.playNext(true)
		},

		// ── 队列管理 ──
		generateShuffleQueue() {
			if (this.playlist.length === 0) {
				this.shuffleQueue = []
				this.shuffleIndex = -1
				return
			}
			const currentSongId = this.currentSong?.id ?? null
			const others = this.playlist.filter((id) => id !== currentSongId)
			this.shuffleQueue = shuffleArray(others)
			if (currentSongId && this.playlist.includes(currentSongId)) {
				this.shuffleQueue.unshift(currentSongId)
			}
			this.shuffleIndex = 0
		},

		removeFromPlaylist(index: number) {
			if (index < 0 || index >= this.playlist.length) return
			this.playlist.splice(index, 1)
			if (this.playlist.length === 0) {
				this.currentSong = null
				this.setPlaying(false)
				this.currentIndex = -1
			} else if (index <= this.currentIndex) {
				this.currentIndex = Math.max(0, this.currentIndex - 1)
			}
			this.savePlayerState()
		},

		// ── 播放控制 ──
		playSong(song: Song) {
			this.currentTime = 0
			this.accumulatedPlayTime = 0
			this.hasBeenCounted = false
			this.isOnlineSong = false
			this.onlineCoverUrl = ''
			this.playbackError = ''

			let index = this.playlist.findIndex((id) => id === song.id)
			if (index === -1) {
				this.playlist.push(song.id)
				index = this.playlist.length - 1
			}

			this.currentSong = song
			this.playing = true
			this.currentIndex = index
			this.duration = song.duration || 0
			this.savePlayerState()

			audioEngine.load(localSongUrl(song.id), true)

			// 委托歌词 Store 加载歌词
			const lyricsStore = useLyricsStore()
			lyricsStore.loadLyrics(song.id)
			lyricsStore.setCurrentIndex(-1)
			this.syncNowPlayingToMain()
			this.syncNowPlayingPosition()

			if (this.playMode === PlayMode.RANDOM) {
				const posInQueue = this.shuffleQueue.indexOf(song.id)
				if (posInQueue !== -1) {
					this.shuffleIndex = posInQueue
				} else {
					this.generateShuffleQueue()
				}
			}
		},

		playSongFromList(data: { listId: string; songIds: string[]; songToPlayId: string }) {
			if (!data.songIds || data.songIds.length === 0) return
			this.currentListId = data.listId
			this.playlist = data.songIds

			const mediaStore = useMediaStore()
			const song = mediaStore.songs.find((s) => s.id === data.songToPlayId)
			if (song) {
				this.playSong(song)
			}
		},

		togglePlay() {
			this.setPlaying(!this.playing)
		},

		setPlaying(targetState: boolean) {
			this.playing = targetState
			if (targetState) {
				void audioEngine.play()
			} else {
				audioEngine.pause()
			}
			this.syncNowPlayingPosition()
		},

		stop() {
			this.playing = false
			this.currentSong = null
			this.currentTime = 0
			this.duration = 0
			this.currentIndex = -1
			this.playlist = []
			this.onlinePlayQueue = []
			this.onlinePlayIndex = -1
			this.onlineShuffleQueue = []
			this.onlineShuffleIndex = -1
			audioEngine.stop()
			this.syncNowPlayingToMain()
			this.syncNowPlayingPosition()
		},

		seek(time: number) {
			const t = Math.max(0, time)
			this.currentTime = t
			this._updateLyricsIndex(t)
			audioEngine.seek(t)
			this.syncNowPlayingPosition()
		},

		playNext(auto = false) {
			if (this.isOnlineSong) {
				this._playNextOnline(auto)
				return
			}
			if (this.playlist.length === 0) return
			if (this.playMode === PlayMode.REPEAT_ONE && auto) {
				this.seek(0)
				this.setPlaying(true)
				return
			}

			const mediaStore = useMediaStore()
			let nextIndex: number

			if (this.playMode === PlayMode.RANDOM) {
				if (this.shuffleIndex < this.shuffleQueue.length - 1) {
					this.shuffleIndex++
				} else {
					this.shuffleQueue = shuffleArray(this.playlist)
					this.shuffleIndex = 0
				}
				const nextId = this.shuffleQueue[this.shuffleIndex]
				const nextSong = mediaStore.songs.find((s) => s.id === nextId)
				if (nextSong) {
					this.playSong(nextSong)
					return
				}
			}

			nextIndex = this.currentIndex + 1
			if (nextIndex >= this.playlist.length) {
				if (this.playMode === PlayMode.SEQUENCE && auto) {
					this.setPlaying(false)
					return
				}
				nextIndex = 0
			}

			const nextId = this.playlist[nextIndex]
			const nextSong = mediaStore.songs.find((s) => s.id === nextId)
			if (nextSong) {
				this.playSong(nextSong)
			}
		},

		_playNextOnline(auto = false) {
			if (this.onlinePlayQueue.length === 0) return

			if (this.playMode === PlayMode.REPEAT_ONE && auto) {
				this.seek(0)
				this.setPlaying(true)
				return
			}

			let nextIndex: number
			const length = this.onlinePlayQueue.length

			if (this.playMode === PlayMode.RANDOM) {
				if (this.onlineShuffleQueue.length === 0) {
					this._generateOnlineShuffleQueue()
				}
				if (this.onlineShuffleIndex < this.onlineShuffleQueue.length - 1) {
					this.onlineShuffleIndex++
				} else {
					this._generateOnlineShuffleQueue()
					this.onlineShuffleIndex = 0
				}
				nextIndex = this.onlineShuffleQueue[this.onlineShuffleIndex]
			} else {
				nextIndex = this.onlinePlayIndex + 1
				if (nextIndex >= length) {
					if (this.playMode === PlayMode.SEQUENCE && auto) {
						this.setPlaying(false)
						return
					}
					nextIndex = 0
				}
			}

			for (let attempts = 0; attempts < length; attempts++) {
				const next = this.onlinePlayQueue[nextIndex]
				if (!next) return
				if (next.url) {
					this.onlinePlayIndex = nextIndex
					this._applyOnlineSong(next)
					this.savePlayerState()
					return
				}
				this.onlinePlayIndex = nextIndex
				if (this.playMode === PlayMode.RANDOM) {
					if (this.onlineShuffleIndex < this.onlineShuffleQueue.length - 1) {
						this.onlineShuffleIndex++
						nextIndex = this.onlineShuffleQueue[this.onlineShuffleIndex]
					} else {
						this._generateOnlineShuffleQueue()
						this.onlineShuffleIndex = 0
						nextIndex = this.onlineShuffleQueue[0]
					}
				} else {
					nextIndex++
					if (nextIndex >= length) {
						if (this.playMode === PlayMode.SEQUENCE && auto) {
							this.setPlaying(false)
							return
						}
						nextIndex = 0
					}
				}
			}

			this.setPlaying(false)
		},

		playPrevious() {
			if (this.isOnlineSong) {
				this._playPreviousOnline()
				return
			}
			if (this.playlist.length === 0) return

			if (this.currentTime > 3) {
				this.seek(0)
				return
			}

			const mediaStore = useMediaStore()
			let prevIndex: number

			if (this.playMode === PlayMode.RANDOM) {
				if (this.shuffleIndex > 0) {
					this.shuffleIndex--
				} else {
					this.shuffleIndex = this.shuffleQueue.length - 1
				}
				const prevId = this.shuffleQueue[this.shuffleIndex]
				const prevSong = mediaStore.songs.find((s) => s.id === prevId)
				if (prevSong) {
					this.playSong(prevSong)
					return
				}
			}

			prevIndex = this.currentIndex - 1
			if (prevIndex < 0) prevIndex = this.playlist.length - 1

			const prevId = this.playlist[prevIndex]
			const prevSong = mediaStore.songs.find((s) => s.id === prevId)
			if (prevSong) this.playSong(prevSong)
		},

		_playPreviousOnline() {
			if (this.onlinePlayQueue.length === 0) return

			if (this.currentTime > 3) {
				this.seek(0)
				return
			}

			let prevIndex: number
			const length = this.onlinePlayQueue.length

			if (this.playMode === PlayMode.RANDOM) {
				if (this.onlineShuffleIndex > 0) {
					this.onlineShuffleIndex--
				} else {
					this.onlineShuffleIndex = this.onlineShuffleQueue.length - 1
				}
				prevIndex = this.onlineShuffleQueue[this.onlineShuffleIndex]
			} else {
				prevIndex = this.onlinePlayIndex - 1
				if (prevIndex < 0) prevIndex = length - 1
			}

			for (let attempts = 0; attempts < length; attempts++) {
				const prev = this.onlinePlayQueue[prevIndex]
				if (!prev) return
				if (prev.url) {
					this.onlinePlayIndex = prevIndex
					this._applyOnlineSong(prev)
					this.savePlayerState()
					return
				}
				this.onlinePlayIndex = prevIndex
				if (this.playMode === PlayMode.RANDOM) {
					if (this.onlineShuffleIndex > 0) {
						this.onlineShuffleIndex--
						prevIndex = this.onlineShuffleQueue[this.onlineShuffleIndex]
					} else {
						this.onlineShuffleIndex = this.onlineShuffleQueue.length - 1
						prevIndex = this.onlineShuffleQueue[this.onlineShuffleIndex]
					}
				} else {
					prevIndex--
					if (prevIndex < 0) prevIndex = length - 1
				}
			}

			this.setPlaying(false)
		},

		// ── 音量 ──
		setVolume(volume: number) {
			this.volume = Math.max(0, Math.min(1, volume))
			audioEngine.setVolume(this.volume)
		},

		setMuted(muted: boolean) {
			this.muted = muted
			audioEngine.setMuted(muted)
		},

		// ── 播放模式 ──
		setPlayMode(mode: PlayMode) {
			this.playMode = mode
			if (this.isOnlineSong && mode === PlayMode.RANDOM && this.onlinePlayQueue.length > 0) {
				this._generateOnlineShuffleQueue()
			}
		},

		// ── 时间管理 ──
		updateCurrentTime(time: number) {
			this.currentTime = time
			this._updateLyricsIndex(time)
			this.syncNowPlayingPosition()
		},

		_updateLyricsIndex(time: number) {
			const lyricsStore = useLyricsStore()
			const lines = lyricsStore.displayLines
			if (!lines.length) return
			const ms = time * 1000 + lyricsStore.syncOffset

			// 游标推进：正常播放时 O(1)，向后 seek 时从头重扫
			let idx = lyricsStore.currentIndex
			if (idx >= 0 && (idx >= lines.length || lines[idx].time > ms)) {
				idx = -1
			}
			while (idx + 1 < lines.length && lines[idx + 1].time <= ms) {
				idx++
			}

			if (idx !== lyricsStore.currentIndex) {
				lyricsStore.setCurrentIndex(idx)
			}
		},

		// ── 播放计数 ──
		async incrementCurrentSongPlayCount() {
			if (!this.currentSong || this.hasBeenCounted) return
			try {
				const result = await window.electronAPI.incrementPlayCount(this.currentSong.id)
				if (result.success && result.song) {
					this.currentSong.playCount = result.song.playCount
					this.hasBeenCounted = true
				}
			} catch {
				// 忽略
			}
		},

		// ── 歌词显隐 ──
		showLyricsDisplay() {
			this.showLyrics = true
		},

		hideLyricsDisplay() {
			this.showLyrics = false
		},

		// ── 在线播放 ──
		playOnlineSong(info: OnlineSongInfo, options?: { queue: OnlineSongInfo[]; startIndex: number }) {
			// 无播放 URL 时不修改播放状态
			if (!info.url) return

			this.currentTime = 0
			this.accumulatedPlayTime = 0
			this.hasBeenCounted = false
			this.isOnlineSong = true
			this.currentSong = null
			this.playbackError = ''

			if (options?.queue) {
				this.onlinePlayQueue = options.queue
				this.onlinePlayIndex = options.startIndex
			} else {
				this.onlinePlayQueue = [info]
				this.onlinePlayIndex = 0
			}

			if (this.playMode === PlayMode.RANDOM) {
				this._generateOnlineShuffleQueue()
			} else {
				this.onlineShuffleQueue = []
				this.onlineShuffleIndex = -1
			}

			this._applyOnlineSong(info)
			this.savePlayerState()
		},

		_applyOnlineSong(info: OnlineSongInfo) {
			this.onlineSongName = info.songName
			this.onlineSinger = info.singer
			this.onlineSongMid = info.songMid || ''
			this.onlineCoverUrl = info.coverUrl || ''
			this.currentTime = 0
			this.duration = 0
			this.playing = true
			audioEngine.load(info.url, true)
			const lyricsStore = useLyricsStore()
			lyricsStore.loadOnlineLyricsByMid(this.onlineSongMid)
			this.syncNowPlayingToMain()
			this.syncNowPlayingPosition()
		},

		_generateOnlineShuffleQueue() {
			if (this.onlinePlayQueue.length === 0) {
				this.onlineShuffleQueue = []
				this.onlineShuffleIndex = -1
				return
			}
			const indices = this.onlinePlayQueue.map((_, i) => i)
			const currentIdx = this.onlinePlayIndex
			const others = indices.filter((i) => i !== currentIdx)
			this.onlineShuffleQueue = shuffleArray(others)
			if (currentIdx >= 0) {
				this.onlineShuffleQueue.unshift(currentIdx)
			}
			this.onlineShuffleIndex = 0
		},

		addToPlaylist(songId: string) {
			if (!this.playlist.includes(songId)) {
				this.playlist.push(songId)
				this.savePlayerState()
			}
		},

		seekToLyricPosition(index: number) {
			const lyricsStore = useLyricsStore()
			const line = lyricsStore.displayLines[index]
			if (line) {
				this.seek(line.time / 1000)
			}
		},

		// ── 验证 ──
		async validatePlaylist() {
			const mediaStore = useMediaStore()
			const validIds = new Set(mediaStore.songs.map((s) => s.id))
			this.playlist = this.playlist.filter((id) => validIds.has(id))
		},

		async validateCurrentSong() {
			if (!this.currentSong) return
			const mediaStore = useMediaStore()
			const exists = mediaStore.songs.some((s) => s.id === this.currentSong!.id)
			if (!exists) {
				this.currentSong = null
				this.setPlaying(false)
				this.currentTime = 0
			}
		},

		// ── 持久化 ──
		savePlayerState() {
			// 在线歌曲不跨会话持久化（URL 过期后无法恢复）
			if (this.isOnlineSong) return
			try {
				const state = {
					currentSong: this.currentSong,
					currentTime: this.currentTime,
					volume: this.volume,
					muted: this.muted,
					playMode: this.playMode,
					playlist: this.playlist,
					currentListId: this.currentListId,
					currentIndex: this.currentIndex,
					shuffleQueue: this.shuffleQueue,
					shuffleIndex: this.shuffleIndex,
				}
				localStorage.setItem('playerState', JSON.stringify(state))
			} catch {
				// localStorage 满时忽略
			}
		},

		loadPlayerState() {
			try {
				const saved = localStorage.getItem('playerState')
				if (saved) {
					const state = JSON.parse(saved)
					// 在线歌曲不跨会话恢复（URL 已失效）
					if (state.isOnlineSong) {
						this.isOnlineSong = false
						this.onlineSongName = ''
						this.onlineSinger = ''
						this.onlineSongMid = ''
						this.onlineCoverUrl = ''
						this.onlinePlayQueue = []
						this.onlinePlayIndex = -1
						this.onlineShuffleQueue = []
						this.onlineShuffleIndex = -1
						this.currentSong = null
						this.playing = false
					} else {
						this.currentSong = state.currentSong || null
						this.currentTime = state.currentTime || 0
						this.volume = state.volume ?? 0.7
						this.muted = state.muted || false
						this.playMode = state.playMode || PlayMode.SEQUENCE
						this.playlist = state.playlist || []
						this.currentListId = state.currentListId || null
						this.currentIndex = state.currentIndex ?? -1
						this.shuffleQueue = state.shuffleQueue || []
						this.shuffleIndex = state.shuffleIndex ?? -1
					}
				}
			} catch {
				// 解析失败时使用默认值
			}
		},
	},
})
