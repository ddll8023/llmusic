import { defineStore } from 'pinia'
import { usePlayerStore } from './player'
import type { Song, Library, ScanProgress, ScanPhase } from '@/types'

let _scanProgressCleanup: (() => void) | null = null

interface MediaState {
	songs: Song[]
	libraries: Library[]
	activeLibraryId: string
	scanning: boolean
	scanProgress: ScanProgress
	lastScanPath: string
	clearingSongs: boolean
	searchTerm: string
	lastUpdatedSong: { id: string; playCount: number; timestamp: number } | null
	loading: boolean
	error: string | null
}

export const useMediaStore = defineStore('media', {
	state: (): MediaState => ({
		songs: [],
		libraries: [],
		activeLibraryId: 'all',
		scanning: false,
		scanProgress: { phase: 'idle' as ScanPhase, processed: 0, total: 0, message: '' },
		lastScanPath: '',
		clearingSongs: false,
		searchTerm: '',
		lastUpdatedSong: null,
		loading: false,
		error: null,
	}),

	getters: {
		songCount: (state) => state.songs.length,

		songsByArtist: (state) => {
			const artists: Record<string, Song[]> = {}
			state.songs.forEach((song) => {
				if (!artists[song.artist]) artists[song.artist] = []
				artists[song.artist].push(song)
			})
			return artists
		},

		songsByAlbum: (state) => {
			const albums: Record<string, Song[]> = {}
			state.songs.forEach((song) => {
				if (!albums[song.album]) albums[song.album] = []
				albums[song.album].push(song)
			})
			return albums
		},

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
		setSearchTerm(term: string) {
			this.searchTerm = term
		},

		// ── 库管理 ──
		async loadLibraries() {
			try {
				const result = await window.electronAPI.getLibraries()
				if (result.success) {
					this.libraries = result.libraries || []
					if (!this.activeLibraryId && this.libraries.length > 0) {
						this.setActiveLibrary(this.libraries[0].id)
					}
				}
				return result
			} catch (error) {
				return { success: false, error: (error as Error).message }
			}
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
				}
				return result
			} catch (error) {
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
				}
				return result
			} catch (error) {
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
				}
				return result
			} catch (error) {
				return { success: false, error: (error as Error).message }
			}
		},

		setActiveLibrary(libraryId: string) {
			this.activeLibraryId = libraryId
			this.loadSongs()
		},

		// ── 歌曲加载与扫描 ──
		async loadSongs() {
			this.loading = true
			this.error = null

			try {
				const result = await window.electronAPI.getSongs({ libraryId: this.activeLibraryId })

				if (result.success) {
					const playerStore = usePlayerStore()
					const currentSongId = playerStore.currentSong?.id
					const currentSongPlayCount = playerStore.currentSong?.playCount

					this.songs = result.songs || []

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
					this.error = result.error || '加载歌曲失败'
				}
			} catch (error) {
				this.error = (error as Error).message || '加载歌曲时出错'
			} finally {
				this.loading = false
			}
		},

		async scanMusic(libraryId: string, clearExisting = true) {
			if (!libraryId) return
			this.scanning = true
			this.scanProgress = { phase: 'starting' as ScanPhase, processed: 0, total: 0, message: '正在准备开始扫描...' }

			_scanProgressCleanup?.()
			_scanProgressCleanup = window.electronAPI.onScanProgress((progress: ScanProgress) => {
				this.scanProgress = { ...this.scanProgress, ...progress }
			})

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
					await this.loadSongs()

					this.scanProgress = { ...this.scanProgress, message: '扫描完成' }

					await this.loadLibraries()
				}
				return result
			} catch (error) {
				this.scanProgress = { phase: 'error' as ScanPhase, processed: 0, total: 0, message: (error as Error).message }
				return { success: false, error: (error as Error).message }
			} finally {
				this.scanning = false
				if (_scanProgressCleanup) {
					_scanProgressCleanup()
					_scanProgressCleanup = null
				}
			}
		},

		async cancelScan() {
			try {
				this.scanning = false
				this.scanProgress = { phase: 'idle' as ScanPhase, processed: 0, total: 0, message: '扫描已取消' }
				const result = await window.electronAPI.cancelScan()
				return result
			} catch (error) {
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

					const playerStore = usePlayerStore()
					if (playerStore.currentSong) {
						playerStore.stop()
					}
				}
				return result
			} catch (error) {
				return { success: false, error: (error as Error).message }
			} finally {
				this.clearingSongs = false
			}
		},
	},
})
