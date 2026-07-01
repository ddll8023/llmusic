<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { usePlayerStore, PlayMode } from '../../store/player';
import { useMediaStore } from '../../store/media';
import { useLyricsStore } from '../../store/lyrics';
import { useUiStore } from '../../store/ui';
import defaultCoverImage from '../../assets/default_img.jpg';
import { formatTime } from '../../utils/timeUtils';
import { useAlbumColors } from '../../composables/useAlbumColors';
import { useAutoHideTimer } from '../../composables/useAutoHideTimer';

declare global {
  interface Window {
    sourceNode?: any;
    isAudioPlaying?: any;
    audioContext?: any;
    decodedAudioBuffer?: any;
    songStartTimeInAc?: any;
    songStartOffset?: any;
    gainNode?: any;
    isPositionLocked?: any;
    positionLockTimeout?: any;
    isSeekingFromTimer?: any;
    _onlineAudio?: any;
    _onlineAudioUrl?: string;
    _onlineCoverUrl?: any;
    _seekLockTimeout?: any;
    _onSeeked?: (() => void) | undefined;
    handleAudioEnded?: () => Promise<void>;
    _playOnlineUrl?: (url: string) => void;
  }
}

const playerStore = usePlayerStore();
const mediaStore = useMediaStore();
const uiStore = useUiStore();
const timelineRef = ref<any>(null);
const volumeRef = ref<any>(null);
const coverImage = ref<any>(null);
const isLoadingCover = ref(false);
const coverLoadError = ref(false);
const playbackError = ref<any>(null);
const isDraggingVolume = ref(false);
const onlineDuration = ref(0);
const { extractFromImage, defaultGlow } = useAlbumColors();

const isCollapsed = computed(() => uiStore.playerBarCollapsed)
const progressPct = computed(() => {
  const dur = playerStore.isOnlineSong ? onlineDuration.value : (playerStore.currentSong?.duration || 0)
  return dur > 0 ? Math.min(1, playerStore.currentTime / dur) : 0
})
const progressDeg = computed(() => progressPct.value * 360)

// 自动隐藏定时器
const autoHide = useAutoHideTimer(5000)
watch(isCollapsed, (v) => { if (!v) autoHide.reset() })



// 切歌时自动展开
watch(() => playerStore.currentSong, (newSong, oldSong) => {
  if (newSong && newSong.id !== (oldSong ? oldSong.id : null)) {
    uiStore.expandPlayerBar()
  }
})

const hasValidSong = computed(() => {
  if (playerStore.isOnlineSong) return true
  if (!playerStore.currentSong) return false
  return mediaStore.songs.some((s) => s.id === playerStore.currentSong!.id)
})

const uiShowPlaylist = computed(() => (uiStore as any).showPlaylist);

let scheduledTime = 0;

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

if (!window.audioContext) window.audioContext = null;
if (!window.sourceNode) window.sourceNode = null;
if (!window.decodedAudioBuffer) window.decodedAudioBuffer = null;
if (!window.songStartTimeInAc) window.songStartTimeInAc = 0;
if (!window.songStartOffset) window.songStartOffset = 0;
if (!window.isAudioPlaying) window.isAudioPlaying = false;
if (!window.gainNode) window.gainNode = null;
if (!window.isPositionLocked) window.isPositionLocked = false;
if (!window.positionLockTimeout) window.positionLockTimeout = null;
if (!window.isSeekingFromTimer) window.isSeekingFromTimer = false;

const handleAudioEnded = async () => {
window.handleAudioEnded = handleAudioEnded
    const wasPlaying = window.isAudioPlaying;
    const currentMode = playerStore.playMode;
    if (wasPlaying) {
        window.isAudioPlaying = false;
        const currentSongId = playerStore.currentSong?.id;
        const currentSongTitle = playerStore.currentSong?.title;
        console.log(`onended: 歌曲 ${currentSongTitle} (ID: ${currentSongId}) 播放完成`);
        try {
            if (currentMode === PlayMode.REPEAT_ONE) {
                setTimeout(() => {
                    if (playerStore.playing && playerStore.playMode === PlayMode.REPEAT_ONE) {
                        playerStore.seek(0);
                    }
                }, 50);
            } else {
                await playerStore.playNext(true);
            }
        } catch (error) {
            console.error(`处理歌曲播放完成时出错:`, error);
            if (currentMode === PlayMode.REPEAT_ONE) {
                setTimeout(() => playerStore.seek(0), 50);
            } else {
                playerStore.playNext(true);
            }
        }
    }
};

const initMediaSession = () => {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', () => {
            if (!playerStore.playing) { playerStore.setPlaying(true); }
        });
        navigator.mediaSession.setActionHandler('pause', () => {
            if (playerStore.playing) { playerStore.setPlaying(false); }
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => { playerStore.playPrevious(); });
        navigator.mediaSession.setActionHandler('nexttrack', () => { playerStore.playNext(); });
        navigator.mediaSession.setActionHandler('seekto', (details) => {
            if (details.seekTime !== undefined) { playerStore.seek(details.seekTime); }
        });
        try {
            navigator.mediaSession.setActionHandler('seekbackward', (details) => {
                const skipTime = details.seekOffset || 10;
                playerStore.seek(Math.max(0, playerStore.currentTime - skipTime));
            });
            navigator.mediaSession.setActionHandler('seekforward', (details) => {
                const skipTime = details.seekOffset || 10;
                const maxDur = playerStore.currentSong ? playerStore.currentSong.duration : 0;
                playerStore.seek(Math.min(maxDur, playerStore.currentTime + skipTime));
            });
        } catch (error) { console.log('不支持的媒体会话处理程序:', error); }
    }
};

