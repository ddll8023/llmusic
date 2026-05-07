import { defineStore } from "pinia";
import { useMediaStore } from "./media";
import { usePlayerStore } from "./player";

export const usePlaylistStore = defineStore("playlist", {
	state: () => ({
		// 所有歌单列表
		playlists: [],
		// 当前激活的歌单ID
		currentPlaylistId: null,
		// 当前歌单的歌曲列表（songId所对应的完整歌曲对象）
		currentPlaylistSongs: [],
		// 加载状态
		loading: false,
		// 创建/编辑歌单对话框状态
		showPlaylistDialog: false,
		// 编辑模式
		isEditMode: false,
		// 临时编辑的歌单数据
		editingPlaylist: {
			id: null,
			name: "",
			description: "",
		},
		// 错误信息
		error: null,
	}),

	getters: {
		// 获取当前激活的歌单
		currentPlaylist: (state) => {
			return (
				state.playlists.find((p) => p.id === state.currentPlaylistId) || null
			);
		},

		// 是否有激活的歌单
		hasCurrentPlaylist: (state) => !!state.currentPlaylistId,

		// 获取歌单数量
		playlistCount: (state) => state.playlists.length,
	},

	actions: {
		// 加载所有歌单
		async loadPlaylists() {
			this.loading = true;
			this.error = null;

			try {
				const result = await window.electronAPI.getPlaylists();
				if (result.success) {
					this.playlists = result.playlists;
				} else {
					this.error = result.error || "加载歌单失败";
					console.error("加载歌单列表失败:", result.error);
				}
			} catch (error) {
				this.error = error.message || "加载歌单出错";
				console.error("加载歌单时出错:", error);
			} finally {
				this.loading = false;
			}
		},

		// 加载指定歌单详情
		async loadPlaylistById(playlistId) {
			if (!playlistId) return;

			this.loading = true;
			this.error = null;

			try {
				const result = await window.electronAPI.getPlaylistById(playlistId);
				if (result.success) {
					// 更新当前激活的歌单
					this.currentPlaylistId = playlistId;

					// 找到并更新本地歌单数据
					const index = this.playlists.findIndex((p) => p.id === playlistId);
					if (index !== -1) {
						this.playlists[index] = result.playlist;
					}

					// 加载歌单中的歌曲详情
					await this.loadPlaylistSongs(result.playlist.songs);
				} else {
					this.error = result.error || "加载歌单详情失败";
					console.error("加载歌单详情失败:", result.error);
				}
			} catch (error) {
				this.error = error.message || "加载歌单详情出错";
				console.error("加载歌单详情时出错:", error);
			} finally {
				this.loading = false;
			}
		},

		// 加载歌单歌曲详情
		async loadPlaylistSongs(songIds) {
			if (!songIds || songIds.length === 0) {
				this.currentPlaylistSongs = [];
				return;
			}

			this.loading = true;

			try {
				// 逐一获取歌曲详情
				const songs = [];
				for (const songId of songIds) {
					const result = await window.electronAPI.getSongById(songId);
					if (result.success && result.song) {
						songs.push(result.song);
					}
				}

				this.currentPlaylistSongs = songs;
			} catch (error) {
				console.error("加载歌单歌曲时出错:", error);
				this.error = error.message || "加载歌单歌曲出错";
			} finally {
				this.loading = false;
			}
		},

		// 创建新歌单
		async createPlaylist(playlistData) {
			this.loading = true;
			this.error = null;

			try {
				const result = await window.electronAPI.createPlaylist(playlistData);
				if (result.success) {
					// 添加到本地歌单列表
					this.playlists.push(result.playlist);
					this.closePlaylistDialog();
					return { success: true, playlist: result.playlist };
				} else {
					this.error = result.error || "创建歌单失败";
					console.error("创建歌单失败:", result.error);
					return { success: false, error: this.error };
				}
			} catch (error) {
				this.error = error.message || "创建歌单出错";
				console.error("创建歌单时出错:", error);
				return { success: false, error: this.error };
			} finally {
				this.loading = false;
			}
		},

		// 更新歌单信息
		async updatePlaylist(playlistId, playlistData) {
			if (!playlistId) return { success: false, error: "未提供歌单ID" };

			this.loading = true;
			this.error = null;

			try {
				const result = await window.electronAPI.updatePlaylist(
					playlistId,
					playlistData
				);
				if (result.success) {
					// 更新本地歌单数据
					const index = this.playlists.findIndex((p) => p.id === playlistId);
					if (index !== -1) {
						this.playlists[index] = result.playlist;
					}

					this.closePlaylistDialog();
					return { success: true, playlist: result.playlist };
				} else {
					this.error = result.error || "更新歌单失败";
					console.error("更新歌单失败:", result.error);
					return { success: false, error: this.error };
				}
			} catch (error) {
				this.error = error.message || "更新歌单出错";
				console.error("更新歌单时出错:", error);
				return { success: false, error: this.error };
			} finally {
				this.loading = false;
			}
		},

		// 删除歌单
		async deletePlaylist(playlistId) {
			if (!playlistId) return { success: false, error: "未提供歌单ID" };

			this.loading = true;
			this.error = null;

			try {
				const result = await window.electronAPI.deletePlaylist(playlistId);
				if (result.success) {
					// 从本地歌单列表中移除
					this.playlists = this.playlists.filter((p) => p.id !== playlistId);

					// 如果删除的是当前激活的歌单，清除当前状态
					if (this.currentPlaylistId === playlistId) {
						this.currentPlaylistId = null;
						this.currentPlaylistSongs = [];
					}

					return { success: true };
				} else {
					this.error = result.error || "删除歌单失败";
					console.error("删除歌单失败:", result.error);
					return { success: false, error: this.error };
				}
			} catch (error) {
				this.error = error.message || "删除歌单出错";
				console.error("删除歌单时出错:", error);
				return { success: false, error: this.error };
			} finally {
				this.loading = false;
			}
		},

		// 向歌单添加歌曲
		async addSongsToPlaylist(playlistId, songIds) {
			if (!playlistId) return { success: false, error: "未提供歌单ID" };
			if (!songIds || (Array.isArray(songIds) && songIds.length === 0)) {
				return { success: false, error: "未提供歌曲ID" };
			}

			this.loading = true;
			this.error = null;

			try {
				const result = await window.electronAPI.addSongsToPlaylist(
					playlistId,
					songIds
				);
				if (result.success) {
					// 如果是当前激活的歌单，刷新歌单详情
					if (this.currentPlaylistId === playlistId) {
						await this.loadPlaylistById(playlistId);
					} else {
						// 否则只刷新歌单列表
						await this.loadPlaylists();
					}

					return { success: true, message: result.message };
				} else {
					this.error = result.error || "添加歌曲到歌单失败";
					console.error("添加歌曲到歌单失败:", result.error);
					return { success: false, error: this.error };
				}
			} catch (error) {
				this.error = error.message || "添加歌曲到歌单出错";
				console.error("添加歌曲到歌单时出错:", error);
				return { success: false, error: this.error };
			} finally {
				this.loading = false;
			}
		},

		// 从歌单移除歌曲
		async removeSongsFromPlaylist(playlistId, songIds) {
			if (!playlistId) return { success: false, error: "未提供歌单ID" };
			if (!songIds || (Array.isArray(songIds) && songIds.length === 0)) {
				return { success: false, error: "未提供歌曲ID" };
			}

			this.loading = true;
			this.error = null;

			try {
				const result = await window.electronAPI.removeSongsFromPlaylist(
					playlistId,
					songIds
				);
				if (result.success) {
					// 如果是当前激活的歌单，刷新歌单详情
					if (this.currentPlaylistId === playlistId) {
						await this.loadPlaylistById(playlistId);
					} else {
						// 否则只刷新歌单列表
						await this.loadPlaylists();
					}

					return { success: true, message: result.message };
				} else {
					this.error = result.error || "从歌单移除歌曲失败";
					console.error("从歌单移除歌曲失败:", result.error);
					return { success: false, error: this.error };
				}
			} catch (error) {
				this.error = error.message || "从歌单移除歌曲出错";
				console.error("从歌单移除歌曲时出错:", error);
				return { success: false, error: this.error };
			} finally {
				this.loading = false;
			}
		},

		// 播放歌单
		async playPlaylist(playlistId) {
			if (!playlistId) return;

			try {
				// 先加载歌单详情
				const result = await window.electronAPI.getPlaylistById(playlistId);
				if (!result.success || !result.playlist.songs.length) {
					console.error("播放歌单失败: 歌单不存在或为空");
					return;
				}

				// 获取播放器store
				const playerStore = usePlayerStore();

				// 播放歌单中的所有歌曲
				playerStore.playSongFromList({
					listId: playlistId,
					songIds: result.playlist.songs,
					songToPlayId: result.playlist.songs[0], // 播放第一首歌
				});

				// 设置当前歌单
				this.currentPlaylistId = playlistId;
			} catch (error) {
				console.error("播放歌单时出错:", error);
				this.error = error.message || "播放歌单出错";
			}
		},

		// 清除当前选中的歌单状态
		clearCurrentPlaylist() {
			this.currentPlaylistId = null;
			this.currentPlaylistSongs = [];
		},

		// 打开创建歌单对话框
		openCreatePlaylistDialog() {
			this.isEditMode = false;
			this.editingPlaylist = {
				id: null,
				name: "",
				description: "",
			};
			this.showPlaylistDialog = true;
		},

		// 打开编辑歌单对话框
		openEditPlaylistDialog(playlist) {
			if (!playlist) return;

			this.isEditMode = true;
			this.editingPlaylist = {
				id: playlist.id,
				name: playlist.name,
				description: playlist.description || "",
			};
			this.showPlaylistDialog = true;
		},

		// 关闭对话框
		closePlaylistDialog() {
			this.showPlaylistDialog = false;
			this.editingPlaylist = {
				id: null,
				name: "",
				description: "",
			};
		},

		// 保存歌单（创建或更新）
		async savePlaylist() {
			// 验证名称不为空
			if (!this.editingPlaylist.name.trim()) {
				this.error = "歌单名称不能为空";
				return { success: false, error: this.error };
			}

			if (this.isEditMode && this.editingPlaylist.id) {
				// 更新已有歌单
				return await this.updatePlaylist(this.editingPlaylist.id, {
					name: this.editingPlaylist.name.trim(),
					description: this.editingPlaylist.description.trim(),
				});
			} else {
				// 创建新歌单
				return await this.createPlaylist({
					name: this.editingPlaylist.name.trim(),
					description: this.editingPlaylist.description.trim(),
					songs: [],
				});
			}
		},
	},
});
