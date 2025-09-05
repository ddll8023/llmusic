<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { usePlayerStore, PlayMode } from '../../store/player';
import { useUiStore } from '../../store/ui';
import defaultCoverImage from '../../assets/default_img.jpg';
import CustomButton from '../custom/CustomButton.vue';
import { formatTime } from '../../utils/timeUtils';

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

// 单曲循环重新播放的通用逻辑
const handleRepeatOneReplay = async () => {
    const currentSongId = playerStore.currentSong?.id;
    const currentSongTitle = playerStore.currentSong?.title;
    
    if (currentSongId) {
        console.log(`单曲循环: 歌曲 ${currentSongTitle} (ID: ${currentSongId}) 重新播放，增加播放次数`);
        try {
            await playerStore.incrementCurrentSongPlayCount();
            setTimeout(() => playerStore.seek(0), 50);
        } catch (error) {
            console.error(`增加播放次数失败:`, error);
            setTimeout(() => playerStore.seek(0), 50);
        }
    }
};

// 安全停止音频源的通用逻辑
const safeStopAudioSource = () => {
    if (window.sourceNode) {
        try {
            window.sourceNode.onended = null;
            if (window.isAudioPlaying) {
                window.sourceNode.stop();
            }
            window.sourceNode = null;
        } catch (error) {
            console.error("停止音频源时出错:", error);
            window.sourceNode = null;
        }
    }
};

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


// 处理音频播放结束的通用逻辑
const handleAudioEnded = async () => {
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

    window.sourceNode.onended = handleAudioEnded;

    const clippedOffset = Math.max(0, Math.min(offset, window.decodedAudioBuffer.duration));
    window.sourceNode.start(0, clippedOffset);

    window.songStartTimeInAc = window.audioContext.currentTime;
    window.songStartOffset = clippedOffset;
    window.isAudioPlaying = true;

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
    if (window.positionLockTimeout) {
        clearTimeout(window.positionLockTimeout);
    }
    window.isPositionLocked = true;
    window.positionLockTimeout = setTimeout(() => {
        window.isPositionLocked = false;
    }, 300);

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
            return 'random';
        case PlayMode.REPEAT_ONE:
            return 'repeat';
        case PlayMode.SEQUENCE:
        default:
            return 'refresh';
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
                safeStopAudioSource();

                // 创建新的音频源
                window.sourceNode = window.audioContext.createBufferSource();
                window.sourceNode.buffer = window.decodedAudioBuffer;
                if (window.gainNode) window.sourceNode.connect(window.gainNode);

                // 设置回调
                window.sourceNode.onended = handleAudioEnded;

                // 从当前时间开始播放
                const currentPosition = playerStore.currentTime; // 使用store中的currentTime
                window.sourceNode.start(0, currentPosition);
                window.songStartTimeInAc = window.audioContext.currentTime;
                window.songStartOffset = currentPosition;
                window.isAudioPlaying = true;

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
                safeStopAudioSource();

                // 更新偏移量，为下次播放做准备
                window.songStartOffset = currentPosition;
                window.isAudioPlaying = false;

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
    // 声明清理资源的引用
    let removeAudioDataListener, removeErrorListener, progressTimer;

    // 添加键盘事件监听器
    window.addEventListener('keydown', handleKeydown);

    // 在任何await之前注册onUnmounted钩子
    onUnmounted(() => {
        // 移除键盘事件监听器
        window.removeEventListener('keydown', handleKeydown);

        // 确保清理音量拖动的事件监听器
        if (isDraggingVolume.value) {
            document.removeEventListener('mousemove', updateVolume);
            document.removeEventListener('mouseup', endVolumeChange);
        }
        // 清理事件监听器
        if (removeErrorListener) removeErrorListener();
        if (removeAudioDataListener) removeAudioDataListener();

        // 清理定时器
        if (progressTimer) clearInterval(progressTimer);

        // 清理音频上下文
        if (window.audioContext) {
            window.audioContext.close();
            window.audioContext = null;
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

    removeAudioDataListener = window.electronAPI.onPlayerAudioData(async (buffer) => {
        try {
            // 确保我们收到了有效数据
            if (!buffer || buffer.byteLength === 0) {
                throw new Error("Received an empty audio buffer.");
            }
            const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
            window.decodedAudioBuffer = await window.audioContext.decodeAudioData(arrayBuffer);

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
            playerStore.setPlaying(false);
        }
    });


    // 监听播放错误事件
    removeErrorListener = window.electronAPI.onPlayerError((error) => {
        console.error('播放器错误:', error);
        playbackError.value = `播放错误: ${error.error || '未知错误'}`;
        playerStore.setPlaying(false);
    });

    // 启动一个定时器来更新UI进度
    progressTimer = setInterval(async () => {
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
                        await handleRepeatOneReplay();
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
                    await handleRepeatOneReplay();
                }
            }
        }
    }, 100);

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
});


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

