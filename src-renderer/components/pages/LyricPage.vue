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

                <div class="lyric-page__content"
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
                                        <FAIcon name="play" size="small" color="secondary" />
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

                    <CustomButton
                        v-if="!playerStore.isAutoScrolling"
                        type="primary"
                        size="small"
                        class="lyric-page__resume-scroll-btn"
                        @click.stop="resumeAutoScroll"
                    >
                        回到当前
                    </CustomButton>
                </div>

                <div class="lyric-page__controls">
                    <div class="lyric-page__progress">
                        <span>{{ formattedCurrentTime }}</span>
                    </div>
                    <div class="lyric-page__font-size-controls">
                        <CustomButton
                            type="secondary"
                            size="small"
                            @click="decreaseFontSize"
                            title="减小字体"
                        >
                            A-
                        </CustomButton>
                        <CustomButton
                            type="secondary"
                            size="small"
                            @click="resetFontSize"
                            title="重置字体"
                        >
                            A
                        </CustomButton>
                        <CustomButton
                            type="secondary"
                            size="small"
                            @click="increaseFontSize"
                            title="增大字体"
                        >
                            A+
                        </CustomButton>
                    </div>
                    <div class="lyric-page__sync-controls">
                        <CustomButton
                            type="secondary"
                            size="small"
                            @click="adjustSync(-500)"
                            title="歌词提前 0.5 秒"
                        >
                            -0.5s
                        </CustomButton>
                        <CustomButton
                            type="secondary"
                            size="small"
                            @click="adjustSync(0)"
                            title="重置同步"
                        >
                            重置
                        </CustomButton>
                        <CustomButton
                            type="secondary"
                            size="small"
                            @click="adjustSync(500)"
                            title="歌词延后 0.5 秒"
                        >
                            +0.5s
                        </CustomButton>
                    </div>
                </div>
            </div>
        </div>

        <!-- 返回按钮，放在最左上角 -->
        <CustomButton
            type="icon-only"
            size="medium"
            icon="arrow-left"
            class="lyric-page__back-btn"
            @click="closeLyrics"
            title="返回"
        />
    </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onUnmounted, onMounted } from 'vue';
import { usePlayerStore } from '../../store/player';
import { useUiStore } from '../../store/ui';
import FAIcon from '../common/FAIcon.vue';
import CustomButton from '../custom/CustomButton.vue';
import { formatTimeFromMs } from '../../utils/timeUtils';

const playerStore = usePlayerStore();
const uiStore = useUiStore();
const lyricLineRefs = ref([]);
const manualScrollTimer = ref(null);
const fontSizeClass = ref('normal'); // 'small', 'normal', 'large'
const albumCoverUrl = ref('');


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

<style lang="scss" scoped>

.lyric-page {
    background-color: $bg-primary;
    color: $text-primary;
    position: fixed;
    left: 0;
    right: 0;
    top: $title-bar-height;
    bottom: $player-bar-height;
    z-index: $z-modal;
    pointer-events: none;
    overflow: hidden;
    visibility: hidden;
    /* 默认隐藏 */
}

/* 淡入淡出动画 */
.lyric-page--fade {
    opacity: 0;
    transition: opacity $transition-base, visibility 0s $transition-base;
    /* 延迟visibility变化 */
}

.lyric-page--fade.lyric-page--show {
    opacity: 1;
    visibility: visible;
    /* 显示时可见 */
    transition: opacity $transition-base, visibility 0s;
    /* 立即改变visibility */
    pointer-events: all;
}

/* 上滑动画 */
.lyric-page--slide {
    transform: translateY(100%);
    transition: transform $transition-slow cubic-bezier(0.16, 1, 0.3, 1), visibility 0s $transition-slow;
    /* 延迟visibility变化 */
    opacity: 1;
}

.lyric-page--slide.lyric-page--show {
    transform: translateY(0);
    visibility: visible;
    /* 显示时可见 */
    transition: transform $transition-slow cubic-bezier(0.16, 1, 0.3, 1), visibility 0s;
    /* 立即改变visibility */
    pointer-events: all;
}

.lyric-page__container {
    display: flex;
    width: 100%;
    height: 100%;
    position: relative;
    padding: 0 ($content-padding * 6);
    /* 增加整体左右边距 */
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
    padding: ($content-padding * 2.5) $content-padding;
    /* 调整内边距 */
    box-sizing: border-box;
}

.lyric-page__album-cover-container {
    width: 100%;
    max-width: 400px;
    aspect-ratio: 1/1;
    border-radius: $border-radius * 2;
    overflow: hidden;
    box-shadow: $box-shadow-hover;
}

