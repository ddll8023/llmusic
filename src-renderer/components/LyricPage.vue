<template>
    <div class="lyric-page" :class="[
        'lyric-page--' + animationStyle,
        { 'lyric-page--show': playerStore.showLyrics }
    ]" @click="handleBackgroundClick">
        <div class="lyric-page__container">
            <!-- 左侧专辑封面区域 -->
            <div class="lyric-page__album-section">
                <div class="lyric-page__album-cover-container">
                    <img :src="albumCoverUrl" alt="Album Cover" class="lyric-page__album-cover" v-if="albumCoverUrl" />
                    <div class="lyric-page__album-cover-placeholder" v-else>
                        <span>{{ songTitle.charAt(0) }}</span>
                    </div>
                </div>
            </div>

            <!-- 右侧歌词内容区域 -->
            <div class="lyric-page__content-section">
                <div class="lyric-page__header">
                    <div class="lyric-page__song-info">
                        <h2 class="lyric-page__song-title">{{ songTitle }}</h2>
                        <p class="lyric-page__song-artist">{{ songArtist }}</p>
                    </div>
                </div>

                <div class="lyric-page__content" ref="lyricsContainer"
                    :class="{ 'lyric-page__content--manual-scroll': !playerStore.isAutoScrolling }"
                    @wheel="handleManualScroll">
                    <div v-if="hasLyricsToShow" class="lyric-page__lyrics" :class="fontSizeClass">
                        <div class="lyric-page__lyrics-wrapper">
                            <div v-for="(line, index) in processedLyrics" :key="index" class="lyric-page__lyric-line"
                                :ref="el => setLyricLineRef(el, index)"
                                :class="{ 'lyric-page__lyric-line--active': index === playerStore.currentLyricIndex }"
                                @click="playerStore.seekToLyricPosition(index)">
                                <div class="lyric-page__lyric-info" v-if="line.time >= 0">
                                    <div class="lyric-page__lyric-time">
                                        <span>{{ formatTimeFromMs(line.time) }}</span>
                                    </div>
                                    <div class="lyric-page__play-icon">
                                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                            <path d="M8 5v14l11-7z" />
                                        </svg>
                                    </div>
                                </div>
                                <div class="lyric-page__lyric-text">{{ line.text }}</div>
                            </div>
                        </div>
                    </div>
                    <div v-else class="lyric-page__no-lyrics">
                        <div class="lyric-page__no-lyrics-content">
                            <p>当前歌曲暂无歌词</p>
                        </div>
                    </div>

                    <button v-if="!playerStore.isAutoScrolling" class="lyric-page__resume-scroll-btn"
                        @click.stop="resumeAutoScroll">
                        <span>回到当前</span>
                    </button>
                </div>

                <div class="lyric-page__controls">
                    <div class="lyric-page__progress">
                        <span>{{ formattedCurrentTime }}</span>
                    </div>
                    <div class="lyric-page__font-size-controls">
                        <button @click="decreaseFontSize" title="减小字体">
                            <span>A-</span>
                        </button>
                        <button @click="resetFontSize" title="重置字体">
                            <span>A</span>
                        </button>
                        <button @click="increaseFontSize" title="增大字体">
                            <span>A+</span>
                        </button>
                    </div>
                    <div class="lyric-page__sync-controls">
                        <button @click="adjustSync(-500)" title="歌词提前 0.5 秒">
                            <span>-0.5s</span>
                        </button>
                        <button @click="adjustSync(0)" title="重置同步">
                            <span>重置</span>
                        </button>
                        <button @click="adjustSync(500)" title="歌词延后 0.5 秒">
                            <span>+0.5s</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 返回按钮，放在最左上角 -->
        <button class="lyric-page__back-btn" @click="closeLyrics">
            <span>返回</span>
        </button>
    </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onUnmounted, onMounted } from 'vue';
import { usePlayerStore } from '../store/player';
import { useUiStore } from '../store/ui';

const playerStore = usePlayerStore();
const uiStore = useUiStore();
const lyricsContainer = ref(null);
const lyricLineRefs = ref([]);
const manualScrollTimer = ref(null);
const fontSizeClass = ref('normal'); // 'small', 'normal', 'large'
const albumCoverUrl = ref('');

