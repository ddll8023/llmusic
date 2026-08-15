<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, watch, computed } from 'vue';
import { usePlayerStore, PlayMode } from '../../store/player';
import { useMediaStore } from '../../store/media';
import { useLyricsStore } from '../../store/lyrics';
import { useUiStore } from '../../store/ui';
import { audioEngine } from '../../core/audio/engine';
import defaultCoverImage from '../../assets/default_img.jpg';
import { formatTime } from '../../utils/timeUtils';
import { useAlbumColors } from '../../composables/useAlbumColors';
import { useAutoHideTimer } from '../../composables/useAutoHideTimer';
import { useDraggable } from '../../composables/useDraggable';

const playerStore = usePlayerStore();
const mediaStore = useMediaStore();
const uiStore = useUiStore();

// ── 音量弹层 ──
const timelineRef = ref<HTMLElement | null>(null);
const volumeRef = ref<HTMLElement | null>(null);
const volumeTriggerRef = ref<HTMLElement | null>(null);
const isVolumePopupVisible = ref(false);
const volumePopupPos = ref({ top: 0, left: 0 });
let volumePopupTimer: ReturnType<typeof setTimeout> | null = null;

const showVolumePopup = () => {
  if (volumePopupTimer) clearTimeout(volumePopupTimer);
  if (!volumeTriggerRef.value) return;
  const rect = volumeTriggerRef.value.getBoundingClientRect();
  volumePopupPos.value = {
    top: rect.top - 8,
    left: rect.left + rect.width / 2
  };
  isVolumePopupVisible.value = true;
};
const hideVolumePopup = () => {
  if (volumePopupTimer) clearTimeout(volumePopupTimer);
  volumePopupTimer = setTimeout(() => { isVolumePopupVisible.value = false; }, 150);
};

// ── 封面 ──
const coverImage = ref<string | null>(null);
const isLoadingCover = ref(false);
const coverLoadError = ref(false);
const isDraggingVolume = ref(false);
const { colors, extractFromImage, defaultGlow } = useAlbumColors();

const isCollapsed = computed(() => uiStore.playerBarCollapsed)
const progressPct = computed(() =>
  playerStore.duration > 0 ? Math.min(1, playerStore.currentTime / playerStore.duration) : 0
)
const progressDeg = computed(() => progressPct.value * 360)

// 自动隐藏定时器
const autoHide = useAutoHideTimer(5000)

// === 收缩态拖拽 ===
const barWrapRef = ref<HTMLElement | null>(null)
const savedDragPos = ref<{ x: number; y: number } | null>(null)

const draggable = useDraggable({
  enabled: () => isCollapsed.value,
  excludeSelector: 'button, a, .n-cover, .n-toggle, .n-play-c',
  bounds: true,
})

/** 计算收缩态的居中位置 */
function computeCenterPosition(el: HTMLElement): { x: number; y: number } {
  const { width, height } = el.getBoundingClientRect()
  return {
    x: (window.innerWidth - width) / 2,
    y: window.innerHeight - 24 - height,
  }
}

// 监听收缩/展开状态变化：展开时保存位置，收缩时恢复
watch(isCollapsed, (collapsed) => {
  if (collapsed) {
    // 收缩 → 恢复上次拖拽位置或居中
    if (savedDragPos.value) {
      draggable.initPosition(savedDragPos.value.x, savedDragPos.value.y)
    } else {
      nextTick(() => {
        if (barWrapRef.value) {
          const pos = computeCenterPosition(barWrapRef.value)
          draggable.initPosition(pos.x, pos.y)
        }
      })
    }
  } else {
    // 展开 → 保存当前位置以便后续恢复
    if (draggable.hasMoved.value) {
      savedDragPos.value = draggable.savePosition()
    }
    autoHide.reset()
  }
})

/** 收缩态拖拽样式 — 用 left/top 覆盖 CSS 居中定位 */
const dragInlineStyle = computed(() => {
  if (!isCollapsed.value || !draggable.hasMoved.value) return undefined
  return {
    left: `${draggable.x.value}px`,
    top: `${draggable.y.value}px`,
    bottom: 'auto',
    transform: 'none',
  }
})