.lyric-page__album-cover {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.lyric-page__album-cover-placeholder {
    width: 100%;
    height: 100%;
    background: linear-gradient(45deg, $bg-tertiary, $bg-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: ($font-size-xl * 3);
    color: $text-disabled;
}

/* 返回按钮 */
.lyric-page__back-btn {
    position: absolute;
    top: $content-padding;
    left: ($content-padding * 3.75);
    /* 调整左边距，与容器边距保持一定距离 */
    z-index: 10;
}

/* 右侧歌词内容区域 */
.lyric-page__content-section {
    width: 60%;
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 0 $content-padding;
    /* 调整左右内边距 */
}

.lyric-page__header {
    padding: ($content-padding * 1.5) 0;
    /* 修改为只有上下内边距 */
    display: flex;
    align-items: center;
    justify-content: center;
    border-bottom: 1px solid $bg-tertiary;
    background-color: transparent;
    /* 移除背景色 */
    z-index: 2;
}

.lyric-page__song-info {
    text-align: center;
}

.lyric-page__song-title {
    font-size: $font-size-xl;
    margin: 0;
    font-weight: $font-weight-medium;
    margin-bottom: ($content-padding * 0.5);
}

.lyric-page__song-artist {
    font-size: $font-size-base;
    margin: 0;
    color: $text-secondary;
}

.lyric-page__content {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: $content-padding;
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
    font-size: $font-size-lg;
    font-weight: $font-weight-medium;
    padding: $content-padding (
        $content-padding * 0.625
    );
border-radius: $border-radius * 2;
transition: all $transition-base;
line-height: 1.5;
cursor: pointer;
color: $text-disabled;
position: relative;
text-align: center;
}

.lyric-page__lyric-line:hover {
    background-color: $overlay-light;
    color: $text-secondary;
}

.lyric-page__lyric-line--active {
    color: $accent-green;
    /* 使用统一的强调色 */
    transform: scale(1.05);
    font-weight: $font-weight-bold;
}

.lyric-page__lyric-info {
    position: absolute;
    left: ($content-padding * 0.9375);
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    opacity: 0;
    transition: opacity $transition-fast;
}

.lyric-page__lyric-line:hover .lyric-page__lyric-info {
    opacity: 1;
}

.lyric-page__lyric-time {
    font-size: 0.8em;
    color: $text-secondary;
}

.lyric-page__play-icon {
    margin-left: ($content-padding * 0.375);
    display: flex;
    align-items: center;
    justify-content: center;
    color: $text-secondary;
}

.lyric-page__lyric-line--active .lyric-page__lyric-time,
.lyric-page__lyric-line--active .lyric-page__play-icon {
    color: $accent-green;
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
    font-size: $font-size-lg;
}

.lyric-page__no-lyrics-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
}

.lyric-page__controls {
    padding: $content-padding 0;
    /* 修改为只有上下内边距 */
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid $bg-tertiary;
    background-color: transparent;
    /* 移除背景色 */
    z-index: 2;
}

.lyric-page__progress {
    font-size: $font-size-base;
    color: $text-secondary;
}

.lyric-page__font-size-controls {
    display: flex;
    gap: ($content-padding * 0.625);
}


.lyric-page__sync-controls {
    display: flex;
    gap: ($content-padding * 0.625);
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
    bottom: ($content-padding * 1.875);
    left: 50%;
    transform: translateX(-50%);
    z-index: 10;
}

/* 字体大小调整 */
.lyric-page__lyrics.small .lyric-page__lyric-line {
    font-size: $font-size-base;
    padding: ($content-padding * 0.75) ($content-padding * 0.625);
}

.lyric-page__lyrics.large .lyric-page__lyric-line {
    font-size: $font-size-xl;
    padding: ($content-padding * 1.25) ($content-padding * 0.625);
}

/* 响应式调整 */
@include respond-to("sm") {
    .lyric-page__container {
        flex-direction: column;
        padding: 0 $content-padding;
    }

    .lyric-page__album-section,
    .lyric-page__content-section {
        width: 100%;
    }

    .lyric-page__album-section {
        height: auto;
        padding: $content-padding;
    }

    .lyric-page__album-cover-container {
        max-width: 200px;
        margin-bottom: ($content-padding * 0.9375);
    }

    .lyric-page__content-section {
        border-left: none;
        border-top: 1px solid $bg-tertiary;
    }

    .lyric-page__back-btn {
        top: ($content-padding * 0.625);
        left: ($content-padding * 0.625);
    }

    .lyric-page__lyric-info {
        left: ($content-padding * 0.3125);
    }
}
</style>