// 格式化毫秒为时间字符串 (mm:ss)
const formatTimeFromMs = (ms) => {
    if (ms < 0) return '--:--';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    // 只显示分钟和秒，使界面更简洁
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

// 动画样式
const animationStyle = computed(() => uiStore.lyricsAnimationStyle);

// 当前歌曲
const currentSong = computed(() => playerStore.currentSong);

// 监听当前歌曲变化，更新封面URL
watch(currentSong, async (newSong) => {
    if (newSong && newSong.id) {
        try {
            const coverData = await window.electronAPI.getSongCover(newSong.id);
            if (coverData && coverData.success && coverData.cover) {
                // 使用cover和format字段构造Data URL
                const format = coverData.format || 'image/jpeg';
                albumCoverUrl.value = `data:${format};base64,${coverData.cover}`;
            } else {
                // 使用默认封面
                albumCoverUrl.value = '';
            }
        } catch (error) {
            console.error('获取封面失败:', error);
            albumCoverUrl.value = '';
        }
    } else {
        albumCoverUrl.value = '';
    }
}, { immediate: true });

// 字体大小调整
const increaseFontSize = () => {
    if (fontSizeClass.value === 'small') fontSizeClass.value = 'normal';
    else if (fontSizeClass.value === 'normal') fontSizeClass.value = 'large';
};

const decreaseFontSize = () => {
    if (fontSizeClass.value === 'large') fontSizeClass.value = 'normal';
    else if (fontSizeClass.value === 'normal') fontSizeClass.value = 'small';
};

const resetFontSize = () => {
    fontSizeClass.value = 'normal';
};

// 在每次渲染时重置 refs 数组
const setLyricLineRef = (el, index) => {
    if (el) {
        lyricLineRefs.value[index] = el;
    }
};

// 当用户使用滚轮时，禁用自动滚动
const handleManualScroll = () => {
    clearTimeout(manualScrollTimer.value);
    if (playerStore.isAutoScrolling) {
        playerStore.setAutoScrolling(false);
    }
    manualScrollTimer.value = setTimeout(() => {
        resumeAutoScroll();
    }, 2000); // 2秒无操作后自动恢复
};

// 恢复自动滚动
const resumeAutoScroll = () => {
    clearTimeout(manualScrollTimer.value);
    playerStore.setAutoScrolling(true);

    // 立即滚动到当前行
    const currentIndex = playerStore.currentLyricIndex;
    if (currentIndex >= 0 && lyricLineRefs.value[currentIndex]) {
        lyricLineRefs.value[currentIndex].scrollIntoView({
            behavior: 'smooth',
            block: 'center',
        });
    }
};

// 获取歌曲信息
const songTitle = computed(() => {
    return playerStore.currentSong ? playerStore.currentSong.title : '未知歌曲';
});

const songArtist = computed(() => {
    return playerStore.currentSong ? playerStore.currentSong.artist : '未知艺术家';
});

// 处理歌词数据，确保每行都有正确的文本
const processedLyrics = computed(() => {
    if (!playerStore.lyrics || !playerStore.lyrics.length) return [];

    return playerStore.lyrics
        .map(line => {
            if (typeof line === 'object' && line !== null) {
                return {
                    time: line.time || -1,
                    // The store should have cleaned it, but as a backup, just ensure it's a string.
                    text: String(line.text || ''),
                    timeText: line.timeText
                };
            }
            if (typeof line === 'string') {
                return { time: -1, text: line };
            }
            return { time: -1, text: '' }; // Should not happen
        })
        .filter(line => line.text.trim() !== '');
});

// 检查是否有歌词可显示
const hasLyricsToShow = computed(() => {
    return playerStore.hasLyrics && processedLyrics.value.length > 0;
});

watch(processedLyrics, () => {
    lyricLineRefs.value = [];
});

// 格式化当前时间
const formattedCurrentTime = computed(() => {
    const time = playerStore.currentTime;
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
});

// 关闭歌词页面
const closeLyrics = () => {
    playerStore.hideLyricsDisplay();
};

// 点击背景关闭
const handleBackgroundClick = (e) => {
    // 只有在点击背景时才关闭歌词页面
    if (e.target.classList.contains('lyric-page')) {
        closeLyrics();
    }
};

// 调整歌词同步
const adjustSync = (adjustment) => {
    if (adjustment === 0) {
        // 重置偏移
        playerStore.setLyricsSyncOffset(0);
    } else {
        // 增加或减少偏移
        playerStore.adjustLyricsSyncOffset(adjustment);
    }
};

// 监听当前歌词行变化，自动滚动
watch(() => playerStore.currentLyricIndex, async (newIndex) => {
    if (newIndex < 0 || !playerStore.isAutoScrolling) return;

    await nextTick();

    const currentLineEl = lyricLineRefs.value[newIndex];
    if (currentLineEl) {
        currentLineEl.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    }
}, { immediate: true });

// 监听动画样式变化，确保平滑过渡
watch(() => uiStore.lyricsAnimationStyle, (newStyle, oldStyle) => {
    // 如果歌词页面当前是显示状态，需要特殊处理样式切换
    if (playerStore.showLyrics) {
        // 临时隐藏歌词页面，避免闪烁
        playerStore.hideLyricsDisplay();

        // 短暂延迟后重新显示，确保动画效果正确应用
        setTimeout(() => {
            playerStore.showLyricsDisplay();
        }, 50);
    }
});

onUnmounted(() => {
    clearTimeout(manualScrollTimer.value);
});
</script>

<style scoped>
.lyric-page {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(15, 14, 31, 0.95);
    color: #fff;
    display: flex;
    flex-direction: column;
    z-index: 100;
    pointer-events: none;
    overflow: hidden;
    visibility: hidden;
    /* 默认隐藏 */
}

/* 淡入淡出动画 */
.lyric-page--fade {
    opacity: 0;
    transition: opacity 0.3s ease, visibility 0s 0.3s;
    /* 延迟visibility变化 */
}

.lyric-page--fade.lyric-page--show {
    opacity: 1;
    visibility: visible;
    /* 显示时可见 */
    transition: opacity 0.3s ease, visibility 0s;
    /* 立即改变visibility */
    pointer-events: all;
}

/* 上滑动画 */
.lyric-page--slide {
    transform: translateY(100%);
    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), visibility 0s 0.4s;
    /* 延迟visibility变化 */
    opacity: 1;
}

