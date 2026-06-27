import { defineStore } from 'pinia'
import type { Song, Playlist } from '@/types'
import { usePlayerStore } from './player'

interface PlaylistDialogState {
	id: string | null
	name: string
	description: string
}

export const usePlaylistStore = defineStore('playlist', {
	state: () => ({
		playlists: [] as Playlist[],
		currentPlaylistId: null as string | null,
		currentPlaylistSongs: [] as Song[],
		loading: false,
		showPlaylistDialog: false,
		isEditMode: false,
		editingPlaylist: { id: null, name: '', description: '' } as PlaylistDialogState,
		error: null as string | null,
	}),

	getters: {
		currentPlaylist: (state): Playlist | null => {
			return state.playlists.find((p) => p.id === state.currentPlaylistId) || null
		},
		hasCurrentPlaylist: (state): boolean => !!state.currentPlaylistId,
		playlistCount: (state): number => state.playlists.length,
	},

	actions: {
		async loadPlaylists() {
			this.loading = true
			this.error = null
			try {
				const result = await window.electronAPI.getPlaylists()
				if (result.success && result.playlists) {
					this.playlists = result.playlists
				} else {
					this.error = result.error || '加载歌单失败'
				}
			} catch (err) {
				this.error = err instanceof Error ? err.message : '加载歌单出错'
			} finally {
				this.loading = false
			}
		},

		async loadPlaylistById(playlistId: string) {
			if (!playlistId) return
			this.loading = true
			this.error = null
			try {
				const result = await window.electronAPI.getPlaylistById(playlistId)
				if (result.success && result.playlist) {
					this.currentPlaylistId = playlistId
					const index = this.playlists.findIndex((p) => p.id === playlistId)
					if (index !== -1) {
						this.playlists[index] = result.playlist
					}
					if (result.playlist.songs) {
						await this.loadPlaylistSongs(result.playlist.songs)
					}
				} else {
					this.error = result.error || '加载歌单详情失败'
				}
			} catch (err) {
				this.error = err instanceof Error ? err.message : '加载歌单详情出错'
			} finally {
				this.loading = false
			}
		},

		async loadPlaylistSongs(songIds: string[]) {
			if (!songIds || songIds.length === 0) {
				this.currentPlaylistSongs = []
				return
			}
			this.loading = true
			try {
				const songs: Song[] = []
				for (const songId of songIds) {
					const result = await window.electronAPI.getSongById(songId)
					if (result.success && result.song) {
						songs.push(result.song)
					}
				}
				this.currentPlaylistSongs = songs
			} catch (err) {
				this.error = err instanceof Error ? err.message : '加载歌单歌曲出错'
			} finally {
				this.loading = false
			}
		},

		async createPlaylist(data: { name: string; description?: string }) {
			this.loading = true
			this.error = null
			try {
				const result = await window.electronAPI.createPlaylist(data)
				if (result.success && result.playlist) {
					this.playlists.push(result.playlist)
					this.closePlaylistDialog()
					return { success: true, playlist: result.playlist } as const
				}
				this.error = result.error || '创建歌单失败'
				return { success: false, error: this.error } as const
			} catch (err) {
				this.error = err instanceof Error ? err.message : '创建歌单出错'
				return { success: false, error: this.error } as const
			} finally {
				this.loading = false
			}
		},

		async addSongsToPlaylist(playlistId: string, songIds: string[]) {
			if (!playlistId || !songIds || songIds.length === 0) {
				return { success: false, error: '参数错误' } as const
			}
			this.loading = true
			this.error = null
			try {
				const result = await window.electronAPI.addSongsToPlaylist(playlistId, songIds)
				if (result.success) {
					if (this.currentPlaylistId === playlistId) {
						await this.loadPlaylistById(playlistId)
					} else {
						await this.loadPlaylists()
					}
					return { success: true } as const
				}
				this.error = result.error || '添加歌曲到歌单失败'
				return { success: false, error: this.error } as const
			} catch (err) {
				this.error = err instanceof Error ? err.message : '添加歌曲到歌单出错'
				return { success: false, error: this.error } as const
			} finally {
				this.loading = false
			}
		},

		async removeSongsFromPlaylist(playlistId: string, songIds: string[]) {
			if (!playlistId || !songIds || songIds.length === 0) {
				return { success: false, error: '参数错误' } as const
			}
			this.loading = true
			this.error = null
			try {
				const result = await window.electronAPI.removeSongsFromPlaylist(playlistId, songIds)
				if (result.success) {
					if (this.currentPlaylistId === playlistId) {
						await this.loadPlaylistById(playlistId)
					} else {
						await this.loadPlaylists()
					}
					return { success: true } as const
				}
				this.error = result.error || '从歌单移除歌曲失败'
				return { success: false, error: this.error } as const
			} catch (err) {
				this.error = err instanceof Error ? err.message : '从歌单移除歌曲出错'
				return { success: false, error: this.error } as const
			} finally {
				this.loading = false
			}
		},

		async deletePlaylist(playlistId: string) {
			if (!playlistId) return { success: false, error: '未提供歌单ID' } as const
			this.loading = true
			this.error = null
			try {
				const result = await window.electronAPI.deletePlaylist(playlistId)
				if (result.success) {
					this.playlists = this.playlists.filter((p) => p.id !== playlistId)
					if (this.currentPlaylistId === playlistId) {
						this.currentPlaylistId = null
						this.currentPlaylistSongs = []
					}
					return { success: true } as const
				}
				this.error = result.error || '删除歌单失败'
				return { success: false, error: this.error } as const
			} catch (err) {
				this.error = err instanceof Error ? err.message : '删除歌单出错'
				return { success: false, error: this.error } as const
			} finally {
				this.loading = false
			}
		},

		async playPlaylist(playlistId: string) {
			if (!playlistId) return
			try {
				const result = await window.electronAPI.getPlaylistById(playlistId)
				if (!result.success || !result.playlist || !result.playlist.songs || result.playlist.songs.length === 0) return
				const playerStore = usePlayerStore()
				playerStore.playSongFromList({
					listId: playlistId,
					songIds: result.playlist.songs,
					songToPlayId: result.playlist.songs[0],
				})
				this.currentPlaylistId = playlistId
			} catch (err) {
				this.error = err instanceof Error ? err.message : '播放歌单出错'
			}
		},

		async updatePlaylist(playlistId: string, data: { name: string; description?: string }) {
			if (!playlistId) return { success: false, error: '未提供歌单ID' } as const
			this.loading = true
			this.error = null
			try {
				const result = await window.electronAPI.updatePlaylist(playlistId, data)
				if (result.success && result.playlist) {
					const index = this.playlists.findIndex((p) => p.id === playlistId)
					if (index !== -1) {
						this.playlists[index] = result.playlist
					}
					this.closePlaylistDialog()
					return { success: true, playlist: result.playlist } as const
				}
				this.error = result.error || '更新歌单失败'
				return { success: false, error: this.error } as const
			} catch (err) {
				this.error = err instanceof Error ? err.message : '更新歌单出错'
				return { success: false, error: this.error } as const
			} finally {
				this.loading = false
			}
		},

		clearCurrentPlaylist() {
			this.currentPlaylistId = null
			this.currentPlaylistSongs = []
		},

		openCreatePlaylistDialog() {
			this.isEditMode = false
			this.editingPlaylist = { id: null, name: '', description: '' }
			this.showPlaylistDialog = true
		},

		openEditPlaylistDialog(playlist: Playlist) {
			if (!playlist) return
			this.isEditMode = true
			this.editingPlaylist = {
				id: playlist.id,
				name: playlist.name,
				description: playlist.description || '',
			}
			this.showPlaylistDialog = true
		},

		closePlaylistDialog() {
			this.showPlaylistDialog = false
			this.editingPlaylist = { id: null, name: '', description: '' }
		},

		async savePlaylist() {
			if (!this.editingPlaylist.name.trim()) {
				this.error = '歌单名称不能为空'
				return { success: false, error: this.error } as const
			}
			if (this.isEditMode && this.editingPlaylist.id) {
				return await this.updatePlaylist(this.editingPlaylist.id, {
					name: this.editingPlaylist.name.trim(),
					description: this.editingPlaylist.description.trim(),
				})
			}
			return await this.createPlaylist({
				name: this.editingPlaylist.name.trim(),
				description: this.editingPlaylist.description.trim(),
			})
		},
	},
})
