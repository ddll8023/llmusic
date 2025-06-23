<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { usePlayerStore, PlayMode } from '../store/player';
import { useUiStore } from '../store/ui';
import defaultCoverImage from '../assets/default_img.jpg';
import Icon from '../components/Icon.vue';

const playerStore = usePlayerStore();
const uiStore = useUiStore();
const timelineRef = ref(null);
const volumeRef = ref(null);
const coverImage = ref(null);
const isLoadingCover = ref(false);
const coverLoadError = ref(false);
const playbackError = ref(null);
const isDraggingVolume = ref(false);

let scheduledTime = 0;

// Web Audio API 相关状态
// 将这些变量暴露到window对象，以便其他组件可以访问
// 如果已经存在，则不重新创建，避免多个组件初始化时出现问题
if (!window.audioContext) window.audioContext = null;
if (!window.sourceNode) window.sourceNode = null; // 当前的音频源
if (!window.decodedAudioBuffer) window.decodedAudioBuffer = null; // 解码后的完整音频缓冲区
if (!window.songStartTimeInAc) window.songStartTimeInAc = 0; // 歌曲在AudioContext时间线中开始播放的时间
if (!window.songStartOffset) window.songStartOffset = 0; // 歌曲开始播放的偏移量（用于跳转或暂停）
if (!window.isAudioPlaying) window.isAudioPlaying = false; // 自定义一个播放状态，因为AudioContext的state不完全同步
if (!window.gainNode) window.gainNode = null;
if (!window.isPositionLocked) window.isPositionLocked = false; // 新增：防止播放位置被意外重置的锁
if (!window.positionLockTimeout) window.positionLockTimeout = null; // 新增：用于清除位置锁定的定时器
if (!window.isSeekingFromTimer) window.isSeekingFromTimer = false; // 新增：用于防止定时器重复触发seek

// 同时保留本地引用，以便在组件内使用
let audioContext = window.audioContext;
let sourceNode = window.sourceNode;
let decodedAudioBuffer = window.decodedAudioBuffer;
let songStartTimeInAc = window.songStartTimeInAc;
let songStartOffset = window.songStartOffset;
let isAudioPlaying = window.isAudioPlaying;
let gainNode = window.gainNode;

// MediaSession API 相关代码
const initMediaSession = () => {
  if ('mediaSession' in navigator) {
    // 设置MediaSession事件处理
    navigator.mediaSession.setActionHandler('play', () => {
      if (!playerStore.playing) {
        playerStore.setPlaying(true);
      }
    });

    navigator.mediaSession.setActionHandler('pause', () => {
      if (playerStore.playing) {
        playerStore.setPlaying(false);
      }
    });

    navigator.mediaSession.setActionHandler('previoustrack', () => {
      playerStore.playPrevious();
    });

    navigator.mediaSession.setActionHandler('nexttrack', () => {
      playerStore.playNext();
    });

    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) {
        playerStore.seek(details.seekTime);
      }
    });

    // 尝试设置其他可选的媒体会话处理程序
    try {
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        const skipTime = details.seekOffset || 10;
        const newTime = Math.max(0, playerStore.currentTime - skipTime);
        playerStore.seek(newTime);
      });

      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        const skipTime = details.seekOffset || 10;
        const newTime = Math.min(
          playerStore.currentSong ? playerStore.currentSong.duration : 0, 
          playerStore.currentTime + skipTime
        );
        playerStore.seek(newTime);
      });
    } catch (error) {
      console.log('不支持的媒体会话操作:', error);
    }
  }
};

// 更新媒体会话元数据
const updateMediaSessionMetadata = () => {
  if (!('mediaSession' in navigator) || !playerStore.currentSong) return;

  const song = playerStore.currentSong;
  
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title || '未知歌曲',
      artist: song.artist || '未知艺术家',
      album: song.album || '未知专辑',
      artwork: [
        {
          src: coverImage.value || defaultCoverImage,
          sizes: '512x512',
          type: 'image/jpeg'
        }
      ]
    });
  } catch (error) {
    console.error('更新媒体会话元数据失败:', error);
  }
};

// 更新媒体会话播放状态
const updateMediaSessionPlaybackState = () => {
  if (!('mediaSession' in navigator)) return;
  
  // 设置播放状态
  if (playerStore.playing) {
    navigator.mediaSession.playbackState = 'playing';
  } else {
    navigator.mediaSession.playbackState = 'paused';
  }
};

// 更新媒体会话播放位置
const updateMediaSessionPosition = () => {
  if (!('mediaSession' in navigator) || !playerStore.currentSong) return;

  try {
    if ('setPositionState' in navigator.mediaSession) {
      navigator.mediaSession.setPositionState({
        duration: playerStore.currentSong.duration || 0,
        position: playerStore.currentTime || 0,
        playbackRate: 1.0
      });
    }
  } catch (error) {
    console.error('更新媒体会话播放位置失败:', error);
  }
};

// 初始化Web Audio API
const initAudioContext = () => {
    if (!window.audioContext) {
        try {
            window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            window.gainNode = window.audioContext.createGain();
            window.gainNode.connect(window.audioContext.destination);
            scheduledTime = window.audioContext.currentTime;

            // 更新本地引用
            audioContext = window.audioContext;
            gainNode = window.gainNode;
        } catch (e) {
            console.error("Web Audio API is not supported in this browser.", e);
            playbackError.value = "浏览器不支持音频播放";
        }
    }
};

