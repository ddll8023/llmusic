<template>
    <div class="lyric-page" :class="[
        'lyric-page--' + animationStyle,
        { 'lyric-page--show': playerStore.showLyrics }
    ]" @click="handleBackgroundClick">
        <div class="lyric-page__container flex w-full max-w-[1400px] h-full mx-auto px-8 box-border items-stretch max-md:flex-col max-md:px-4">
            <!-- 左侧专辑封面区域 -->
            <div class="lyric-page__album-section w-[38%] h-full flex flex-col items-center justify-center p-4 px-6 box-border max-md:w-full max-md:h-auto max-md:min-h-[200px] max-md:p-4">
                <div class="lyric-page__album-cover-container group w-[85%] max-w-[360px] aspect-square rounded-lg overflow-hidden shadow-md transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_8px_24px_rgba(0,0,0,0.25)] max-md:max-w-[160px]">
                    <img :src="albumCoverUrl" alt="Album Cover" class="lyric-page__album-cover w-full h-full object-cover" v-if="albumCoverUrl" />
                    <div class="lyric-page__album-cover-placeholder w-full h-full bg-gradient-to-br from-surface-overlay to-surface-elevated flex items-center justify-center text-[60px] text-content-disabled" v-else>
                        <span>{{ songTitle.charAt(0) }}</span>
                    </div>
                </div>
            </div>

            <!-- 右侧歌词内容区域 -->
            <div class="lyric-page__content-section w-[62%] h-full flex flex-col py-0 px-4 pl-6 box-border max-md:w-full max-md:flex-1 max-md:p-0 max-md:border-t max-md:border-line-base/50">
                <div class="lyric-page__header p-5 flex items-center justify-center relative mb-4 max-md:p-4">
                    <div class="lyric-page__song-info text-center">
                        <h2 class="lyric-page__song-title text-xl m-0 font-medium mb-2">{{ songTitle }}</h2>
                        <p class="lyric-page__song-artist text-sm m-0 text-content-secondary">{{ songArtist }}</p>
                    </div>
                    <!-- 替代 ::after 伪元素的分隔线 -->
                    <div class="absolute bottom-0 left-1/2 -translate-x-1/2 w-[60px] h-0.5 bg-gradient-to-r from-transparent via-accent-green to-transparent max-md:w-[40px]"></div>
                </div>

                <div class="lyric-page__content flex-1 flex items-center justify-center py-4 relative overflow-hidden"
                    :class="{ 'lyric-page__content--manual-scroll': !playerStore.isAutoScrolling }"
                    @wheel="handleManualScroll">
                    <div v-if="hasLyricsToShow" class="lyric-page__lyrics w-full h-full overflow-y-scroll overflow-x-hidden text-center" :class="fontSizeClass">
                        <div class="lyric-page__lyrics-wrapper py-[50%]">
                            <div v-for="(line, index) in processedLyrics" :key="index"
                                class="lyric-page__lyric-line group/line text-lg font-medium p-3 px-8 rounded transition-all duration-200 leading-relaxed cursor-pointer text-content-disabled relative text-center my-1 hover:bg-overlay-light hover:text-content-secondary"
                                :class="[
                                    index === playerStore.currentLyricIndex ? 'lyric-page__lyric-line--active' : ''
                                ]"
                                :ref="el => setLyricLineRef(el, index)"
                                @click="playerStore.seekToLyricPosition(index)">
                                <div class="lyric-page__lyric-info absolute left-4 top-1/2 -translate-y-1/2 flex items-center opacity-0 transition-opacity duration-150 group-hover/line:opacity-100 max-md:left-4" v-if="line.time >= 0">
                                    <div class="lyric-page__lyric-time text-[0.8em] text-content-secondary">
                                        <span>{{ formatTimeFromMs(line.time) }}</span>
                                    </div>
                                    <div class="lyric-page__play-icon ml-1.5 flex items-center justify-center text-content-secondary">
                                        <FAIcon name="play" size="small" color="secondary" />
                                    </div>
                                </div>
                                <div class="lyric-page__lyric-text inline-block">{{ line.text }}</div>
                            </div>
                        </div>
                    </div>
                    <div v-else class="lyric-page__no-lyrics flex items-center justify-center flex-col h-full w-full opacity-80 text-lg">
                        <div class="lyric-page__no-lyrics-content flex flex-col items-center justify-center text-center">
                            <p>当前歌曲暂无歌词</p>
                        </div>
                    </div>


                </div>

                <div class="lyric-page__controls py-4 flex justify-between items-center relative mt-4 max-md:flex-wrap max-md:gap-4 max-md:py-4">
                    <!-- 替代 ::before 伪元素的分隔线 -->
                    <div class="absolute top-0 left-1/2 -translate-x-1/2 w-[60px] h-0.5 bg-gradient-to-r from-transparent via-accent-green/50 to-transparent"></div>
                    <div class="lyric-page__progress text-sm text-content-secondary">
                        <span>{{ formattedCurrentTime }}</span>
                    </div>
                    <div class="lyric-page__font-size-controls flex gap-2.5">
                        <CustomButton type="secondary" size="small" @click="decreaseFontSize" title="减小字体">
                            A-
                        </CustomButton>
                        <CustomButton type="secondary" size="small" @click="resetFontSize" title="重置字体">
                            A
                        </CustomButton>
                        <CustomButton type="secondary" size="small" @click="increaseFontSize" title="增大字体">
                            A+
                        </CustomButton>
                    </div>
                    <div class="lyric-page__sync-controls flex gap-2.5">
                        <CustomButton type="secondary" size="small" @click="adjustSync(-500)" title="歌词提前 0.5 秒">
                            -0.5s
                        </CustomButton>
                        <CustomButton type="secondary" size="small" @click="adjustSync(0)" title="重置同步">
                            重置
                        </CustomButton>
                        <CustomButton type="secondary" size="small" @click="adjustSync(500)" title="歌词延后 0.5 秒">
                            +0.5s
                        </CustomButton>
                    </div>
                </div>
            </div>
        </div>

        <!-- 返回按钮，放在最左上角 -->
        <div class="absolute top-4 left-[60px] z-20">
            <CustomButton type="icon-only" size="medium" icon="arrow-left" @click="closeLyrics" title="返回" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted, onMounted } from 'vue';
