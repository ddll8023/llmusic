import { defineStore } from 'pinia'
import { usePlayerStore } from './player'
import type { Song, Library, ScanProgress, ScanPhase, ScanFailedFile } from '@/types'

/**
 * 规范化 libraryId：null / undefined / 空值 统一转为 'all'
 */
function normalizeLibraryId(libraryId?: string | null): string {
	return libraryId || 'all'
}

/**
 * 模块级 pending Promise，用于复用同一库的正在加载的请求
 */
let _songsLoadingPromise: Promise<{ success: boolean; error?: string; skipped?: boolean }> | null = null
let _songsLoadingPromiseForLibraryId: string | null = null

/** 扫描进度监听器只注册一次（onScanProgress 不返回清理函数） */
let _scanProgressListenerRegistered = false

/** 音乐库列表加载的并发去重 Promise */
let _librariesLoadingPromise: Promise<{ success: boolean; error?: string; libraries?: Library[] }> | null = null

interface MediaState {
	songs: Song[]
	libraries: Library[]
	activeLibraryId: string
	scanning: boolean
	scanProgress: ScanProgress
	/** 最近一次扫描的失败文件清单 */
	lastScanFailedFiles: ScanFailedFile[]
	/** 最近一次扫描跳过的未变更文件数（增量扫描） */
	lastScanSkippedCount: number
	lastScanPath: string
	clearingSongs: boolean
	searchTerm: string
	lastUpdatedSong: { id: string; playCount: number; timestamp: number } | null
	loading: boolean
	error: string | null
	/** 当前 songs 对应哪个 libraryId */
	songsLoadedLibraryId: string | null
	/** 当前正在加载哪个 libraryId */
	songsLoadingLibraryId: string | null
	/** 递增请求序号，用于丢弃过期响应 */
	songsLoadRequestId: number
}

