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
					<!-- 分隔线 -->
					<div class="absolute bottom-0 left-1/2 -translate-x-1/2 w-[60px] h-0.5 bg-gradient-to-r from-transparent via-accent-green to-transparent max-md:w-[40px]"></div>
				</div>

				<div class="lyric-page__content flex-1 flex items-center justify-center py-4 relative overflow-hidden"
					:class="{ 'lyric-page__content--manual-scroll': !lyricsStore.isAutoScrolling }"
					@wheel="handleManualScroll">
					<div v-if="hasLyricsToShow" class="lyric-page__lyrics w-full h-full overflow-y-scroll overflow-x-hidden text-center" :class="fontSizeClass">
						<div class="lyric-page__lyrics-wrapper py-[50%]">
							<div v-for="(line, index) in displayLines" :key="index"
								class="lyric-page__lyric-line group/line text-lg font-medium p-3 px-8 rounded transition-all duration-200 leading-relaxed cursor-pointer text-content-disabled relative text-center my-1 hover:bg-overlay-light hover:text-content-secondary"
								:class="[
									index === lyricsStore.currentIndex ? 'lyric-page__lyric-line--active' : ''
								]"
								:ref="el => setLyricLineRef(el, index)"
								@click="seekToLyric(index)">
								<!-- 时间戳和播放按钮（hover 显示） -->
								<div class="lyric-page__lyric-info absolute left-4 top-1/2 -translate-y-1/2 flex items-center opacity-0 transition-opacity duration-150 group-hover/line:opacity-100 max-md:left-4" v-if="line.time >= 0">
									<div class="lyric-page__lyric-time text-[0.8em] text-content-secondary">
										<span>{{ formatTimeFromMs(line.time) }}</span>
									</div>
									<div class="lyric-page__play-icon ml-1.5 flex items-center justify-center text-content-secondary">
										<FAIcon name="play" size="small" color="secondary" />
									</div>
								</div>
								<!-- 逐字歌词渲染 -->
								<div v-if="line.words && line.words.length > 0" class="lyric-page__words inline-block">
									<span v-for="(word, wi) in line.words" :key="wi"
										class="lyric-page__word"
										:class="{ 'lyric-page__word--active': isWordActive(word) }">
										{{ word.word }}
									</span>
								</div>
								<!-- 普通歌词文本 -->
								<div v-else class="lyric-page__lyric-text inline-block">{{ line.text }}</div>
								<!-- 翻译歌词 -->
								<div v-if="lyricsStore.showTranslation && line.translation"
									class="lyric-page__lyric-translation">
									{{ line.translation }}
								</div>
								<!-- 罗马音/音译 -->
								<div v-if="lyricsStore.showRoma && line.roma"
									class="lyric-page__lyric-roma">
									{{ line.roma }}
								</div>
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
					<!-- 分隔线 -->
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
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { usePlayerStore } from '../../store/player'
import { useLyricsStore } from '../../store/lyrics'
import { useUiStore } from '../../store/ui'
import type { LyricWord } from '../../types'
import FAIcon from '../common/FAIcon.vue'
import CustomButton from '../custom/CustomButton.vue'
import { formatTimeFromMs } from '../../utils/timeUtils'

const playerStore = usePlayerStore()
const lyricsStore = useLyricsStore()
const uiStore = useUiStore()
const lyricLineRefs = ref<any[]>([])
const manualScrollTimer = ref<any>(null)
const fontSizeClass = ref('normal') // 'small', 'normal', 'large'
const albumCoverUrl = ref('')

// 动画样式
const animationStyle = computed(() => uiStore.lyricsAnimationStyle)

// 当前歌曲
const currentSong = computed(() => playerStore.currentSong)

// 监听当前歌曲变化，更新封面URL
watch(currentSong, async (newSong) => {
	if (newSong && newSong.id) {
		// 在线歌曲：直接从 window._onlineCoverUrl 读取
		if (playerStore.isOnlineSong) {
			albumCoverUrl.value = window._onlineCoverUrl || ''
			return
		}
		try {
			const coverData: any = await window.electronAPI.getSongCover(newSong.id)
			if (coverData && coverData.success && coverData.cover) {
				const format = coverData.format || 'image/jpeg'
				albumCoverUrl.value = `data:${format};base64,${coverData.cover}`
			} else {
				albumCoverUrl.value = ''
			}
		} catch (error) {
			console.error('获取封面失败:', error)
			albumCoverUrl.value = ''
		}
	} else {
		albumCoverUrl.value = ''
	}
}, { immediate: true })

// 字体大小调整
const increaseFontSize = () => {
	if (fontSizeClass.value === 'small') fontSizeClass.value = 'normal'
	else if (fontSizeClass.value === 'normal') fontSizeClass.value = 'large'
}

const decreaseFontSize = () => {
	if (fontSizeClass.value === 'large') fontSizeClass.value = 'normal'
	else if (fontSizeClass.value === 'normal') fontSizeClass.value = 'small'
}

const resetFontSize = () => {
	fontSizeClass.value = 'normal'
}

