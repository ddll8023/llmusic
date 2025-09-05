import { defineStore } from "pinia";
import { useMediaStore } from "./media";
import { formatTimeProgress } from "../utils/timeUtils";

// 播放模式枚举
export const PlayMode = {
	SEQUENCE: "sequence", // 顺序播放
	RANDOM: "random", // 随机播放
	REPEAT_ONE: "repeat_one", // 单曲循环
};

// 定义播放器存储
export const usePlayerStore = defineStore("player", {
	state: () => ({
		// 当前播放的歌曲
		currentSong: null,
		// 播放状态: true - 播放中, false - 暂停
		playing: false,
		// 当前播放时间 (秒)
		currentTime: 0,
		// 音量 (0-1)
		volume: 0.7,
		// 是否静音
		muted: false,
		// 播放模式
		playMode: PlayMode.SEQUENCE,
		// 播放列表 (歌曲ID数组)
		playlist: [],
		// 当前播放列表的唯一标识
		currentListId: null,
		// 当前播放索引
		currentIndex: -1,
		// 歌词相关
		lyrics: [], // 解析后的歌词数据，包含时间戳和文本
		currentLyricIndex: -1, // 当前播放的歌词索引
		hasLyrics: false, // 是否有歌词
		lyricsSyncOffset: 0, // 歌词同步偏移量（毫秒）
		showLyrics: false, // 是否显示歌词页面
		lyricMetadata: {}, // 歌词元数据
		lyricsFormat: null, // 歌词格式：'lrc' 或 'text'
		lyricsSource: null, // 歌词来源：'embedded' 或 'external_file'
		isAutoScrolling: true, // 歌词是否启用自动滚动
	}),

	getters: {
		// 是否有正在播放的歌曲
		hasCurrentSong: (state) => state.currentSong !== null,

		// 播放进度百分比
		progress: (state) => {
			if (!state.currentSong || !state.currentSong.duration) {
				return 0;
			}
			return state.currentTime / state.currentSong.duration;
		},

		// 播放进度时间格式化 (分:秒)
		formattedTime: (state) => {
			return formatTimeProgress(state.currentTime, state.currentSong?.duration);
		},
	},

	actions: {
		// 载入保存的播放器状态
		loadPlayerState() {
			try {
				const savedState = localStorage.getItem("playerState");
				if (savedState) {
					const state = JSON.parse(savedState);

					// 恢复播放模式
					if (
						state.playMode &&
						Object.values(PlayMode).includes(state.playMode)
					) {
						this.playMode = state.playMode;
					}

					// 恢复音量设置
					if (typeof state.volume === "number") {
						this.volume = Math.max(0, Math.min(1, state.volume));
					}

					// 恢复静音状态
					if (typeof state.muted === "boolean") {
						this.muted = state.muted;
					}

					// 恢复播放列表和索引
					if (Array.isArray(state.playlist) && state.playlist.length > 0) {
						this.playlist = state.playlist;
						this.currentListId = state.currentListId || null;

						if (
							typeof state.currentIndex === "number" &&
							state.currentIndex >= 0 &&
							state.currentIndex < state.playlist.length
						) {
							this.currentIndex = state.currentIndex;

							// 尝试加载上次播放的歌曲
							const lastSongId = state.playlist[state.currentIndex];
							if (lastSongId) {
								window.electronAPI
									.getSongById(lastSongId)
									.then((result) => {
										if (result.success && result.song) {
											this.currentSong = result.song;
											// 不自动播放，只恢复状态
											this.playing = false;
										}
									})
									.catch((error) => {
										console.error("恢复上次播放歌曲失败:", error);
									});
							}
						}
					}
				}
			} catch (error) {
				console.error("加载播放器状态出错:", error);
			}
		},

		// 保存播放器状态到本地存储
		savePlayerState() {
			try {
				// 只保存需要持久化的状态
				const stateToSave = {
					playMode: this.playMode,
					playlist: this.playlist,
					currentListId: this.currentListId,
					currentIndex: this.currentIndex,
					volume: this.volume,
					muted: this.muted,
				};
				localStorage.setItem("playerState", JSON.stringify(stateToSave));
			} catch (error) {
				console.error("保存播放器状态出错:", error);
			}
		},

		// 更新歌曲时长，如果从音频文件获取的时长比数据库中的更准确
		updateSongDuration(songId, duration) {
			if (!songId || !duration || isNaN(duration)) return;

			if (this.currentSong && this.currentSong.id === songId) {
				// 如果时长相差超过1秒，使用新的时长
				if (Math.abs(this.currentSong.duration - duration) > 1) {
					this.currentSong.duration = duration;
				}
			}
		},

		// 播放指定歌曲
		playSong(song) {
			if (!song) return;

			this.currentTime = 0; // 重置播放时间
			this.resetLyrics(); // 重置歌词状态

			let index = this.playlist.findIndex((id) => id === song.id);
			if (index === -1) {
				// 如果歌曲不在播放列表中，自动添加到播放列表
				console.log(`歌曲 ${song.title} 不在当前播放列表中，正在自动添加...`);
				this.playlist.push(song.id);
				index = this.playlist.length - 1;
				this.savePlayerState(); // 保存播放列表变更
			}

			// 现在歌曲一定在播放列表中
			this.currentSong = song;
			this.playing = true;
			this.currentIndex = index;
			this.savePlayerState(); // 保存当前索引变更
			// 加载歌词
			this.loadLyrics(song.id);

			// 更新媒体会话元数据（基本信息，封面会在PlayerBar组件中更新）
			if ("mediaSession" in navigator) {
				try {
					navigator.mediaSession.metadata = new MediaMetadata({
						title: song.title || "未知歌曲",
						artist: song.artist || "未知艺术家",
						album: song.album || "未知专辑",
					});

					// 更新播放状态
					navigator.mediaSession.playbackState = "playing";
				} catch (error) {
					console.error("更新媒体会话元数据失败:", error);
				}
			}
		},

		// 设置播放状态
		setPlaying(isPlaying) {
			this.playing = isPlaying;

			// 更新媒体会话播放状态
			if ("mediaSession" in navigator) {
				navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
			}
		},

		// 播放或暂停
		togglePlay() {
			if (this.currentSong) {
				this.playing = !this.playing;
			}
		},

		// 暂停播放
		pause() {
			this.playing = false;
		},

		// 增加当前歌曲的播放次数
		async incrementCurrentSongPlayCount() {
			if (this.currentSong && this.currentSong.id) {
				try {
					const result = await window.electronAPI.incrementPlayCount(
						this.currentSong.id
					);
					if (result.success) {
						console.log(
							`歌曲 ${this.currentSong.title} 播放次数已增加，当前次数：${result.song.playCount}`
						);
						// 更新当前歌曲对象的播放次数
						this.currentSong.playCount = result.song.playCount;

						// 使用media store的updateSongPlayCount方法更新媒体库中的歌曲播放次数
						const mediaStore = useMediaStore();
						const updateSuccess = mediaStore.updateSongPlayCount(
							this.currentSong.id,
							result.song.playCount
						);
						if (updateSuccess) {
							console.log("媒体库中的歌曲播放次数已更新");
						}

						return result; // 返回结果，以便调用者知道操作是否成功
					} else {
						console.error("增加播放次数失败:", result.error);
						return result;
					}
				} catch (error) {
					console.error("增加播放次数时出错:", error);
					return { success: false, error: error.message };
				}
			}
			return { success: false, error: "没有正在播放的歌曲" };
		},

		// 播放下一首
		async playNext(isPlaybackEnd = false) {
			if (!this.currentSong || this.playlist.length === 0) {
				return;
			}

			// 保存当前歌曲的ID，因为在异步操作过程中this.currentSong可能会改变
			const currentSongId = this.currentSong.id;
			const currentSongTitle = this.currentSong.title;

			// 如果是因为播放结束而调用，则先增加播放次数，并等待操作完成
			if (isPlaybackEnd) {
				try {
					console.log(
						`歌曲 ${currentSongTitle} (ID: ${currentSongId}) 播放完成，增加播放次数`
					);
					// 等待播放次数增加完成
					await this.incrementCurrentSongPlayCount();
				} catch (error) {
					console.error(`增加歌曲 ${currentSongTitle} 播放次数失败:`, error);
				}
			}

			// 在单曲循环模式下，任何"下一首"操作（无论是自动结束还是手动点击）都应重新播放当前歌曲
			if (this.playMode === PlayMode.REPEAT_ONE) {
				this.seek(0);
				return;
			}

			let nextIndex;

			// 根据播放模式确定下一首歌
			switch (this.playMode) {
				case PlayMode.RANDOM:
					if (this.playlist.length > 1) {
						const mediaStore = useMediaStore();
						const playlistWithDetails = this.playlist
							.map((songId) => mediaStore.songs.find((s) => s.id === songId))
							.filter(Boolean); // 过滤掉在当前歌曲列表中找不到的歌曲

						// 如果无法获取到歌曲详情，则退回到简单随机
						if (playlistWithDetails.length < 2) {
							nextIndex = Math.floor(Math.random() * this.playlist.length);
							while (nextIndex === this.currentIndex) {
								nextIndex = Math.floor(Math.random() * this.playlist.length);
							}
							break;
						}

						// --- 加权随机算法 ---
						let weightedSongs = playlistWithDetails.map((song) => ({
							id: song.id,
							// 权重与播放次数成反比，播放次数越少，权重越高
							// 使用次数的平方来急剧增加高播放次数歌曲的"惩罚"
							// 增加 `|| 0` 来处理 playCount 可能为 undefined 的情况
							weight: 1 / ((song.playCount || 0) ** 2 + 1),
						}));

						// 如果当前歌曲也在加权列表中，暂时将其权重设为0，以避免立即重复播放
						const currentSongInWeightedList = weightedSongs.find(
							(s) => s.id === currentSongId
						);
						if (currentSongInWeightedList) {
							currentSongInWeightedList.weight = 0;
						}

						const totalWeight = weightedSongs.reduce(
							(sum, song) => sum + song.weight,
							0
						);

						if (totalWeight === 0) {
							// 如果所有歌曲权重都为0（例如只有一首歌或所有歌都播放过很多次），则随机选一首
							const availableSongs = weightedSongs.filter(
								(s) => s.id !== currentSongId
							);
							if (availableSongs.length > 0) {
								const randomSong =
									availableSongs[
										Math.floor(Math.random() * availableSongs.length)
									];
								nextIndex = this.playlist.indexOf(randomSong.id);
							} else {
								// 如果没有其他歌曲可选，就播放当前歌曲
								nextIndex = this.currentIndex;
							}
						} else {
							let random = Math.random() * totalWeight;

							let chosenSongId = null;
							for (const song of weightedSongs) {
								random -= song.weight;
								if (random <= 0) {
									chosenSongId = song.id;
									break;
								}
							}
							nextIndex = this.playlist.indexOf(chosenSongId);
						}
					} else {
						nextIndex = 0;
					}
					break;

				case PlayMode.SEQUENCE:
				default:
					// 顺序模式下播放下一首，到末尾则回到开头
					nextIndex = (this.currentIndex + 1) % this.playlist.length;
					break;
			}

			// 设置下一首为当前播放歌曲
			this.currentIndex = nextIndex;
			const nextSongId = this.playlist[nextIndex];
			this.savePlayerState(); // 保存当前索引变更

			// 这里需要通过 API 获取歌曲完整信息
			try {
				const result = await window.electronAPI.getSongById(nextSongId);
				if (result.success && result.song) {
					console.log(
						`播放下一首歌曲: ${result.song.title} (ID: ${result.song.id})`
					);
					this.currentSong = result.song;
					this.playing = true;
					this.currentTime = 0;
					// 加载歌词
					this.loadLyrics(result.song.id);
				} else {
					console.error(`获取下一首歌曲信息失败:`, result.error);
				}
			} catch (error) {
				console.error(`播放下一首歌曲时出错:`, error);
			}
		},

		// 播放上一首
		playPrevious() {
			if (!this.currentSong || this.playlist.length === 0) {
				return;
			}

			// 在单曲循环模式下，任何"上一首"操作都应重新播放当前歌曲
			if (this.playMode === PlayMode.REPEAT_ONE) {
				this.seek(0);
				return;
			}

			let prevIndex;

			// 根据播放模式确定上一首歌
			switch (this.playMode) {
				case PlayMode.RANDOM:
					// 随机播放模式下，上一首也是随机的（同样使用加权随机）
					if (this.playlist.length > 1) {
						const mediaStore = useMediaStore();
						const playlistWithDetails = this.playlist
							.map((songId) => mediaStore.songs.find((s) => s.id === songId))
							.filter(Boolean);

						if (playlistWithDetails.length < 2) {
							prevIndex = Math.floor(Math.random() * this.playlist.length);
							while (prevIndex === this.currentIndex) {
								prevIndex = Math.floor(Math.random() * this.playlist.length);
							}
							break;
						}

						let weightedSongs = playlistWithDetails.map((song) => ({
							id: song.id,
							// 增加 `|| 0` 来处理 playCount 可能为 undefined 的情况
							weight: 1 / ((song.playCount || 0) ** 2 + 1),
						}));

						const currentSongInWeightedList = weightedSongs.find(
							(s) => s.id === this.currentSong.id
						);
						if (currentSongInWeightedList) {
							currentSongInWeightedList.weight = 0;
						}

						const totalWeight = weightedSongs.reduce(
							(sum, song) => sum + song.weight,
							0
						);

						if (totalWeight === 0) {
							const availableSongs = weightedSongs.filter(
								(s) => s.id !== this.currentSong.id
							);
							if (availableSongs.length > 0) {
								const randomSong =
									availableSongs[
										Math.floor(Math.random() * availableSongs.length)
									];
								prevIndex = this.playlist.indexOf(randomSong.id);
							} else {
								prevIndex = this.currentIndex;
							}
						} else {
							let random = Math.random() * totalWeight;
							let chosenSongId = null;
							for (const song of weightedSongs) {
								random -= song.weight;
								if (random <= 0) {
									chosenSongId = song.id;
									break;
								}
							}
							prevIndex = this.playlist.indexOf(chosenSongId);
						}
					} else {
						prevIndex = 0;
					}
					break;

				case PlayMode.SEQUENCE:
				case PlayMode.REPEAT_ONE: // 手动点击上一首时
				default:
					// 顺序模式下播放上一首，到开头则跳到末尾
					prevIndex =
						(this.currentIndex - 1 + this.playlist.length) %
						this.playlist.length;
					break;
			}

			// 设置上一首为当前播放歌曲
			this.currentIndex = prevIndex;
			const prevSongId = this.playlist[prevIndex];
			this.savePlayerState(); // 保存当前索引变更

			// 这里需要通过 API 获取歌曲完整信息
			window.electronAPI.getSongById(prevSongId).then((result) => {
				if (result.success && result.song) {
					this.currentSong = result.song;
					this.playing = true;
					this.currentTime = 0;
					// 加载歌词
					this.loadLyrics(result.song.id);
				}
			});
		},

		// 跳转到指定播放时间
		seek(time) {
			if (!this.currentSong || isNaN(time)) {
				return;
			}

			// 确保时间在有效范围内
			const newTime = Math.max(0, Math.min(time, this.currentSong.duration));

			// 如果是从结束位置跳转到开始位置（单曲循环模式下），增加播放次数
			const isFromEndToStart =
				this.currentTime > 0 &&
				this.currentTime >= this.currentSong.duration - 0.5 &&
				newTime < 0.5;

			// 如果跳转到歌曲结束位置（接近结束），增加播放次数
			if (
				(newTime > 0 &&
					this.currentSong.duration > 0 &&
					(newTime >= this.currentSong.duration ||
						this.currentSong.duration - newTime < 0.5)) ||
				isFromEndToStart
			) {
				this.incrementCurrentSongPlayCount();
			}

			// 锁定位置，防止定时器立即覆盖
			if (window.isPositionLocked !== undefined) {
				if (window.positionLockTimeout) {
					clearTimeout(window.positionLockTimeout);
				}
				window.isPositionLocked = true;

				window.positionLockTimeout = setTimeout(() => {
					window.isPositionLocked = false;
				}, 300); // 锁定300毫秒
			}

			// 使用updateCurrentTime方法更新时间，这样会同时更新歌词索引
			this.updateCurrentTime(newTime);

			// 如果window.audioContext可用，直接更新Web Audio API状态
			if (window.audioContext && window.decodedAudioBuffer) {
				try {
					// 停止当前音频源，但需要检查它是否已经开始
					if (window.sourceNode) {
						try {
							window.sourceNode.onended = null;
							if (window.isAudioPlaying) {
								// 只有在实际播放中才调用stop
								window.sourceNode.stop();
							}
						} catch (error) {
							console.error("停止音频源时出错:", error);
						}
					}

					// 创建新的音频源
					window.sourceNode = window.audioContext.createBufferSource();
					window.sourceNode.buffer = window.decodedAudioBuffer;
					if (window.gainNode) window.sourceNode.connect(window.gainNode);

					// 设置onended回调
					window.sourceNode.onended = () => {
						if (window.isAudioPlaying) {
							window.isAudioPlaying = false;

							// 检查是否是单曲循环模式
							if (this.playMode === PlayMode.REPEAT_ONE) {
								// 延迟一小段时间再重新开始播放，避免可能的竞态条件
								setTimeout(() => {
									if (this.playing && this.playMode === PlayMode.REPEAT_ONE) {
										this.seek(0);
									}
								}, 50);
							} else {
								this.playNext(true);
							}
						}
					};

					// 如果正在播放，从新位置开始播放
					if (this.playing) {
						window.sourceNode.start(0, newTime);
						window.songStartTimeInAc = window.audioContext.currentTime;
						window.isAudioPlaying = true;
					} else {
						// 如果暂停中，只更新偏移量，不启动播放
						window.isAudioPlaying = false;
					}

					// 无论是播放还是暂停，都更新起始偏移量
					window.songStartOffset = newTime;
				} catch (error) {
					console.error("在seek方法中更新Web Audio API状态失败:", error);
				}
			}

			// 同时通过IPC调用主进程的seek方法
			window.electronAPI
				.playerSeek(newTime)
				.then(() => {})
				.catch((error) => console.error("seek方法调用主进程seek失败:", error));
		},

		// 更新当前播放时间
		updateCurrentTime(time) {
			this.currentTime = time;

			// 更新歌词索引
			if (this.hasLyrics && this.lyrics.length > 0) {
				this.updateCurrentLyricIndex();
			}

			// 更新媒体会话播放位置
			if (
				"mediaSession" in navigator &&
				"setPositionState" in navigator.mediaSession
			) {
				try {
					navigator.mediaSession.setPositionState({
						duration: this.currentSong?.duration || 0,
						position: this.currentTime || 0,
						playbackRate: 1.0,
					});
				} catch (error) {
					console.error("更新媒体会话播放位置失败:", error);
				}
			}
		},

		// 设置播放模式
		setPlayMode(mode) {
			const oldMode = this.playMode;
			this.playMode = mode;
			this.savePlayerState(); // 保存状态变更

			// 如果切换到单曲循环模式，检查歌曲是否即将结束
			if (mode === PlayMode.REPEAT_ONE) {
				// 如果当前歌曲即将结束（剩余时间不足0.5秒），则手动重新开始播放
				if (
					this.currentSong &&
					this.currentTime > 0 &&
					this.currentSong.duration > 0
				) {
					const remainingTime = this.currentSong.duration - this.currentTime;
					if (remainingTime < 0.5) {
						this.seek(0);
					}
				}
			}
		},

		// 设置音量
		setVolume(volume) {
			this.volume = Math.max(0, Math.min(1, volume));
			this.savePlayerState(); // 保存状态变更
		},

		// 切换静音
		toggleMute() {
			this.muted = !this.muted;
		},

		// 设置静音状态
		setMuted(muted) {
			this.muted = muted;
			this.savePlayerState(); // 保存状态变更
		},

		// 清空当前歌曲
		clearCurrentSong() {
			this.currentSong = null;
			this.playing = false;
			this.currentTime = 0;
		},

		// 清空播放列表
		clearPlaylist() {
			this.playlist = [];
			this.currentIndex = -1;
			this.currentSong = null;
			this.playing = false;
			this.currentTime = 0;
			this.savePlayerState(); // 保存状态变更
		},

		// 验证当前播放状态，确保歌曲存在
		async validateCurrentSong() {
			if (!this.currentSong) return false;

			try {
				// 尝试通过ID获取歌曲，验证其是否存在
				const result = await window.electronAPI.getSongById(
					this.currentSong.id
				);
				if (result.success && result.song) {
					// 更新歌曲信息，以防有变化
					this.currentSong = result.song;
					return true;
				} else {
					console.warn(
						`当前播放的歌曲ID ${this.currentSong.id} 不存在于数据库中`
					);
					// 歌曲不存在，清空当前状态
					this.clearCurrentSong();
					return false;
				}
			} catch (error) {
				console.error("验证当前歌曲时出错:", error);
				return false;
			}
		},

		// 验证播放列表中的所有歌曲，移除不存在的歌曲
		async validatePlaylist() {
			if (!this.playlist || this.playlist.length === 0) return;

			console.log("正在验证播放列表中的歌曲...");
			const validatedPlaylist = [];
			let needsUpdate = false;
			let currentIndexAdjustment = 0;

			// 检查每一首歌曲是否存在
			for (let i = 0; i < this.playlist.length; i++) {
				const songId = this.playlist[i];
				try {
					const result = await window.electronAPI.getSongById(songId);
					if (result.success && result.song) {
						validatedPlaylist.push(songId);
					} else {
						console.warn(
							`播放列表中的歌曲ID ${songId} 不存在于数据库中，将被移除`
						);
						needsUpdate = true;
						// 如果移除的歌曲在当前播放歌曲之前，需要调整当前索引
						if (i < this.currentIndex) {
							currentIndexAdjustment++;
						}
					}
				} catch (error) {
					console.error(`验证播放列表歌曲 ${songId} 时出错:`, error);
					// 出错时保守处理，保留该歌曲ID
					validatedPlaylist.push(songId);
				}
			}

			// 如果有歌曲被移除，更新播放列表
			if (needsUpdate) {
				console.log(
					`播放列表已更新，移除了 ${
						this.playlist.length - validatedPlaylist.length
					} 首无效歌曲`
				);
				this.playlist = validatedPlaylist;

				// 调整当前索引
				if (this.currentIndex >= 0) {
					this.currentIndex = Math.max(
						0,
						this.currentIndex - currentIndexAdjustment
					);
					// 如果当前索引超出了新播放列表的范围
					if (this.currentIndex >= this.playlist.length) {
						this.currentIndex =
							this.playlist.length > 0 ? this.playlist.length - 1 : -1;
					}
				}

				// 如果播放列表为空，清空当前歌曲
				if (this.playlist.length === 0) {
					this.clearCurrentSong();
				}

				// 保存更新后的状态
				this.savePlayerState();
				return true;
			}

			return false;
		},

		// 添加歌曲到播放列表
		addToPlaylist(songId) {
			if (!this.playlist.includes(songId)) {
				this.playlist.push(songId);
			}
		},

		// 从播放列表中移除歌曲
		removeFromPlaylist(index) {
			if (index >= 0 && index < this.playlist.length) {
				const isCurrentlyPlaying = index === this.currentIndex;

				// 从播放列表中移除
				this.playlist.splice(index, 1);

				// 如果移除的是当前播放歌曲
				if (isCurrentlyPlaying) {
					if (this.playlist.length > 0) {
						// 播放下一首 (或当前位置的歌曲)
						this.currentIndex = index % this.playlist.length;
						const nextSongId = this.playlist[this.currentIndex];
						window.electronAPI.getSongById(nextSongId).then((result) => {
							if (result.success && result.song) {
								this.currentSong = result.song;
								this.playing = true;
								this.currentTime = 0;
							}
						});
					} else {
						// 如果播放列表已空，重置播放器
						this.clearPlaylist();
					}
				} else if (index < this.currentIndex) {
					// 如果移除的是当前歌曲之前的歌曲，更新索引
					this.currentIndex--;
				}
			}
		},

		// 播放列表中的歌曲，始终用传入的歌曲列表替换当前播放列表
		playSongFromList({ listId, songIds, songToPlayId }) {
			// 验证输入参数
			if (!songIds || !Array.isArray(songIds) || songIds.length === 0) {
				console.error("播放列表为空或无效");
				return;
			}

			if (!songToPlayId) {
				console.error("未指定要播放的歌曲ID");
				return;
			}

			// 确保要播放的歌曲ID在提供的歌曲列表中
			const songIndex = songIds.indexOf(songToPlayId);
			if (songIndex === -1) {
				console.warn(
					`要播放的歌曲ID ${songToPlayId} 不在提供的歌曲列表中，将被添加`
				);
				songIds.push(songToPlayId);
			}

			// 始终替换整个播放列表
			console.log("替换播放列表，共 " + songIds.length + " 首歌曲");
			this.playlist = [...songIds];
			this.currentListId = listId;

			// 设置当前播放索引
			const newIndex = this.playlist.indexOf(songToPlayId);
			if (newIndex !== -1) {
				this.currentIndex = newIndex;
			}

			this.savePlayerState(); // 保存播放列表变更

			// 找到要播放的歌曲的完整信息
			window.electronAPI.getSongById(songToPlayId).then((result) => {
				if (result.success && result.song) {
					this.playSong(result.song);
				} else {
					console.error(`无法获取歌曲ID ${songToPlayId} 的信息，可能已被删除`);
					// 如果歌曲获取失败，则清空播放器
					this.currentSong = null;
					this.playing = false;
					this.currentTime = 0;
					this.savePlayerState(); // 保存状态变更

					// 从播放列表中移除无效的歌曲ID
					const index = this.playlist.indexOf(songToPlayId);
					if (index !== -1) {
						this.playlist.splice(index, 1);
						this.savePlayerState(); // 保存播放列表变更
					}
				}
			});
		},

		// 加载歌词
		async loadLyrics(songId = null) {
			try {
				// 清空当前歌词
				this.resetLyrics();

				// 如果没有指定歌曲ID，则使用当前歌曲
				const targetSongId =
					songId || (this.currentSong ? this.currentSong.id : null);
				if (!targetSongId) return;

				// 从主进程获取歌词
				const result = await window.electronAPI.getLyrics(targetSongId);

				if (result.success) {
					// 检查歌词数据结构
					if (Array.isArray(result.lyrics)) {
						// 确保每个歌词行都有正确的结构
						this.lyrics = result.lyrics
							.map((line) => {
								// 1. Handle non-objects first
								if (typeof line !== "object" || line === null) {
									const text = String(line || "");
									if (!text.trim()) return null;
									return { time: -1, text };
								}

								// 2. It's an object, get time
								const time = typeof line.time === "number" ? line.time : -1;
								let rawText = line.text;

								// 3. Handle nested objects in 'text' field
								if (rawText && typeof rawText === "object") {
									rawText = rawText.text || JSON.stringify(rawText);
								}

								// 4. Ensure rawText is a string
								const text = String(rawText || "");

								// 5. Filter out empty/whitespace lines
								if (!text.trim()) {
									return null;
								}

								// 6. Return the final, clean object
								return {
									time,
									text,
									...("timeText" in line ? { timeText: line.timeText } : {}),
								};
							})
							.filter(Boolean); // This removes all the nulls
					} else {
						this.lyrics = [];
					}

					this.hasLyrics = this.lyrics.length > 0;
					this.lyricMetadata = result.metadata || {};
					this.lyricsFormat = result.format;
					this.lyricsSource = result.source;

					// 立即更新当前歌词索引
					this.updateCurrentLyricIndex();
				} else {
					this.resetLyrics();
				}

				return result.success;
			} catch (error) {
				this.resetLyrics();
				return false;
			}
		},

		// 重置歌词状态
		resetLyrics() {
			this.lyrics = [];
			this.currentLyricIndex = -1;
			this.hasLyrics = false;
			this.lyricMetadata = {};
			this.lyricsFormat = null;
			this.lyricsSource = null;
		},

		// 根据当前播放时间更新歌词索引
		updateCurrentLyricIndex() {
			// 如果位置被锁定，且已经设置了currentLyricIndex，跳过更新
			if (window.isPositionLocked && this.currentLyricIndex >= 0) {
				return;
			}

			if (!this.lyrics || this.lyrics.length === 0) {
				this.currentLyricIndex = -1;
				return;
			}

			const currentTimeMs = this.currentTime * 1000;
			const adjustedTime = currentTimeMs + this.lyricsSyncOffset;

			// 检查歌词时间是否有效
			const hasValidTiming = this.lyrics.some((line) => line.time >= 0);
			if (!hasValidTiming) {
				// 如果没有任何有效时间戳的歌词行，根据歌曲播放进度计算当前行
				const totalLines = this.lyrics.length;
				const songDuration = this.currentSong
					? this.currentSong.duration * 1000
					: 0;

				if (songDuration > 0 && totalLines > 0) {
					// 根据播放比例计算当前行
					const playRatio = Math.min(
						1,
						Math.max(0, currentTimeMs / songDuration)
					);
					this.currentLyricIndex = Math.floor(playRatio * totalLines);
				} else {
					this.currentLyricIndex = 0;
				}
				return;
			}

			// 如果当前时间小于第一句歌词时间
			if (this.lyrics[0].time > adjustedTime) {
				this.currentLyricIndex = -1;
				return;
			}

			// 如果已经到达最后一句歌词
			if (this.lyrics[this.lyrics.length - 1].time <= adjustedTime) {
				this.currentLyricIndex = this.lyrics.length - 1;
				return;
			}

			// 顺序查找当前歌词（对于数据量较小的情况更有效）
			for (let i = 0; i < this.lyrics.length - 1; i++) {
				if (
					this.lyrics[i].time <= adjustedTime &&
					this.lyrics[i + 1].time > adjustedTime
				) {
					this.currentLyricIndex = i;
					return;
				}
			}

			// 如果上面的查找失败，使用二分查找作为备选
			let left = 0;
			let right = this.lyrics.length - 1;

			while (left <= right) {
				const mid = Math.floor((left + right) / 2);

				if (
					this.lyrics[mid].time <= adjustedTime &&
					(mid === this.lyrics.length - 1 ||
						this.lyrics[mid + 1].time > adjustedTime)
				) {
					this.currentLyricIndex = mid;
					return;
				} else if (this.lyrics[mid].time > adjustedTime) {
					right = mid - 1;
				} else {
					left = mid + 1;
				}
			}

			// 如果都找不到，返回最近的行
			this.currentLyricIndex = Math.max(
				0,
				Math.min(this.lyrics.length - 1, left)
			);
		},

		// 设置歌词同步偏移量
		setLyricsSyncOffset(offset) {
			this.lyricsSyncOffset = offset;
			this.updateCurrentLyricIndex();
		},

		// 调整歌词同步
		adjustLyricsSyncOffset(adjustment) {
			this.lyricsSyncOffset += adjustment;
			this.updateCurrentLyricIndex();
		},

		// 从歌词位置跳转播放
		seekToLyricPosition(lyricIndex) {
			if (!this.lyrics || lyricIndex < 0 || lyricIndex >= this.lyrics.length)
				return;

			const targetTime = this.lyrics[lyricIndex].time - this.lyricsSyncOffset;
			if (targetTime >= 0) {
				// 转换为秒
				const seekTimeInSeconds = targetTime / 1000;

				// 锁定位置，防止定时器立即覆盖
				if (window.isPositionLocked !== undefined) {
					if (window.positionLockTimeout) {
						clearTimeout(window.positionLockTimeout);
					}
					window.isPositionLocked = true;

					window.positionLockTimeout = setTimeout(() => {
						window.isPositionLocked = false;
					}, 500); // 锁定500毫秒，比普通seek长一些
				}

				// 立即设置高亮的歌词行，确保UI立即响应
				this.currentLyricIndex = lyricIndex;

				// 设置播放时间，这会间接调用updateCurrentTime，但已经设置了高亮行，不会覆盖
				this.updateCurrentTime(seekTimeInSeconds);

				// 设置Web Audio API状态
				if (window.audioContext && window.decodedAudioBuffer) {
					try {
						// 无论是否正在播放，都停止当前音频源
						if (window.sourceNode) {
							try {
								window.sourceNode.onended = null;
								if (window.isAudioPlaying) {
									// 只在实际播放中才调用stop
									window.sourceNode.stop();
								}
							} catch (error) {
								console.error("停止音频源时出错:", error);
							}
						}

						// 创建新的音频源
						window.sourceNode = window.audioContext.createBufferSource();
						window.sourceNode.buffer = window.decodedAudioBuffer;
						if (window.gainNode) window.sourceNode.connect(window.gainNode);

						// 设置onended回调
						window.sourceNode.onended = () => {
							// 只有在不是被手动停止的情况下才播放下一首
							if (window.isAudioPlaying) {
								window.isAudioPlaying = false;
								this.playNext(true);
							}
						};

						// 无论之前是什么状态，都开始播放
						window.sourceNode.start(0, seekTimeInSeconds);
						window.songStartTimeInAc = window.audioContext.currentTime;
						window.isAudioPlaying = true;

						// 确保播放状态也被更新
						this.playing = true;

						// 更新起始偏移量
						window.songStartOffset = seekTimeInSeconds;
					} catch (error) {
						console.error("更新Web Audio API播放位置失败:", error);
					}
				}

				// 同时通过IPC调用主进程的seek方法
				window.electronAPI
					.playerSeek(seekTimeInSeconds)
					.then(() => {})
					.catch((error) => console.error("歌词跳转失败:", error));
			}

			// 点击歌词行后，恢复自动滚动
			this.isAutoScrolling = true;
		},

		// 切换歌词页面显示状态
		toggleLyricsDisplay() {
			this.showLyrics = !this.showLyrics;
		},

		// 显示歌词页面
		showLyricsDisplay() {
			this.showLyrics = true;
		},

		// 隐藏歌词页面
		hideLyricsDisplay() {
			this.showLyrics = false;
			// 关闭歌词页面时，恢复自动滚动状态
			this.isAutoScrolling = true;
		},

		// 设置歌词自动滚动状态
		setAutoScrolling(isAuto) {
			this.isAutoScrolling = isAuto;
		},

		// 重置播放器状态
		resetPlayerState() {
			this.currentSong = null;
			this.playing = false;
			this.currentTime = 0;
			this.playlist = [];
			this.currentIndex = -1;
			this.resetLyrics(); // 调用已有的歌词重置方法
			this.savePlayerState(); // 保存重置后的状态

			// 停止当前音频播放
			if (window.sourceNode) {
				try {
					window.sourceNode.onended = null;
					if (window.isAudioPlaying) {
						window.sourceNode.stop();
					}
					window.sourceNode = null;
					window.isAudioPlaying = false;
				} catch (error) {
					console.error("重置播放器状态时停止音频失败:", error);
				}
			}

			// 通知主进程停止播放
			window.electronAPI.playerStop().catch((error) => {
				console.error("通知主进程停止播放失败:", error);
			});
		},
	},
});