import { usePlayerStore } from '../../store/player';
import { useUiStore } from '../../store/ui';
import FAIcon from '../common/FAIcon.vue';
import CustomButton from '../custom/CustomButton.vue';
import { formatTimeFromMs } from '../../utils/timeUtils';

const playerStore = usePlayerStore();
const uiStore = useUiStore();
const lyricLineRefs = ref<any[]>([]);
const manualScrollTimer = ref<any>(null);
const fontSizeClass = ref('normal'); // 'small', 'normal', 'large'
const albumCoverUrl = ref('');


// 动画样式
const animationStyle = computed(() => uiStore.lyricsAnimationStyle);

// 当前歌曲
const currentSong = computed(() => playerStore.currentSong);

// 监听当前歌曲变化，更新封面URL
watch(currentSong, async (newSong) => {
    if (newSong && newSong.id) {
        // 在线歌曲：直接从 window._onlineCoverUrl 读取
        if (playerStore.isOnlineSong) {
            albumCoverUrl.value = window._onlineCoverUrl || '';
            return;
        }
        try {
            const coverData: any = await window.electronAPI.getSongCover(newSong.id);
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
const setLyricLineRef = (el: any, index: number) => {
    if (el) {
        lyricLineRefs.value[index] = el;
    }
};

// 当用户使用滚轮时，禁用自动滚动
const handleManualScroll = () => {
    clearTimeout(manualScrollTimer.value);
    if (playerStore.isAutoScrolling) {
        (playerStore as any).setAutoScrolling(false);
    }
    manualScrollTimer.value = setTimeout(() => {
        resumeAutoScroll();
    }, 2000); // 2秒无操作后自动恢复
};

// 恢复自动滚动
const resumeAutoScroll = () => {
    clearTimeout(manualScrollTimer.value);
    (playerStore as any).setAutoScrolling(true);

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
                    timeText: (line as any).timeText
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
const handleBackgroundClick = (e: any) => {
    // 只有在点击背景时才关闭歌词页面
    if (e.target.classList.contains('lyric-page')) {
        closeLyrics();
    }
};

// 调整歌词同步
const adjustSync = (adjustment: any) => {
    if (adjustment === 0) {
        // 重置偏移
        (playerStore as any).setLyricsSyncOffset(0);
    } else {
        // 增加或减少偏移
        (playerStore as any).adjustLyricsSyncOffset(adjustment);
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
/* 歌词页面动画系统 — 需要 visibility/pointer-events 精确控制 */
.lyric-page {
    position: fixed;
    left: 0; right: 0; top: 32px; bottom: 90px;
    z-index: 100;
    pointer-events: none;
    overflow: hidden;
    visibility: hidden;
    background-color: #121212;
    color: #ffffff;
}
.lyric-page--fade {
    opacity: 0;
    transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1), visibility 0s 0.25s;
}
.lyric-page--fade.lyric-page--show {
    opacity: 1; visibility: visible;
    transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1), visibility 0s;
    pointer-events: all;
}
.lyric-page--slide {
    transform: translateY(100%); opacity: 1;
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), visibility 0s 0.3s;
}
.lyric-page--slide.lyric-page--show {
    transform: translateY(0); visibility: visible;
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), visibility 0s;
    pointer-events: all;
}

/* 歌词行 active 状态 — text-shadow 无法用 Tailwind 表达 */
.lyric-page__lyric-line--active {
    color: #4caf50;
    font-weight: 600;
    text-shadow: 0 0 20px rgba(76, 175, 80, 0.3);
}
.lyric-page__lyric-line--active .lyric-page__lyric-time,
.lyric-page__lyric-line--active .lyric-page__play-icon {
    color: #4caf50;
}

/* 歌词滚动条 — 始终占用空间但默认透明 */
.lyric-page__lyrics {
    scrollbar-width: thin;
    scrollbar-color: transparent transparent;
}
.lyric-page__lyrics::-webkit-scrollbar { width: 8px; }
.lyric-page__lyrics::-webkit-scrollbar-track { background: transparent; }
.lyric-page__lyrics::-webkit-scrollbar-thumb { background-color: transparent; border-radius: 4px; }
.lyric-page__content--manual-scroll .lyric-page__lyrics::-webkit-scrollbar-thumb {
    background-color: rgba(255, 255, 255, 0.2);
}
.lyric-page__content--manual-scroll .lyric-page__lyrics {
    scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

/* 字体大小调整 — 父级 class 控制子元素，需保留在 scoped CSS 中 */
.lyric-page__lyrics.small .lyric-page__lyric-line { font-size: 14px; padding: 8px 24px; }
.lyric-page__lyrics.large .lyric-page__lyric-line { font-size: 20px; padding: 16px 32px; }

/* 响应式歌词行间距 */
@media (max-width: 768px) {
    .lyric-page__lyric-line { padding: 8px 24px; }
}
</style>