// 在每次渲染时重置 refs 数组
const setLyricLineRef = (el: any, index: number) => {
	if (el) {
		lyricLineRefs.value[index] = el
	}
}

// 当用户使用滚轮时，禁用自动滚动
const handleManualScroll = () => {
	clearTimeout(manualScrollTimer.value)
	if (lyricsStore.isAutoScrolling) {
		lyricsStore.setAutoScrolling(false)
	}
	manualScrollTimer.value = setTimeout(() => {
		resumeAutoScroll()
	}, 2000) // 2秒无操作后自动恢复
}

// 恢复自动滚动
const resumeAutoScroll = () => {
	clearTimeout(manualScrollTimer.value)
	lyricsStore.setAutoScrolling(true)

	// 立即滚动到当前行
	const currentIndex = lyricsStore.currentIndex
	if (currentIndex >= 0 && lyricLineRefs.value[currentIndex]) {
		lyricLineRefs.value[currentIndex].scrollIntoView({
			behavior: 'smooth',
			block: 'center',
		})
	}
}

// 获取歌曲信息
const songTitle = computed(() => {
	return playerStore.currentSong ? playerStore.currentSong.title : '未知歌曲'
})

const songArtist = computed(() => {
	return playerStore.currentSong ? playerStore.currentSong.artist : '未知艺术家'
})

// 判断逐字歌词中的某个字是否应高亮
const isWordActive = (word: LyricWord): boolean => {
	const adjustedTime = playerStore.currentTime * 1000 + lyricsStore.syncOffset
	return adjustedTime >= word.time && adjustedTime < word.time + word.duration
}

// 用于展示的歌词行（过滤掉空白行）
const displayLines = computed(() => {
	return lyricsStore.lines.filter(line => line.text.trim() !== '')
})

// 检查是否有歌词可显示
const hasLyricsToShow = computed(() => {
	return lyricsStore.hasLyrics && displayLines.value.length > 0
})

watch(displayLines, () => {
	lyricLineRefs.value = []
})

// 格式化当前时间
const formattedCurrentTime = computed(() => {
	const time = playerStore.currentTime
	const minutes = Math.floor(time / 60)
	const seconds = Math.floor(time % 60)
	return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
})

// 关闭歌词页面
const closeLyrics = () => {
	playerStore.hideLyricsDisplay()
}

// 点击背景关闭
const handleBackgroundClick = (e: any) => {
	if (e.target.classList.contains('lyric-page')) {
		closeLyrics()
	}
}

// 调整歌词同步
const adjustSync = (adjustment: number) => {
	if (adjustment === 0) {
		lyricsStore.resetOffset()
	} else {
		lyricsStore.adjustOffset(adjustment)
	}
}

// 歌词行点击跳转
const seekToLyric = (index: number) => {
	playerStore.seekToLyricPosition(index)
}

// 监听当前歌词行变化，自动滚动
watch(() => lyricsStore.currentIndex, async (newIndex) => {
	if (newIndex < 0 || !lyricsStore.isAutoScrolling) return

	await nextTick()

	const currentLineEl = lyricLineRefs.value[newIndex]
	if (currentLineEl) {
		currentLineEl.scrollIntoView({
			behavior: 'smooth',
			block: 'center'
		})
	}
}, { immediate: true })

// 监听动画样式变化，确保平滑过渡
watch(() => uiStore.lyricsAnimationStyle, () => {
	if (playerStore.showLyrics) {
		playerStore.hideLyricsDisplay()
		setTimeout(() => {
			playerStore.showLyricsDisplay()
		}, 50)
	}
})

onUnmounted(() => {
	clearTimeout(manualScrollTimer.value)
})
</script>

<style scoped>
/* 歌词页面动画系统 */
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

/* 歌词行 active 状态 */
.lyric-page__lyric-line--active {
	color: #4caf50;
	font-weight: 600;
	text-shadow: 0 0 20px rgba(76, 175, 80, 0.3);
}
.lyric-page__lyric-line--active .lyric-page__lyric-time,
.lyric-page__lyric-line--active .lyric-page__play-icon {
	color: #4caf50;
}

/* 逐字歌词高亮 */
.lyric-page__word--active {
	color: #4caf50;
}

/* 翻译歌词样式 */
.lyric-page__lyric-translation {
	font-size: 0.85em;
	opacity: 0.7;
	margin-top: 2px;
	color: #a0a0a0;
}

/* 罗马音/音译样式 */
.lyric-page__lyric-roma {
	font-size: 0.8em;
	opacity: 0.55;
	margin-top: 1px;
	color: #888;
}

/* 歌词滚动条 */
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

/* 字体大小调整 */
.lyric-page__lyrics.small .lyric-page__lyric-line { font-size: 14px; padding: 8px 24px; }
.lyric-page__lyrics.large .lyric-page__lyric-line { font-size: 20px; padding: 16px 32px; }

/* 响应式 */
@media (max-width: 768px) {
	.lyric-page__lyric-line { padding: 8px 24px; }
}
</style>