</script>

<template>
    <div class="player-bar-container" :class="{
        'has-error': playbackError,
        'no-song': !playerStore.currentSong
    }" v-if="playerStore.currentSong">
        <!-- Song Info -->
        <div class="song-info">
            <img :src="coverImage || defaultCoverImage" class="song-cover" :class="{ 'loading': isLoadingCover }"
                alt="cover" @click="showLyrics" @error="onCoverImageError" title="点击查看歌词" />
            <div class="song-details">
                <span class="song-title">{{ playerStore.currentSong.title }}</span>
                <span class="song-artist">{{ playerStore.currentSong.artist }}</span>
            </div>
            <CustomButton type="icon-only" icon="heart" icon-size="medium" :custom-class="'favorite-button'"
                title="收藏歌曲" />
        </div>

        <!-- Main Controls -->
        <div class="main-controls">
            <div class="top-controls">
                <CustomButton type="icon-only" :icon="playModeIconName" icon-size="medium" :title="playModeText"
                    :custom-class="playerStore.playMode !== 'sequence' ? 'is-active' : ''" @click="togglePlayMode" />
                <CustomButton type="icon-only" icon="step-backward" icon-size="large" title="上一首"
                    @click="playerStore.playPrevious" />
                <CustomButton type="icon-only" :icon="playerStore.playing ? 'pause' : 'play'" icon-size="large"
                    :title="playerStore.playing ? '暂停' : '播放'" :circle="true" custom-class="play-pause-button"
                    @click="togglePlayPause" />
                <CustomButton type="icon-only" icon="step-forward" icon-size="large" title="下一首"
                    @click="playerStore.playNext()" />
                <CustomButton type="icon-only" icon="list" icon-size="medium" title="播放列表"
                    :custom-class="uiStore.showPlaylist ? 'is-active' : ''" @click="uiStore.togglePlaylist()" />
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
            <CustomButton type="icon-only"
                :icon="(playerStore.muted || playerStore.volume === 0) ? 'volume-off' : 'volume-up'" icon-size="medium"
                :title="playerStore.muted ? '取消静音' : '静音'" :custom-class="playerStore.muted ? 'is-active' : ''"
                @click="toggleMute" />
            <div class="volume-bar-wrapper" ref="volumeRef" @mousedown="startVolumeChange" title="调节音量">
                <div class="volume-bar-fill" :style="{ width: volumePercentage }"></div>
            </div>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.player-bar-container {
    display: grid;
    grid-template-columns: 1fr 2fr 1fr;
    align-items: center;
    background-color: $bg-secondary;
    padding: $content-padding;
    height: $player-bar-height;
    border-top: 1px solid $bg-tertiary;
    color: $text-primary;
    z-index: $z-player;
    position: relative;
    transition: all $transition-base;

    @include respond-to("md") {
        grid-template-columns: 1fr 1.5fr 1fr;
        padding: ($content-padding * 0.75);
    }

    @include respond-to("sm") {
        grid-template-columns: 1fr;
        grid-template-rows: auto auto;
        gap: ($content-padding * 0.5);
        height: auto;
        min-height: $player-bar-height;
        padding: ($content-padding * 0.75);
    }
}

/* Song Info Section */
.song-info {
    display: flex;
    align-items: center;
    gap: $content-padding;
    min-width: 0; // 防止flex项目溢出

    @include respond-to("sm") {
        justify-content: center;
        order: 1;
    }
}

.song-cover {
    width: 56px;
    height: 56px;
    border-radius: $border-radius;
    object-fit: cover;
    cursor: pointer;
    transition: all $transition-base;
    box-shadow: $box-shadow;
    flex-shrink: 0;

    &:hover {
        transform: scale(1.05);
        box-shadow: $box-shadow-hover;
    }

    @include respond-to("sm") {
        width: 48px;
        height: 48px;
    }
}

.song-details {
    display: flex;
    flex-direction: column;
    min-width: 0; // 防止文本溢出
    flex: 1;
}

.song-title {
    font-size: $font-size-base;
    font-weight: $font-weight-medium;
    color: $text-primary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 2px;

    @include respond-to("sm") {
        font-size: $font-size-sm;
        text-align: center;
    }
}