/** 窗口 resize 时修正坐标（防止被裁出视口） */
function clampDragPosition() {
  if (!draggable.hasMoved.value || !barWrapRef.value) return
  const { width, height } = barWrapRef.value.getBoundingClientRect()
  const cx = Math.max(0, Math.min(window.innerWidth - width, draggable.x.value))
  const cy = Math.max(0, Math.min(window.innerHeight - height, draggable.y.value))
  if (cx !== draggable.x.value || cy !== draggable.y.value) {
    draggable.initPosition(cx, cy)
  }
}

const hasValidSong = computed(() => {
  if (playerStore.isOnlineSong) return true
  if (!playerStore.currentSong) return false
  return mediaStore.songs.some((s) => s.id === playerStore.currentSong!.id)
})

const uiShowPlaylist = computed(() => uiStore.isPlaylistVisible);

// ── 媒体会话 ──
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
                if (playerStore.duration > 0) {
                    playerStore.seek(Math.min(playerStore.duration, playerStore.currentTime + skipTime));
                }
            });
        } catch (error) { console.log('不支持的媒体会话处理程序:', error); }
    }
};

const updateMediaSessionMetadata = () => {
    if (!('mediaSession' in navigator)) return;
    if (!playerStore.currentSong && !playerStore.isOnlineSong) {
        navigator.mediaSession.metadata = null;
        return;
    }
    try {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: displaySongTitle.value || '未知歌曲',
            artist: displaySongArtist.value || '未知艺术家',
            album: playerStore.currentSong?.album || '',
            artwork: [{ src: coverImage.value || defaultCoverImage, sizes: '512x512', type: 'image/jpeg' }]
        });
    } catch (error) { console.error('更新媒体会话元数据失败:', error); }
};

const updateMediaSessionPlaybackState = () => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = playerStore.playing ? 'playing' : 'paused';
};

const updateMediaSessionPosition = () => {
    if (!('mediaSession' in navigator) || playerStore.duration <= 0) return;
    try {
        if ('setPositionState' in navigator.mediaSession) {
            navigator.mediaSession.setPositionState({
                duration: playerStore.duration,
                position: Math.min(playerStore.currentTime || 0, playerStore.duration),
                playbackRate: 1.0
            });
        }
    } catch (error) { console.error('更新媒体会话播放位置失败:', error); }
};

// ── 展示字段 ──
const displaySongTitle = computed(() =>
    playerStore.isOnlineSong ? playerStore.onlineSongName : (playerStore.currentSong?.title || '')
);
const displaySongArtist = computed(() =>
    playerStore.isOnlineSong ? playerStore.onlineSinger : (playerStore.currentSong?.artist || '')
);
const displayDuration = computed(() => formatTime(playerStore.duration));

const progressPercentage = computed(() => {
    if (progressPct.value <= 0) return '2%'
    return `${Math.round(progressPct.value * 100)}%`
});

const volumePercentage = computed(() => `${playerStore.volume * 100}%`);
const volumeDisplayText = computed(() => {
  if (playerStore.muted) return '静音'
  return `${Math.round(playerStore.volume * 100)}%`
})

// ── 交互 ──
const setPlayTime = (event: MouseEvent) => {
    if (!timelineRef.value || playerStore.duration <= 0) return;
    const rect = timelineRef.value.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    playerStore.seek(percent * playerStore.duration);
};

const toggleMute = () => { playerStore.setMuted(!playerStore.muted); };

const startVolumeChange = (event: MouseEvent) => {
    isDraggingVolume.value = true;
    autoHide.pauseOnDrag();
    updateVolume(event);
    document.addEventListener('mousemove', updateVolume);
    document.addEventListener('mouseup', endVolumeChange);
};

