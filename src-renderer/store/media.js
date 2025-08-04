import { defineStore } from "pinia";
import { usePlayerStore } from "./player";

// 定义媒体库存储
export const useMediaStore = defineStore("media", {
	state: () => ({
		// 所有歌曲列表 -> 现在只存储当前活动库的歌曲
		songs: [],
		// 音乐库列表
		libraries: [],
		// 当前活动的音乐库ID, null 代表 "所有音乐"
		activeLibraryId: "all",
		// 扫描状态
		scanning: false,
		// 扫描进度
		scanProgress: {
			phase: "idle",
			processed: 0,
			total: 0,
			message: "",
		},
		// 最后一次扫描的路径
		lastScanPath: "",
		// 清空歌曲库状态
		clearingSongs: false,
		// 搜索词
		searchTerm: "",
		// 用于存储最后一次更新的歌曲
		lastUpdatedSong: null,
		// 加载状态
		loading: false,
		// 加载错误
		error: null,
	}),

	getters: {
		// 获取歌曲数量
		songCount: (state) => state.songs.length,

		// 按艺术家分组的歌曲
		songsByArtist: (state) => {
			const artists = {};
			state.songs.forEach((song) => {
				if (!artists[song.artist]) {
					artists[song.artist] = [];
				}
				artists[song.artist].push(song);
			});
			return artists;
		},

		// 按专辑分组的歌曲
		songsByAlbum: (state) => {
			const albums = {};
			state.songs.forEach((song) => {
				if (!albums[song.album]) {
					albums[song.album] = [];
				}
				albums[song.album].push(song);
			});
			return albums;
		},

		// 过滤后的歌曲
		filteredSongs: (state) => {
			if (!state.searchTerm) {
				return state.songs;
			}
			const term = state.searchTerm.toLowerCase();
			return state.songs.filter(
				(song) =>
					song.title?.toLowerCase().includes(term) ||
					song.artist?.toLowerCase().includes(term) ||
					song.album?.toLowerCase().includes(term)
			);
		},

		// 获取当前活动的音乐库对象
		activeLibrary: (state) => {
			if (!state.activeLibraryId) {
				return null;
			}
			return state.libraries.find((lib) => lib.id === state.activeLibraryId);
		},
	},

	actions: {
		// 设置搜索词
		setSearchTerm(term) {
			this.searchTerm = term;
		},

		// ---- 库管理 Actions ----
		async loadLibraries() {
			try {
				const result = await window.electronAPI.getLibraries();
				if (result.success) {
					this.libraries = result.libraries;
					// 如果没有活动的库，并且库列表不为空，则默认激活第一个
					if (!this.activeLibraryId && this.libraries.length > 0) {
						this.setActiveLibrary(this.libraries[0].id);
					}
				}
				return result;
			} catch (error) {
				return { success: false, error: error.message };
			}
		},

		async addLibrary() {
			try {
				// 1. 调用主进程打开目录选择对话框
				const selection = await window.electronAPI.selectDirectory();

				// 2. 如果用户取消选择，则直接返回
				if (selection.canceled || !selection.path) {
					return { success: true, canceled: true };
				}

				// 3. 用户选择目录后，调用原有的addLibrary，并传递路径
				const result = await window.electronAPI.addLibrary({
					dirPath: selection.path,
				});

				if (result.success) {
					await this.loadLibraries(); // 重新加载列表
					this.setActiveLibrary(result.library.id); // 激活新添加的库
					// 添加成功后立即开始扫描
					this.scanMusic(result.library.id, true);
				}
				return result;
			} catch (error) {
				return { success: false, error: error.message };
			}
		},

		async updateLibrary(libraryId, updates) {
			try {
				const result = await window.electronAPI.updateLibrary({
					libraryId,
					updates,
				});
				if (result.success) {
					// 直接更新 store 中的数据，避免重新从数据库加载
					const index = this.libraries.findIndex((lib) => lib.id === libraryId);
					if (index !== -1) {
						this.libraries[index] = {
							...this.libraries[index],
							...result.library,
						};
					}
				}
				return result;
			} catch (error) {
				return { success: false, error: error.message };
			}
		},

		async removeLibrary(libraryId) {
			try {
				const result = await window.electronAPI.removeLibrary(libraryId);
				if (result.success) {
					// 如果删除的是当前激活的库，则切换到"所有音乐"
					if (this.activeLibraryId === libraryId) {
						this.setActiveLibrary(null);
					}
					this.libraries = this.libraries.filter((lib) => lib.id !== libraryId);
				}
				return result;
			} catch (error) {
				return { success: false, error: error.message };
			}
		},

		setActiveLibrary(libraryId) {
			this.activeLibraryId = libraryId;
			this.loadSongs(); // 切换库后加载歌曲
		},

		// ---- 歌曲加载与扫描 Actions ----
		async loadSongs() {
			this.loading = true;
			this.error = null;

			try {
				const result = await window.electronAPI.getSongs({
					libraryId: this.activeLibraryId,
				});

				if (result.success) {
					// 保存当前播放歌曲的信息，以便在切换库后恢复
					const playerStore = usePlayerStore();
					const currentSongId = playerStore.currentSong?.id;
					const currentSongPlayCount = playerStore.currentSong?.playCount;

					// 更新歌曲列表
					this.songs = result.songs;

					// 如果当前正在播放歌曲，检查它是否在新加载的列表中
					if (currentSongId) {
						const songInNewList = this.songs.find(
							(song) => song.id === currentSongId
						);
						if (songInNewList) {
							// 如果在新列表中找到了当前播放的歌曲，确保其播放次数是正确的
							if (typeof currentSongPlayCount === "number") {
								// 保留原来的播放次数
								songInNewList.playCount = currentSongPlayCount;
							}
						}
					}

					// 应用之前记录的播放次数更新
					if (this.lastUpdatedSong) {
						const { id, playCount } = this.lastUpdatedSong;
						const songToUpdate = this.songs.find((song) => song.id === id);
						if (songToUpdate) {
							songToUpdate.playCount = playCount;
						}
					}
				} else {
					this.error = result.error || "加载歌曲失败";
				}
			} catch (error) {
				this.error = error.message || "加载歌曲时出错";
			} finally {
				this.loading = false;
			}
		},

		// 开始扫描音乐
		async scanMusic(libraryId, clearExisting = true) {
			if (!libraryId) {
				return;
			}
			this.scanning = true;
			this.scanProgress.phase = "starting";
			this.scanProgress.processed = 0;
			this.scanProgress.total = 0;
			this.scanProgress.message = "正在准备开始扫描...";
			let removeProgressListener = null;

			try {
				// 设置进度回调
				removeProgressListener = window.electronAPI.onScanProgress(
					(progress) => {
						this.scanProgress.phase = progress.phase;
						this.scanProgress.message = progress.message;
						this.scanProgress.processed = progress.processed || 0;
						this.scanProgress.total = progress.total || 0;
					}
				);

				// 开始扫描
				const result = await window.electronAPI.scanMusic({
					libraryId,
					clearExisting,
				});

				// 如果扫描成功，并且扫描的是当前活动库，则重新加载歌曲
				if (
					result.success &&
					!result.canceled &&
					this.activeLibraryId === libraryId
				) {
					// 保存当前播放状态
					const playerStore = usePlayerStore();
					const wasPlaying = playerStore.playing;
					const currentSongId = playerStore.currentSong?.id;

					// 如果正在播放，先暂停，避免在重新加载歌曲时出现问题
					if (wasPlaying) {
						playerStore.setPlaying(false);
					}

					this.scanProgress.phase = "reloading_list";
					this.scanProgress.message = "正在刷新歌曲列表...";
					await this.loadSongs();

					// 验证并清理播放列表中无效的歌曲ID
					this.scanProgress.message = "正在验证播放列表...";
					await playerStore.validatePlaylist();

					// 验证当前播放的歌曲是否仍然存在
					if (currentSongId) {
						await playerStore.validateCurrentSong();

						// 如果验证成功且之前在播放，则恢复播放
						if (playerStore.currentSong && wasPlaying) {
							// 短暂延迟后恢复播放，确保音频数据已加载
							setTimeout(() => {
								playerStore.setPlaying(true);
							}, 500);
						}
					}

					this.scanProgress.phase = "complete";
					this.scanProgress.message = `扫描完成，共找到 ${this.songs.length} 首歌曲。播放列表已更新。`;

					// 重新加载音乐库信息，确保界面上显示的歌曲数量是最新的
					await this.loadLibraries();
				}
				return result;
			} catch (error) {
				this.scanProgress.phase = "error";
				this.scanProgress.message = error.message;
				return { success: false, error: error.message };
			} finally {
				this.scanning = false;
				if (removeProgressListener) {
					removeProgressListener();
				}
			}
		},

		async cancelScan() {
			try {
				this.scanning = false;
				this.scanProgress.phase = "canceled";
				this.scanProgress.message = "扫描已取消";

				const result = await window.electronAPI.cancelScan();

				return result;
			} catch (error) {
				this.scanning = false;
				this.scanProgress.phase = "canceled";
				this.scanProgress.message = "扫描已取消";
				return { success: false, error: error.message };
			}
		},

		// 更新单首歌曲的播放次数
		updateSongPlayCount(songId, playCount) {
			if (!songId || typeof playCount !== "number") {
				return false;
			}

			// 查找歌曲并更新播放次数
			const songIndex = this.songs.findIndex((song) => song.id === songId);

			// 即使当前视图中找不到歌曲，也要更新lastUpdatedSong
			// 这样当用户切回包含该歌曲的库时，可以看到更新后的播放次数
			this.lastUpdatedSong = {
				id: songId,
				playCount: playCount,
				timestamp: Date.now(),
			};

			// 如果当前视图中找到了歌曲，则更新它
			if (songIndex !== -1) {
				// 使用Vue的响应式更新方式
				this.$patch((state) => {
					// 使用$patch方法进行批量更新，这样更高效
					state.songs[songIndex] = {
						...state.songs[songIndex],
						playCount: playCount,
					};
				});

				return true;
			} else {
				return false;
			}
		},

		// 获取单首歌曲的最新数据
		async refreshSongById(songId) {
			try {
				// 从数据库获取最新的歌曲数据
				const result = await window.electronAPI.getSongById(songId);
				if (result.success && result.song) {
					// 查找歌曲并更新
					const songIndex = this.songs.findIndex((song) => song.id === songId);
					if (songIndex !== -1) {
						// 使用Vue的响应式更新方式
						this.songs[songIndex] = {
							...this.songs[songIndex],
							...result.song,
						};
						return true;
					}
				}
				return false;
			} catch (error) {
				return false;
			}
		},

		// 清除所有歌曲
		async clearAllSongs() {
			if (this.scanning) {
				return { success: false, error: "扫描进行中，无法清除歌曲" };
			}

			try {
				this.clearingSongs = true;

				// 调用主进程清除所有歌曲
				const result = await window.electronAPI.clearAllSongs();

				if (result.success) {
					// 清空本地状态
					this.songs = [];
					this.searchTerm = "";
					this.lastUpdatedSong = null;
					this.error = null;

					// 通知播放器停止播放
					const playerStore = usePlayerStore();
					if (playerStore.currentSong) {
						playerStore.stop();
					}
				}

				return result;
			} catch (error) {
				return { success: false, error: error.message };
			} finally {
				this.clearingSongs = false;
			}
		},
	},
});
