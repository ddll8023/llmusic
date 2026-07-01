/**
 * 歌词状态管理（独立 Store）
 *
 * 职责：
 * - 歌词数据的加载与缓存
 * - 当前歌词行索引追踪
 * - 同步偏移量调整
 * - 翻译/音译显示开关
 * - 自动滚动状态管理
 *
 * 从 playerStore 剥离，降低播放器耦合，为后续桌面歌词/歌词搜索预留扩展点。
 */
import { defineStore } from "pinia"
import type { LyricLine } from "../types"
import { getSongDownloadBundle } from '@/api/qqmusic'
import { usePlayerStore } from './player'

export const useLyricsStore = defineStore("lyrics", {
	state: () => ({
		/** 歌词行列表 */
		lines: [] as LyricLine[],
		/** 当前高亮的歌词行索引 */
		currentIndex: -1,
		/** 是否有歌词可显示 */
		hasLyrics: false,
		/** 歌词同步偏移量 (ms)，正数=延后，负数=提前 */
		syncOffset: 0,
		/** 是否启用自动滚动 */
		isAutoScrolling: true,
		/** 是否显示翻译歌词 */
		showTranslation: false,
		/** 是否显示罗马音/音译 */
		showRoma: false,
		/** 歌词来源 */
		source: null as string | null,
		/** 歌词格式 */
		format: null as string | null,
		/** 歌词元信息 */
		metadata: {} as Record<string, string>,
	}),

	getters: {
		/** 当前高亮的歌词行对象 */
		currentLine(state): LyricLine | null {
			return state.currentIndex >= 0 && state.currentIndex < state.lines.length
				? state.lines[state.currentIndex]
				: null
		},

		/** 用于展示的歌词行（根据 showTranslation/showRoma 组装） */
		displayLines(state): LyricLine[] {
			return state.lines.filter((line) => line.text.trim() !== "")
		},
	},

	actions: {
		/**
		 * 加载歌词
		 * 供 playerStore.playSong 调用
		 */
		async loadLyrics(songId: string) {
			try {
				const result = await window.electronAPI.getLyrics(songId)
				if (result && "success" in result && result.success && result.lyrics) {
					this.lines = result.lyrics as LyricLine[]
					this.hasLyrics = this.lines.length > 0
					const _r = result as { source?: string; format?: string; metadata?: Record<string, string> }
					this.source = _r.source ?? null
					this.format = _r.format ?? null
					this.metadata = _r.metadata ?? {}
					this.currentIndex = -1
					return
				}
				this.reset()
			} catch {
				this.reset()
			}
		},

		/**
		 * 更新当前歌词行索引
		 */
		setCurrentIndex(index: number) {
			this.currentIndex = index
		},

		/**
		 * 调整歌词同步偏移量
		 * @param delta 偏移量 (ms)
		 */
		adjustOffset(delta: number) {
			this.syncOffset += delta
		},

		/** 重置偏移量 */
		resetOffset() {
			this.syncOffset = 0
		},

		/** 切换翻译显示 */
		toggleTranslation() {
			this.showTranslation = !this.showTranslation
		},

		/** 切换罗马音显示 */
		toggleRoma() {
			this.showRoma = !this.showRoma
		},

		/** 设置自动滚动状态 */
		setAutoScrolling(auto: boolean) {
			this.isAutoScrolling = auto
		},

		/**
		 * 从 LRC 文本加载歌词（用于在线歌曲）
		 */
		loadOnlineLyrics(lrcText: string) {
			const parsed: LyricLine[] = lrcText.split('\n')
				.map(line => line.trim())
				.filter(line => /^\[\d{2}:\d{2}[\.\:]\d{2,3}\]/.test(line))
				.map(line => {
					const match = line.match(/^\[(\d{2}):(\d{2})[\.\:](\d{2,3})\](.*)/)
					if (!match) return null
					const ms = parseInt(match[1]) * 60000
						+ parseInt(match[2]) * 1000
						+ parseInt(match[3]) * (match[3].length === 3 ? 1 : 10)
					const text = (match[4] || '').trim()
					if (!text) return null
					return { time: ms, text }
				})
				.filter((l): l is LyricLine => l !== null)
			this.lines = parsed
			this.hasLyrics = parsed.length > 0
			this.currentIndex = -1
			this.syncOffset = 0
			this.isAutoScrolling = true
			this.source = 'online'
			this.format = 'lrc'
		},

		/**
		 * 通过 songMid 从后端加载在线歌词
		 * 供 playerStore._applyOnlineSong 调用（fire-and-forget）
		 */
		async loadOnlineLyricsByMid(songMid: string) {
			if (!songMid) return
			try {
				const res = await getSongDownloadBundle(String(Date.now()), songMid)
				const playerStore = usePlayerStore()
				if (playerStore.onlineSongMid !== songMid) return
				const data = res.data as { lyrics?: string }
				if (data?.lyrics) {
					this.loadOnlineLyrics(data.lyrics)
				}
			} catch {
				// 歌词加载失败不阻塞播放
			}
		},

		/** 重置歌词状态 */
		reset() {
			this.lines = []
			this.currentIndex = -1
			this.hasLyrics = false
			this.source = null
			this.format = null
			this.metadata = {}
		},
	},
})