function calcVolumeFromEvent(event: MouseEvent): number {
    const target = volumeRef.value
    if (!target) return playerStore.volume
    const rect = target.getBoundingClientRect()
    if (rect.height <= 0) return playerStore.volume
    // 垂直：底部=100%，顶部=0%
    return Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height))
}

const updateVolume = (event: MouseEvent) => {
    playerStore.setVolume(calcVolumeFromEvent(event))
};

const endVolumeChange = () => {
    isDraggingVolume.value = false;
    document.removeEventListener('mousemove', updateVolume);
    document.removeEventListener('mouseup', endVolumeChange);
    autoHide.resumeAfterDrag();
};

const togglePlayPause = () => {
    if (!playerStore.currentSong && !playerStore.isOnlineSong) return;
    playerStore.togglePlay();
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
        case PlayMode.SEQUENCE: default: return 'list';
    }
});

const loadSongCover = async (songId: string) => {
    if (!songId) { coverImage.value = null; coverLoadError.value = false; return; }
    isLoadingCover.value = true;
    coverLoadError.value = false;
    try {
        const result = await window.electronAPI.getSongCover(songId);
        if (result.success && result.cover) {
            coverImage.value = `data:${result.format};base64,${result.cover}`;
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
let pulseTimer: ReturnType<typeof setInterval> | null = null;

// 更新专辑封面背景光晕
function updateAlbumGlow(src: string | null) {
  if (!src || src === defaultCoverImage) {
    document.documentElement.style.setProperty('--album-glow', defaultGlow);
    return;
  }
  extractFromImage(src);
}

// 取色完成后把渐变写入全局 CSS 变量（base.css 消费 --album-glow）
watch(() => colors.value.gradient, (gradient) => {
  document.documentElement.style.setProperty('--album-glow', gradient || defaultGlow);
});

const showLyrics = async () => {
    if (!playerStore.isOnlineSong && !playerStore.currentSong) return;
    try {
        const lyricsStore = useLyricsStore()
        if (playerStore.isOnlineSong) {
            if (!lyricsStore.hasLyrics && playerStore.onlineSongMid) {
                await lyricsStore.loadOnlineLyricsByMid(playerStore.onlineSongMid)
            }
        } else if (!lyricsStore.hasLyrics && playerStore.currentSong) {
            await lyricsStore.loadLyrics(playerStore.currentSong.id);
        }
        playerStore.showLyricsDisplay();
    } catch (err) { console.error('显示歌词时出错:', err); }
};

// ── Watchers ──
// 切歌（本地）：加载封面并展开播放栏；音频装载由 playerStore.playSong 内的引擎调用完成
watch(() => playerStore.currentSong?.id, (newId, oldId) => {
    if (playerStore.isOnlineSong) return;
    if (newId && newId !== oldId) {
        uiStore.expandPlayerBar();
        loadSongCover(newId);
        updateMediaSessionMetadata();
    } else if (!newId) {
        coverImage.value = null;
        updateMediaSessionMetadata();
    }
});

// 在线歌曲：封面来自 store 的 onlineCoverUrl
watch(() => [playerStore.isOnlineSong, playerStore.onlineCoverUrl, playerStore.onlineSongName], () => {
    if (playerStore.isOnlineSong) {
        uiStore.expandPlayerBar();
        coverImage.value = playerStore.onlineCoverUrl || null;
        updateMediaSessionMetadata();
    }
});

watch(() => playerStore.playing, () => { updateMediaSessionPlaybackState(); });

// 切到单曲循环时若已接近结尾，立即回到开头避免瞬间切歌
watch(() => playerStore.playMode, (newMode) => {
    if (newMode === PlayMode.REPEAT_ONE && playerStore.duration > 0
        && (playerStore.duration - playerStore.currentTime) < 0.5) {
        playerStore.seek(0);
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

const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === ' ' && document.activeElement?.tagName !== 'INPUT') {
        event.preventDefault();
        playerStore.togglePlay();
    } else if (event.key === 'ArrowLeft') {
        playerStore.seek(Math.max(0, playerStore.currentTime - 5));
    } else if (event.key === 'ArrowRight') {
        if (playerStore.duration > 0) {
            playerStore.seek(Math.min(playerStore.duration, playerStore.currentTime + 5));
        }
    }
};

onMounted(() => {
    window.addEventListener('keydown', handleKeydown);

    // 引擎接线 → 恢复上次会话 → 恢复音源（暂停态）
    playerStore.attachEngine();
    playerStore.loadPlayerState();
    playerStore.restorePlayback();

    initMediaSession();
    if (playerStore.currentSong) {
        loadSongCover(playerStore.currentSong.id);
        updateMediaSessionMetadata();
        updateMediaSessionPlaybackState();
        updateMediaSessionPosition();
    }

    // 窗口失焦时自动收缩
    const handleBlur = () => { if (uiStore.playerBarAutoHide) uiStore.collapsePlayerBar() }
    window.addEventListener('blur', handleBlur);

    // 启动节奏脉冲
    pulseTimer = setInterval(() => {
      if (playerStore.playing) {
        isPulsing.value = true;
        setTimeout(() => { isPulsing.value = false; }, 600);
      }
    }, 2400);

    // 收缩态拖拽绑定
    if (barWrapRef.value) draggable.bind(barWrapRef.value)
    window.addEventListener('resize', clampDragPosition);

    autoHide.start();

    onUnmounted(() => {
        window.removeEventListener('keydown', handleKeydown);
        window.removeEventListener('blur', handleBlur);
        window.removeEventListener('resize', clampDragPosition);
        if (isDraggingVolume.value) {
            document.removeEventListener('mousemove', updateVolume);
            document.removeEventListener('mouseup', endVolumeChange);
        }
        if (pulseTimer) clearInterval(pulseTimer);
        if (volumePopupTimer) clearTimeout(volumePopupTimer);
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
        audioEngine.dispose();
        draggable.unbind();
    });
});
</script>

<template>
  <div ref="barWrapRef"
    :class="['ribbon-wrap', { collapsed: isCollapsed, 'is-dragging': draggable.isDragging.value }]"
    :style="dragInlineStyle"
    role="region" aria-label="播放控制栏"
    @mouseenter="autoHide.reset()" @mouseleave="autoHide.start()">
    <div :class="['ribbon', { 'ribbon-pulse': isPulsing }]"
      :style="{ '--progress-deg': progressDeg + 'deg' }"
      @mouseenter="autoHide.reset()">

      <!-- SVG 色差玻璃覆盖层 -->
      <div class="ribbon-glass-overlay"></div>

      <!-- 封面（始终存在，过渡尺寸/圆角） -->
      <div class="n-cover" @click="showLyrics" title="点击查看歌词">
        <img :src="coverImage || defaultCoverImage"
          :class="['rcover-img', isLoadingCover ? 'animate-pulse' : '']"
          alt="cover" @error="onCoverImageError" />
        <!-- 播放中迷你均衡器 -->
        <div class="n-eq" v-if="playerStore.playing && hasValidSong" aria-hidden="true">
          <span v-for="n in 3" :key="n"></span>
        </div>
      </div>

      <!-- 歌曲信息（始终存在，过渡宽度） -->
      <div class="n-track" :title="displaySongTitle + ' - ' + displaySongArtist">
        <template v-if="hasValidSong">
          <div class="rt-name">{{ displaySongTitle }}</div>
          <div class="rt-artist">{{ displaySongArtist }}</div>
        </template>
        <template v-else>
          <div class="rt-name" style="color:var(--color-content-disabled);letter-spacing:2px;font-weight:400">LLMusic</div>
        </template>
      </div>

      <!-- 辅助控制区（收缩态压缩消失） -->
      <div class="n-aux">
        <span v-if="hasValidSong" class="ribbon-badge">SQ · FLAC</span>
        <span v-else class="ribbon-badge" style="opacity:0">SQ · FLAC</span>

        <span class="rdivider"></span>

        <div class="rbtn-group">
          <button class="rbtn" title="上一首" @click="playerStore.playPrevious"><i class="fa fa-step-backward"></i></button>
          <button class="rbtn n-aux-play" title="播放/暂停"
            @click="togglePlayPause"><i :class="['fa', playerStore.playing ? 'fa-pause' : 'fa-play']"></i></button>
          <button class="rbtn" title="下一首" @click="playerStore.playNext()"><i class="fa fa-step-forward"></i></button>
        </div>

        <span class="rdivider"></span>

        <div class="rprog">
          <span class="rprog-time">{{ formatTime(playerStore.currentTime) }}</span>
          <div ref="timelineRef" class="rprog-track" @click="setPlayTime">
            <div class="rprog-fill" :style="{ width: progressPercentage }"></div>
          </div>
          <span class="rprog-time">{{ displayDuration }}</span>
        </div>

        <span class="rdivider"></span>

        <div class="rbtn-group">
          <button class="rbtn" title="收藏" :class="{ 'active': false }"><i class="fa fa-heart-o"></i></button>
          <button class="rbtn" title="播放模式" :class="{ 'active': playerStore.playMode !== 'sequence' }" @click="togglePlayMode"><i class="fa" :class="'fa-' + playModeIconName"></i></button>
          <button class="rbtn" title="歌词" @click="showLyrics"><i class="fa fa-file-text-o"></i></button>
          <button class="rbtn" title="播放列表" :class="{ 'active': uiShowPlaylist }" @click="uiStore.togglePlaylist()"><i class="fa fa-bars"></i></button>
        </div>

        <span class="rdivider"></span>

        <div class="rvol" title="音量">
          <div class="rvol-trigger"
            ref="volumeTriggerRef"
            @mouseenter="showVolumePopup"
            @mouseleave="hideVolumePopup">
            <span class="rvol-icon" @click="toggleMute"><i :class="['fa', 'fa-fw', playerStore.muted || playerStore.volume === 0 ? 'fa-volume-off' : playerStore.volume < 0.5 ? 'fa-volume-down' : 'fa-volume-up']"></i></span>
          </div>
        </div>
      </div>

      <!-- 收缩态播放按钮 -->
      <button class="n-play-c" v-show="isCollapsed" title="播放/暂停"
        @click="togglePlayPause"><i :class="['fa', playerStore.playing ? 'fa-pause' : 'fa-play']"></i></button>

      <!-- 展开/收缩按钮（始终存在） -->
      <button class="n-toggle"
        :title="isCollapsed ? '展开' : '收缩'"
        @click="isCollapsed ? uiStore.expandPlayerBar() : uiStore.collapsePlayerBar()">
        <i :class="['fa', isCollapsed ? 'fa-chevron-up' : 'fa-chevron-down']"></i>
      </button>
    </div>
  </div>

  <!-- Teleport 音量弹层到 body，避免 overflow 裁剪 -->
  <Teleport to="body">
    <div class="rvol-popup" :class="{ 'is-visible': isVolumePopupVisible }"
      :style="{ top: volumePopupPos.top + 'px', left: volumePopupPos.left + 'px' }"
      @mouseenter="showVolumePopup"
      @mouseleave="hideVolumePopup">
      <span ref="volumeRef" class="rvol-bar" @mousedown="startVolumeChange">
        <span class="rvol-fill" :style="{ height: volumePercentage }"></span>
        <span class="rvol-thumb" :style="{ top: (100 - playerStore.volume * 100) + '%' }"></span>
      </span>
      <span class="rvol-value">{{ volumeDisplayText }}</span>
    </div>
  </Teleport>
</template>

<style scoped>
/* ===== 外层容器（固定定位） ===== */
.ribbon-wrap {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 210;
  width: fit-content;
  max-width: calc(100% - 56px);
  transition: max-width 0.35s cubic-bezier(.16,1,.3,1);
}
.ribbon-wrap.collapsed {
  width: fit-content;
  max-width: 380px;
}

/* ===== Ribbon 主体（玻璃胶囊） ===== */
.ribbon {
  display: flex;
  align-items: center;
  height: 64px;
  border-radius: 50px;
  background: var(--glass-playerbar-bg);
  backdrop-filter: saturate(var(--glass-saturate)) brightness(var(--glass-brightness)) blur(var(--glass-blur));
  -webkit-backdrop-filter: saturate(var(--glass-saturate)) brightness(var(--glass-brightness)) blur(var(--glass-blur));
  box-shadow: var(--glass-panel-shadow);
  transition: height 0.35s cubic-bezier(.16,1,.3,1),
              box-shadow var(--duration-fast) cubic-bezier(.16,1,.3,1);
  position: relative;
  overflow: clip;
  will-change: height, box-shadow;
}
.ribbon-wrap.collapsed .ribbon {
  height: 52px;
}

/* SVG 色差玻璃覆盖层 — 叠加在 backdrop-filter 之上 */
.ribbon-glass-overlay {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  filter: var(--glass-svg-filter);
  will-change: filter;
}

/* hover 玻璃增强 */
.ribbon-wrap:hover .ribbon {
  box-shadow: var(--glass-panel-hover-shadow);
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
  transition: opacity 0.3s ease, height 0.3s ease, background 0.3s ease;
}
.ribbon-wrap.collapsed .ribbon::before {
  opacity: 0;
}
.ribbon-wrap:hover .ribbon::before {
  height: 3px;
  background: linear-gradient(90deg, rgba(76,175,80,.25), rgba(76,175,80,.65), rgba(76,175,80,.25));
}

/* 收缩态 ::after 进度环 */
.ribbon-wrap.collapsed .ribbon::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 2px;
  background: conic-gradient(
    from 0deg,
    var(--color-accent-green) 0deg,
    var(--color-accent-green) var(--progress-deg, 0deg),
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

/* ===== 封面（始终存在，过渡尺寸/圆角） ===== */
.n-cover {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  position: relative;
  margin-left: 12px;
  transition: width 0.35s cubic-bezier(.16,1,.3,1),
              height 0.35s cubic-bezier(.16,1,.3,1),
              border-radius 0.35s cubic-bezier(.16,1,.3,1),
              margin-left 0.35s cubic-bezier(.16,1,.3,1);
}
.n-cover::after {
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

/* ===== 播放中迷你均衡器（封面右下角） ===== */
.n-eq {
  position: absolute;
  right: 4px;
  bottom: 4px;
  z-index: 2;
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 14px;
  padding: 2px 3px;
  border-radius: 7px;
  background: rgba(0,0,0,.5);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  pointer-events: none;
}
.n-eq span {
  width: 2.5px;
  border-radius: 2px;
  background: linear-gradient(to top, var(--color-accent-green), #a5d6a7);
  animation: eqBounce 0.9s ease-in-out infinite;
}
.n-eq span:nth-child(1) { animation-delay: 0s; }
.n-eq span:nth-child(2) { animation-delay: 0.22s; }
.n-eq span:nth-child(3) { animation-delay: 0.44s; }
@keyframes eqBounce {
  0%, 100% { height: 3px; }
  50% { height: 10px; }
}
.ribbon-wrap:hover .n-cover {
  transform: scale(1.05);
  box-shadow: 0 0 20px rgba(255,255,255,.06);
}
.ribbon-wrap.collapsed .n-cover {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  margin-left: 6px;
}

/* ===== 歌曲信息（始终存在，过渡宽度） ===== */
.n-track {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 200px;
  margin: 0 8px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  transition: max-width 0.35s cubic-bezier(.16,1,.3,1),
              margin 0.35s cubic-bezier(.16,1,.3,1);
}
.ribbon-wrap.collapsed .n-track {
  max-width: 130px;
}
.rt-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-content-base);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rt-artist {
  font-size: 11px;
  color: var(--color-content-secondary);
  margin-top: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ===== 辅助控制区（收缩态压缩消失） ===== */
.n-aux {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  white-space: nowrap;
  max-width: 580px;
  opacity: 1;
  transition: max-width 0.35s cubic-bezier(.16,1,.3,1),
              opacity 0.2s ease,
              margin 0.35s cubic-bezier(.16,1,.3,1),
              padding 0.35s cubic-bezier(.16,1,.3,1);
}
.ribbon-wrap.collapsed .n-aux {
  max-width: 0;
  opacity: 0;
  margin: 0;
  padding: 0;
  pointer-events: none;
}

/* ===== 音质标签 ===== */
.ribbon-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 20px;
  background: rgba(255,255,255,.05);
  color: var(--color-content-tertiary);
  white-space: nowrap;
  flex-shrink: 0;
  letter-spacing: 0.3px;
  transition: background 0.3s ease, color 0.3s ease;
}
.ribbon-wrap:hover .ribbon-badge {
  background: rgba(76,175,80,.12);
  color: var(--color-accent-green);
}

/* ===== 分隔线 ===== */
.rdivider {
  width: 1px;
  height: 24px;
  background: rgba(255,255,255,.05);
  flex-shrink: 0;
}

/* ===== 按钮通用 ===== */
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
  color: var(--color-content-base);
}
.rbtn.active {
  color: var(--color-accent-green);
}

/* n-aux 内的播放按钮（展开态使用） */
.n-aux-play {
  width: 34px;
  height: 34px;
  background: rgba(255,255,255,.06);
  font-size: 16px;
  color: rgba(255,255,255,.75);
}
.n-aux-play:hover {
  background: rgba(255,255,255,.13);
  color: var(--color-content-base);
  box-shadow: 0 0 18px rgba(255,255,255,.06);
}

/* ===== 收缩态播放按钮 ===== */
.n-play-c {
  flex-shrink: 0;
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
}
.n-play-c:hover {
  background: rgba(255,255,255,.16);
  box-shadow: 0 0 18px rgba(255,255,255,.06);
}

/* ===== 展开/收缩按钮（始终存在） ===== */
.n-toggle {
  flex-shrink: 0;
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
  margin-right: 10px;
  transition: all 0.25s ease, margin-right 0.35s cubic-bezier(.16,1,.3,1);
}
.n-toggle:hover {
  color: var(--color-content-base);
  background: rgba(255,255,255,.06);
}
.ribbon-wrap.collapsed .n-toggle {
  margin-right: 6px;
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
  color: var(--color-content-tertiary);
  font-variant-numeric: tabular-nums;
  min-width: 30px;
  text-align: center;
  transition: color 0.3s;
}
.ribbon-wrap:hover .rprog-time { color: var(--color-content-secondary); }
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
  background: linear-gradient(90deg, var(--color-content-base), rgba(255,255,255,.7));
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
  background: var(--color-content-base);
  border-radius: 50%;
  opacity: 0;
  transition: opacity 0.25s ease;
  box-shadow: 0 0 6px rgba(255,255,255,.3);
}
.ribbon-wrap:hover .rprog-fill::after { opacity: 1; }

/* ===== 音量 ===== */
/* 外部容器 */
.rvol {
  flex-shrink: 0;
  cursor: pointer;
  padding: 3px 8px;
  border-radius: 50px;
  transition: background 0.25s;
}
.rvol:hover { background: rgba(255,255,255,.04); }

/* 触发区 */
.rvol-trigger {
  display: flex;
  align-items: center;
}

/* Teleport 弹层 — 固定定位，从 body 渲染 */
.rvol-popup {
  position: fixed;
  z-index: 9999;
  transform: translate(-50%, -100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 8px 8px;
  border-radius: 10px;
  background: rgba(0,0,0,.55);
  backdrop-filter: blur(16px) saturate(1.6) brightness(1.1);
  -webkit-backdrop-filter: blur(16px) saturate(1.6) brightness(1.1);
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,.06),
    0 4px 20px rgba(0,0,0,.5),
    0 8px 40px rgba(0,0,0,.3);
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.2s ease,
    transform 0.25s cubic-bezier(.16,1,.3,1);
}
.rvol-popup.is-visible {
  opacity: 1;
  pointer-events: auto;
  transform: translate(-50%, calc(-100% - 8px));
}

/* 垂直轨道 */
.rvol-bar {
  width: 4px;
  height: 80px;
  border-radius: 2px;
  background: rgba(255,255,255,.10);
  position: relative;
  cursor: pointer;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.04);
}

/* 填充条（从底部向上） */
.rvol-fill {
  position: absolute;
  bottom: 0;
  width: 100%;
  border-radius: 2px;
  background: linear-gradient(to top,
    rgba(76,175,80,.55),
    rgba(76,175,80,.30) 50%,
    rgba(255,255,255,.75)
  );
  transition: height 0.15s cubic-bezier(.16,1,.3,1);
}

/* 填充玻璃高光 */
.rvol-fill::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(-90deg,
    rgba(255,255,255,.12) 0%,
    transparent 60%
  );
  pointer-events: none;
}

/* 拖拽手柄 */
.rvol-thumb {
  position: absolute;
  left: 50%;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, rgba(255,255,255,.95), rgba(220,220,220,.8));
  transform: translate(-50%, -50%);
  box-shadow:
    0 0 4px rgba(255,255,255,.25),
    0 0 10px rgba(76,175,80,.12),
    inset 0 0 2px rgba(255,255,255,.6);
  pointer-events: none;
  z-index: 1;
  transition: box-shadow 0.2s ease;
}
.rvol-popup:hover .rvol-thumb {
  box-shadow:
    0 0 6px rgba(255,255,255,.35),
    0 0 18px rgba(76,175,80,.18),
    inset 0 0 2px rgba(255,255,255,.6);
}

/* 音量数值 */
.rvol-value {
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--color-content-secondary);
  text-align: center;
  letter-spacing: 0.3px;
  white-space: nowrap;
}

