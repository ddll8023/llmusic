/**
 * 侧边栏拖拽调整功能的组合式函数
 * 提供完整的拖拽逻辑、状态管理和错误处理
 */

import { ref, onUnmounted, watch } from "vue";
import { createDragManager } from "../utils/dragHelper.js";
import { useUiStore } from "../store/ui.js";

/**
 * 侧边栏调整组合式函数
 * @param {Object} options 配置选项
 * @returns {Object} 拖拽相关的方法和状态
 */
export function useSidebarResize(options = {}) {
	const {
		minWidth = 60,
		maxWidth = 300,
		onDragStart = null,
		onDragUpdate = null,
		onDragEnd = null,
	} = options;

	const uiStore = useUiStore();
	const dragManager = createDragManager();
	const isDragging = ref(false);

	/**
	 * 开始拖拽
	 * @param {MouseEvent} event 鼠标事件
	 */
	const startResize = (event) => {
		try {
			event.preventDefault();

			isDragging.value = true;
			uiStore.startSidebarDrag();

			// 触发开始回调
			if (onDragStart) {
				onDragStart(uiStore.sidebarWidth);
			}

			// 使用拖拽管理器处理拖拽
			dragManager.start(
				event,
				uiStore.sidebarWidth,
				{ min: minWidth, max: maxWidth },
				// 拖拽更新回调
				(newWidth) => {
					uiStore.setTempSidebarWidth(newWidth);

					// 触发更新回调
					if (onDragUpdate) {
						onDragUpdate(newWidth);
					}
				},
				// 拖拽结束回调
				(finalWidth) => {
					isDragging.value = false;
					uiStore.endSidebarDrag();

					// 触发结束回调
					if (onDragEnd) {
						onDragEnd(finalWidth);
					}
				}
			);
		} catch (error) {
			console.error("开始拖拽时发生错误:", error);
			// 确保状态清理
			isDragging.value = false;
			uiStore.cancelSidebarDrag();
		}
	};

	/**
	 * 手动停止拖拽
	 */
	const stopResize = () => {
		if (isDragging.value) {
			dragManager.destroy();
			isDragging.value = false;
			uiStore.cancelSidebarDrag();
		}
	};

	/**
	 * 双击处理 - 收缩/展开侧边栏
	 */
	const handleDoubleClick = () => {
		try {
			uiStore.toggleSidebarCollapse();
		} catch (error) {
			console.error("双击切换侧边栏时发生错误:", error);
		}
	};

	/**
	 * 设置侧边栏宽度
	 * @param {number} width 新宽度
	 */
	const setSidebarWidth = (width) => {
		try {
			uiStore.setSidebarWidth(width);
		} catch (error) {
			console.error("设置侧边栏宽度时发生错误:", error);
		}
	};

	/**
	 * 收缩侧边栏
	 */
	const collapseSidebar = () => {
		try {
			uiStore.collapseSidebar();
		} catch (error) {
			console.error("收缩侧边栏时发生错误:", error);
		}
	};

	/**
	 * 展开侧边栏
	 */
	const expandSidebar = () => {
		try {
			uiStore.expandSidebar();
		} catch (error) {
			console.error("展开侧边栏时发生错误:", error);
		}
	};

	/**
	 * 切换侧边栏收缩状态
	 */
	const toggleCollapse = () => {
		try {
			uiStore.toggleSidebarCollapse();
		} catch (error) {
			console.error("切换侧边栏状态时发生错误:", error);
		}
	};

	// 监听组件卸载，清理资源
	onUnmounted(() => {
		try {
			if (dragManager) {
				dragManager.destroy();
			}
			isDragging.value = false;
		} catch (error) {
			console.error("清理拖拽资源时发生错误:", error);
		}
	});

	// 监听escape键取消拖拽
	const handleKeyDown = (event) => {
		if (event.key === "Escape" && isDragging.value) {
			stopResize();
		}
	};

	// 添加键盘事件监听
	if (typeof document !== "undefined") {
		document.addEventListener("keydown", handleKeyDown);

		onUnmounted(() => {
			document.removeEventListener("keydown", handleKeyDown);
		});
	}

	return {
		// 状态
		isDragging,
		currentWidth: () => uiStore.currentDisplayWidth,
		isCollapsed: () => uiStore.isSidebarCollapsed,

		// 方法
		startResize,
		stopResize,
		handleDoubleClick,
		setSidebarWidth,
		collapseSidebar,
		expandSidebar,
		toggleCollapse,

		// 内部引用（用于高级用法）
		dragManager,
		uiStore,
	};
}


export default useSidebarResize;