const updateMediaSessionMetadata = () => {
    if (!('mediaSession' in navigator) || !playerStore.currentSong) return;
    const song = playerStore.currentSong;
    try {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: song.title || '未知歌曲',
            artist: song.artist || '未知艺术家',
            album: song.album || '未知专辑',
            artwork: [{ src: coverImage.value || defaultCoverImage, sizes: '512x512', type: 'image/jpeg' }]
        });
    } catch (error) { console.error('更新媒体会话元数据失败:', error); }
};

const updateMediaSessionPlaybackState = () => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = playerStore.playing ? 'playing' : 'paused';
};

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
    } catch (error) { console.error('更新媒体会话播放位置失败:', error); }
};

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
    if (!window.decodedAudioBuffer || !window.audioContext) return;
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

const resetAudioPlayer = () => {
    if (window.sourceNode) {
        window.isAudioPlaying = false;
        window.sourceNode.onended = null;
        window.sourceNode.stop();
        window.sourceNode = null;
    }
    window.decodedAudioBuffer = null;
    window.songStartTimeInAc = 0;
    window.songStartOffset = 0;
};

const handleOnlinePlayback = () => {
    const url = window._onlineAudioUrl;
    if (!url) return;
    if (!window._onlineAudio) {
        window._onlineAudio = new Audio();
        window._onlineAudio.addEventListener('timeupdate', () => {
            if (!window.isPositionLocked && window._onlineAudio) {
                playerStore.updateCurrentTime(window._onlineAudio.currentTime);
            }
        });
        window._onlineAudio.addEventListener('loadedmetadata', () => {
            if (window._onlineAudio && isFinite(window._onlineAudio.duration)) {
                onlineDuration.value = window._onlineAudio.duration;
            }
        });
        window._onlineAudio.addEventListener('ended', () => {
            if (playerStore.playMode === PlayMode.REPEAT_ONE) {
                window._onlineAudio.currentTime = 0;
                window._onlineAudio.play().catch(e => console.error('在线单曲循环重启失败:', e));
                playerStore.currentTime = 0;
                return;
            }
            playerStore.playNext(true);
        });
        window._onlineAudio.addEventListener('error', (e) => {
            console.error('在线播放出错:', e);
            playbackError.value = '在线播放失败';
        });
    }
    if (window._onlineAudio.src !== url) {
        window._onlineAudio.src = url;
    }
    window._onlineAudio.play().catch(e => console.error('在线播放启动失败:', e));
};

window._playOnlineUrl = (url: string) => {
    if (!url) return;
    if (!window._onlineAudio) {
        window._onlineAudio = new Audio();
        window._onlineAudio.addEventListener('timeupdate', () => {
            if (!window.isPositionLocked && window._onlineAudio) {
                playerStore.updateCurrentTime(window._onlineAudio.currentTime);
            }
        });
        window._onlineAudio.addEventListener('loadedmetadata', () => {
            if (window._onlineAudio && isFinite(window._onlineAudio.duration)) {
                onlineDuration.value = window._onlineAudio.duration;
            }
        });
        window._onlineAudio.addEventListener('ended', () => {
            if (playerStore.playMode === PlayMode.REPEAT_ONE) {
                window._onlineAudio.currentTime = 0;
                window._onlineAudio.play().catch(e => console.error('在线单曲循环重启失败:', e));
                playerStore.currentTime = 0;
                return;
            }
            playerStore.playNext(true);
        });
        window._onlineAudio.addEventListener('error', (e) => {
            console.error('在线播放出错:', e);
            playbackError.value = '在线播放失败';
        });
    }
    if (window._onlineAudio.src !== url && !window._onlineAudio.src.endsWith(url)) {
        window._onlineAudio.src = url;
    }
    window._onlineAudio.play().catch(e => console.error('在线播放启动失败:', e));
};

const progressPercentage = computed(() => {
    if (progressPct.value <= 0) return '2%'
    return `${Math.round(progressPct.value * 100)}%`
});

const displaySongTitle = computed(() =>
    playerStore.isOnlineSong ? playerStore.onlineSongName : (playerStore.currentSong?.title || '')
);
const displaySongArtist = computed(() =>
    playerStore.isOnlineSong ? playerStore.onlineSinger : (playerStore.currentSong?.artist || '')
);
const displayDuration = computed(() => {
    if (playerStore.isOnlineSong) return formatTime(onlineDuration.value);
    return formatTime(playerStore.currentSong?.duration || 0);
});

const volumePercentage = computed(() => `${playerStore.volume * 100}%`);