const playAudioBuffer = (offset = 0) => {
    if (!window.decodedAudioBuffer || !window.audioContext) {
        return;
    }

    // 如果有正在播放的，先停掉
    if (window.sourceNode) {
        window.sourceNode.onended = null;
        window.sourceNode.stop();
    }

    window.sourceNode = window.audioContext.createBufferSource();
    window.sourceNode.buffer = window.decodedAudioBuffer;
    window.sourceNode.connect(window.gainNode);

    // 记录当前播放模式，用于日志记录
    const currentPlayMode = playerStore.playMode;

    window.sourceNode.onended = async () => {
        const wasPlaying = window.isAudioPlaying;
        const currentMode = playerStore.playMode;

        if (wasPlaying) {
            window.isAudioPlaying = false;
            
            // 保存当前歌曲信息，避免异步操作中丢失
            const currentSongId = playerStore.currentSong?.id;
            const currentSongTitle = playerStore.currentSong?.title;
            
            console.log(`onended: 歌曲 ${currentSongTitle} (ID: ${currentSongId}) 播放完成`);

            try {
                // 检查是否是单曲循环模式
                if (currentMode === PlayMode.REPEAT_ONE) {
                    // 延迟一小段时间再重新开始播放，避免可能的竞态条件
                    setTimeout(() => {
                        if (playerStore.playing && playerStore.playMode === PlayMode.REPEAT_ONE) {
                            playerStore.seek(0);
                        }
                    }, 50);
                } else {
                    // 非单曲循环模式，播放下一首
                    // 注意：playNext内部会增加播放次数，所以这里不需要再调用incrementCurrentSongPlayCount
                    await playerStore.playNext(true);
                }
            } catch (error) {
                console.error(`处理歌曲播放完成时出错:`, error);
                // 即使出错也尝试继续播放
                if (currentMode === PlayMode.REPEAT_ONE) {
                    setTimeout(() => playerStore.seek(0), 50);
                } else {
                    playerStore.playNext(true);
                }
            }
        }
    };

    const clippedOffset = Math.max(0, Math.min(offset, window.decodedAudioBuffer.duration));
    window.sourceNode.start(0, clippedOffset);

    window.songStartTimeInAc = window.audioContext.currentTime;
    window.songStartOffset = clippedOffset;
    window.isAudioPlaying = true;

    // 更新本地引用
    sourceNode = window.sourceNode;
    songStartTimeInAc = window.songStartTimeInAc;
    songStartOffset = window.songStartOffset;
    isAudioPlaying = window.isAudioPlaying;
};

// 重置音频播放器状态
const resetAudioPlayer = () => {
    if (window.sourceNode) {
        window.isAudioPlaying = false; // 标记为手动停止
        window.sourceNode.onended = null;
        window.sourceNode.stop();
        window.sourceNode = null;
    }
    window.decodedAudioBuffer = null;
    window.songStartTimeInAc = 0;
    window.songStartOffset = 0;

    // 更新本地引用
    sourceNode = window.sourceNode;
    decodedAudioBuffer = window.decodedAudioBuffer;
    songStartTimeInAc = window.songStartTimeInAc;
    songStartOffset = window.songStartOffset;
    isAudioPlaying = window.isAudioPlaying;
};

// 格式化时间
const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds === null) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// 进度条百分比
const progressPercentage = computed(() => {
    if (playerStore.currentSong && playerStore.currentSong.duration) {
        return `${(playerStore.currentTime / playerStore.currentSong.duration) * 100}%`;
    }
    return '0%';
});

// 音量条百分比
const volumePercentage = computed(() => {
    return `${playerStore.volume * 100}%`;
});

// 点击进度条设置播放时间
const setPlayTime = (event) => {
    if (!timelineRef.value || !playerStore.currentSong || !window.decodedAudioBuffer) return;

    const rect = timelineRef.value.getBoundingClientRect();
    const percent = (event.clientX - rect.left) / rect.width;
    const newTime = percent * window.decodedAudioBuffer.duration;

    // 锁定位置，防止定时器立即覆盖
    lockPosition();

    // 直接使用seek方法，它会更新UI和音频状态
    playerStore.seek(newTime);
};

// 点击音量条设置音量
const setVolume = (event) => {
    if (!volumeRef.value) return;

    const rect = volumeRef.value.getBoundingClientRect();
    const percent = (event.clientX - rect.left) / rect.width;
    const newVolume = Math.max(0, Math.min(1, percent));

    playerStore.setVolume(newVolume);
};

// 切换静音状态
const toggleMute = () => {
    playerStore.setMuted(!playerStore.muted);
};

// 开始音量拖动
const startVolumeChange = (event) => {
    isDraggingVolume.value = true;
    updateVolume(event);
    document.addEventListener('mousemove', updateVolume);
    document.addEventListener('mouseup', endVolumeChange);
};

// 更新音量（用于点击和拖动）
const updateVolume = (event) => {
    if (!volumeRef.value) return;

    const rect = volumeRef.value.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    playerStore.setVolume(percent);
};

// 结束音量拖动
const endVolumeChange = () => {
    isDraggingVolume.value = false;
    document.removeEventListener('mousemove', updateVolume);
    document.removeEventListener('mouseup', endVolumeChange);
};

// 切换播放/暂停
const togglePlayPause = async () => {
    if (!playerStore.currentSong) {
        playerStore.setPlaying(false);
        return;
    }
    initAudioContext();
    const targetState = !playerStore.playing;
    playerStore.setPlaying(targetState);
};

