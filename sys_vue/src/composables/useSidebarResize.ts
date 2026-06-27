/**
 * 侧边栏拖拽调整功能的组合式函数
 * 提供完整的拖拽逻辑、状态管理和错误处理
 */

import { ref, onUnmounted } from 'vue'
import { createDragManager } from '../utils/dragHelper'
import { useUiStore } from '../store/ui'

export interface SidebarResizeOptions {
	minWidth?: number
	maxWidth?: number
	onDragStart?: (width: number) => void
	onDragUpdate?: (width: number) => void
	onDragEnd?: (width: number) => void
}

/**
 * 侧边栏调整组合式函数
 */
export function useSidebarResize(options: SidebarResizeOptions = {}) {
	const { minWidth = 60, maxWidth = 300, onDragStart = null, onDragUpdate = null, onDragEnd = null } = options

	const uiStore = useUiStore()
	const dragManager = createDragManager()
	const isDragging = ref(false)

	/** 开始拖拽 */
	const startResize = (event: MouseEvent) => {
		try {
			event.preventDefault()

			isDragging.value = true
			uiStore.startSidebarDrag()

			if (onDragStart) {
				onDragStart(uiStore.sidebarWidth)
			}

			dragManager.start(
				event,
				uiStore.sidebarWidth,
				{ min: minWidth, max: maxWidth },
				(newWidth: number) => {
					uiStore.setTempSidebarWidth(newWidth)
					if (onDragUpdate) {
						onDragUpdate(newWidth)
					}
				},
				(finalWidth: number) => {
					isDragging.value = false
					uiStore.endSidebarDrag()
					if (onDragEnd) {
						onDragEnd(finalWidth)
					}
				}
			)
		} catch (error) {
			console.error('开始拖拽时发生错误:', error)
			isDragging.value = false
			uiStore.cancelSidebarDrag()
		}
	}

	/** 手动停止拖拽 */
	const stopResize = () => {
		if (isDragging.value) {
			dragManager.destroy()
			isDragging.value = false
			uiStore.cancelSidebarDrag()
		}
	}

	/** 双击处理 - 收缩/展开侧边栏 */
	const handleDoubleClick = () => {
		try {
			uiStore.toggleSidebarCollapse()
		} catch (error) {
			console.error('双击切换侧边栏时发生错误:', error)
		}
	}

	/** 设置侧边栏宽度 */
	const setSidebarWidth = (width: number) => {
		try {
			uiStore.setSidebarWidth(width)
		} catch (error) {
			console.error('设置侧边栏宽度时发生错误:', error)
		}
	}

	/** 收缩侧边栏 */
	const collapseSidebar = () => {
		try {
			uiStore.collapseSidebar()
		} catch (error) {
			console.error('收缩侧边栏时发生错误:', error)
		}
	}

	/** 展开侧边栏 */
	const expandSidebar = () => {
		try {
			uiStore.expandSidebar()
		} catch (error) {
			console.error('展开侧边栏时发生错误:', error)
		}
	}

	/** 切换侧边栏收缩状态 */
	const toggleCollapse = () => {
		try {
			uiStore.toggleSidebarCollapse()
		} catch (error) {
			console.error('切换侧边栏状态时发生错误:', error)
		}
	}

	// 清理资源
	onUnmounted(() => {
		try {
			if (dragManager) {
				dragManager.destroy()
			}
			isDragging.value = false
		} catch (error) {
			console.error('清理拖拽资源时发生错误:', error)
		}
	})

	// escape键取消拖拽
	const handleKeyDown = (event: KeyboardEvent) => {
		if (event.key === 'Escape' && isDragging.value) {
			stopResize()
		}
	}

	if (typeof document !== 'undefined') {
		document.addEventListener('keydown', handleKeyDown)
		onUnmounted(() => {
			document.removeEventListener('keydown', handleKeyDown)
		})
	}

	return {
		isDragging,
		currentWidth: () => uiStore.currentDisplayWidth,
		isCollapsed: () => uiStore.isSidebarCollapsed,
		startResize,
		stopResize,
		handleDoubleClick,
		setSidebarWidth,
		collapseSidebar,
		expandSidebar,
		toggleCollapse,
		dragManager,
		uiStore,
	}
}

export default useSidebarResize
