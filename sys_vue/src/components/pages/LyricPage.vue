<template>
	<div class="lyric-page" :class="[
		'lyric-page--' + animationStyle,
		{ 'lyric-page--show': playerStore.showLyrics,
		  'lyric-page--perf': uiStore.performanceMode,
		  'playerbar-collapsed': uiStore.playerBarCollapsed }
	]" :style="{ '--album-glow-color': albumGlowColor, '--album-accent-color': albumAccentColor, '--album-soft-color': albumSoftColor }" @click="handleBackgroundClick">
		<!-- 封面模糊沉浸背景（压暗处理，保证文字可读；随播放缓慢漂移） -->
		<div class="lyric-page__bg-cover" aria-hidden="true"
			:class="{ 'lyric-page__bg-cover--active': albumCoverUrl && playerStore.playing }"
			:style="{ '--cover-url': albumCoverUrl ? `url(${albumCoverUrl})` : 'none' }"></div>

		<!-- 动态背景光晕（随封面主色联动） -->
		<div class="lyric-page__bg-blobs" aria-hidden="true">
			<div class="lyric-page__bg-blob lyric-page__bg-blob--1"></div>
			<div class="lyric-page__bg-blob lyric-page__bg-blob--2"></div>
			<div class="lyric-page__bg-blob lyric-page__bg-blob--3"></div>
		</div>

		<div class="lyric-page__container flex w-full max-w-[1400px] h-full mx-auto px-10 box-border items-stretch max-md:flex-col max-md:px-4">
			<!-- 左侧专辑封面区域 — 增强版炫酷动画 -->
			<div ref="albumSectionRef" class="lyric-page__album-section w-[38%] h-full flex flex-col items-center justify-center p-6 box-border relative max-md:w-full max-md:h-auto max-md:min-h-[200px] max-md:p-4">

				<!-- 声波波纹环 → 从封面扩散 -->
				<div class="lyric-page__ripple-ring lyric-page__ripple-ring--1" aria-hidden="true"></div>
				<div class="lyric-page__ripple-ring lyric-page__ripple-ring--2" aria-hidden="true"></div>
				<div class="lyric-page__ripple-ring lyric-page__ripple-ring--3" aria-hidden="true"></div>

				<!-- 真实音频频谱可视化（环绕封面一周） -->
				<canvas v-if="uiStore.lyricsSpectrumEnabled" ref="spectrumCanvasRef" class="lyric-page__spectrum" aria-hidden="true"></canvas>

				<!-- 低音能量光晕（随频谱低频实时呼吸） -->
				<div v-if="uiStore.lyricsSpectrumEnabled" class="lyric-page__bass-halo" aria-hidden="true"></div>

				<!-- 黑胶唱盘 → 深色圆盘 + 同心槽纹 -->
				<div class="lyric-page__vinyl-disc" aria-hidden="true" :class="{ 'lyric-page__vinyl-disc--spin': playerStore.playing }">
					<div class="lyric-page__vinyl-groove lyric-page__vinyl-groove--1"></div>
					<div class="lyric-page__vinyl-groove lyric-page__vinyl-groove--2"></div>
					<div class="lyric-page__vinyl-groove lyric-page__vinyl-groove--3"></div>
					<div class="lyric-page__vinyl-groove lyric-page__vinyl-groove--4"></div>
					<div class="lyric-page__vinyl-label">
						<div class="lyric-page__vinyl-hole"></div>
					</div>
				</div>

				<!-- 封面容器 → 旋转 + 发光边框 + 扫光反射 -->
				<div class="lyric-page__album-cover-wrapper" :key="'cover-' + songKey">
					<!-- 旋转渐变发光边框 -->
					<div class="lyric-page__cover-border-ring" aria-hidden="true"
						:class="{ 'lyric-page__cover-border-ring--active': playerStore.playing }"></div>
					<!-- 封面图片 -->
					<div class="lyric-page__album-cover-container"
						:class="{ 'lyric-page__album-cover-container--spin': playerStore.playing }">
						<img :src="albumCoverUrl" alt="Album Cover" class="lyric-page__album-img"
							:class="coverLoaded ? 'opacity-100' : 'opacity-0'"
							@load="onCoverLoaded"
							@error="onCoverError"
							v-if="albumCoverUrl" />
						<div class="lyric-page__album-placeholder" v-else>
							<span>{{ songTitle.charAt(0) }}</span>
						</div>
					</div>
					<!-- 玻璃反光扫光层 -->
					<div class="lyric-page__cover-shine" aria-hidden="true"
						:class="{ 'lyric-page__cover-shine--active': playerStore.playing }"></div>
				</div>

				<!-- 浮动光点粒子 -->
				<div class="lyric-page__particles" aria-hidden="true" :key="'particles-' + songKey"
					:class="{ 'lyric-page__particles--active': playerStore.playing }">
					<div v-for="n in 8" :key="n" class="lyric-page__particle"
						:style="getParticleStyle(n)"></div>
				</div>
			</div>

			<!-- 右侧歌词内容区域 -->
			<div class="lyric-page__content-section w-[62%] h-full flex flex-col py-0 px-6 pl-8 box-border max-md:w-full max-md:flex-1 max-md:p-0 max-md:border-t max-md:border-line-base/50">
				<div class="lyric-page__header pt-3 px-5 pb-6 flex items-center justify-center relative mb-2 max-md:p-4">
					<div class="lyric-page__song-info text-center">
						<h2 class="lyric-page__song-title text-xl m-0 font-medium mb-2">{{ songTitle }}</h2>
						<p class="lyric-page__song-artist text-sm m-0 text-content-secondary">{{ songArtist }}</p>
						<p v-if="songAlbum" class="lyric-page__song-album text-xs m-0 mt-1 text-content-tertiary">{{ songAlbum }}</p>
					</div>
					<!-- 分隔线 -->
					<div class="absolute bottom-0 left-1/2 -translate-x-1/2 w-[60px] h-0.5 bg-gradient-to-r from-transparent via-accent-green to-transparent max-md:w-[40px]"></div>
				</div>

				<div class="lyric-page__content flex-1 flex items-center justify-center py-4 relative overflow-hidden"
					:class="{ 'lyric-page__content--manual-scroll': !lyricsStore.isAutoScrolling }"
					@wheel="handleManualScroll">
					<div v-if="hasLyricsToShow" class="lyric-page__lyrics w-full h-full overflow-y-scroll overflow-x-hidden text-center" :class="fontSizeClass">
						<div class="lyric-page__lyrics-wrapper py-[50%]" :key="'lyrics-' + songKey">
							<div v-for="(line, index) in displayLines" :key="index"
								class="lyric-page__lyric-line group/line text-lg font-medium p-3 px-10 rounded-xl leading-relaxed cursor-pointer text-content-disabled relative text-center my-1.5"
								:class="[
									index === lyricsStore.currentIndex ? 'lyric-page__lyric-line--active' : '',
									lineDistanceClass(index)
								]"
								:ref="el => setLyricLineRef(el, index)"
								@click="seekToLyric(index)">
									<!-- 当前行左侧指示条 -->
									<div class="lyric-page__lyric-indicator" v-if="index === lyricsStore.currentIndex">
										<div class="lyric-page__lyric-indicator-inner"></div>
									</div>
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
							<FAIcon name="music" size="xl" color="secondary" class="opacity-60 mb-4" />
							<p>当前歌曲暂无歌词</p>
							<p class="text-xs text-content-tertiary mt-2">播放歌曲后，歌词将随旋律滚动</p>
						</div>
					</div>
				</div>

				<div class="lyric-page__controls py-4 flex justify-between items-center relative mt-4 max-md:flex-wrap max-md:gap-3 max-md:py-4">
					<!-- 分隔线 -->
					<div class="absolute top-0 left-1/2 -translate-x-1/2 w-[60px] h-0.5 bg-gradient-to-r from-transparent via-accent-green/50 to-transparent"></div>
					<span class="lyric-page__time text-sm text-content-tertiary">{{ formattedCurrentTime }}</span>
					<div class="lyric-page__control-groups flex items-center gap-3">
						<div class="lyric-page__font-size-controls flex gap-1">
							<button class="lyric-page__ghost-btn" @click="decreaseFontSize" title="减小字体">A−</button>
							<button class="lyric-page__ghost-btn" @click="resetFontSize" title="重置字体">A</button>
							<button class="lyric-page__ghost-btn" @click="increaseFontSize" title="增大字体">A+</button>
						</div>
						<span class="lyric-page__control-divider" aria-hidden="true"></span>
						<div class="lyric-page__sync-controls flex gap-1">
							<button class="lyric-page__ghost-btn" @click="adjustSync(-500)" title="歌词提前 0.5 秒">−0.5s</button>
							<button class="lyric-page__ghost-btn" @click="adjustSync(0)" title="重置同步">重置</button>
							<button class="lyric-page__ghost-btn" @click="adjustSync(500)" title="歌词延后 0.5 秒">+0.5s</button>
						</div>
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
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { usePlayerStore } from '../../store/player'
import { useLyricsStore } from '../../store/lyrics'
import { useUiStore } from '../../store/ui'
import { useAlbumColors } from '../../composables/useAlbumColors'
import { audioEngine } from '../../core/audio/engine'
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