const setPlayTime = (event: any) => {
    if (!timelineRef.value) return;
    if (!playerStore.isOnlineSong && !playerStore.currentSong) return;
    if (playerStore.isOnlineSong) {
        const rect = timelineRef.value.getBoundingClientRect();
        const percent = (event.clientX - rect.left) / rect.width;
        const audio = window._onlineAudio;
        if (!audio) return;
        const duration = audio.duration || onlineDuration.value || 0;
        if (duration <= 0) return;
        const newTime = percent * duration;
        if (window._seekLockTimeout) { clearTimeout(window._seekLockTimeout); }
        if (window._onSeeked) { audio.removeEventListener('seeked', window._onSeeked); }
        window.isPositionLocked = true;
        playerStore.seek(newTime);
        audio.currentTime = newTime;
        window._onSeeked = () => {
            window.isPositionLocked = false;
            window._onSeeked = undefined;
            if (window._seekLockTimeout) { clearTimeout(window._seekLockTimeout); window._seekLockTimeout = undefined; }
        };
        audio.addEventListener('seeked', window._onSeeked);
        window._seekLockTimeout = setTimeout(() => {
            if (window.isPositionLocked) {
                window.isPositionLocked = false;
                audio.removeEventListener('seeked', window._onSeeked!);
                window._onSeeked = undefined;
                playerStore.updateCurrentTime(audio.currentTime);
            }
            window._seekLockTimeout = undefined;
        }, 1000);
        return;
    }
    if (!playerStore.currentSong || !window.decodedAudioBuffer) return;
    const rect = timelineRef.value.getBoundingClientRect();
    const percent = (event.clientX - rect.left) / rect.width;
    const newTime = percent * window.decodedAudioBuffer.duration;
    if (window.positionLockTimeout) { clearTimeout(window.positionLockTimeout); }
    window.isPositionLocked = true;
    window.positionLockTimeout = setTimeout(() => { window.isPositionLocked = false; }, 300);
    playerStore.seek(newTime);
};

const setVolume = (event: any) => {
    if (!volumeRef.value) return;
    const rect = volumeRef.value.getBoundingClientRect();
    const percent = (event.clientX - rect.left) / rect.width;
    playerStore.setVolume(Math.max(0, Math.min(1, percent)));
};

const toggleMute = () => { playerStore.setMuted(!playerStore.muted); };

const startVolumeChange = (event: any) => {
    isDraggingVolume.value = true;
    autoHide.pauseOnDrag();
    updateVolume(event);
    document.addEventListener('mousemove', updateVolume);
    document.addEventListener('mouseup', endVolumeChange);
};

function calcVolumeFromEvent(event: any): number {
    const target = volumeRef.value
    if (!target) return playerStore.volume
    const rect = target.getBoundingClientRect()
    if (rect.width <= 0) return playerStore.volume
    return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
}

const updateVolume = (event: any) => {
    const vol = calcVolumeFromEvent(event)
    playerStore.setVolume(vol)
};

const endVolumeChange = () => {
    isDraggingVolume.value = false;
    document.removeEventListener('mousemove', updateVolume);
    document.removeEventListener('mouseup', endVolumeChange);
    autoHide.resumeAfterDrag();
};

const togglePlayPause = async () => {
    if (!playerStore.currentSong && !playerStore.isOnlineSong) { playerStore.setPlaying(false); return; }
    if (!playerStore.isOnlineSong) initAudioContext();
    playerStore.setPlaying(!playerStore.playing);
};