export const useMediaStore = defineStore('media', {
	state: (): MediaState => ({
		songs: [],
		libraries: [],
		activeLibraryId: 'all',
		scanning: false,
		scanProgress: { phase: 'idle' as ScanPhase, processed: 0, total: 0, message: '' },
		lastScanFailedFiles: [],
		lastScanSkippedCount: 0,
		lastScanPath: '',
		clearingSongs: false,
		searchTerm: '',
		lastUpdatedSong: null,
		loading: false,
		error: null,
		songsLoadedLibraryId: null,
		songsLoadingLibraryId: null,
		songsLoadRequestId: 0,
	}),

	getters: {
		songCount: (state) => state.songs.length,

		filteredSongs: (state) => {
			if (!state.searchTerm) return state.songs
			const term = state.searchTerm.toLowerCase()
			return state.songs.filter(
				(song) =>
					song.title?.toLowerCase().includes(term) ||
					song.artist?.toLowerCase().includes(term) ||
					song.album?.toLowerCase().includes(term)
			)
		},

		activeLibrary: (state) => {
			if (!state.activeLibraryId) return null
			return state.libraries.find((lib) => lib.id === state.activeLibraryId) || null
		},
	},

	actions: {
		/** 定点替换单条歌曲记录（标签编辑后同步，避免全量重载） */
		replaceSong(song: Song) {
			const index = this.songs.findIndex((s) => s.id === song.id)
			if (index !== -1) {
				this.songs.splice(index, 1, song)
			}
		},

		setSearchTerm(term: string) {
			this.searchTerm = term
		},

		// ── 库管理 ──
		async loadLibraries() {
			// 并发去重：启动期 App/SideBar/Settings 同时调用只发一次 IPC
			if (_librariesLoadingPromise) return _librariesLoadingPromise

			_librariesLoadingPromise = (async () => {
				try {
					const result = await window.electronAPI.getLibraries()
					if (result.success) {
						this.libraries = result.libraries || []
						if (!this.activeLibraryId && this.libraries.length > 0) {
							this.setActiveLibrary(this.libraries[0].id)
						}
					} else {
						this.error = result.error || '加载音乐库失败'
					}
					return result
				} catch (error) {
					this.error = (error as Error).message || '加载音乐库出错'
					return { success: false, error: (error as Error).message }
				} finally {
					_librariesLoadingPromise = null
				}
			})()
			return _librariesLoadingPromise
		},

		async addLibrary() {
			try {
				const selection = await window.electronAPI.selectDirectory()
				if (selection.canceled || !selection.path) {
					return { success: true, canceled: true }
				}

				const result = await window.electronAPI.addLibrary({ dirPath: selection.path })
				if (result.success) {
					this.libraries = [...this.libraries, result.library].filter(Boolean)
					if (result.library) this.setActiveLibrary(result.library.id)
					this.scanMusic(result.library.id, true)
				} else {
					this.error = result.error || '添加音乐库失败'
				}
				return result
			} catch (error) {
				this.error = (error as Error).message || '添加音乐库出错'
				return { success: false, error: (error as Error).message }
			}
		},

		async updateLibrary(libraryId: string, updates: Record<string, unknown>) {
			try {
				const result = await window.electronAPI.updateLibrary({ libraryId, updates })
				if (result.success) {
					const index = this.libraries.findIndex((lib) => lib.id === libraryId)
					if (index !== -1 && result.library) {
						this.libraries[index] = { ...this.libraries[index], ...result.library }
					}
				} else {
					this.error = result.error || '更新音乐库失败'
				}
				return result
			} catch (error) {
				this.error = (error as Error).message || '更新音乐库出错'
				return { success: false, error: (error as Error).message }
			}
		},

		async removeLibrary(libraryId: string) {
			try {
				const result = await window.electronAPI.removeLibrary(libraryId)
				if (result.success) {
					if (this.activeLibraryId === libraryId) {
						this.activeLibraryId = 'all'
					}
					this.libraries = this.libraries.filter((lib) => lib.id !== libraryId)
					this.songs = this.songs.filter((s) => s.libraryId !== libraryId)

					// 如果移除的是已加载或正在加载的库，清理标记
					if (this.songsLoadedLibraryId === libraryId) {
						this.songsLoadedLibraryId = null
					}
					if (this.songsLoadingLibraryId === libraryId) {
						this.songsLoadingLibraryId = null
					}
				} else {
					this.error = result.error || '移除音乐库失败'
				}
				return result
			} catch (error) {
				this.error = (error as Error).message || '移除音乐库出错'
				return { success: false, error: (error as Error).message }
			}
		},

		setActiveLibrary(libraryId: string | null) {
			const targetLibraryId = normalizeLibraryId(libraryId)

			// 同库且已加载完成，不重复触发
			if (this.activeLibraryId === targetLibraryId && this.songsLoadedLibraryId === targetLibraryId) {
				return
			}

			this.activeLibraryId = targetLibraryId
			this.loadSongs({ libraryId: targetLibraryId })
		},

		// ── 歌曲加载与扫描 ──
		async loadSongs(options: { libraryId?: string | null; force?: boolean } = {}) {
			const targetLibraryId = normalizeLibraryId(options.libraryId ?? this.activeLibraryId)
			const force = options.force ?? false

			// 已加载完成且不强制刷新，跳过
			if (!force && this.songsLoadedLibraryId === targetLibraryId) {
				return { success: true, skipped: true }
			}

			// 同一库正在加载中，复用 pending Promise
			if (
				!force &&
				this.songsLoadingLibraryId === targetLibraryId &&
				_songsLoadingPromise &&
				_songsLoadingPromiseForLibraryId === targetLibraryId
			) {
				return _songsLoadingPromise
			}

			// 启动新请求
			this.songsLoadRequestId++
			const requestId = this.songsLoadRequestId
			this.songsLoadingLibraryId = targetLibraryId
			this.loading = true
			this.error = null

			const promise = (async () => {
				try {
					const result = await window.electronAPI.getSongs({ libraryId: targetLibraryId })

					// 丢弃过期响应
					if (requestId !== this.songsLoadRequestId) {
						return { success: false, error: '请求已过期' }
					}

					if (result.success) {
						const playerStore = usePlayerStore()
						const currentSongId = playerStore.currentSong?.id
						const currentSongPlayCount = playerStore.currentSong?.playCount

						this.songs = result.songs || []
						this.songsLoadedLibraryId = targetLibraryId

						if (currentSongId) {
							const songInNewList = this.songs.find((s) => s.id === currentSongId)
							if (songInNewList && typeof currentSongPlayCount === 'number') {
								songInNewList.playCount = currentSongPlayCount
							}
						}

						if (this.lastUpdatedSong) {
							const songToUpdate = this.songs.find((s) => s.id === this.lastUpdatedSong!.id)
							if (songToUpdate) {
								songToUpdate.playCount = this.lastUpdatedSong.playCount
							}
						}
					} else {
						if (requestId === this.songsLoadRequestId) {
							this.error = result.error || '加载歌曲失败'
						}
					}

					return result
				} catch (error) {
					if (requestId === this.songsLoadRequestId) {
						this.error = (error as Error).message || '加载歌曲时出错'
					}
					return { success: false, error: (error as Error).message }
				} finally {
					if (requestId === this.songsLoadRequestId) {
						this.loading = false
						this.songsLoadingLibraryId = null
						_songsLoadingPromise = null
						_songsLoadingPromiseForLibraryId = null
					}
				}
			})()

			_songsLoadingPromise = promise
			_songsLoadingPromiseForLibraryId = targetLibraryId
			return promise
		},

		async scanMusic(libraryId: string, clearExisting = true) {
			if (!libraryId) return
			this.scanning = true
			this.scanProgress = { phase: 'starting' as ScanPhase, processed: 0, total: 0, message: '正在准备开始扫描...' }
			this.lastScanFailedFiles = []
			this.lastScanSkippedCount = 0

			// 模块级标记保证进度监听只注册一次，避免多次扫描时重复回调
			if (!_scanProgressListenerRegistered) {
				_scanProgressListenerRegistered = true
				window.electronAPI.onScanProgress((progress: ScanProgress) => {
					this.scanProgress = { ...this.scanProgress, ...progress }
					// 扫描完成事件携带失败清单与跳过统计
					if (progress.phase === 'complete') {
						this.lastScanFailedFiles = progress.failedFiles || []
						this.lastScanSkippedCount = progress.skippedCount || 0
					}
				})
			}

			try {
				const result = await window.electronAPI.scanMusic({ libraryId, clearExisting })

				if (result.success && !result.canceled && this.activeLibraryId === libraryId) {
					const playerStore = usePlayerStore()
					const wasPlaying = playerStore.playing
					const currentSongId = playerStore.currentSong?.id

					if (wasPlaying) {
						playerStore.setPlaying(false)
					}

					this.scanProgress = { ...this.scanProgress, phase: 'parsing' as ScanPhase, message: '正在刷新歌曲列表...' }
					await this.loadSongs({ libraryId, force: true })

					this.scanProgress = { ...this.scanProgress, message: '扫描完成' }

					await this.loadLibraries()
				}
				return result
			} catch (error) {
				this.scanProgress = { phase: 'error' as ScanPhase, processed: 0, total: 0, message: (error as Error).message }
				return { success: false, error: (error as Error).message }
			} finally {
				this.scanning = false
			}
		},

		async cancelScan() {
			try {
				this.scanning = false
				this.scanProgress = { phase: 'idle' as ScanPhase, processed: 0, total: 0, message: '扫描已取消' }
				const result = await window.electronAPI.cancelScan()
				if (!result.success) {
					this.error = result.error || '取消扫描失败'
				}
				return result
			} catch (error) {
				this.error = (error as Error).message || '取消扫描出错'
				return { success: false, error: (error as Error).message }
			}
		},

		updateSongPlayCount(songId: string, playCount: number) {
			if (!songId || typeof playCount !== 'number') return false

			this.lastUpdatedSong = { id: songId, playCount, timestamp: Date.now() }

			const songIndex = this.songs.findIndex((s) => s.id === songId)
			if (songIndex !== -1) {
				this.songs[songIndex] = { ...this.songs[songIndex], playCount }
				return true
			}
			return false
		},

		async refreshSongById(songId: string) {
			try {
				const result = await window.electronAPI.getSongById(songId)
				if (result.success && result.song) {
					const songIndex = this.songs.findIndex((s) => s.id === songId)
					if (songIndex !== -1) {
						this.songs[songIndex] = { ...this.songs[songIndex], ...result.song }
						return true
					}
				}
				return false
			} catch {
				return false
			}
		},

		async clearAllSongs() {
			if (this.scanning) {
				return { success: false, error: '扫描进行中，无法清除歌曲' }
			}

			try {
				this.clearingSongs = true
				const result = await window.electronAPI.clearAllSongs()

				if (result.success) {
					this.songs = []
					this.searchTerm = ''
					this.lastUpdatedSong = null
					this.error = null
					this.songsLoadedLibraryId = null
					this.songsLoadingLibraryId = null
					this.songsLoadRequestId++
					_songsLoadingPromise = null
					_songsLoadingPromiseForLibraryId = null

					const playerStore = usePlayerStore()
					if (playerStore.currentSong) {
						playerStore.stop()
					}
				} else {
					this.error = result.error || '清除歌曲失败'
				}
				return result
			} catch (error) {
				this.error = (error as Error).message || '清除歌曲出错'
				return { success: false, error: (error as Error).message }
			} finally {
				this.clearingSongs = false
			}
		},
	},
})