// 切换播放模式
const togglePlayMode = () => {
    const modes = [PlayMode.SEQUENCE, PlayMode.RANDOM, PlayMode.REPEAT_ONE];
    const currentIndex = modes.indexOf(playerStore.playMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    const newMode = modes[nextIndex];
    playerStore.setPlayMode(newMode);
};

// 获取播放模式的文本和图标
const playModeText = computed(() => {
    switch (playerStore.playMode) {
        case PlayMode.RANDOM:
            return "随机播放";
        case PlayMode.REPEAT_ONE:
            return "单曲循环";
        case PlayMode.SEQUENCE:
        default:
            return "顺序播放";
    }
});

// 播放模式图标的计算属性
const playModeIconName = computed(() => {
    switch (playerStore.playMode) {
        case PlayMode.RANDOM:
            return 'shuffle';
        case PlayMode.REPEAT_ONE:
            return 'repeat-one';
        case PlayMode.SEQUENCE:
        default:
            return 'repeat';
    }
});

// 加载歌曲封面
const loadSongCover = async (songId) => {
    if (!songId) {
        coverImage.value = null;
        coverLoadError.value = false;
        return;
    }

    isLoadingCover.value = true;
    coverLoadError.value = false;

    try {
        const result = await window.electronAPI.getSongCover(songId);
        if (result.success && result.cover) {
            const coverDetails = {
                format: result.format,
                fromCache: result.fromCache,
                dataLength: result.cover ? result.cover.length : 0,
            };

            if (!result.cover || result.cover.length === 0) {
                console.error("封面数据为空");
                coverImage.value = null;
                coverLoadError.value = true;
                return;
            }

            if (!/^[A-Za-z0-9+/=]+$/.test(result.cover)) {
                console.error("封面数据不是有效的Base64字符串");
                coverImage.value = null;
                coverLoadError.value = true;
                return;
            }
            coverImage.value = `data:${result.format};base64,${result.cover}`;
            
            // 封面加载成功后更新媒体会话元数据
            updateMediaSessionMetadata();
        } else {
            console.error("加载封面失败:", result.error);
            coverImage.value = null;
            coverLoadError.value = true;
        }
    } catch (error) {
        console.error("加载封面时发生异常:", error);
        coverImage.value = null;
        coverLoadError.value = true;
    } finally {
        isLoadingCover.value = false;
    }
};

const onCoverImageError = () => {
    coverLoadError.value = true;
    if (coverImage.value !== defaultCoverImage) {
        coverImage.value = defaultCoverImage;
        // 当封面图片加载失败时，使用默认封面更新媒体会话元数据
        updateMediaSessionMetadata();
    }
};

// 监听当前歌曲变化，更新媒体会话元数据
watch(
    () => playerStore.currentSong,
    (newSong, oldSong) => {
        if (newSong && newSong.id !== (oldSong ? oldSong.id : null)) {
            playbackError.value = null;
            resetAudioPlayer();
            loadSongCover(newSong.id);
            window.electronAPI.playerPlay({ filePath: newSong.filePath });
            
            // 更新媒体会话元数据
            updateMediaSessionMetadata();
        } else if (!newSong) {
            resetAudioPlayer();
            coverImage.value = null;
            playerStore.setPlaying(false);
        }
    },
    { deep: true }
);

// 监听播放状态的变化，更新媒体会话播放状态
watch(
    () => playerStore.playing,
    async (isPlaying) => {
        if (!playerStore.currentSong) {
            resetAudioPlayer();
            return;
        }

        if (isPlaying) {
            initAudioContext();
            if (window.audioContext.state === 'suspended') {
                await window.audioContext.resume();
            }

            // 无论之前的AudioContext状态如何，只要开始播放就重新创建音频源并从当前位置开始播放
            if (window.decodedAudioBuffer) {
                // 如果有正在播放的音源，先停止
                if (window.sourceNode) {
                    try {
                        window.sourceNode.onended = null;
                        if (window.isAudioPlaying) { // 只有在实际播放中才调用stop
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

                // 设置回调
                window.sourceNode.onended = async () => {
                    const wasPlaying = window.isAudioPlaying;
                    const currentMode = playerStore.playMode;

                    if (wasPlaying) {
                        window.isAudioPlaying = false;
                        
                        // 保存当前歌曲信息，避免异步操作中丢失
                        const currentSongId = playerStore.currentSong?.id;
                        const currentSongTitle = playerStore.currentSong?.title;
                        
                        console.log(`onended: 歌曲 ${currentSongTitle} (ID: ${currentSongId}) 播放完成`);

                        try {
                            // 检查是否是单曲循环模式
                            if (currentMode === PlayMode.REPEAT_ONE) {
                                // 延迟一小段时间再重新开始播放，避免可能的竞态条件
                                setTimeout(() => {
                                    if (playerStore.playing && playerStore.playMode === PlayMode.REPEAT_ONE) {
                                        playerStore.seek(0);
                                    }
                                }, 50);
                            } else {
                                // 非单曲循环模式，播放下一首
                                // 注意：playNext内部会增加播放次数，所以这里不需要再调用incrementCurrentSongPlayCount
                                await playerStore.playNext(true);
                            }
                        } catch (error) {
                            console.error(`处理歌曲播放完成时出错:`, error);
                            // 即使出错也尝试继续播放
                            if (currentMode === PlayMode.REPEAT_ONE) {
                                setTimeout(() => playerStore.seek(0), 50);
                            } else {
                                playerStore.playNext(true);
                            }
                        }
                    }
                };

                // 从当前时间开始播放
                const currentPosition = playerStore.currentTime; // 使用store中的currentTime
                window.sourceNode.start(0, currentPosition);
                window.songStartTimeInAc = window.audioContext.currentTime;
                window.songStartOffset = currentPosition;
                window.isAudioPlaying = true;

                // 更新本地引用
                sourceNode = window.sourceNode;
                songStartTimeInAc = window.songStartTimeInAc;
                songStartOffset = window.songStartOffset;
                isAudioPlaying = true;
            }
        } else {
            // 暂停播放
            if (window.audioContext && window.audioContext.state === 'running') {
                // 如果位置被锁定，我们使用锁定的位置而不是计算当前位置
                let currentPosition;

                if (window.isPositionLocked) {
                    // 使用playerStore中的currentTime作为当前位置
                    currentPosition = playerStore.currentTime;
                } else {
                    // 计算当前实际播放位置
                    const elapsedTime = window.audioContext.currentTime - window.songStartTimeInAc;
                    currentPosition = window.songStartOffset + elapsedTime;
                }

                // 停止当前音源，但需要检查它是否已经开始
                try {
                    if (window.sourceNode) {
                        window.sourceNode.onended = null;
                        if (window.isAudioPlaying) { // 只有在实际播放中才调用stop
                            window.sourceNode.stop();
                        }
                        window.sourceNode = null;
                        sourceNode = null;
                    }
                } catch (error) {
                    console.error("停止音频源时出错:", error);
                    // 即使出错也确保清理引用
                    window.sourceNode = null;
                    sourceNode = null;
                }

                // 更新偏移量，为下次播放做准备
                window.songStartOffset = currentPosition;
                window.isAudioPlaying = false;
                songStartOffset = currentPosition;
                isAudioPlaying = false;

                // 更新播放器状态
                playerStore.updateCurrentTime(currentPosition);
            }
        }
        
        // 更新媒体会话播放状态
        updateMediaSessionPlaybackState();
    }
);

watch(
    () => playerStore.volume,
    (newVolume) => {
        if (window.gainNode && !playerStore.muted) {
            window.gainNode.gain.value = newVolume;
        }
    }
);

watch(
    () => playerStore.muted,
    (newMuted) => {
        if (window.gainNode) {
            window.gainNode.gain.value = newMuted ? 0 : playerStore.volume;
        }
    }
);

// 监听播放模式变化
watch(
    () => playerStore.playMode,
    (newMode) => {
        // 如果是单曲循环模式，且当前歌曲即将结束，则重新开始播放
        if (newMode === PlayMode.REPEAT_ONE && playerStore.currentSong) {
            const remainingTime = playerStore.currentSong.duration - playerStore.currentTime;
            if (remainingTime < 0.5) {
                playerStore.seek(0);
            }
        }
    }
);

// 监听封面图片变化，更新媒体会话元数据
watch(
    () => coverImage.value,
    () => {
        updateMediaSessionMetadata();
    }
);

// 监听播放位置变化，更新媒体会话播放位置
watch(
    () => playerStore.currentTime,
    () => {
        updateMediaSessionPosition();
    }
);

// 设置播放器事件监听器
onMounted(async () => {
    // 加载保存的播放器状态
    playerStore.loadPlayerState();

    initAudioContext();
    
    // 初始化媒体会话
    initMediaSession();

    // 如果有当前歌曲，更新媒体会话元数据
    if (playerStore.currentSong) {
        updateMediaSessionMetadata();
        updateMediaSessionPlaybackState();
        updateMediaSessionPosition();
    }

    const removeAudioDataListener = window.electronAPI.onPlayerAudioData(async (buffer) => {
        try {
            // 确保我们收到了有效数据
            if (!buffer || buffer.byteLength === 0) {
                throw new Error("Received an empty audio buffer.");
            }
            const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
            window.decodedAudioBuffer = await window.audioContext.decodeAudioData(arrayBuffer);
            decodedAudioBuffer = window.decodedAudioBuffer; // 更新本地引用

            // 使用解码出的准确时长更新store
            if (playerStore.currentSong) {
                playerStore.updateSongDuration(playerStore.currentSong.id, window.decodedAudioBuffer.duration);
                
                // 音频加载完成后更新媒体会话元数据和播放位置
                updateMediaSessionMetadata();
                updateMediaSessionPosition();
            }

            // 如果状态是播放，则开始播放
            if (playerStore.playing) {
                playAudioBuffer(playerStore.currentTime);
                // 更新媒体会话播放状态
                updateMediaSessionPlaybackState();
            }

        } catch (error) {
            console.error("解码音频数据时出错:", error);
            playbackError.value = `音频解码失败: ${error.message}`;
            window.decodedAudioBuffer = null;
            decodedAudioBuffer = null;
            playerStore.setPlaying(false);
        }
    });

    // 主进程的ended事件现在只作为备份/调试
    const removeEndedListener = window.electronAPI.onPlayerEnded(() => {
        // 移除调试信息
    });

    // 监听播放错误事件
    const removeErrorListener = window.electronAPI.onPlayerError((error) => {
        console.error('播放器错误:', error);
        playbackError.value = `播放错误: ${error.error || '未知错误'}`;
        playerStore.setPlaying(false);
    });

    // 获取当前播放状态
    try {
        const status = await window.electronAPI.playerGetStatus();
        if (status.success && status.state === 'playing') {
            // 同步状态
            playerStore.updateCurrentTime(status.position);
        }
    } catch (error) {
        console.error('获取播放状态失败:', error);
    }

    // 组件卸载时清理监听器
onUnmounted(() => {
    removeErrorListener();
    removeAudioDataListener();
    removeEndedListener();

    if (window.audioContext) {
        window.audioContext.close();
        window.audioContext = null;
        audioContext = null;
    }

    // 清理MediaSession处理程序
    if ('mediaSession' in navigator) {
        try {
            navigator.mediaSession.setActionHandler('play', null);
            navigator.mediaSession.setActionHandler('pause', null);
            navigator.mediaSession.setActionHandler('previoustrack', null);
            navigator.mediaSession.setActionHandler('nexttrack', null);
            navigator.mediaSession.setActionHandler('seekto', null);
            navigator.mediaSession.setActionHandler('seekbackward', null);
            navigator.mediaSession.setActionHandler('seekforward', null);
            
            // 清除元数据
            navigator.mediaSession.metadata = null;
        } catch (error) {
            console.error('清理媒体会话处理程序失败:', error);
        }
    }

    // 停止播放
    window.electronAPI.playerStop().catch(error => {
        console.error('停止播放失败:', error);
    });
});

    // 启动一个定时器来更新UI进度
    const progressTimer = setInterval(async () => {
        if (playerStore.playing && window.isAudioPlaying && window.audioContext && window.audioContext.state === 'running') {
            // 如果位置被锁定，跳过更新
            if (window.isPositionLocked) {
                return;
            }

            const elapsedTime = window.audioContext.currentTime - window.songStartTimeInAc;
            const newCurrentTime = window.songStartOffset + elapsedTime;

            if (window.decodedAudioBuffer && newCurrentTime < window.decodedAudioBuffer.duration) {
                // 使用updateCurrentTime方法更新时间，这样会同时更新歌词索引
                playerStore.updateCurrentTime(newCurrentTime);

                // 检查是否即将结束，且处于单曲循环模式
                // 提前0.2秒检测，避免可能的延迟导致切换到下一首
                const remainingTime = window.decodedAudioBuffer.duration - newCurrentTime;
                if (playerStore.playMode === PlayMode.REPEAT_ONE && remainingTime < 0.2) {
                    // 单曲循环模式下，提前准备重新开始播放
                    window.isAudioPlaying = false;
                    
                    // 保存当前歌曲信息，避免异步操作中丢失
                    const currentSongId = playerStore.currentSong?.id;
                    const currentSongTitle = playerStore.currentSong?.title;
                    
                    if (currentSongId) {
                        console.log(`单曲循环: 歌曲 ${currentSongTitle} (ID: ${currentSongId}) 即将结束，增加播放次数`);
                        try {
                            await playerStore.incrementCurrentSongPlayCount();
                            setTimeout(() => playerStore.seek(0), 50);
                        } catch (error) {
                            console.error(`增加播放次数失败:`, error);
                            setTimeout(() => playerStore.seek(0), 50);
                        }
                    }
                }
            } else if (window.decodedAudioBuffer && newCurrentTime >= window.decodedAudioBuffer.duration) {
                window.isAudioPlaying = false;
                const currentSongId = playerStore.currentSong?.id;
                const currentSongTitle = playerStore.currentSong?.title;
                console.log(`检测到歌曲 ${currentSongTitle} (ID: ${currentSongId}) 播放完成，触发播放完成逻辑`);
                
                // 直接调用 playNext(true) 即可，它内部会处理播放次数增加
                if (playerStore.playMode !== PlayMode.REPEAT_ONE) {
                    playerStore.playNext(true);
                } else {
                    // 单曲循环模式下，单独处理
                    try {
                        await playerStore.incrementCurrentSongPlayCount();
                        setTimeout(() => playerStore.seek(0), 50);
                    } catch (error) {
                        console.error(`增加播放次数失败:`, error);
                        setTimeout(() => playerStore.seek(0), 50);
                    }
                }
            }
        }
    }, 100);

    onUnmounted(() => {
        clearInterval(progressTimer);
    })
});

// 添加一个辅助函数用于设置位置锁定
const lockPosition = (duration = 300) => {
    // 清除之前的超时调用（如果有）
    if (window.positionLockTimeout) {
        clearTimeout(window.positionLockTimeout);
    }

    // 设置位置锁定
    window.isPositionLocked = true;

    // 设置超时以解除锁定
    window.positionLockTimeout = setTimeout(() => {
        window.isPositionLocked = false;
    }, duration);
};

// 键盘快捷键控制
const handleKeydown = (event) => {
    // 空格键：播放/暂停
    if (event.key === ' ' && document.activeElement.tagName !== 'INPUT') {
        event.preventDefault();
        playerStore.togglePlay();
    }
    // 左箭头：快退 5 秒
    else if (event.key === 'ArrowLeft') {
        const newTime = Math.max(0, playerStore.currentTime - 5);
        playerStore.seek(newTime);
    }
    // 右箭头：快进 5 秒
    else if (event.key === 'ArrowRight') {
        if (playerStore.currentSong) {
            const newTime = Math.min(playerStore.currentSong.duration, playerStore.currentTime + 5);
            playerStore.seek(newTime);
        }
    }
};

// 组件挂载后添加键盘事件监听器
onMounted(() => {
    window.addEventListener('keydown', handleKeydown);
});

// 组件卸载前移除键盘事件监听器
onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown);

    // 确保清理音量拖动的事件监听器
    if (isDraggingVolume.value) {
        document.removeEventListener('mousemove', updateVolume);
        document.removeEventListener('mouseup', endVolumeChange);
    }
});

// 强制提取封面
const forceExtractCover = async (songId) => {
    try {
        const forceResult = await window.electronAPI.forceExtractCover(songId);

        if (forceResult.success && forceResult.cover) {
            // 验证base64数据
            if (!/^[A-Za-z0-9+/=]+$/.test(forceResult.cover)) {
                console.error(`强制提取的封面数据不是有效的base64字符串`);
                return;
            }

            const imageFormat = forceResult.format || 'image/jpeg';

            // 清除可能存在的换行符或空白字符
            const cleanBase64 = forceResult.cover.trim();
            coverImage.value = `data:${imageFormat};base64,${cleanBase64}`;

            // 测试图片加载
            const testImg = new Image();
            testImg.onload = () => {
                coverLoadError.value = false;
            };
            testImg.onerror = (e) => {
                console.error('强制提取的封面加载失败:', e);
                coverLoadError.value = true;
            };
            testImg.src = coverImage.value;

        } else {
            console.warn(`强制提取封面失败:`, forceResult.error || "未知错误");
        }
    } catch (error) {
        console.error('强制提取封面时出错:', error);
    }
};

// 显示歌词
const showLyrics = async () => {
    if (!playerStore.currentSong) {
        return;
    }

    try {
        // 如果还没有加载歌词，则先加载歌词
        if (!playerStore.hasLyrics) {
            const success = await playerStore.loadLyrics();
        }

        // 显示歌词页面
        playerStore.showLyricsDisplay();
    } catch (err) {
        console.error(`显示歌词时出错: ${err.message}`);
    }
};

// 移除updateLocalTime函数，因为我们不再使用audio元素
</script>

<template>
    <div class="player-bar-container" v-if="playerStore.currentSong">
        <!-- Song Info -->
        <div class="song-info">
            <img :src="coverImage || defaultCoverImage" class="song-cover" alt="cover" @click="showLyrics"
                title="点击查看歌词" />
            <div class="song-details">
                <span class="song-title">{{ playerStore.currentSong.title }}</span>
                <span class="song-artist">{{ playerStore.currentSong.artist }}</span>
            </div>
            <button class="control-button favorite-button">
                <!-- Inlined Heart Icon (22x22) -->
                <svg width="22" height="22" viewBox="0 0 23 20">
                    <path
                        d="M16.3115 0.499999H16.3125C19.4597 0.499999 22 3.01827 22 6.11132C22 6.86474 21.8469 7.61035 21.5498 8.30272C21.2527 8.99509 20.8175 9.61958 20.2715 10.1387L20.2597 10.1504L11.25 19.2871L2.0791 9.9912C1.06654 8.95417 0.499928 7.56175 0.499999 6.1123C0.500118 3.01803 3.04044 0.499999 6.18749 0.499999C8.11327 0.499999 9.81361 1.44292 10.8428 2.88671L11.249 3.45703L11.6572 2.88671C12.1863 2.14652 12.8847 1.54311 13.6943 1.12793C14.5039 0.712776 15.4016 0.497637 16.3115 0.499999Z"
                        fill="currentColor" stroke="currentColor" stroke-width="0.5" />
                </svg>
            </button>
        </div>

        <!-- Main Controls -->
        <div class="main-controls">
            <div class="top-controls">
                <button @click="togglePlayMode" class="control-button" :title="playModeText">
                    <!-- Inlined Shuffle Icon (22x22) -->
                    <svg v-if="playerStore.playMode === 'random'" width="22" height="22" viewBox="0 0 30 30">
                        <path
                            d="M20.88 9.315H23.67L21.885 11.025C21.8147 11.0947 21.7589 11.1777 21.7208 11.2691C21.6828 11.3605 21.6632 11.4585 21.6632 11.5575C21.6632 11.6565 21.6828 11.7545 21.7208 11.8459C21.7589 11.9373 21.8147 12.0203 21.885 12.09C21.9552 12.1649 22.0399 12.2247 22.1341 12.2655C22.2283 12.3063 22.3299 12.3274 22.4325 12.3274C22.5352 12.3274 22.6367 12.3063 22.7309 12.2655C22.8251 12.2247 22.9098 12.1649 22.98 12.09L26.0775 9.09C26.1504 9.02223 26.209 8.94065 26.25 8.85C26.2952 8.75644 26.3186 8.65389 26.3186 8.55C26.3186 8.4461 26.2952 8.34355 26.25 8.25C26.2158 8.15538 26.1592 8.07045 26.085 8.0025L22.9875 5.0025C22.8385 4.86167 22.6413 4.7832 22.4363 4.7832C22.2312 4.7832 22.034 4.86167 21.885 5.0025C21.8147 5.07222 21.7589 5.15517 21.7208 5.24656C21.6828 5.33796 21.6632 5.43599 21.6632 5.535C21.6632 5.63401 21.6828 5.73203 21.7208 5.82343C21.7589 5.91482 21.8147 5.99777 21.885 6.0675L23.67 7.785H20.88C19.9782 7.76911 19.082 7.93116 18.2428 8.26189C17.4037 8.59262 16.6379 9.08554 15.9894 9.71246C15.3409 10.3394 14.8223 11.088 14.4634 11.9155C14.1044 12.743 13.9122 13.6331 13.8975 14.535C13.8858 15.2363 13.736 15.9284 13.4568 16.5718C13.1775 17.2152 12.7743 17.7973 12.27 18.2848C11.7658 18.7723 11.1704 19.1558 10.518 19.4132C9.86555 19.6706 9.16879 19.7969 8.4675 19.785H4.5825C4.38359 19.785 4.19283 19.864 4.05217 20.0047C3.91152 20.1453 3.8325 20.3361 3.8325 20.535C3.8325 20.7339 3.91152 20.9247 4.05217 21.0653C4.19283 21.206 4.38359 21.285 4.5825 21.285H8.4675C10.2883 21.3151 12.0466 20.621 13.3559 19.3553C14.6652 18.0896 15.4184 16.3558 15.45 14.535C15.4815 13.1239 16.0704 11.7827 17.0879 10.8046C18.1054 9.8264 19.4688 9.29086 20.88 9.315ZM4.5825 9.315H8.4675C9.33651 9.30896 10.1945 9.50987 10.9705 9.90112C11.7464 10.2924 12.4181 10.8627 12.93 11.565C13.1244 11.0391 13.3759 10.5361 13.68 10.065C13.0086 9.34664 12.1952 8.77568 11.2914 8.38835C10.3877 8.00102 9.41324 7.80577 8.43 7.815H4.5825C4.38359 7.815 4.19283 7.89401 4.05217 8.03467C3.91152 8.17532 3.8325 8.36608 3.8325 8.565C3.8325 8.76391 3.91152 8.95467 4.05217 9.09533C4.19283 9.23598 4.38359 9.315 4.5825 9.315Z"
                            fill="currentColor" />
                        <path
                            d="M26.145 20.115C26.1276 20.0833 26.1076 20.0532 26.085 20.025L22.9875 17.025C22.8385 16.8842 22.6413 16.8057 22.4362 16.8057C22.2312 16.8057 22.034 16.8842 21.885 17.025C21.8147 17.0947 21.7589 17.1777 21.7208 17.2691C21.6828 17.3605 21.6631 17.4585 21.6631 17.5575C21.6631 17.6565 21.6828 17.7545 21.7208 17.8459C21.7589 17.9373 21.8147 18.0203 21.885 18.09L23.67 19.8075H20.88C20.0114 19.8111 19.1543 19.6091 18.3787 19.2181C17.6031 18.827 16.9311 18.258 16.4175 17.5575C16.2261 18.0847 15.9744 18.588 15.6675 19.0575C16.3386 19.7762 17.152 20.3474 18.0558 20.7348C18.9596 21.1221 19.9342 21.3172 20.9175 21.3075H23.7075L21.885 23.025C21.7453 23.1655 21.6669 23.3556 21.6669 23.5537C21.6669 23.7519 21.7453 23.942 21.885 24.0825C22.0327 24.2228 22.2287 24.3011 22.4325 24.3011C22.6363 24.3011 22.8323 24.2228 22.98 24.0825L26.0775 21.0825C26.1001 21.0543 26.1201 21.0242 26.1375 20.9925C26.1833 20.948 26.2191 20.8943 26.2425 20.835C26.2865 20.744 26.31 20.6444 26.3113 20.5433C26.3126 20.4422 26.2917 20.3421 26.25 20.25C26.2239 20.1987 26.1883 20.1529 26.145 20.115Z"
                            fill="currentColor" />
                    </svg>
                    <!-- Inlined Repeat Icon (22x22) -->
                    <svg v-else-if="playerStore.playMode === 'sequence'" width="22" height="22" viewBox="0 0 24 24">
                        <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" fill="currentColor">
                        </path>
                    </svg>
                    <!-- Inlined Repeat One Icon (22x22) -->
                    <svg v-else-if="playerStore.playMode === 'repeat_one'" width="22" height="22" viewBox="0 0 24 24">
                        <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" fill="currentColor">
                        </path><text x="11.5" y="14" fill="currentColor" font-size="8" text-anchor="middle"
                            dominant-baseline="middle">1</text>
                    </svg>
                </button>
                <button @click="playerStore.playPrevious" class="control-button">
                    <!-- Inlined Previous Icon (28x28) -->
                    <svg width="28" height="28" viewBox="0 0 32 32">
                        <path d="M28 28L8 18V28H6L6 4H8L8 14L28 4L28 28Z" fill="currentColor" />
                    </svg>
                </button>
                <button @click="togglePlayPause" class="control-button play-pause-button">
                    <!-- Inlined Play/Pause Icons (24x24) -->
                    <svg v-if="playerStore.playing" width="24" height="24" viewBox="0 0 22 26">
                        <rect width="7" height="26" rx="3.5" fill="currentColor" />
                        <rect x="15" width="7" height="26" rx="3.5" fill="currentColor" />
                    </svg>
                    <svg v-else width="24" height="24" viewBox="0 0 32 32">
                        <path d="M6 4l20 12L6 28z" fill="currentColor"></path>
                    </svg>
                </button>
                <button @click="playerStore.playNext()" class="control-button">
                    <!-- Inlined Next Icon (28x28) -->
                    <svg width="28" height="28" viewBox="0 0 32 32">
                        <path d="M4 4L24 14V4H26V28H24V18L4 28V4Z" fill="currentColor" />
                    </svg>
                </button>
                <button @click="uiStore.togglePlaylist()" class="control-button">
                    <!-- Inlined Playlist Icon (22x22) -->
                    <svg width="22" height="22" viewBox="0 0 24 24">
                        <path d="M4 10h12v2H4zm0-4h12v2H4zm0 8h8v2H4zm10 0v6l5-3z" fill="currentColor" />
                    </svg>
                </button>
            </div>
            <div class="progress-section">
                <span class="time-display">{{ formatTime(playerStore.currentTime) }}</span>
                <div class="progress-bar-wrapper" @click="setPlayTime" ref="timelineRef">
                    <div class="progress-bar-fill" :style="{ width: progressPercentage }"></div>
                </div>
                <span class="time-display">{{ formatTime(playerStore.currentSong.duration) }}</span>
            </div>
        </div>

        <!-- Volume Control -->
        <div class="volume-controls">
            <button @click="toggleMute" class="control-button">
                <!-- Inlined Volume Icons (22x22) -->
                <svg v-if="playerStore.muted || playerStore.volume === 0" width="22" height="22" viewBox="0 0 24 24">
                    <path
                        d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"
                        fill="currentColor"></path>
                </svg>
                <svg v-else width="22" height="22" viewBox="0 0 23 23">
                    <path
                        d="M12.8273 0.0753804C13.1315 0.203735 13.3445 0.477569 13.3992 0.795753L13.413 0.958072V22.0357C13.413 22.4216 13.1814 22.7699 12.8255 22.9192C12.5204 23.0471 12.175 23.0074 11.9092 22.8232L11.7835 22.7191L6.17602 17.2102H2.87422C1.38022 17.2102 0.152433 16.0703 0.0131576 14.6128L0 14.3361V8.60872C0 7.11472 1.1399 5.88693 2.59741 5.74766L2.87422 5.7345H6.1784L11.7864 0.271804C12.0623 0.00300758 12.4724 -0.0743663 12.8273 0.0753804ZM18.6589 2.02954L18.8247 2.14221L19.0121 2.30426C19.1326 2.41258 19.299 2.56949 19.4959 2.774C19.8893 3.1825 20.4078 3.78444 20.9252 4.57244C21.9607 6.14963 23 8.48725 23 11.5046C23 14.5222 21.9605 16.8563 20.9244 18.4301C20.4069 19.2162 19.8882 19.8164 19.4946 20.2236L19.2239 20.4936L18.8661 20.8174L18.8029 20.8693C18.388 21.1979 17.7841 21.1291 17.4554 20.7145C17.164 20.3466 17.1861 19.8308 17.4844 19.4896L17.7319 19.2645C17.8212 19.1846 17.9544 19.0599 18.1169 18.8918C18.4424 18.555 18.8826 18.047 19.3241 17.3766C20.2057 16.037 21.0839 14.0636 21.0839 11.5046C21.0839 8.94546 20.2057 6.96792 19.3233 5.62406C18.9554 5.06362 18.5883 4.616 18.2875 4.28655L17.9633 3.94878L17.6101 3.62416C17.1968 3.29446 17.1276 2.69124 17.457 2.27749C17.7499 1.90954 18.2586 1.81462 18.6589 2.02954ZM16.7442 5.86164L16.935 5.99527L17.1911 6.2362L17.2947 6.34472C17.5122 6.57931 17.7927 6.92295 18.0705 7.3799C18.6291 8.29874 19.1696 9.66578 19.1696 11.4941C19.1696 13.3223 18.6291 14.6908 18.0709 15.611C17.7934 16.0686 17.5129 16.4131 17.2956 16.6482L17.101 16.848L16.9663 16.9726L16.8902 17.0372L16.7685 17.0924C16.5149 17.194 15.9216 17.3596 15.5437 16.8868C15.2515 16.5213 15.2704 16.0075 15.5646 15.6651L15.8223 15.4174L15.8882 15.3479C16.031 15.1935 16.2304 14.9507 16.4326 14.6172C16.8342 13.9553 17.2535 12.9265 17.2535 11.4941C17.2535 10.0618 16.8342 9.03504 16.4332 8.37527C16.2816 8.12599 16.1316 7.92762 16.006 7.77921L15.8235 7.57826L15.6922 7.4537C15.2808 7.12562 15.2131 6.52393 15.5424 6.11008C15.8351 5.74202 16.3438 5.64689 16.7442 5.86164Z"
                        fill="currentColor" />
                </svg>
            </button>
            <div class="volume-bar-wrapper" ref="volumeRef" @mousedown="startVolumeChange">
                <div class="volume-bar-fill" :style="{ width: volumePercentage }"></div>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* Restore original player theme while keeping the new layout */
.player-bar-container {
    display: grid;
    grid-template-columns: 1fr 2fr 1fr;
    align-items: center;
    background-color: #181818;
    /* Original background color */
    padding: 12px 16px;
    height: 90px;
    border-top: 1px solid #282828;
    color: #ffffff;
    /* Primary text color */
}

/* Song Info */
.song-info {
    display: flex;
    align-items: center;
    gap: 14px;
}

.song-cover {
    width: 56px;
    height: 56px;
    border-radius: 4px;
}

.song-details {
    display: flex;
    flex-direction: column;
}

.song-title {
    font-size: 14px;
    font-weight: 500;
}

.song-artist {
    font-size: 12px;
    color: #b3b3b3;
    /* Secondary text color */
}

.favorite-button {
    margin-left: 10px;
    color: #b3b3b3;
    /* Default color for heart */
}

.favorite-button:hover {
    color: #ffffff;
}

/* Main Controls */
.main-controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
}