.lyric-page--slide.lyric-page--show {
    transform: translateY(0);
    visibility: visible;
    /* 显示时可见 */
    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), visibility 0s;
    /* 立即改变visibility */
    pointer-events: all;
}

.lyric-page__container {
    display: flex;
    width: 100%;
    height: 100%;
    position: relative;
    padding: 0 100px;
    /* 增加整体左右边距至100px */
    box-sizing: border-box;
}

/* 左侧专辑封面区域 */
.lyric-page__album-section {
    width: 40%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    /* 调整内边距 */
    box-sizing: border-box;
}

.lyric-page__album-cover-container {
    width: 100%;
    max-width: 400px;
    aspect-ratio: 1/1;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

.lyric-page__album-cover {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.lyric-page__album-cover-placeholder {
    width: 100%;
    height: 100%;
    background: linear-gradient(45deg, #333, #555);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 72px;
    color: rgba(255, 255, 255, 0.5);
}

/* 返回按钮 */
.lyric-page__back-btn {
    position: absolute;
    top: 20px;
    left: 60px;
    /* 调整左边距，与容器边距保持一定距离 */
    background: none;
    border: none;
    color: #fff;
    font-size: 16px;
    cursor: pointer;
    padding: 8px 12px;
    border-radius: 4px;
    transition: background-color 0.2s;
    z-index: 10;
}

.lyric-page__back-btn:hover {
    background-color: rgba(255, 255, 255, 0.1);
}

/* 右侧歌词内容区域 */
.lyric-page__content-section {
    width: 60%;
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 0 20px;
    /* 调整左右内边距 */
}

.lyric-page__header {
    padding: 24px 0;
    /* 修改为只有上下内边距 */
    display: flex;
    align-items: center;
    justify-content: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    background-color: transparent;
    /* 移除背景色 */
    z-index: 2;
}

.lyric-page__song-info {
    text-align: center;
}

.lyric-page__song-title {
    font-size: 24px;
    margin: 0;
    font-weight: 500;
    margin-bottom: 8px;
}

.lyric-page__song-artist {
    font-size: 16px;
    margin: 0;
    opacity: 0.7;
}

.lyric-page__content {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    position: relative;
    overflow: hidden;
}

.lyric-page__lyrics {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    text-align: center;
    -ms-overflow-style: none;
    /* IE and Edge */
    scrollbar-width: none;
    /* Firefox */
}

.lyric-page__lyrics::-webkit-scrollbar {
    display: none;
    /* Chrome, Safari, Opera */
}

.lyric-page__lyrics-wrapper {
    padding: 50% 0;
    /* 上下留出半个屏幕的高度，确保第一句和最后一句也能居中 */
}

.lyric-page__lyric-line {
    font-size: 20px;
    font-weight: 500;
    padding: 16px 10px;
    border-radius: 8px;
    transition: all 0.3s ease;
    line-height: 1.5;
    cursor: pointer;
    color: rgba(255, 255, 255, 0.5);
    position: relative;
    text-align: center;
}

.lyric-page__lyric-line:hover {
    background-color: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.7);
}

.lyric-page__lyric-line--active {
    color: #ff7700;
    /* 使用橙色作为高亮颜色，与截图一致 */
    transform: scale(1.05);
    font-weight: 700;
}

.lyric-page__lyric-info {
    position: absolute;
    left: 15px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    opacity: 0;
    transition: opacity 0.2s ease;
}

.lyric-page__lyric-line:hover .lyric-page__lyric-info {
    opacity: 1;
}

.lyric-page__lyric-time {
    font-size: 0.8em;
    color: rgba(255, 255, 255, 0.6);
}

.lyric-page__play-icon {
    margin-left: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.6);
}

.lyric-page__lyric-line--active .lyric-page__lyric-time,
.lyric-page__lyric-line--active .lyric-page__play-icon {
    color: #ff7700;
}

.lyric-page__lyric-text {
    display: inline-block;
}

.lyric-page__no-lyrics {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    height: 100%;
    width: 100%;
    opacity: 0.8;
    font-size: 18px;
}

.lyric-page__no-lyrics-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
}

