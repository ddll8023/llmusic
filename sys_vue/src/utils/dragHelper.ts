/**
 * 拖拽优化工具函数
 * 提供节流、批量更新和边界检测功能
 */

/** 节流函数 - 限制函数执行频率 */
export const throttle = <T extends (...args: any[]) => unknown>(
	fn: T,
	wait = 16
): ((...args: Parameters<T>) => void) => {
	let lastTime = 0
	let timeout: ReturnType<typeof setTimeout> | null = null

	return function throttled(this: unknown, ...args: Parameters<T>) {
		const now = Date.now()
		const remaining = wait - (now - lastTime)

		if (remaining <= 0) {
			if (timeout) {
				clearTimeout(timeout)
				timeout = null
			}
			lastTime = now
			return fn.apply(this, args)
		} else if (!timeout) {
			timeout = setTimeout(() => {
				lastTime = Date.now()
				timeout = null
				fn.apply(this, args)
			}, remaining)
		}
	}
}

/** 使用 requestAnimationFrame 优化的批量更新 */
export const rafThrottle = <T extends (...args: any[]) => unknown>(
	updateFn: T
): ((...args: Parameters<T>) => void) => {
	let rafId: number | null = null
	let pending = false

	return function (this: unknown, ...args: Parameters<T>) {
		if (pending) return
		pending = true
		rafId = requestAnimationFrame(() => {
			updateFn.apply(this, args)
			pending = false
			rafId = null
		})
	}
}

/** 拖拽边界检测和约束 */
export const clamp = (value: number, min: number, max: number): number => {
	return Math.min(Math.max(value, min), max)
}

/** 拖拽边界配置 */
export interface DragBounds {
	min: number
	max: number
}

/** 拖拽事件管理器 */
export class DragManager {
	isDragging = false
	startX = 0
	startWidth = 0
	currentWidth = 0
	bounds: DragBounds = { min: 60, max: 300 }
	onUpdate: ((width: number) => void) | null = null
	onEnd: ((width: number) => void) | null = null

	private throttledUpdate: (width: number) => void

	constructor() {
		this.throttledUpdate = rafThrottle((width: number) => {
			this.currentWidth = width
			if (this.onUpdate) {
				this.onUpdate(width)
			}
		})
	}

	/**
	 * 开始拖拽
	 * @param initialWidth 初始宽度
	 */
	start(
		event: MouseEvent,
		initialWidth: number,
		bounds: Partial<DragBounds> = {},
		onUpdate: ((width: number) => void) | null = null,
		onEnd: ((width: number) => void) | null = null
	): void {
		this.isDragging = true
		this.startX = event.clientX
		this.startWidth = initialWidth
		this.currentWidth = initialWidth
		this.bounds = { ...this.bounds, ...bounds }
		this.onUpdate = onUpdate
		this.onEnd = onEnd

		document.addEventListener('mousemove', this.handleMouseMove)
		document.addEventListener('mouseup', this.handleMouseUp)
		document.body.classList.add('is-resizing')
		event.preventDefault()
	}

	/** 处理鼠标移动 */
	handleMouseMove = (event: MouseEvent): void => {
		if (!this.isDragging) return
		event.preventDefault()

		const deltaX = event.clientX - this.startX
		const newWidth = clamp(this.startWidth + deltaX, this.bounds.min, this.bounds.max)
		this.throttledUpdate(newWidth)
	}

	/** 处理鼠标释放 */
	handleMouseUp = (): void => {
		if (!this.isDragging) return
		this.isDragging = false

		document.removeEventListener('mousemove', this.handleMouseMove)
		document.removeEventListener('mouseup', this.handleMouseUp)
		document.body.classList.remove('is-resizing')

		if (this.onEnd) {
			this.onEnd(this.currentWidth)
		}
	}

	/** 销毁拖拽管理器 */
	destroy(): void {
		if (this.isDragging) {
			this.handleMouseUp()
		}
		document.body.classList.remove('is-resizing')
		this.onUpdate = null
		this.onEnd = null
	}
}

/** 创建拖拽管理器实例 */
export const createDragManager = (): DragManager => {
	return new DragManager()
}
