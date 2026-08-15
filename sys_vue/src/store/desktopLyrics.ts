import { defineStore } from "pinia"

let initPromise: Promise<void> | null = null

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

export const useDesktopLyricsStore = defineStore("desktopLyrics", {
	state: () => ({
		enabled: false,
		locked: false,
		alwaysOnTop: true,
		fontSize: 28,
		doubleLine: false,
		currentLineColor: "#ffffff",
		nextLineColor: "#b3b3b3",
		ready: false,
	}),

	actions: {
		assignConfig(config: Partial<DesktopLyricConfig>) {
			this.enabled = config.enabled ?? this.enabled
			this.locked = config.locked ?? this.locked
			this.alwaysOnTop = config.alwaysOnTop ?? this.alwaysOnTop
			this.fontSize = config.fontSize ?? this.fontSize
			this.doubleLine = config.doubleLine ?? this.doubleLine
			this.currentLineColor = config.currentLineColor ?? this.currentLineColor
			this.nextLineColor = config.nextLineColor ?? this.nextLineColor
		},

		init() {
			if (this.ready) return Promise.resolve()
			if (!initPromise) {
				initPromise = this._doInit().finally(() => {
					initPromise = null
				})
			}
			return initPromise
		},

		async _doInit() {
			try {
				const res = await window.electronAPI.getDesktopLyricState()
				if (res.success && res.config) {
					this.assignConfig(res.config)
				}
			} catch {
				// 初始化失败时保持默认值
			}
			window.electronAPI.onDesktopLyricConfigChange((config) => {
				this.assignConfig(config)
			})
			this.ready = true
		},

		async setEnabled(enabled: boolean) {
			const res = await window.electronAPI.setDesktopLyricEnabled(enabled)
			if (res.success) {
				this.enabled = enabled
			}
		},

		async setLocked(locked: boolean) {
			const res = await window.electronAPI.updateDesktopLyricConfig({ locked })
			if (res.success) {
				this.locked = locked
			}
		},

		async setAlwaysOnTop(alwaysOnTop: boolean) {
			const res = await window.electronAPI.updateDesktopLyricConfig({ alwaysOnTop })
			if (res.success) {
				this.alwaysOnTop = alwaysOnTop
			}
		},

		async setFontSize(fontSize: number) {
			const res = await window.electronAPI.updateDesktopLyricConfig({ fontSize })
			if (res.success) {
				this.fontSize = fontSize
			}
		},

		async setDoubleLine(doubleLine: boolean) {
			const res = await window.electronAPI.updateDesktopLyricConfig({ doubleLine })
			if (res.success) {
				this.doubleLine = doubleLine
			}
		},

		async setCurrentLineColor(color: string) {
			const res = await window.electronAPI.updateDesktopLyricConfig({ currentLineColor: color })
			if (res.success) {
				this.currentLineColor = color
			}
		},

		async setNextLineColor(color: string) {
			const res = await window.electronAPI.updateDesktopLyricConfig({ nextLineColor: color })
			if (res.success) {
				this.nextLineColor = color
			}
		},
	},
})