const togglePlayMode = () => {
    const modes = [PlayMode.SEQUENCE, PlayMode.RANDOM, PlayMode.REPEAT_ONE];
    const currentIndex = modes.indexOf(playerStore.playMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    playerStore.setPlayMode(modes[nextIndex]);
};

const playModeIconName = computed(() => {
    switch (playerStore.playMode) {
        case PlayMode.RANDOM: return 'random';
        case PlayMode.REPEAT_ONE: return 'repeat';
        case PlayMode.SEQUENCE: default: return 'refresh';
    }
});

const loadSongCover = async (songId: any) => {
    if (!songId) { coverImage.value = null; coverLoadError.value = false; return; }
    isLoadingCover.value = true;
    coverLoadError.value = false;
    try {
        const result = await (window.electronAPI.getSongCover(songId) as any);
        if (result.success && result.cover) {
            if (!result.cover || result.cover.length === 0) { coverImage.value = null; coverLoadError.value = true; return; }
            if (!/^[A-Za-z0-9+/=]+$/.test(result.cover)) { coverImage.value = null; coverLoadError.value = true; return; }
            coverImage.value = `data:${result.format};base64,${result.cover}`;
            updateMediaSessionMetadata();
        } else { coverImage.value = null; coverLoadError.value = true; }
    } catch (error) {
        console.error("加载封面时发生异常:", error);
        coverImage.value = null; coverLoadError.value = true;
    } finally { isLoadingCover.value = false; }
};

const onCoverImageError = () => {
    coverLoadError.value = true;
    if (coverImage.value !== defaultCoverImage) {
        coverImage.value = defaultCoverImage;
        updateMediaSessionMetadata();
    }
};

// 节奏脉冲状态
const isPulsing = ref(false);
let pulseTimer: any = null;

// 更新专辑封面背景光晕
function updateAlbumGlow(src: string | null) {
  if (!src || src === defaultCoverImage) {
    document.documentElement.style.setProperty('--album-glow', defaultGlow);
    return;
  }
  extractFromImage(src);
}

const showLyrics = async () => {
    if (!playerStore.isOnlineSong && !playerStore.currentSong) return;
    try {
        if (playerStore.isOnlineSong) {
            const lyricsStore = useLyricsStore()
            if (!lyricsStore.hasLyrics && playerStore.onlineSongMid) {
                await lyricsStore.loadOnlineLyricsByMid(playerStore.onlineSongMid)
            }
            playerStore.showLyricsDisplay();
            return;
        }
        if (!playerStore.currentSong) return;
        const lyricsStore = useLyricsStore()
        if (!lyricsStore.hasLyrics) { await lyricsStore.loadLyrics(playerStore.currentSong.id); }
        playerStore.showLyricsDisplay();
    } catch (err) { console.error(`显示歌词时出错: ${(err as any).message}`); }
};

// === Watchers (audio logic - unchanged) ===
watch(() => playerStore.currentSong, (newSong, oldSong) => {
    if (newSong && newSong.id !== (oldSong ? oldSong.id : null)) {
        playbackError.value = null;
        resetAudioPlayer();
        if (playerStore.isOnlineSong) {
            coverImage.value = window._onlineCoverUrl || null;
        } else {
            loadSongCover(newSong.id);
            window.electronAPI.playerPlay({ filePath: newSong.filePath });
        }
        updateMediaSessionMetadata();
    } else if (!newSong) {
        if (playerStore.isOnlineSong) {
            coverImage.value = window._onlineCoverUrl || null;
            handleOnlinePlayback();
            updateMediaSessionMetadata();
            return;
        }
        resetAudioPlayer();
        coverImage.value = null;
        playerStore.setPlaying(false);
    }
}, { deep: true });

watch(() => playerStore.onlineSongName, (newName) => {
    if (newName && playerStore.isOnlineSong) {
        coverImage.value = window._onlineCoverUrl || null;
        updateMediaSessionMetadata();
    }
});

watch(() => mediaStore.songs.length, (newLen, oldLen) => {
    if (oldLen === 0 && newLen > 0 && playerStore.currentSong && !playerStore.isOnlineSong) {
        const song = mediaStore.songs.find((s) => s.id === playerStore.currentSong!.id)
        if (song) {
            loadSongCover(song.id)
            window.electronAPI.playerPlay({ filePath: song.filePath })
            updateMediaSessionMetadata()
        }
    }
})

watch(() => playerStore.playing, async (isPlaying) => {
    if (!playerStore.isOnlineSong && !playerStore.currentSong) { resetAudioPlayer(); return; }
    if (playerStore.isOnlineSong) {
        const audio = window._onlineAudio;
        if (!isPlaying) { if (audio) audio.pause(); }
        else { if (audio) audio.play().catch(e => console.error('在线恢复播放失败:', e)); }
        updateMediaSessionPlaybackState();
        return;
    }
    if (isPlaying) {
        initAudioContext();
        if (window.audioContext.state === 'suspended') { await window.audioContext.resume(); }
        if (window.decodedAudioBuffer) {
            safeStopAudioSource();
            window.sourceNode = window.audioContext.createBufferSource();
            window.sourceNode.buffer = window.decodedAudioBuffer;
            if (window.gainNode) window.sourceNode.connect(window.gainNode);
            window.sourceNode.onended = handleAudioEnded;
            const currentPosition = playerStore.currentTime;
            window.sourceNode.start(0, currentPosition);
            window.songStartTimeInAc = window.audioContext.currentTime;
            window.songStartOffset = currentPosition;
            window.isAudioPlaying = true;
        }
    } else {
        if (window.audioContext && window.audioContext.state === 'running') {
            let currentPosition;
            if (window.isPositionLocked) { currentPosition = playerStore.currentTime; }
            else {
                const elapsedTime = window.audioContext.currentTime - window.songStartTimeInAc;
                currentPosition = window.songStartOffset + elapsedTime;
            }
            safeStopAudioSource();
            window.songStartOffset = currentPosition;
            window.isAudioPlaying = false;
            playerStore.updateCurrentTime(currentPosition);
        }
    }
    updateMediaSessionPlaybackState();
});

watch(() => playerStore.volume, (newVolume) => {
    if (window.gainNode && !playerStore.muted) { window.gainNode.gain.value = newVolume; }
    if (window._onlineAudio) { window._onlineAudio.volume = newVolume; }
});

watch(() => playerStore.muted, (newMuted) => {
    if (window.gainNode) { window.gainNode.gain.value = newMuted ? 0 : playerStore.volume; }
    if (window._onlineAudio) { window._onlineAudio.volume = newMuted ? 0 : playerStore.volume; }
});

watch(() => playerStore.playMode, (newMode) => {
    if (newMode === PlayMode.REPEAT_ONE && playerStore.currentSong) {
        if ((playerStore.currentSong.duration - playerStore.currentTime) < 0.5) { playerStore.seek(0); }
    }
});

watch(() => coverImage.value, () => {
  updateMediaSessionMetadata();
  if (coverImage.value) updateAlbumGlow(coverImage.value);
});
watch(() => playerStore.currentTime, () => { updateMediaSessionPosition(); });

// 自动隐藏 idle 触发收缩
watch(() => autoHide.isIdle.value, (idle) => {
  if (idle && !isCollapsed.value) {
    uiStore.collapsePlayerBar()
  }
})

const handleKeydown = (event: any) => {
    if (event.key === ' ' && document.activeElement?.tagName !== 'INPUT') {
        event.preventDefault();
        playerStore.togglePlay();
    } else if (event.key === 'ArrowLeft') {
        playerStore.seek(Math.max(0, playerStore.currentTime - 5));
        if (playerStore.isOnlineSong && window._onlineAudio) { window._onlineAudio.currentTime = Math.max(0, playerStore.currentTime - 5); }
    } else if (event.key === 'ArrowRight') {
        const maxDur = playerStore.isOnlineSong ? onlineDuration.value : (playerStore.currentSong?.duration || 0);
        if (maxDur > 0) {
            playerStore.seek(Math.min(maxDur, playerStore.currentTime + 5));
            if (playerStore.isOnlineSong && window._onlineAudio) { window._onlineAudio.currentTime = Math.min(maxDur, playerStore.currentTime + 5); }
        }
    }
};

onMounted(async () => {
    let removeAudioDataListener: any, removeErrorListener: any, progressTimer: any;
    window.addEventListener('keydown', handleKeydown);
    onUnmounted(() => {
        window.removeEventListener('keydown', handleKeydown);
        if (isDraggingVolume.value) {
            document.removeEventListener('mousemove', updateVolume);
            document.removeEventListener('mouseup', endVolumeChange);
        }
        if (removeErrorListener) removeErrorListener();
        if (removeAudioDataListener) removeAudioDataListener();
        if (progressTimer) clearInterval(progressTimer);
        if (pulseTimer) clearInterval(pulseTimer);
        if (window.audioContext) { window.audioContext.close(); window.audioContext = null; }
        if ('mediaSession' in navigator) {
            try {
                navigator.mediaSession.setActionHandler('play', null);
                navigator.mediaSession.setActionHandler('pause', null);
                navigator.mediaSession.setActionHandler('previoustrack', null);
                navigator.mediaSession.setActionHandler('nexttrack', null);
                navigator.mediaSession.setActionHandler('seekto', null);
                navigator.mediaSession.setActionHandler('seekbackward', null);
                navigator.mediaSession.setActionHandler('seekforward', null);
                navigator.mediaSession.metadata = null;
            } catch (error) { console.error('清理媒体会话处理程序失败:', error); }
        }
        window.electronAPI.playerStop().catch(error => { console.error('停止播放失败:', error); });
    });
    playerStore.loadPlayerState();
    initAudioContext();
    initMediaSession();
    if (playerStore.currentSong) {
        updateMediaSessionMetadata();
        updateMediaSessionPlaybackState();
        updateMediaSessionPosition();
    }
    removeAudioDataListener = window.electronAPI.onPlayerAudioData(async (buffer: any) => {
        try {
            if (!buffer || buffer.byteLength === 0) { throw new Error("Received an empty audio buffer."); }
            const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
            window.decodedAudioBuffer = await window.audioContext.decodeAudioData(arrayBuffer);
            if (playerStore.currentSong) {
                playerStore.updateSongDuration(playerStore.currentSong.id, window.decodedAudioBuffer.duration);
                updateMediaSessionMetadata();
                updateMediaSessionPosition();
            }
            if (playerStore.playing) {
                playAudioBuffer(0);
                updateMediaSessionPlaybackState();
            }
            if (playerStore.currentTime > 0) { window.songStartOffset = playerStore.currentTime; }
        } catch (error) {
            console.error("解码音频数据时出错:", error);
            playbackError.value = `音频解码失败: ${(error as any).message}`;
            window.decodedAudioBuffer = null;
            playerStore.setPlaying(false);
        }
    });
    removeErrorListener = window.electronAPI.onPlayerError((error: any) => {
        console.error('播放器错误:', error);
        playbackError.value = `播放错误: ${error.error || '未知错误'}`;
        playerStore.setPlaying(false);
    });
    progressTimer = setInterval(async () => {
        if (playerStore.playing && window.isAudioPlaying && window.audioContext && window.audioContext.state === 'running') {
            if (window.isPositionLocked) return;
            const elapsedTime = window.audioContext.currentTime - window.songStartTimeInAc;
            const newCurrentTime = window.songStartOffset + elapsedTime;
            if (window.decodedAudioBuffer && newCurrentTime < window.decodedAudioBuffer.duration) {
                playerStore.updateCurrentTime(newCurrentTime);
                if (playerStore.playMode === PlayMode.REPEAT_ONE && (window.decodedAudioBuffer.duration - newCurrentTime) < 0.2) {
                    window.isAudioPlaying = false;
                    await handleRepeatOneReplay();
                }
            } else if (window.decodedAudioBuffer && newCurrentTime >= window.decodedAudioBuffer.duration) {
                window.isAudioPlaying = false;
                if (playerStore.playMode !== PlayMode.REPEAT_ONE) { playerStore.playNext(true); }
                else { await handleRepeatOneReplay(); }
            }
        }
    }, 100);
    // 窗口失焦时自动收缩（必须在 await 前注册，否则 onUnmounted 失效）
    const handleBlur = () => { if (uiStore.playerBarAutoHide) uiStore.collapsePlayerBar() }
    window.addEventListener('blur', handleBlur);
    onUnmounted(() => window.removeEventListener('blur', handleBlur));

    try {
        const status = await (window.electronAPI.playerGetStatus() as any);
        if (status.success && status.state === 'playing') { playerStore.updateCurrentTime(status.position); }
    } catch (error) { console.error('获取播放状态失败:', error); }

    // 启动节奏脉冲
    pulseTimer = setInterval(() => {
      if (playerStore.playing) {
        isPulsing.value = true;
        setTimeout(() => { isPulsing.value = false; }, 600);
      }
    }, 2400);

    autoHide.start();
});
</script>

<template>
  <!-- 玻璃 Ribbon -->
  <div :class="['ribbon-wrap', { collapsed: isCollapsed }]"
    role="region" aria-label="播放控制栏"
    @mouseenter="autoHide.reset()" @mouseleave="autoHide.start()">
    <div :class="['ribbon w-full', { 'ribbon-pulse': isPulsing }]"
      :style="{ '--progress-deg': progressDeg + 'deg' }"
      @mouseenter="autoHide.reset()">
      <!-- 封面（全模式） -->
      <div v-show="!isCollapsed" class="ribbon-cover" @click="showLyrics" title="点击查看歌词">
        <img :src="coverImage || defaultCoverImage"
          :class="['rcover-img', { 'mini': isCollapsed }, isLoadingCover ? 'animate-pulse' : '']"
          alt="cover" @error="onCoverImageError" />
      </div>

      <!-- 歌曲信息（全模式） -->
      <div v-show="!isCollapsed" class="ribbon-track">
        <template v-if="hasValidSong">
          <div class="rt-name">{{ displaySongTitle }}</div>
          <div class="rt-artist">{{ displaySongArtist }}</div>
        </template>
        <template v-else>
          <div class="rt-name" style="color:#535353;letter-spacing:2px;font-weight:400">LLMusic</div>
          <div class="rt-artist" style="color:#383838">&nbsp;</div>
        </template>
      </div>

      <!-- 迷你态：B2 胶囊浮标 -->
      <template v-if="isCollapsed">
        <div class="pf-cover" @click="showLyrics" title="点击查看歌词">
          <img :src="coverImage || defaultCoverImage"
            class="rcover-img"
            alt="cover" @error="onCoverImageError" />
        </div>
        <div class="pf-info" :title="displaySongTitle + ' - ' + displaySongArtist">
          <div class="pf-name">{{ hasValidSong ? displaySongTitle : 'LLMusic' }}</div>
          <div class="pf-artist">{{ hasValidSong ? displaySongArtist : ' ' }}</div>
        </div>
        <button class="pf-play" title="播放/暂停" @click="togglePlayPause">{{ playerStore.playing ? '⏸' : '▶' }}</button>
        <button class="pf-expand" title="展开" @click="uiStore.expandPlayerBar()">▲</button>
      </template>

      <!-- 全模式追踪信息 -->
      <template v-if="!isCollapsed">
        <!-- 音质标签 -->
        <span v-if="hasValidSong" class="ribbon-badge">SQ · FLAC</span>
        <span v-else class="ribbon-badge" style="opacity:0">SQ · FLAC</span>

        <!-- 分隔 -->
        <span class="rdivider"></span>

        <!-- 主控制 -->
        <div class="rbtn-group">
          <button class="rbtn" title="上一首" @click="playerStore.playPrevious">⏮</button>
          <button class="rbtn rbtn-play" title="播放/暂停" @click="togglePlayPause">{{ playerStore.playing ? '⏸' : '▶' }}</button>
          <button class="rbtn" title="下一首" @click="playerStore.playNext()">⏭</button>
        </div>

        <!-- 分隔 -->
        <span class="rdivider"></span>

        <!-- 进度 -->
        <div class="rprog">
          <span class="rprog-time">{{ formatTime(playerStore.currentTime) }}</span>
          <div ref="timelineRef" class="rprog-track" @click="setPlayTime">
            <div class="rprog-fill" :style="{ width: progressPercentage }"></div>
          </div>
          <span class="rprog-time">{{ displayDuration }}</span>
        </div>

        <!-- 分隔 -->
        <span class="rdivider"></span>

        <!-- 辅助控制 -->
        <div class="rbtn-group">
          <button class="rbtn" title="收藏" :class="{ 'active': false }">♡</button>
          <button class="rbtn" title="播放模式" :class="{ 'active': playerStore.playMode !== 'sequence' }" style="font-size:12px" @click="togglePlayMode">{{ playModeIconName === 'random' ? '🔀' : playModeIconName === 'repeat' ? '🔁' : '🔂' }}</button>
          <button class="rbtn" title="歌词" style="font-size:14px" @click="showLyrics">♫</button>
          <button class="rbtn" title="播放列表" :class="{ 'active': uiShowPlaylist }" style="font-size:13px" @click="uiStore.togglePlaylist()">☰</button>
        </div>

        <!-- 分隔 -->
        <span class="rdivider"></span>

        <!-- 音量 -->
        <div class="rvol" title="音量">
          <span class="rvol-icon" @click="toggleMute">{{ playerStore.muted || playerStore.volume === 0 ? '🔇' : playerStore.volume < 0.5 ? '🔉' : '🔊' }}</span>
          <span ref="volumeRef" class="rvol-bar" @mousedown="startVolumeChange">
            <span class="rvol-fill" :style="{ width: volumePercentage }"></span>
          </span>
        </div>
      </template>

      <!-- 展开/收缩按钮（仅全模式） -->
      <button v-show="!isCollapsed" class="rcollapse-btn" title="收缩"
        @click="uiStore.collapsePlayerBar()">▼</button>
    </div>
  </div>
</template>

<style scoped>
/* ===== 外层容器（固定定位） ===== */
.ribbon-wrap {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 210;
  width: calc(100% - 56px);
  max-width: 960px;
  transition: max-width 0.35s cubic-bezier(.16,1,.3,1);
}

/* ===== Ribbon 主体（玻璃胶囊） ===== */
.ribbon {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 64px;
  padding: 0 14px 0 12px;
  border-radius: 50px;
  background: rgba(0,0,0,.12);
  backdrop-filter: saturate(1.8) brightness(1.16) blur(12px);
  -webkit-backdrop-filter: saturate(1.8) brightness(1.16) blur(12px);
  box-shadow:
    inset 0 0 2px 1px rgba(255,255,255,.32),
    inset 0 0 10px 4px rgba(255,255,255,.13),
    0 4px 16px rgba(17,17,26,.08),
    0 8px 24px rgba(17,17,26,.08),
    0 16px 56px rgba(17,17,26,.08),
    inset 0 4px 16px rgba(17,17,26,.08),
    inset 0 8px 24px rgba(17,17,26,.08),
    inset 0 16px 56px rgba(17,17,26,.08);
  transition: box-shadow 0.35s ease, height 0.35s cubic-bezier(.16,1,.3,1), padding 0.35s ease, gap 0.35s ease;
  position: relative;
  overflow: clip;
}
/* 底部微光进度线 */
.ribbon::before {
  content: '';
  position: absolute;
  bottom: 0;
  left: 52px;
  right: 52px;
  height: 2px;
  background: linear-gradient(90deg, rgba(255,255,255,.04), rgba(255,255,255,.15), rgba(255,255,255,.04));
  border-radius: 2px;
  transition: height 0.3s ease, background 0.3s ease;
}
.ribbon-wrap:hover .ribbon::before {
  height: 3px;
  background: linear-gradient(90deg, rgba(76,175,80,.25), rgba(76,175,80,.65), rgba(76,175,80,.25));
}
/* hover 玻璃增强 */
.ribbon-wrap:hover .ribbon {
  box-shadow:
    inset 0 0 2px 1px rgba(255,255,255,.4),
    inset 0 0 12px 5px rgba(255,255,255,.16),
    0 4px 20px rgba(17,17,26,.1),
    0 8px 28px rgba(17,17,26,.1),
    0 16px 60px rgba(17,17,26,.1),
    inset 0 4px 20px rgba(17,17,26,.1),
    inset 0 8px 28px rgba(17,17,26,.1),
    inset 0 16px 60px rgba(17,17,26,.1);
}

/* ===== 封面 ===== */
.ribbon-cover {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  flex-shrink: 0;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.35s ease, box-shadow 0.35s ease;
  position: relative;
}
.ribbon-cover::after {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(135deg, rgba(255,255,255,.06), transparent);
  border-radius: inherit;
  pointer-events: none;
}
.rcover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.ribbon-wrap:hover .ribbon-cover {
  transform: scale(1.05);
  box-shadow: 0 0 20px rgba(255,255,255,.06);
}

/* ===== 歌曲信息 ===== */
.ribbon-track {
  flex: 0 0 auto;
  min-width: 0;
  max-width: 160px;
}
.rt-name {
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rt-artist {
  font-size: 11px;
  color: #b3b3b3;
  margin-top: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ===== 音质标签 ===== */
.ribbon-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 20px;
  background: rgba(255,255,255,.05);
  color: #888;
  white-space: nowrap;
  flex-shrink: 0;
  letter-spacing: 0.3px;
  transition: background 0.3s ease, color 0.3s ease;
}
.ribbon-wrap:hover .ribbon-badge {
  background: rgba(76,175,80,.12);
  color: #4caf50;
}

/* ===== 分隔线 ===== */
.rdivider {
  width: 1px;
  height: 24px;
  background: rgba(255,255,255,.05);
  flex-shrink: 0;
}

/* ===== 按钮 ===== */
.rbtn-group {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.rbtn {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: rgba(255,255,255,.5);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all 0.2s ease;
  flex-shrink: 0;
}
.rbtn:hover {
  background: rgba(255,255,255,.08);
  color: #fff;
}
.rbtn.active {
  color: #4caf50;
}
.rbtn-play {
  width: 34px;
  height: 34px;
  background: rgba(255,255,255,.06);
  font-size: 16px;
  color: rgba(255,255,255,.75);
}
.rbtn-play:hover {
  background: rgba(255,255,255,.13);
  color: #fff;
  box-shadow: 0 0 18px rgba(255,255,255,.06);
}

/* ===== 进度 ===== */
.rprog {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 130px;
}
.rprog-time {
  font-size: 11px;
  color: #737373;
  font-variant-numeric: tabular-nums;
  min-width: 30px;
  text-align: center;
  transition: color 0.3s;
}
.ribbon-wrap:hover .rprog-time { color: #aaa; }
.rprog-track {
  flex: 1;
  height: 3px;
  background: rgba(255,255,255,.07);
  border-radius: 3px;
  position: relative;
  cursor: pointer;
  transition: height 0.25s ease;
}
.ribbon-wrap:hover .rprog-track { height: 5px; }
.rprog-fill {
  height: 100%;
  background: linear-gradient(90deg, #fff, rgba(255,255,255,.7));
  border-radius: 3px;
  position: relative;
  transition: width 0.3s ease;
}
.rprog-fill::after {
  content: '';
  position: absolute;
  right: -4px;
  top: 50%;
  transform: translateY(-50%);
  width: 7px;
  height: 7px;
  background: #fff;
  border-radius: 50%;
  opacity: 0;
  transition: opacity 0.25s ease;
  box-shadow: 0 0 6px rgba(255,255,255,.3);
}
.ribbon-wrap:hover .rprog-fill::after { opacity: 1; }

/* ===== 音量 ===== */
.rvol {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  cursor: pointer;
  padding: 3px 8px;
  border-radius: 50px;
  transition: background 0.25s;
}
.rvol:hover { background: rgba(255,255,255,.04); }
.rvol-icon {
  font-size: 14px;
  color: rgba(255,255,255,.45);
  transition: color 0.25s;
}
.rvol:hover .rvol-icon { color: rgba(255,255,255,.75); }
.rvol-bar {
  width: 44px;
  height: 3px;
  background: rgba(255,255,255,.07);
  border-radius: 2px;
  position: relative;
  overflow: hidden;
  transition: width 0.25s ease, height 0.25s ease;
}
.ribbon-wrap:hover .rvol-bar { width: 56px; height: 4px; }
.rvol-fill {
  height: 100%;
  background: #fff;
  border-radius: 2px;
  transition: width 0.2s ease;
}

/* ===== 节奏脉冲动画 ===== */
@keyframes ribbonPulse {
  0%, 100% { opacity: 0.85; }
  50% { opacity: 1; }
}
.ribbon-pulse {
  animation: ribbonPulse 0.6s ease-out;
}

/* ===== 响应式 ===== */
@media (max-width: 820px) {
  .ribbon-wrap { width: calc(100% - 32px); bottom: 16px; }
  .ribbon { gap: 5px; padding: 0 10px; height: 60px; }
  .ribbon-cover { width: 38px; height: 38px; }
  .ribbon-track { max-width: 100px; }
  .rt-name { font-size: 12px; }
  .rt-artist { font-size: 10px; }
  .rprog { flex: 0 0 90px; }
  .rprog-time { min-width: 24px; font-size: 10px; }
  .rvol-bar { width: 32px; }
  .ribbon-badge { display: none; }
  .rdivider:last-of-type { display: none; }
}
@media (max-width: 600px) {
  .rprog { flex: 0 0 70px; }
  .rbtn { width: 26px; height: 26px; font-size: 12px; }
  .rbtn-play { width: 30px; height: 30px; font-size: 14px; }
  .rvol-bar { width: 24px; }
  .rvol { padding: 2px 4px; }
}

/* 收缩态响应式 */
@media (max-width: 820px) {
  .ribbon-wrap.collapsed { max-width: 300px; }
  .pf-info { max-width: 100px; }
}
@media (max-width: 600px) {
  .ribbon-wrap.collapsed { max-width: calc(100% - 32px); }
  .pf-cover { width: 30px; height: 30px; }
  .pf-info { max-width: 80px; }
}

/* ===== 收缩态（B2 胶囊浮标） ===== */
.ribbon-wrap.collapsed {
  width: fit-content;
  max-width: 380px;
}
/* SVG 进度环容器 */
.ribbon-wrap.collapsed .ribbon {
  width: auto;
  justify-content: center;
  padding: 0 10px 0 6px;
  gap: 8px;
  height: 52px;
  position: relative;
}
/* 隐藏底部微光线条（由 SVG 进度环替代） */
.ribbon-wrap.collapsed .ribbon::before {
  display: none;
}
/* 收缩态 ::after 边框进度环（使用 conic-gradient） */
.ribbon-wrap.collapsed .ribbon::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 2px;
  background: conic-gradient(
    from 0deg,
    #4caf50 0deg,
    #4caf50 var(--progress-deg, 0deg),
    transparent var(--progress-deg, 0deg),
    transparent 360deg
  ) border-box;
  mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  mask-composite: exclude;
  -webkit-mask-composite: xor;
  pointer-events: none;
}

/* B2 胶囊 · 圆形封面 */
.pf-cover {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  flex-shrink: 0;
  overflow: hidden;
  cursor: pointer;
  position: relative;
}
.pf-cover::after {
  content: '';
  position: absolute; inset: 0;
  border-radius: inherit;
  background: linear-gradient(135deg, rgba(255,255,255,.08), transparent);
  pointer-events: none;
}
.pf-cover .rcover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* B2 胶囊 · 歌曲信息 */
.pf-info {
  min-width: 0;
  max-width: 130px;
  flex-shrink: 1;
}
.pf-name {
  font-size: 12px;
  font-weight: 500;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pf-artist {
  font-size: 10px;
  color: #b3b3b3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 0;
}

/* B2 胶囊 · 播放按钮 */
.pf-play {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: rgba(255,255,255,.08);
  color: rgba(255,255,255,.8);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s ease;
}
.pf-play:hover {
  background: rgba(255,255,255,.16);
  box-shadow: 0 0 18px rgba(255,255,255,.06);
}

/* B2 胶囊 · 展开按钮 */
.pf-expand {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: rgba(255,255,255,.3);
  font-size: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s ease;
}
.pf-expand:hover {
  color: #fff;
  background: rgba(255,255,255,.06);
}

/* 全模式下的展开/收缩按钮 */
.rcollapse-btn {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: rgba(255,255,255,.35);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  flex-shrink: 0;
  transition: all 0.25s ease;
}
.rcollapse-btn:hover {
  color: #fff;
  background: rgba(255,255,255,.06);
}
</style>