// 频谱可视化
const spectrumCanvasRef = ref<HTMLCanvasElement | null>(null)
const albumSectionRef = ref<HTMLElement | null>(null)
let analyser: AnalyserNode | null = null
let freqData: Uint8Array<ArrayBuffer> | null = null
let spectrumRaf = 0

// 封面加载状态
const coverLoaded = ref(false)

// 切歌重置键：自增 → 强制重挂载动画元素，使 CSS animation 重新开始
const songKey = ref(0)

// 专辑颜色提取
const { colors: albumColors, extractFromImage } = useAlbumColors()

// 动态 glow / accent 色
const albumGlowColor = computed(() => albumColors.value.dominant)
const albumAccentColor = computed(() => {
	const m = albumColors.value.gradient.match(/rgba\((\d+),\s*(\d+),\s*(\d+)/)
	if (m) return `rgba(${m[1]},${m[2]},${m[3]},1)`
	return 'rgba(76,175,80,1)'
})
// 封面主色半透明版 → 背景光斑 / 光晕联动
const albumSoftColor = computed(() => {
	const m = albumColors.value.gradient.match(/rgba\((\d+),\s*(\d+),\s*(\d+)/)
	if (m) return `rgba(${m[1]},${m[2]},${m[3]},0.28)`
	return 'rgba(76,175,80,0.28)'
})

// 粒子随机样式生成（在 mounted 时固定位置，避免每次渲染变化）
const particlePositions = ref<Array<{x: number, y: number, size: number, delay: number, duration: number, color: string}>>([])
function initParticles() {
	particlePositions.value = Array.from({ length: 8 }, () => ({
		x: Math.round(Math.random() * 380 + 30),
		y: Math.round(Math.random() * 320 + 30),
		size: Math.round(Math.random() * 4 + 2),
		delay: Math.random() * 5,
		duration: Math.random() * 3 + 3,
		color: ['rgba(100,180,255,0.6)', 'rgba(255,80,150,0.5)', 'rgba(180,80,255,0.5)', 'rgba(255,200,50,0.5)', 'rgba(80,220,150,0.5)'][Math.floor(Math.random() * 5)]
	}))
}
function getParticleStyle(index: number) {
	const p = particlePositions.value[index - 1]
	if (!p) return {}
	return {
		left: p.x + 'px',
		top: p.y + 'px',
		width: p.size + 'px',
		height: p.size + 'px',
		background: p.color,
		animationDelay: p.delay + 's',
		animationDuration: p.duration + 's'
	}
}

// ===== 真实音频频谱可视化（Web Audio Analyser 驱动，跨域源退化为伪频谱） =====

// 伪频谱兜底：在线 CDN 无 CORS 头 / 暂停时也有轻微呼吸感
function pseudoLevel(index: number, bars: number, playing: boolean, t: number): number {
	const base = playing ? 0.22 : 0.1
	const amp = playing ? 0.72 : 0.16
	const wave = Math.abs(Math.sin(t * (1.6 + (index % 7) * 0.21) + index * 1.9))
	const swell = 0.6 + 0.4 * Math.sin(t * 0.8 + index * 0.35)
	return Math.min(1, base + wave * amp * swell)
}

const SPECTRUM_BARS = 64

function drawSpectrum(): void {
	spectrumRaf = requestAnimationFrame(drawSpectrum)
	const canvas = spectrumCanvasRef.value
	const section = albumSectionRef.value
	if (!canvas || !section) return
	const ctx = canvas.getContext('2d')
	if (!ctx) return

	const rect = section.getBoundingClientRect()
	const size = Math.max(120, Math.min(rect.width, rect.height) * 0.78)
	const dpr = Math.min(window.devicePixelRatio || 1, 2)
	const px = Math.round(size * dpr)
	if (canvas.width !== px || canvas.height !== px) {
		canvas.width = px
		canvas.height = px
	}
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
	ctx.clearRect(0, 0, size, size)

	const playing = playerStore.playing
	const now = performance.now() / 1000
	const levels: number[] = []
	const analyserNode = analyser

	if (analyserNode && freqData && playing) {
		analyserNode.getByteFrequencyData(freqData)
		let sum = 0
		for (let i = 0; i < freqData.length; i++) sum += freqData[i]
		// 数据全为 0 → 跨域音源不可分析，走伪频谱
		if (sum > 64) {
			const perBin = Math.max(1, Math.floor(freqData.length / SPECTRUM_BARS))
			for (let i = 0; i < SPECTRUM_BARS; i++) {
				let v = 0
				const end = Math.min(freqData.length, (i + 1) * perBin)
				for (let j = i * perBin; j < end; j++) v += freqData[j]
				levels.push(Math.min(1, v / (perBin * 255)))
			}
		}
	}
	if (levels.length === 0) {
		for (let i = 0; i < SPECTRUM_BARS; i++) {
			levels.push(pseudoLevel(i, SPECTRUM_BARS, playing, now))
		}
	}

	// 低频能量 → 驱动光晕与封面呼吸
	let bass = 0
	if (analyserNode && freqData && playing) {
		for (let i = 0; i < Math.min(6, freqData.length); i++) bass += freqData[i]
		bass = Math.min(1, bass / (6 * 255))
	} else {
		bass = playing ? 0.35 + 0.3 * Math.sin(now * 4) : 0.12 + 0.06 * Math.sin(now * 2)
	}
	section.style.setProperty('--bass-energy', bass.toFixed(3))

	// 环绕频谱环
	const cx = size / 2
	const cy = size / 2
	const innerR = size * 0.3
	const outerR = size * 0.475
	const accent = albumAccentColor.value

	ctx.lineCap = 'round'
	// 底环
	ctx.lineWidth = Math.max(1, size * 0.004)
	ctx.strokeStyle = 'rgba(255,255,255,0.07)'
	ctx.beginPath()
	ctx.arc(cx, cy, outerR, 0, Math.PI * 2)
	ctx.stroke()

	const gap = (Math.PI * 2) / SPECTRUM_BARS
	const barLen = (outerR - innerR) * 0.55
	for (let i = 0; i < SPECTRUM_BARS; i++) {
		const v = Math.pow(levels[i], 1.3)
		const r0 = innerR + (outerR - innerR) * v * 0.82
		const angle = i * gap - Math.PI / 2
		const cos = Math.cos(angle)
		const sin = Math.sin(angle)
		ctx.lineWidth = Math.max(1.5, size * 0.012)
		ctx.strokeStyle = i % 2 === 0 ? accent : 'rgba(255,255,255,0.4)'
		ctx.globalAlpha = 0.25 + v * 0.75
		ctx.beginPath()
		ctx.moveTo(cx + cos * r0, cy + sin * r0)
		ctx.lineTo(cx + cos * (r0 + barLen), cy + sin * (r0 + barLen))
		ctx.stroke()
	}
	ctx.globalAlpha = 1
}

function startSpectrum(): void {
	if (spectrumRaf) return
	if (!analyser) {
		analyser = audioEngine.getAnalyser()
		if (analyser) {
			freqData = new Uint8Array(analyser.frequencyBinCount)
			audioEngine.resumeAudioContext()
		}
	}
	drawSpectrum()
}

function stopSpectrum(): void {
	cancelAnimationFrame(spectrumRaf)
	spectrumRaf = 0
}

// 页面可见且非性能模式且频谱开关开启时运行；暂停时保留轻微呼吸动画
watch(() => playerStore.showLyrics, (show) => {
	if (show && !uiStore.performanceMode && uiStore.lyricsSpectrumEnabled) startSpectrum()
	else stopSpectrum()
}, { immediate: true })

watch(() => uiStore.performanceMode, (perf) => {
	if (perf) stopSpectrum()
	else if (playerStore.showLyrics && uiStore.lyricsSpectrumEnabled) startSpectrum()
})

watch(() => uiStore.lyricsSpectrumEnabled, (enabled) => {
	if (enabled) {
		if (playerStore.showLyrics && !uiStore.performanceMode) startSpectrum()
	} else {
		stopSpectrum()
	}
})

// 动画样式
const animationStyle = computed(() => uiStore.lyricsAnimationStyle)

// 当前歌曲
const currentSong = computed(() => playerStore.currentSong)

// 监听在线/本地状态，更新封面URL
watch(() => playerStore.isOnlineSong, (isOnline) => {
	if (isOnline) {
		albumCoverUrl.value = playerStore.onlineCoverUrl || ''
	} else if (!playerStore.currentSong) {
		albumCoverUrl.value = ''
	}
}, { immediate: true })

// 在线歌曲切歌时更新封面
watch(() => playerStore.onlineSongName, (newName) => {
	if (newName && playerStore.isOnlineSong) {
		albumCoverUrl.value = playerStore.onlineCoverUrl || ''
	}
})

// 封面加载完成 → 提取颜色 + 显示
function onCoverLoaded() {
	coverLoaded.value = true
	if (albumCoverUrl.value) {
		extractFromImage(albumCoverUrl.value)
	}
}

// 封面加载失败 → 切回占位图
function onCoverError() {
	albumCoverUrl.value = ''
}

watch(currentSong, async (newSong) => {
	if (newSong && newSong.id) {
		// 切歌 → 重置动画 + 重新初始化粒子
		songKey.value++
		initParticles()
		coverLoaded.value = false
		if (playerStore.isOnlineSong) {
			albumCoverUrl.value = playerStore.onlineCoverUrl || ''
			return
		}
		try {
			const coverData = await window.electronAPI.getSongCover(newSong.id)
			if (coverData.success && coverData.cover) {
				const format = coverData.format || 'image/jpeg'
				albumCoverUrl.value = `data:${format};base64,${coverData.cover}`
			} else {
				albumCoverUrl.value = ''
			}
		} catch (error) {
			console.error('获取封面失败:', error)
			albumCoverUrl.value = ''
		}
	} else if (!playerStore.isOnlineSong) {
		songKey.value++
		initParticles()
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
const setLyricLineRef = (el: Element | { $el?: Element } | null, index: number) => {
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
	scrollToCurrentLine('smooth')
}

// 获取歌曲信息
const songTitle = computed(() => {
	if (playerStore.isOnlineSong) return playerStore.onlineSongName
	return playerStore.currentSong?.title || '未知歌曲'
})

const songArtist = computed(() => {
	if (playerStore.isOnlineSong) return playerStore.onlineSinger
	return playerStore.currentSong?.artist || '未知艺术家'
})

const songAlbum = computed(() => {
	if (playerStore.isOnlineSong) return ''
	return playerStore.currentSong?.album || ''
})

// 判断逐字歌词中的某个字是否应高亮
const isWordActive = (word: LyricWord): boolean => {
	const adjustedTime = playerStore.currentTime * 1000 + lyricsStore.syncOffset
	return adjustedTime >= word.time && adjustedTime < word.time + word.duration
}

// 用于展示的歌词行（复用 store 的过滤结果，避免重复计算）
const displayLines = computed(() => lyricsStore.displayLines)

// 与当前行的距离 → 淡化类名（Apple Music 式纵深留白 + 3D 透视）
const lineDistanceClass = (index: number): string => {
	const current = lyricsStore.currentIndex
	if (current < 0) return '' // 尚未定位到当前行时保持全亮
	const diff = Math.abs(index - current)
	if (diff === 1) return 'lyric-page__lyric-line--near'
	const above = index < current
	if (diff === 2) return above ? 'lyric-page__lyric-line--away-up' : 'lyric-page__lyric-line--away-down'
	if (diff > 2) return above ? 'lyric-page__lyric-line--far-up' : 'lyric-page__lyric-line--far-down'
	return ''
}

// 检查是否有歌词可显示
const hasLyricsToShow = computed(() => {
	return lyricsStore.hasLyrics && displayLines.value.length > 0
})

// ===== 自动滚动逻辑 =====

/** 滚动到当前歌词行 */
async function scrollToCurrentLine(behavior: ScrollBehavior = 'auto') {
	const index = lyricsStore.currentIndex
	if (index < 0 || !lyricsStore.isAutoScrolling) return
	await nextTick()
	const el = lyricLineRefs.value[index]
	if (el) {
		el.scrollIntoView({ behavior, block: 'center' })
	}
}

// 歌词行数据变化时（新歌加载/歌词异步返回），清空 refs 后重新滚动
watch(displayLines, async () => {
	lyricLineRefs.value = []
	await nextTick()
	scrollToCurrentLine('auto')
})

// 当前歌词行变化时自动滚动（播放中实时更新）
watch(() => lyricsStore.currentIndex, async (newIndex) => {
	if (newIndex < 0 || !lyricsStore.isAutoScrolling) return
	await nextTick()
	const el = lyricLineRefs.value[newIndex]
	if (el) {
		el.scrollIntoView({ behavior: 'smooth', block: 'center' })
	}
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
const handleBackgroundClick = (e: MouseEvent) => {
	const target = e.target as HTMLElement | null
	if (target?.classList.contains('lyric-page')) {
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

// 监听动画样式变化，确保平滑过渡
watch(() => uiStore.lyricsAnimationStyle, () => {
	if (playerStore.showLyrics) {
		playerStore.hideLyricsDisplay()
		setTimeout(() => {
			playerStore.showLyricsDisplay()
		}, 50)
	}
})

onMounted(() => {
	initParticles()
	scrollToCurrentLine('auto')
	if (playerStore.showLyrics && !uiStore.performanceMode && uiStore.lyricsSpectrumEnabled) {
		startSpectrum()
	}
})

onUnmounted(() => {
	clearTimeout(manualScrollTimer.value)
	stopSpectrum()
})
</script>

<style scoped>
/* ===== 1. 封面模糊沉浸背景 ===== */
.lyric-page__bg-cover {
	position: fixed;
	inset: -8%;
	z-index: 0;
	background-size: cover;
	background-position: center;
	/* 封面图下层 + 暗色渐变叠加层（保证歌词/按钮文字可读） */
	background-image:
		linear-gradient(rgba(10, 10, 12, 0.62), rgba(10, 10, 12, 0.62)),
		var(--cover-url, none);
	filter: blur(70px) saturate(1.15) brightness(0.52);
	transform: scale(1.04);
	opacity: 0;
	pointer-events: none;
	transition: opacity 0.9s ease;
}
.lyric-page__bg-cover--active {
	opacity: 0.6;
	animation: coverDrift 36s ease-in-out infinite alternate;
}
@keyframes coverDrift {
	0% { transform: scale(1.04) translate(0, 0) rotate(0deg); }
	50% { transform: scale(1.12) translate(-1.5%, 1.2%) rotate(1.2deg); }
	100% { transform: scale(1.08) translate(1.2%, -1%) rotate(-1deg); }
}

/* ===== 1b. 动态背景光晕 ===== */
.lyric-page__bg-blobs {
	position: fixed;
	inset: 0;
	z-index: 0;
	overflow: hidden;
	pointer-events: none;
}
.lyric-page__bg-blob {
	position: absolute;
	border-radius: 50%;
	filter: blur(80px);
	opacity: 0.3;
}
.lyric-page__bg-blob--1 {
	top: -10%;
	left: -5%;
	width: 500px;
	height: 500px;
	background: radial-gradient(circle, var(--album-soft-color, rgba(76, 175, 80, 0.28)), transparent 70%);
	animation: blobFloat 25s ease-in-out infinite;
}
.lyric-page__bg-blob--2 {
	bottom: -15%;
	right: -10%;
	width: 600px;
	height: 600px;
	background: radial-gradient(circle, rgba(33, 150, 243, 0.2), transparent 70%);
	animation: blobFloat 30s ease-in-out infinite;
	animation-delay: -5s;
}
.lyric-page__bg-blob--3 {
	top: 40%;
	left: 30%;
	width: 400px;
	height: 400px;
	background: radial-gradient(circle, rgba(156, 39, 176, 0.18), transparent 70%);
	animation: blobFloat 20s ease-in-out infinite;
	animation-delay: -10s;
}
@keyframes blobFloat {
	0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
	20% { transform: translate(100px, -50px) scale(1.1) rotate(4deg); }
	40% { transform: translate(-30px, 60px) scale(0.95) rotate(-3deg); }
	60% { transform: translate(50px, 30px) scale(1.05) rotate(3deg); }
	80% { transform: translate(-60px, -20px) scale(1.02) rotate(-2deg); }
}

/* ===== 2. 歌词页面入场动画 ===== */
.lyric-page {
	position: fixed;
	left: 0; right: 0; top: 32px; bottom: 0;
	z-index: 100;
	pointer-events: none;
	overflow: hidden;
	visibility: hidden;
	background-color: var(--color-surface-base);
	color: var(--color-content-base);
}

.lyric-page__container {
	position: relative;
	z-index: 1;
}

.lyric-page--fade {
	opacity: 0;
	transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1), visibility 0s 0.4s;
}
.lyric-page--fade.lyric-page--show {
	opacity: 1; visibility: visible;
	transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1), visibility 0s;
	pointer-events: all;
}

.lyric-page--slide {
	transform: translateY(100%); opacity: 1;
	transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), visibility 0s 0.4s;
}
.lyric-page--slide.lyric-page--show {
	transform: translateY(0); visibility: visible;
	transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), visibility 0s;
	pointer-events: all;
}

/* 弹性缩放入场 */
.lyric-page--elastic {
	opacity: 0;
	transform: scale(0.85) translateY(40px);
	filter: blur(10px);
	transition: all 0.55s cubic-bezier(0.34, 1.56, 0.64, 1), visibility 0s 0.55s;
}
.lyric-page--elastic.lyric-page--show {
	opacity: 1;
	transform: scale(1) translateY(0);
	filter: blur(0);
	visibility: visible;
	transition: all 0.55s cubic-bezier(0.34, 1.56, 0.64, 1), visibility 0s;
	pointer-events: all;
}

/* 模糊浮现入场 */
.lyric-page--blur {
	opacity: 0;
	transform: scale(1.08);
	filter: blur(18px);
	transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1), visibility 0s 0.5s;
}
.lyric-page--blur.lyric-page--show {
	opacity: 1;
	transform: scale(1);
	filter: blur(0);
	visibility: visible;
	transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1), visibility 0s;
	pointer-events: all;
}
/* 弹性入场子元素交错延迟 */
.lyric-page--elastic.lyric-page--show .lyric-page__album-section {
	animation: elasticIn 0.55s 0.05s both cubic-bezier(0.34, 1.56, 0.64, 1);
}
.lyric-page--elastic.lyric-page--show .lyric-page__header {
	animation: elasticIn 0.55s 0.15s both cubic-bezier(0.34, 1.56, 0.64, 1);
}
.lyric-page--elastic.lyric-page--show .lyric-page__content {
	animation: elasticIn 0.55s 0.25s both cubic-bezier(0.34, 1.56, 0.64, 1);
}
.lyric-page--elastic.lyric-page--show .lyric-page__controls {
	animation: elasticIn 0.55s 0.35s both cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes elasticIn {
	0% { opacity: 0; transform: scale(0.9) translateY(30px); filter: blur(8px); }
	100% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); }
}

/* ===== 3. 内容区底部留白 ===== */
.lyric-page__content-section {
	padding-bottom: 90px;
	transition: padding-bottom 0.35s cubic-bezier(.16,1,.3,1);
}
.lyric-page.playerbar-collapsed .lyric-page__content-section {
	padding-bottom: 76px;
}

/* ===== 4. 封面相关 ===== */
.lyric-page__album-cover-container {
	position: relative;
	z-index: 2;
	cursor: pointer;
}

/* ===== 5. 歌词行样式 ===== */
.lyric-page__lyric-line {
	border-radius: 12px;
	margin-top: 6px;
	margin-bottom: 6px;
	transition: opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1), transform 0.5s cubic-bezier(0.4, 0, 0.2, 1), color 0.4s ease, text-shadow 0.4s ease, background 0.3s ease;
	transform-origin: center center;
}

/* 切歌时歌词整体淡入 */
.lyric-page__lyrics-wrapper {
	animation: lyricsFadeIn 0.55s ease-out both;
}
@keyframes lyricsFadeIn {
	0% { opacity: 0; transform: translateY(18px); }
	100% { opacity: 1; transform: translateY(0); }
}

/* 与当前行距离越远越淡，并带 3D 透视纵深（Apple Music 风格） */
.lyric-page__lyric-line--near { opacity: 0.6; transform: scale(0.97); }
.lyric-page__lyric-line--away-up { opacity: 0.42; transform: perspective(600px) rotateX(10deg) scale(0.94); }
.lyric-page__lyric-line--away-down { opacity: 0.42; transform: perspective(600px) rotateX(-10deg) scale(0.94); }
.lyric-page__lyric-line--far-up { opacity: 0.26; transform: perspective(600px) rotateX(22deg) scale(0.9); }
.lyric-page__lyric-line--far-down { opacity: 0.26; transform: perspective(600px) rotateX(-22deg) scale(0.9); }

/* 统一 hover 表现：无拉伸动画、平面圆角背景；所有行（含当前行）完全同风格 */
.lyric-page__lyric-line:hover {
	background: var(--color-overlay-light);
	color: var(--color-content-secondary);
	opacity: 1;
	transform: none;
	text-shadow: none;
	border-radius: 12px;
	z-index: 3;
	transition: transform 0.15s ease, background 0.2s ease, color 0.2s ease, opacity 0.2s ease;
}

.lyric-page__lyric-line--active {
	color: var(--color-accent-green);
	font-weight: 600;
	opacity: 1;
	transform: scale(1.05);
	text-shadow:
		0 0 20px rgba(76, 175, 80, 0.3),
		0 0 40px rgba(76, 175, 80, 0.15),
		0 0 80px rgba(76, 175, 80, 0.08);
}

/* 当前行左侧发光指示条 */
.lyric-page__lyric-indicator {
	position: absolute;
	left: 0;
	top: 50%;
	transform: translateY(-50%);
	width: 3px;
	height: 60%;
	min-height: 24px;
	background: linear-gradient(to bottom, var(--color-accent-green), #81c784);
	border-radius: 0 3px 3px 0;
	animation: indicatorPulse 2s ease-in-out infinite;
}
.lyric-page__lyric-indicator-inner {
	position: absolute;
	inset: -4px;
	background: inherit;
	filter: blur(6px);
	opacity: 0.5;
	border-radius: 0 3px 3px 0;
}
@keyframes indicatorPulse {
	0%, 100% { opacity: 0.8; box-shadow: 0 0 6px rgba(76,175,80,0.4); }
	50% { opacity: 1; box-shadow: 0 0 12px rgba(76,175,80,0.6); }
}

.lyric-page__lyric-line--active .lyric-page__lyric-time,
.lyric-page__lyric-line--active .lyric-page__play-icon {
	color: var(--color-accent-green);
}

/* ===== 6. 逐字歌词高亮 ===== */
.lyric-page__word {
	transition: color 0.12s ease, transform 0.12s ease;
	display: inline-block;
	position: relative;
}
.lyric-page__word--active {
	color: var(--color-accent-green);
	text-shadow: 0 0 12px rgba(76, 175, 80, 0.5);
	transform: scale(1.1);
}
.lyric-page__word--active::after {
	content: '';
	position: absolute;
	bottom: -2px;
	left: 0;
	right: 0;
	height: 2px;
	background: var(--color-accent-green);
	border-radius: 1px;
	animation: wordUnderline 0.3s ease-out;
}
@keyframes wordUnderline {
	0% { width: 0; opacity: 0; }
	100% { width: 100%; opacity: 1; }
}

/* ===== 7. 翻译/罗马音 ===== */
.lyric-page__lyric-translation {
	font-size: 0.85em;
	opacity: 0.7;
	margin-top: 2px;
	color: var(--color-content-secondary);
}
.lyric-page__lyric-roma {
	font-size: 0.8em;
	opacity: 0.55;
	margin-top: 1px;
	color: var(--color-content-tertiary);
}

/* ===== 8. 歌词滚动条 + 上下边缘渐隐 ===== */
.lyric-page__lyrics {
	scrollbar-width: thin;
	scrollbar-color: transparent transparent;
	/* 沉浸式边缘渐隐：歌词进出视口时柔化 */
	-webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 9%, #000 91%, transparent 100%);
	mask-image: linear-gradient(to bottom, transparent 0, #000 9%, #000 91%, transparent 100%);
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

/* ===== 9. 字体大小调整 ===== */
.lyric-page__lyrics.small .lyric-page__lyric-line { font-size: 14px; padding: 8px 24px; }
.lyric-page__lyrics.large .lyric-page__lyric-line { font-size: 20px; padding: 16px 32px; }

/* ===== 9b. 控制区低调工具按钮（幽灵样式） ===== */
.lyric-page__time {
	font-size: 12px;
	font-variant-numeric: tabular-nums;
	color: var(--color-content-tertiary);
	letter-spacing: 0.4px;
}
.lyric-page__ghost-btn {
	background: transparent;
	border: none;
	padding: 3px 8px;
	border-radius: 6px;
	font-size: 11px;
	line-height: 1.4;
	color: var(--color-content-tertiary);
	font-variant-numeric: tabular-nums;
	cursor: pointer;
	transition: color 0.25s ease, background 0.25s ease, transform 0.15s ease;
}
.lyric-page__ghost-btn:hover {
	color: var(--color-accent-green);
	background: rgba(255, 255, 255, 0.06);
}
.lyric-page__ghost-btn:active {
	transform: scale(0.94);
}
.lyric-page__control-divider {
	width: 1px;
	height: 14px;
	background: rgba(255, 255, 255, 0.08);
	flex-shrink: 0;
}

/* ===== 10. 响应式 ===== */
@media (max-width: 768px) {
	.lyric-page__lyric-line { padding: 8px 24px; }
	.lyric-page__bg-blob--1 { width: 300px; height: 300px; }
	.lyric-page__bg-blob--2 { width: 400px; height: 400px; }
	.lyric-page__bg-blob--3 { width: 250px; height: 250px; }
	
	.lyric-page__vinyl-disc { width: 160px; height: 160px; }
	.lyric-page__vinyl-groove {
		display: none;
	}
	.lyric-page__album-cover-container { width: 120px; height: 120px; }
	.lyric-page__cover-border-ring { width: 146px; height: 146px; }
	.lyric-page__ripple-ring--1 { width: 200px; height: 200px; }
	.lyric-page__ripple-ring--2 { width: 240px; height: 240px; }
	.lyric-page__ripple-ring--3 { width: 280px; height: 280px; }
	.lyric-page__particles { display: none; }
	.lyric-page__spectrum { width: 86%; max-width: none; }
	.lyric-page__bg-cover { filter: blur(40px) saturate(1.15) brightness(0.52); }
}

/* ======== 11. 封面增强 — 黑胶唱盘 ======== */

/* 黑胶唱盘基底 */
.lyric-page__vinyl-disc {
	position: absolute;
	width: 260px;
	height: 260px;
	border-radius: 50%;
	background: radial-gradient(circle at 40% 35%, #1a1a1a, #0a0a0a 60%, #050505);
	box-shadow:
		0 8px 32px rgba(0,0,0,0.6),
		inset 0 2px 4px rgba(255,255,255,0.03);
	z-index: 1;
	top: calc(50% - 130px);
	left: calc(50% - 130px);
	will-change: transform;
}
.lyric-page__vinyl-disc--spin {
	animation: vinylSpin 4s linear infinite;
}
@keyframes vinylSpin {
	from { transform: rotate(0deg); }
	to { transform: rotate(360deg); }
}

/* 黑胶槽纹同心圆 */
.lyric-page__vinyl-groove {
	position: absolute;
	border-radius: 50%;
	border: 1px solid rgba(255,255,255,0.04);
	top: 50%; left: 50%;
	transform: translate(-50%, -50%);
}
.lyric-page__vinyl-groove--1 { width: 240px; height: 240px; }
.lyric-page__vinyl-groove--2 { width: 220px; height: 220px; }
.lyric-page__vinyl-groove--3 { width: 200px; height: 200px; }
.lyric-page__vinyl-groove--4 { width: 180px; height: 180px; }

/* 中心标签 */
.lyric-page__vinyl-label {
	position: absolute;
	width: 44px; height: 44px;
	border-radius: 50%;
	top: 50%; left: 50%;
	transform: translate(-50%, -50%);
	background: conic-gradient(
		from 0deg,
		#e53935, #ef5350, #e53935, #c62828,
		#ef5350, #e53935, #b71c1c, #e53935
	);
	box-shadow: inset 0 1px 3px rgba(255,255,255,0.2);
	z-index: 3;
}
.lyric-page__vinyl-hole {
	position: absolute;
	width: 10px; height: 10px;
	border-radius: 50%;
	top: 50%; left: 50%;
	transform: translate(-50%, -50%);
	background: #0a0a0a;
	box-shadow: inset 0 1px 2px rgba(0,0,0,0.8);
}

/* ======== 12. 封面容器包装 + 旋转 ======== */

.lyric-page__album-cover-wrapper {
	position: relative;
	width: 85%;
	max-width: 340px;
	aspect-ratio: 1;
	z-index: 2;
	display: flex;
	align-items: center;
	justify-content: center;
	/* 低音能量驱动轻微呼吸 */
	transform: scale(calc(1 + var(--bass-energy, 0) * 0.025));
	transition: transform 0.12s linear;
	/* 切歌时封面淡入（仅动画 opacity，避免覆盖低音呼吸 transform） */
	animation: coverFadeIn 0.6s ease-out both;
}
@keyframes coverFadeIn {
	0% { opacity: 0; }
	100% { opacity: 1; }
}

.lyric-page__album-cover-container {
	width: 80%;
	aspect-ratio: 1;
	border-radius: 50%;
	overflow: hidden;
	position: relative;
	z-index: 2;
	box-shadow:
		0 4px 20px rgba(0,0,0,0.4),
		0 0 30px var(--album-glow-color, rgba(76,175,80,0.2)),
		0 0 60px var(--album-glow-color, rgba(76,175,80,0.1));
	transition: box-shadow 0.6s ease;
}
.lyric-page__album-cover-container--spin {
	animation: coverSpin 8s linear infinite;
}
@keyframes coverSpin {
	from { transform: rotate(0deg); }
	to { transform: rotate(360deg); }
}

.lyric-page__album-img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	border-radius: 50%;
	transition: opacity 0.4s ease;
}

.lyric-page__album-placeholder {
	width: 100%;
	height: 100%;
	background: linear-gradient(135deg, #1a1a2e, #16213e);
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 48px;
	color: rgba(255,255,255,0.2);
	border-radius: 50%;
}

/* ======== 13. 旋转渐变发光边框（增强版） ======== */

.lyric-page__cover-border-ring {
	position: absolute;
	width: calc(80% + 24px);
	aspect-ratio: 1;
	border-radius: 50%;
	z-index: 1;
	padding: 4px;
	background: conic-gradient(
		from 0deg,
		var(--album-accent-color, #4caf50),
		rgba(100,200,255,0.9),
		rgba(200,100,255,0.8),
		rgba(255,100,150,0.7),
		rgba(100,255,200,0.6),
		var(--album-accent-color, #4caf50)
	);
	mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 4px));
	-webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 4px));
	opacity: 0.7;
	transition: opacity 0.5s ease, filter 0.5s ease;
	filter: blur(0.5px) brightness(1.4);
	animation: borderSpin 6s linear infinite;
	box-shadow:
		0 0 20px var(--album-accent-color, rgba(76,175,80,0.15)),
		0 0 40px var(--album-accent-color, rgba(76,175,80,0.08));
}
.lyric-page__cover-border-ring::before {
	content: '';
	position: absolute;
	inset: -6px;
	border-radius: 50%;
	background: conic-gradient(
		from 90deg,
		transparent 0deg,
		rgba(100,200,255,0.08) 60deg,
		rgba(200,100,255,0.05) 120deg,
		transparent 180deg,
		rgba(255,100,150,0.05) 240deg,
		rgba(100,255,200,0.08) 300deg,
		transparent 360deg
	);
	mask: radial-gradient(farthest-side, transparent calc(100% - 8px), #000 calc(100% - 8px));
	-webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 8px), #000 calc(100% - 8px));
	animation: borderSpin 4s linear infinite reverse;
	pointer-events: none;
}
.lyric-page__cover-border-ring--active {
	opacity: 1;
	filter: blur(0.5px) brightness(1.6);
	animation: borderSpin 2s linear infinite;
	box-shadow:
		0 0 10px rgba(100,200,255,0.3),
		0 0 25px var(--album-accent-color, rgba(76,175,80,0.25)),
		0 0 50px var(--album-glow-color, rgba(76,175,80,0.15)),
		0 0 80px var(--album-glow-color, rgba(76,175,80,0.08));
}
.lyric-page__cover-border-ring--active::before {
	animation: borderSpin 3s linear infinite reverse;
}
@keyframes borderSpin {
	from { transform: rotate(0deg); }
	to { transform: rotate(360deg); }
}

/* ======== 14. 玻璃反光扫光（增强版） ======== */

.lyric-page__cover-shine {
	position: absolute;
	top: 0; left: 0;
	width: 80%;
	aspect-ratio: 1;
	border-radius: 50%;
	z-index: 4;
	pointer-events: none;
	overflow: hidden;
	opacity: 0;
	background: linear-gradient(
		105deg,
		transparent 25%,
		rgba(255,255,255,0.18) 40%,
		rgba(200,220,255,0.12) 45%,
		rgba(255,255,255,0.08) 50%,
		transparent 60%
	);
}
.lyric-page__cover-shine--active {
	opacity: 1;
	animation: shineSweep 3.5s ease-in-out infinite;
}
@keyframes shineSweep {
	0% { transform: rotate(0deg) scale(1); opacity: 0; }
	8% { opacity: 0.8; }
	20% { transform: rotate(160deg) scale(1.08); opacity: 0.5; }
	45% { transform: rotate(360deg) scale(1); opacity: 0; }
	70% { transform: rotate(540deg) scale(1.08); opacity: 0.5; }
	85% { opacity: 0.8; }
	100% { transform: rotate(720deg) scale(1); opacity: 0; }
}

/* ======== 15. 声波波纹环（增强版） ======== */

.lyric-page__ripple-ring {
	position: absolute;
	border-radius: 50%;
	top: 50%; left: 50%;
	transform: translate(-50%, -50%);
	z-index: 0;
	pointer-events: none;
	opacity: 0;
}
.lyric-page__ripple-ring--1 {
	width: 300px; height: 300px;
	border: 2.5px solid rgba(100,200,255,0.35);
	box-shadow: 0 0 20px rgba(100,200,255,0.12), inset 0 0 20px rgba(100,200,255,0.05);
	animation: rippleExpand 3.5s ease-out infinite;
}
.lyric-page__ripple-ring--2 {
	width: 350px; height: 350px;
	border: 2px solid rgba(200,100,255,0.28);
	box-shadow: 0 0 20px rgba(200,100,255,0.10), inset 0 0 20px rgba(200,100,255,0.04);
	animation: rippleExpand 3.5s ease-out 1.2s infinite;
}
.lyric-page__ripple-ring--3 {
	width: 400px; height: 400px;
	border: 2px solid rgba(255,100,150,0.22);
	box-shadow: 0 0 20px rgba(255,100,150,0.08), inset 0 0 20px rgba(255,100,150,0.03);
	animation: rippleExpand 3.5s ease-out 2.4s infinite;
}
@keyframes rippleExpand {
	0% { transform: translate(-50%, -50%) scale(0.8); opacity: 0.7; }
	40% { transform: translate(-50%, -50%) scale(1.0); opacity: 0.4; }
	100% { transform: translate(-50%, -50%) scale(1.2); opacity: 0; }
}

/* ======== 15b. 真实音频频谱画布（环绕封面） ======== */

.lyric-page__spectrum {
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	width: 92%;
	aspect-ratio: 1;
	max-width: 560px;
	z-index: 1;
	pointer-events: none;
	opacity: 0.9;
}

/* ======== 15c. 低音能量光晕 ======== */

.lyric-page__bass-halo {
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	width: 96%;
	aspect-ratio: 1;
	max-width: 600px;
	border-radius: 50%;
	background: radial-gradient(circle, var(--album-soft-color, rgba(76,175,80,0.28)) 0%, transparent 62%);
	filter: blur(30px);
	opacity: calc(0.35 + var(--bass-energy, 0) * 0.65);
	z-index: 1;
	pointer-events: none;
	transition: opacity 0.1s linear;
}

/* ======== 16. 浮动粒子 ======== */

.lyric-page__particles {
	position: absolute;
	inset: 0;
	z-index: 3;
	pointer-events: none;
}
.lyric-page__particle {
	position: absolute;
	border-radius: 50%;
	opacity: 0;
	box-shadow: 0 0 6px currentColor;
}
.lyric-page__particles--active .lyric-page__particle {
	animation: particleFloat linear infinite;
}
@keyframes particleFloat {
	0% { transform: translateY(0) scale(1); opacity: 0; }
	10% { opacity: 0.6; }
	50% { transform: translateY(-60px) scale(1.2); opacity: 0.4; }
	90% { opacity: 0.1; }
	100% { transform: translateY(-120px) scale(0.5); opacity: 0; }
}

/* ======== 17. 封面区域响应式微调 ======== */

@media (max-width: 768px) {
	.lyric-page__album-section {
		min-height: 200px;
	}
}

/* ===== 动画资源门控 ===== */

/* 页面隐藏时暂停全部动画（组件常驻挂载，避免后台空转 GPU/CPU） */
.lyric-page:not(.lyric-page--show) *,
.lyric-page:not(.lyric-page--show) *::before,
.lyric-page:not(.lyric-page--show) *::after {
	animation-play-state: paused !important;
}

/* 性能模式：关闭装饰性动画元素（粒子/频谱/扫光/波纹环/背景光斑/模糊背景） */
.lyric-page--perf .lyric-page__particles,
.lyric-page--perf .lyric-page__spectrum,
.lyric-page--perf .lyric-page__bass-halo,
.lyric-page--perf .lyric-page__cover-shine,
.lyric-page--perf .lyric-page__ripple-ring,
.lyric-page--perf .lyric-page__bg-blobs {
	display: none !important;
}
.lyric-page--perf .lyric-page__bg-cover {
	display: none !important;
}
.lyric-page--perf .lyric-page__cover-border-ring,
.lyric-page--perf .lyric-page__cover-border-ring::before {
	animation: none !important;
}

/* 系统级减弱动态效果偏好 */
@media (prefers-reduced-motion: reduce) {
	.lyric-page *,
	.lyric-page *::before,
	.lyric-page *::after {
		animation: none !important;
		transition: none !important;
	}
}
</style>
