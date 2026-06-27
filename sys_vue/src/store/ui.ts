import { defineStore } from 'pinia'
import { usePlaylistStore } from './playlist'

interface UiState {
	isSidebarVisible: boolean
	sidebarWidth: number
	tempSidebarWidth: number
	isDraggingSidebar: boolean
	isPlaylistVisible: boolean
	currentView: string
	lyricsAnimationStyle: string
	closeBehavior: string
}

type CloseBehavior = 'exit' | 'minimize'

const loadState = () => {
	try {
		const savedLyricsAnimation = localStorage.getItem('lyricsAnimationStyle')
		const savedCloseBehavior = localStorage.getItem('closeBehavior')
		const savedSidebarVisible = localStorage.getItem('sidebarVisible')

		if (savedSidebarVisible === 'false') {
			localStorage.setItem('sidebarVisible', 'true')
		}

		return {
			lyricsAnimationStyle: savedLyricsAnimation || 'fade',
			closeBehavior: savedCloseBehavior || 'exit',
			isSidebarVisible: true,
		}
	} catch {
		return {
			lyricsAnimationStyle: 'fade' as const,
			closeBehavior: 'exit' as const,
			isSidebarVisible: true,
		}
	}
}

export const useUiStore = defineStore('ui', {
	state: (): UiState => ({
		isSidebarVisible: loadState().isSidebarVisible,
		sidebarWidth: 250,
		tempSidebarWidth: 250,
		isDraggingSidebar: false,
		isPlaylistVisible: false,
		currentView: 'main',
		lyricsAnimationStyle: loadState().lyricsAnimationStyle,
		closeBehavior: loadState().closeBehavior,
	}),

	getters: {
		isSidebarCollapsed: (state): boolean => state.sidebarWidth <= 130,
		effectiveSidebarWidth: (state): number => (state.isSidebarVisible ? state.sidebarWidth : 0),
		currentDisplayWidth: (state): number =>
			state.isDraggingSidebar ? state.tempSidebarWidth : state.sidebarWidth,
		effectiveDragWidth: (state): number =>
			state.isSidebarVisible
				? state.isDraggingSidebar
					? state.tempSidebarWidth
					: state.sidebarWidth
				: 0,
	},

	actions: {
		setView(view: string) {
			this.currentView = view
			if (view !== 'playlist') {
				import('./playlist')
					.then(({ usePlaylistStore: store }) => {
						const playlistStore = store()
						playlistStore.clearCurrentPlaylist()
					})
					.catch((error) => {
						console.error('清除歌单状态失败:', error)
					})
			}
		},

		toggleSidebar() {
			this.isSidebarVisible = !this.isSidebarVisible
			localStorage.setItem('sidebarVisible', String(this.isSidebarVisible))
		},

		toggleSidebarCollapse() {
			if (this.isSidebarCollapsed) {
				this.sidebarWidth = 250
			} else {
				this.sidebarWidth = 60
			}
		},

		collapseSidebar() {
			this.sidebarWidth = 60
		},

		expandSidebar() {
			this.sidebarWidth = 250
		},

		togglePlaylist() {
			this.isPlaylistVisible = !this.isPlaylistVisible
		},

		showSidebar() {
			this.isSidebarVisible = true
			localStorage.setItem('sidebarVisible', 'true')
		},

		hideSidebar() {
			this.isSidebarVisible = false
			localStorage.setItem('sidebarVisible', 'false')
		},

		setSidebarWidth(newWidth: number) {
			const minWidth = 60
			const maxWidth = 300
			this.sidebarWidth = Math.min(Math.max(newWidth, minWidth), maxWidth)
		},

		setTempSidebarWidth(newWidth: number) {
			const minWidth = 60
			const maxWidth = 300
			this.tempSidebarWidth = Math.min(Math.max(newWidth, minWidth), maxWidth)
		},

		startSidebarDrag() {
			this.isDraggingSidebar = true
			this.tempSidebarWidth = this.sidebarWidth
		},

		endSidebarDrag() {
			this.isDraggingSidebar = false
			this.sidebarWidth = this.tempSidebarWidth
		},

		cancelSidebarDrag() {
			this.isDraggingSidebar = false
			this.tempSidebarWidth = this.sidebarWidth
		},

		updateSidebarWidthBatch(newWidth: number, isTemp = false) {
			const minWidth = 60
			const maxWidth = 300
			const clampedWidth = Math.min(Math.max(newWidth, minWidth), maxWidth)
			if (isTemp) {
				this.tempSidebarWidth = clampedWidth
			} else {
				this.sidebarWidth = clampedWidth
				this.tempSidebarWidth = clampedWidth
			}
		},

		setLyricsAnimationStyle(style: string) {
			this.lyricsAnimationStyle = style
			try {
				localStorage.setItem('lyricsAnimationStyle', style)
			} catch (e) {
				console.error('保存设置失败:', e)
			}
		},

		async setCloseBehavior(behavior: CloseBehavior) {
			if (behavior !== 'exit' && behavior !== 'minimize') {
				console.error('无效的窗口关闭行为:', behavior)
				return false
			}

			const result = await window.electronAPI.setCloseBehavior(behavior)
			if (result) {
				this.closeBehavior = behavior
				try {
					localStorage.setItem('closeBehavior', behavior)
				} catch (e) {
					console.error('保存设置失败:', e)
				}
				return true
			}
			return false
		},

		async initCloseBehavior() {
			try {
				const currentBehavior = await window.electronAPI.getCloseBehavior()
				if (currentBehavior !== this.closeBehavior) {
					this.closeBehavior = currentBehavior
					localStorage.setItem('closeBehavior', currentBehavior)
				}
			} catch (e) {
				console.error('初始化窗口关闭行为失败:', e)
			}
		},
	},
})
