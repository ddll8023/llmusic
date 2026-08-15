<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import type { LyricLine } from "../types"

interface DesktopLyricConfig {
	enabled: boolean
	locked: boolean
	alwaysOnTop: boolean
	fontSize: number
	x: number | null
	y: number | null
	width: number
	height: number
	showTranslation: boolean
	doubleLine: boolean
	currentLineColor: string
	nextLineColor: string
}

interface NowPlayingTrack {
	id?: string
	title: string
	artist: string
	album: string
	isOnline?: boolean
}

interface NowPlayingSnapshot {
	track: NowPlayingTrack | null
	lyric: LyricLine[]
	position: number
	playing: boolean
	speed: number
	lyricOffsetMs: number
	sendTimestamp: number
	showTranslation: boolean
	showRoma: boolean
}

interface NowPlayingPositionSync {
	position: number
	playing: boolean
	speed: number
	sendTimestamp: number
}

interface UnlockButtonBounds {
	x: number
	y: number
	width: number
	height: number
}

const defaultConfig: DesktopLyricConfig = {
	enabled: true,
	locked: false,
	alwaysOnTop: true,
	fontSize: 28,
	x: null,
	y: null,
	width: 800,
	height: 120,
	showTranslation: true,
	doubleLine: false,
	currentLineColor: "#ffffff",
	nextLineColor: "#b3b3b3",
}

const config = ref<DesktopLyricConfig>({ ...defaultConfig })
const track = ref<NowPlayingTrack | null>(null)
const lyric = ref<LyricLine[]>([])
const playing = ref(false)
const showTranslation = ref(false)
const showRoma = ref(false)
const primaryIndex = ref(-1)
const currentMs = ref(0)
const isHovered = ref(false)
const isDragging = ref(false)
const showSettings = ref(false)
let baseHeight = 120

const unlockButtonRef = ref<HTMLButtonElement | null>(null)
const controlsRef = ref<HTMLDivElement | null>(null)
const settingsRef = ref<HTMLDivElement | null>(null)

// ---- 播放位置锚点 + RAF 插值 ----
let anchorPos = 0
let anchorPerf = 0
let anchorInitialized = false
let speed = 1
let lyricOffsetMs = 0
let rafId: number | null = null
const SYNC_DRIFT_THRESHOLD = 300

function syncOnce(): void {
	const next = playing.value ? anchorPos + (performance.now() - anchorPerf) * speed : anchorPos
	currentMs.value = next + lyricOffsetMs
	let idx = -1
	const lines = lyric.value
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].time <= currentMs.value) idx = i
		else break
	}
	if (idx !== primaryIndex.value) primaryIndex.value = idx
}

function tick(): void {
	syncOnce()
	rafId = playing.value ? requestAnimationFrame(tick) : null
}

function kickTick(): void {
	if (rafId !== null) return
	rafId = requestAnimationFrame(tick)
}

function resetAnchor(positionMs: number, sendTimestamp: number): void {
	const ipcDelay = Math.max(0, Date.now() - sendTimestamp)
	anchorPos = positionMs + (playing.value ? ipcDelay : 0)
	anchorPerf = performance.now()
	currentMs.value = anchorPos + lyricOffsetMs
	anchorInitialized = true
}

function applySnapshot(snap: NowPlayingSnapshot): void {
	track.value = snap.track
	lyric.value = snap.lyric || []
	playing.value = snap.playing
	showTranslation.value = snap.showTranslation
	showRoma.value = snap.showRoma
	speed = snap.speed || 1
	lyricOffsetMs = snap.lyricOffsetMs || 0
	primaryIndex.value = -1
	resetAnchor(snap.position || 0, snap.sendTimestamp || Date.now())
}