.song-artist {
    font-size: $font-size-sm;
    color: $text-secondary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    @include respond-to("sm") {
        font-size: $font-size-xs;
        text-align: center;
    }
}

// 收藏按钮特殊样式
.favorite-button {
    &.is-favorite {
        color: $accent-green !important;
    }

    @include respond-to("sm") {
        display: none; // 在小屏幕上隐藏
    }
}

/* Main Controls Section */
.main-controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: ($content-padding * 0.5);
    width: 100%;

    @include respond-to("sm") {
        order: 2;
        gap: ($content-padding * 0.375);
    }
}

.top-controls {
    display: flex;
    align-items: center;
    gap: $content-padding;
    justify-content: center;

    @include respond-to("sm") {
        gap: ($content-padding * 0.75);
    }
}

// CustomButton 组件已处理基础按钮样式
// 保留特殊状态样式
.is-active {
    color: $accent-green !important;
}

// 播放/暂停按钮特殊样式（圆形边框）
.play-pause-button {
    border: 2px solid $text-secondary !important;

    &:hover {
        border-color: $accent-green !important;
    }
}

/* Progress Section */
.progress-section {
    width: 100%;
    display: flex;
    align-items: center;
    gap: ($content-padding * 0.75);

    @include respond-to("sm") {
        gap: ($content-padding * 0.5);
    }
}

.time-display {
    font-size: $font-size-xs;
    color: $text-secondary;
    min-width: 40px;
    text-align: center;
    font-weight: $font-weight-medium;
    font-variant-numeric: tabular-nums; // 等宽数字

    @include respond-to("sm") {
        min-width: 35px;
        font-size: $font-size-xs;
    }
}

.progress-bar-wrapper {
    flex: 1;
    height: 8px;
    display: flex;
    align-items: center;
    cursor: pointer;
    background-color: $overlay-medium;
    border-radius: ($border-radius * 2);
    transition: all $transition-base;
    position: relative;
    overflow: hidden;

    &:hover {
        height: 10px;
        background-color: $overlay-light;

        .progress-bar-fill {
            background-color: $accent-green;
        }
    }

    @include respond-to("sm") {
        height: 6px;

        &:hover {
            height: 8px;
        }
    }
}

.progress-bar-fill {
    height: 100%;
    background-color: $text-primary;
    border-radius: ($border-radius * 2);
    transition: all $transition-base;
    position: relative;

    &::after {
        content: '';
        position: absolute;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        width: 12px;
        height: 12px;
        background-color: $text-primary;
        border-radius: 50%;
        opacity: 0;
        transition: opacity $transition-base;

        @include respond-to("sm") {
            width: 10px;
            height: 10px;
        }
    }

    .progress-bar-wrapper:hover &::after {
        opacity: 1;
    }
}

/* Volume Controls Section */
.volume-controls {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: ($content-padding * 0.75);

    @include respond-to("sm") {
        display: none; // 在小屏幕上隐藏音量控制
    }
}

.volume-bar-wrapper {
    width: 100px;
    height: 6px;
    display: flex;
    align-items: center;
    cursor: pointer;
    background-color: $overlay-medium;
    border-radius: ($border-radius * 2);
    transition: all $transition-base;
    position: relative;
    overflow: hidden;

    &:hover {
        height: 8px;
        background-color: $overlay-light;

        .volume-bar-fill {
            background-color: $accent-green;
        }
    }

    @include respond-to("md") {
        width: 80px;
    }
}

.volume-bar-fill {
    height: 100%;
    background-color: $text-primary;
    border-radius: ($border-radius * 2);
    transition: all $transition-base;
    position: relative;

    &::after {
        content: '';
        position: absolute;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        width: 10px;
        height: 10px;
        background-color: $text-primary;
        border-radius: 50%;
        opacity: 0;
        transition: opacity $transition-base;
    }

    .volume-bar-wrapper:hover &::after {
        opacity: 1;
    }
}

/* 播放模式激活状态已由 .is-active 统一处理 */

/* 加载动画 */
.song-cover.loading {
    animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {

    0%,
    100% {
        opacity: 1;
    }

    50% {
        opacity: 0.5;
    }
}

/* 错误状态 */
.player-bar-container.has-error {
    border-top-color: $danger;

    .progress-bar-fill {
        background-color: $danger;
    }
}

/* 无歌曲状态 */
.player-bar-container.no-song {
    opacity: 0.6;
    pointer-events: none;
}
</style>