.top-controls {
    display: flex;
    align-items: center;
    gap: 16px;
}

.control-button {
    background: none;
    border: none;
    color: #b3b3b3;
    cursor: pointer;
    padding: 0;
    transition: color 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
}

.control-button:hover {
    color: #ffffff;
}

.play-pause-button {
    background-color: transparent;
    color: #ffffff;
    border-radius: 50%;
    width: 42px;
    height: 42px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #b3b3b3;
}

.play-pause-button:hover {
    transform: scale(1.05);
    border-color: #ffffff;
}

/* Progress Bar */
.progress-section {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
}

.time-display {
    font-size: 11px;
    color: #b3b3b3;
    min-width: 40px;
    text-align: center;
}

.progress-bar-wrapper {
    flex-grow: 1;
    height: 12px;
    display: flex;
    align-items: center;
    cursor: pointer;
    background-color: #535353;
    border-radius: 2px;
}

.progress-bar-fill {
    height: 100%;
    background-color: #ffffff;
    border-radius: 2px;
}

.progress-bar-wrapper:hover .progress-bar-fill {
    background-color: #1db954;
}

/* Volume Controls */
.volume-controls {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
}

.volume-bar-wrapper {
    width: 100px;
    height: 12px;
    display: flex;
    align-items: center;
    cursor: pointer;
    background-color: #535353;
    border-radius: 2px;
}

.volume-bar-fill {
    height: 100%;
    background-color: #ffffff;
    border-radius: 2px;
}

.volume-bar-wrapper:hover .volume-bar-fill {
    background-color: #1db954;
}
</style>