function applyPosition(pos: NowPlayingPositionSync): void {
	playing.value = pos.playing
	const ipcDelay = Math.max(0, Date.now() - pos.sendTimestamp)
	const candidate = pos.position + (playing.value ? ipcDelay : 0)
	const projected = anchorInitialized && playing.value
		? anchorPos + (performance.now() - anchorPerf) * speed
		: null
	if (projected === null || Math.abs(candidate - projected) > SYNC_DRIFT_THRESHOLD) {
		speed = pos.speed || 1
		resetAnchor(pos.position, pos.sendTimestamp)
	} else {
		speed = pos.speed || speed
	}
}

// ---- 展示派生 ----
const currentLine = computed<LyricLine | null>(() => {
	if (primaryIndex.value < 0 || primaryIndex.value >= lyric.value.length) return null
	return lyric.value[primaryIndex.value]
})

const activeWordIndex = computed(() => {
	const line = currentLine.value
	if (!line?.words?.length) return -1
	let idx = -1
	for (let i = 0; i < line.words.length; i++) {
		if (currentMs.value >= line.words[i].time) idx = i
		else break
	}
	return idx
})

const displayText = computed(() => {
	if (!track.value) return "LLMusic 桌面歌词"
	if (!lyric.value.length) return `${track.value.title} - ${track.value.artist}`
	if (!currentLine.value) return track.value.title
	return currentLine.value.text
})

const nextLine = computed<LyricLine | null>(() => {
	if (!config.value.doubleLine) return null
	const idx = primaryIndex.value
	if (idx < 0 || idx + 1 >= lyric.value.length) return null
	return lyric.value[idx + 1]
})

const displayTranslation = computed(() => {
	if (!showTranslation.value || !currentLine.value?.translation) return ""
	return currentLine.value.translation
})

const displayRoma = computed(() => {
	if (!showRoma.value || !currentLine.value?.roma) return ""
	return currentLine.value.roma
})

// ---- 拖拽 ----
let dragOffsetX = 0
let dragOffsetY = 0
let dragPointerId = -1
let dragTarget: HTMLElement | null = null
let moveRafPending = false
let pendingX = 0
let pendingY = 0

function flushMove(): void {
	moveRafPending = false
	void window.electronAPI.desktopLyricMove(pendingX, pendingY)
}

function onPointerDown(event: PointerEvent): void {
	if (config.value.locked) return
	if (event.button !== 0) return
	const target = event.target as HTMLElement
	if (target.closest("button")) return

	isDragging.value = true
	dragOffsetX = event.clientX
	dragOffsetY = event.clientY
	dragPointerId = event.pointerId
	dragTarget = target
	try {
		target.setPointerCapture(event.pointerId)
	} catch {
		// 忽略捕获失败
	}
	target.addEventListener("pointermove", onPointerMove)
	target.addEventListener("pointerup", onPointerUp)
	target.addEventListener("pointercancel", onPointerUp)
	event.preventDefault()
}

function onPointerMove(event: PointerEvent): void {
	if (!isDragging.value) return
	pendingX = Math.round(event.screenX - dragOffsetX)
	pendingY = Math.round(event.screenY - dragOffsetY)
	if (!moveRafPending) {
		moveRafPending = true
		requestAnimationFrame(flushMove)
	}
}

function onPointerUp(): void {
	if (!isDragging.value) return
	isDragging.value = false
	if (dragTarget && dragPointerId !== -1) {
		try {
			dragTarget.releasePointerCapture(dragPointerId)
		} catch {
			// 忽略释放失败
		}
	}
	dragTarget?.removeEventListener("pointermove", onPointerMove)
	dragTarget?.removeEventListener("pointerup", onPointerUp)
	dragTarget?.removeEventListener("pointercancel", onPointerUp)
	dragTarget = null
	dragPointerId = -1
	void window.electronAPI.desktopLyricSaveState()
}