/* 图标 */
.rvol-icon {
  font-size: 14px;
  color: rgba(255,255,255,.45);
  transition: color 0.25s;
  display: block;
  line-height: 1;
}
.rvol:hover .rvol-icon { color: rgba(255,255,255,.75); }

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
  .ribbon { height: 60px; }
  .ribbon-wrap.collapsed .ribbon { height: 50px; }
  .n-cover { width: 38px; height: 38px; margin-left: 10px; }
  .ribbon-wrap.collapsed .n-cover { width: 34px; height: 34px; margin-left: 5px; }
  .n-track { max-width: 140px; }
  .ribbon-wrap.collapsed .n-track { max-width: 100px; }
  .rt-name { font-size: 12px; }
  .rt-artist { font-size: 10px; }
  .rprog { flex: 0 0 90px; }
  .rprog-time { min-width: 24px; font-size: 10px; }
  .rvol-bar { height: 60px; }
  .rvol-popup { padding: 8px 6px 6px; gap: 4px; }
  .rvol-value { font-size: 9px; }
  .ribbon-badge { display: none; }
  .rdivider:last-of-type { display: none; }
}
@media (max-width: 600px) {
  .rprog { flex: 0 0 70px; }
  .rbtn { width: 26px; height: 26px; font-size: 12px; }
  .n-aux-play { width: 30px; height: 30px; font-size: 14px; }
  .rvol { padding: 2px 4px; }
  .rvol-bar { height: 48px; }
  .rvol-popup { padding: 6px 5px 5px; gap: 3px; }
  .rvol-value { display: none; }
}

@media (max-width: 820px) {
  .ribbon-wrap.collapsed { max-width: 300px; }
}
@media (max-width: 600px) {
  .ribbon-wrap.collapsed { max-width: calc(100% - 32px); }
}

/* ===== 收缩态拖拽 ===== */
.ribbon-wrap.collapsed {
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
}
.ribbon-wrap.collapsed:active {
  cursor: grabbing;
}
.ribbon-wrap.is-dragging {
  box-shadow:
    0 8px 32px rgba(0,0,0,.45),
    0 0 0 1px rgba(255,255,255,.08);
  transition: none !important;
}
</style>