.lyric-page__controls {
    padding: 20px 0;
    /* 修改为只有上下内边距 */
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    background-color: transparent;
    /* 移除背景色 */
    z-index: 2;
}

.lyric-page__progress {
    font-size: 16px;
    opacity: 0.7;
}

.lyric-page__font-size-controls {
    display: flex;
    gap: 10px;
}

.lyric-page__font-size-controls button {
    padding: 5px 10px;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: white;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
}

.lyric-page__font-size-controls button:hover {
    background: rgba(255, 255, 255, 0.2);
}

.lyric-page__sync-controls {
    display: flex;
    gap: 10px;
}

.lyric-page__sync-controls button {
    padding: 5px 10px;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: white;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
}

.lyric-page__sync-controls button:hover {
    background: rgba(255, 255, 255, 0.2);
}

/* 手动滚动样式 */
.lyric-page__content--manual-scroll .lyric-page__lyrics {
    /* 当手动滚动时，可以显示滚动条以便操作 */
    -ms-overflow-style: auto;
    scrollbar-width: auto;
}

.lyric-page__content--manual-scroll .lyric-page__lyrics::-webkit-scrollbar {
    display: block;
}

.lyric-page__content--manual-scroll .lyric-page__lyrics::-webkit-scrollbar-track {
    background: transparent;
}

.lyric-page__content--manual-scroll .lyric-page__lyrics::-webkit-scrollbar-thumb {
    background-color: rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    border: 3px solid transparent;
    background-clip: content-box;
}

/* 恢复自动滚动按钮 */
.lyric-page__resume-scroll-btn {
    position: absolute;
    bottom: 30px;
    left: 50%;
    transform: translateX(-50%);
    background-color: rgba(74, 138, 244, 0.8);
    color: white;
    border: none;
    border-radius: 20px;
    padding: 8px 16px;
    font-size: 14px;
    cursor: pointer;
    z-index: 10;
    transition: all 0.3s;
    backdrop-filter: blur(5px);
}

.lyric-page__resume-scroll-btn:hover {
    background-color: rgba(74, 138, 244, 1);
    transform: translateX(-50%) scale(1.05);
}

/* 字体大小调整 */
.lyric-page__lyrics.small .lyric-page__lyric-line {
    font-size: 16px;
    padding: 12px 10px;
}

.lyric-page__lyrics.large .lyric-page__lyric-line {
    font-size: 24px;
    padding: 20px 10px;
}

/* 响应式调整 */
@media (max-width: 768px) {
    .lyric-page__container {
        flex-direction: column;
    }

    .lyric-page__album-section,
    .lyric-page__content-section {
        width: 100%;
    }

    .lyric-page__album-section {
        height: auto;
        padding: 20px;
    }

    .lyric-page__album-cover-container {
        max-width: 200px;
        margin-bottom: 15px;
    }

    .lyric-page__content-section {
        border-left: none;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .lyric-page__back-btn {
        top: 10px;
        left: 10px;
    }

    .lyric-page__lyric-info {
        left: 5px;
    }
}
</style>