// ---- 锁定态可交互区域上报 ----
function reportUnlockButtonBounds(): void {
	const rects: DOMRect[] = []
	if (config.value.locked && isHovered.value && controlsRef.value) {
		rects.push(controlsRef.value.getBoundingClientRect())
	}
	if (showSettings.value && settingsRef.value) {
		rects.push(settingsRef.value.getBoundingClientRect())
	}
	if (!rects.length) {
		void window.electronAPI.setDesktopLyricUnlockButtonBounds(null)
		return
	}
	const left = Math.min(...rects.map((r) => r.left))
	const top = Math.min(...rects.map((r) => r.top))
	const right = Math.max(...rects.map((r) => r.right))
	const bottom = Math.max(...rects.map((r) => r.bottom))
	const bounds: UnlockButtonBounds = {
		x: left,
		y: top,
		width: right - left,
		height: bottom - top,
	}
	void window.electronAPI.setDesktopLyricUnlockButtonBounds(bounds)
}

// ---- 操作 ----
async function toggleLock(): Promise<void> {
	const next = !config.value.locked
	const res = await window.electronAPI.updateDesktopLyricConfig({ locked: next })
	if (res.success) config.value.locked = next
}

async function closeDesktopLyric(): Promise<void> {
	await window.electronAPI.desktopLyricClose()
}

function toggleSettings(): void {
	showSettings.value = !showSettings.value
	if (showSettings.value) {
		baseHeight = config.value.height || 120
		void updateSetting({ height: Math.max(baseHeight, 320) })
	} else {
		void updateSetting({ height: baseHeight })
	}
}

async function updateSetting(patch: Partial<DesktopLyricConfig>): Promise<void> {
	await window.electronAPI.updateDesktopLyricConfig(patch)
}

function setDisplayMode(mode: "single" | "double"): void {
	void updateSetting({ doubleLine: mode === "double" })
}

function setFontSize(size: number): void {
	void updateSetting({ fontSize: size })
}

function setCurrentLineColor(event: Event): void {
	const input = event.target as HTMLInputElement
	void updateSetting({ currentLineColor: input.value })
}

function setNextLineColor(event: Event): void {
	const input = event.target as HTMLInputElement
	void updateSetting({ nextLineColor: input.value })
}

// ---- 生命周期 ----
const unsubscribers: Array<() => void> = []
let snapshotPollTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
	// 先注册事件监听，避免异步获取状态/快照期间漏掉已广播的更新
	unsubscribers.push(
		window.electronAPI.onDesktopLyricConfigChange((next) => {
			config.value = { ...config.value, ...next }
			nextTick(() => reportUnlockButtonBounds())
		}),
		window.electronAPI.onDesktopLyricNowPlaying((snap) => {
			applySnapshot(snap)
			kickTick()
		}),
		window.electronAPI.onDesktopLyricPositionSync((pos) => {
			applyPosition(pos)
			kickTick()
		}),
		window.electronAPI.onDesktopLyricCursorInside((inside) => {
			isHovered.value = inside
		}),
	)

	try {
		const stateRes = await window.electronAPI.getDesktopLyricState()
		if (stateRes.success && stateRes.config) {
			config.value = { ...defaultConfig, ...stateRes.config }
			baseHeight = config.value.height || 120
		}
	} catch {
		// 保持默认配置
	}

	try {
		const snapRes = await window.electronAPI.requestDesktopLyricSnapshot()
		if (snapRes.success && snapRes.snapshot) {
			applySnapshot(snapRes.snapshot)
			kickTick()
		}
	} catch {
		// 忽略快照拉取失败
	}

	// 兜底轮询：事件同步异常时也能在数秒内恢复歌词与进度
	snapshotPollTimer = setInterval(async () => {
		try {
			const res = await window.electronAPI.requestDesktopLyricSnapshot()
			if (!res.success || !res.snapshot) return
			const snap = res.snapshot
			const trackChanged =
				snap.track?.id !== track.value?.id ||
				snap.track?.title !== track.value?.title ||
				snap.track?.artist !== track.value?.artist
			const lyricChanged = snap.lyric.length !== lyric.value.length
			const playingChanged = snap.playing !== playing.value
			if (trackChanged || lyricChanged || playingChanged || !anchorInitialized) {
				applySnapshot(snap)
				kickTick()
			} else if (snap.playing && Math.abs(snap.position - currentMs.value) > 2000) {
				resetAnchor(snap.position, snap.sendTimestamp || Date.now())
				kickTick()
			}
		} catch {
			// 忽略轮询失败
		}
	}, 2000)

	await nextTick()
	reportUnlockButtonBounds()
	window.addEventListener("resize", reportUnlockButtonBounds)
})

onBeforeUnmount(() => {
	if (rafId !== null) cancelAnimationFrame(rafId)
	rafId = null
	if (snapshotPollTimer) {
		clearInterval(snapshotPollTimer)
		snapshotPollTimer = null
	}
	for (const off of unsubscribers) off()
	window.removeEventListener("resize", reportUnlockButtonBounds)
})

watch(() => config.value.fontSize, () => {
	nextTick(() => reportUnlockButtonBounds())
})

watch(isHovered, () => {
	nextTick(() => reportUnlockButtonBounds())
})

watch(showSettings, () => {
	nextTick(() => reportUnlockButtonBounds())
})
</script>

<template>
	<div
		class="desktop-lyric"
		:class="{ 'desktop-lyric--locked': config.locked, 'desktop-lyric--hovered': isHovered }"
		:style="{ fontSize: config.fontSize + 'px' }"
		@pointerdown="onPointerDown"
	>
		<div class="desktop-lyric__content">
			<div
				v-if="currentLine?.words?.length"
				class="desktop-lyric__line desktop-lyric__line--words"
				:style="{ color: config.currentLineColor }"
			>
				<span
					v-for="(word, wi) in currentLine.words"
					:key="wi"
					class="desktop-lyric__word"
					:class="{ 'desktop-lyric__word--active': wi <= activeWordIndex }"
				>{{ word.word }}</span>
			</div>
			<div v-else class="desktop-lyric__line" :style="{ color: config.currentLineColor }">{{ displayText }}</div>
			<div
				v-if="nextLine"
				class="desktop-lyric__line desktop-lyric__line--next"
				:style="{ color: config.nextLineColor }"
			>{{ nextLine.text }}</div>
			<div v-if="displayRoma" class="desktop-lyric__sub desktop-lyric__sub--roma">{{ displayRoma }}</div>
			<div v-if="displayTranslation" class="desktop-lyric__sub desktop-lyric__sub--translation">{{ displayTranslation }}</div>
		</div>

		<div ref="controlsRef" class="desktop-lyric__controls" :class="{ 'desktop-lyric__controls--visible': !config.locked || isHovered }">
			<button
				ref="unlockButtonRef"
				class="desktop-lyric__btn"
				:title="config.locked ? '解锁（允许拖拽）' : '锁定（点击穿透）'"
				@click.stop="toggleLock"
			>
				{{ config.locked ? "解锁" : "锁定" }}
			</button>
			<button
				class="desktop-lyric__btn"
				:class="{ 'desktop-lyric__btn--active': showSettings }"
				title="桌面歌词设置"
				@click.stop="toggleSettings"
			>
				设置
			</button>
			<button class="desktop-lyric__btn" title="关闭桌面歌词" @click.stop="closeDesktopLyric">关闭</button>
		</div>

		<div
			v-if="showSettings"
			ref="settingsRef"
			class="desktop-lyric__settings"
			role="dialog"
			aria-label="桌面歌词设置"
			@click.stop
			@pointerdown.stop
		>
			<div class="desktop-lyric__settings-header">
				<span class="desktop-lyric__settings-title">歌词设置</span>
				<button class="desktop-lyric__settings-close" title="关闭设置" @click.stop="toggleSettings">×</button>
			</div>

			<div class="desktop-lyric__settings-body">
				<div class="desktop-lyric__settings-group">
					<span class="desktop-lyric__settings-label">显示</span>
					<div class="desktop-lyric__settings-segmented">
						<button
							class="desktop-lyric__settings-segmented-btn"
							:class="{ 'desktop-lyric__settings-segmented-btn--active': !config.doubleLine }"
							@click.stop="setDisplayMode('single')"
						>单行</button>
						<button
							class="desktop-lyric__settings-segmented-btn"
							:class="{ 'desktop-lyric__settings-segmented-btn--active': config.doubleLine }"
							@click.stop="setDisplayMode('double')"
						>双行</button>
					</div>
				</div>

				<div class="desktop-lyric__settings-group">
					<span class="desktop-lyric__settings-label">字号</span>
					<div class="desktop-lyric__settings-size">
						<button class="desktop-lyric__settings-step" title="减小字号" @click.stop="setFontSize(config.fontSize - 2)">−</button>
						<span class="desktop-lyric__settings-size-value">{{ config.fontSize }}px</span>
						<button class="desktop-lyric__settings-step" title="增大字号" @click.stop="setFontSize(config.fontSize + 2)">+</button>
					</div>
				</div>

				<div class="desktop-lyric__settings-group">
					<span class="desktop-lyric__settings-label">当前行</span>
					<label class="desktop-lyric__settings-color">
						<input
							type="color"
							:value="config.currentLineColor"
							@input="setCurrentLineColor"
						/>
						<span>{{ config.currentLineColor }}</span>
					</label>
				</div>

				<div class="desktop-lyric__settings-group">
					<span class="desktop-lyric__settings-label">下一行</span>
					<label class="desktop-lyric__settings-color">
						<input
							type="color"
							:value="config.nextLineColor"
							@input="setNextLineColor"
						/>
						<span>{{ config.nextLineColor }}</span>
					</label>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.desktop-lyric {
	position: relative;
	width: 100vw;
	height: 100vh;
	display: flex;
	align-items: center;
	justify-content: center;
	box-sizing: border-box;
	overflow: hidden;
	background: transparent;
	color: #fff;
	text-align: center;
	cursor: default;
	transition: opacity 0.25s ease;
}

.desktop-lyric--locked:not(.desktop-lyric--hovered) {
	opacity: 0.9;
}

.desktop-lyric__content {
	max-width: 90vw;
	line-height: 1.5;
	text-shadow: 0 1px 6px rgba(0, 0, 0, 0.45);
}

.desktop-lyric__line {
	font-weight: 600;
	letter-spacing: 0.02em;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.desktop-lyric__line--words {
	white-space: normal;
}

.desktop-lyric__line--next {
	margin-top: 0.3em;
	font-size: 0.75em;
	font-weight: 500;
	opacity: 0.55;
}

.desktop-lyric__word {
	opacity: 0.45;
	transition: opacity 0.15s ease;
}

.desktop-lyric__word--active {
	opacity: 1;
}

.desktop-lyric__sub {
	margin-top: 0.35em;
	font-size: 0.7em;
	opacity: 0.85;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.desktop-lyric__sub--roma {
	opacity: 0.6;
}

.desktop-lyric__controls {
	position: absolute;
	top: 8px;
	right: 8px;
	display: flex;
	gap: 6px;
	opacity: 0;
	transition: opacity 0.2s ease;
}

.desktop-lyric__controls--visible {
	opacity: 1;
}

.desktop-lyric__btn {
	appearance: none;
	border: 1px solid rgba(255, 255, 255, 0.25);
	background: rgba(0, 0, 0, 0.35);
	color: #fff;
	font-size: 12px;
	line-height: 1;
	padding: 5px 9px;
	border-radius: 6px;
	cursor: pointer;
	backdrop-filter: blur(4px);
}

.desktop-lyric__btn:hover {
	background: rgba(0, 0, 0, 0.55);
}

.desktop-lyric__btn--active {
	background: rgba(76, 175, 80, 0.45);
	border-color: rgba(76, 175, 80, 0.6);
}

.desktop-lyric__settings {
	position: absolute;
	top: 44px;
	right: 8px;
	width: 280px;
	border-radius: 16px;
	background: linear-gradient(145deg, rgba(30, 30, 38, 0.92), rgba(16, 16, 22, 0.94));
	border: 1px solid rgba(255, 255, 255, 0.1);
	box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.06);
	backdrop-filter: blur(16px) saturate(1.2);
	overflow: hidden;
	text-align: left;
	z-index: 20;
	color: #fff;
	font-size: 12px;
	animation: desktop-lyric-settings-in 0.18s ease-out;
}

@keyframes desktop-lyric-settings-in {
	from {
		opacity: 0;
		transform: translateY(-6px) scale(0.98);
	}
	to {
		opacity: 1;
		transform: none;
	}
}

.desktop-lyric__settings-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 12px 14px 10px;
	border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.desktop-lyric__settings-title {
	font-size: 13px;
	font-weight: 600;
	letter-spacing: 0.02em;
}

.desktop-lyric__settings-close {
	appearance: none;
	border: none;
	background: transparent;
	color: rgba(255, 255, 255, 0.55);
	font-size: 18px;
	line-height: 1;
	width: 24px;
	height: 24px;
	border-radius: 6px;
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
}

.desktop-lyric__settings-close:hover {
	background: rgba(255, 255, 255, 0.1);
	color: #fff;
}

.desktop-lyric__settings-body {
	padding: 4px 14px 12px;
}

.desktop-lyric__settings-group {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 10px 0;
	border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.desktop-lyric__settings-group:last-child {
	border-bottom: none;
}

.desktop-lyric__settings-label {
	color: rgba(255, 255, 255, 0.62);
}

.desktop-lyric__settings-segmented {
	display: flex;
	background: rgba(255, 255, 255, 0.06);
	border-radius: 8px;
	padding: 2px;
	gap: 2px;
}

.desktop-lyric__settings-segmented-btn {
	appearance: none;
	border: none;
	background: transparent;
	color: rgba(255, 255, 255, 0.7);
	padding: 4px 12px;
	border-radius: 6px;
	cursor: pointer;
	font-size: 12px;
	transition: background 0.15s ease, color 0.15s ease;
}

.desktop-lyric__settings-segmented-btn--active {
	background: rgba(255, 255, 255, 0.14);
	color: #fff;
	box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}

.desktop-lyric__settings-size {
	display: flex;
	align-items: center;
	gap: 8px;
}

.desktop-lyric__settings-step {
	appearance: none;
	width: 24px;
	height: 24px;
	border-radius: 6px;
	border: 1px solid rgba(255, 255, 255, 0.12);
	background: rgba(255, 255, 255, 0.06);
	color: #fff;
	cursor: pointer;
	font-size: 14px;
	line-height: 1;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: background 0.15s ease;
}

.desktop-lyric__settings-step:hover {
	background: rgba(255, 255, 255, 0.12);
}

.desktop-lyric__settings-size-value {
	min-width: 44px;
	text-align: center;
	font-variant-numeric: tabular-nums;
}

.desktop-lyric__settings-color {
	display: flex;
	align-items: center;
	gap: 8px;
	cursor: pointer;
}

.desktop-lyric__settings-color input[type="color"] {
	width: 28px;
	height: 28px;
	padding: 0;
	border: 1px solid rgba(255, 255, 255, 0.15);
	border-radius: 8px;
	background: transparent;
	cursor: pointer;
}

.desktop-lyric__settings-color span {
	color: rgba(255, 255, 255, 0.75);
	font-size: 11px;
	text-transform: uppercase;
}

@media (prefers-reduced-motion: reduce) {
	.desktop-lyric__settings {
		animation: none;
	}
}
</style>
