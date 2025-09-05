/**
 * 拖拽优化工具函数
 * 提供节流、批量更新和边界检测功能
 */

/**
 * 节流函数 - 限制函数执行频率
 * @param {Function} fn 要节流的函数
 * @param {number} wait 节流时间间隔 (ms)
 * @returns {Function} 节流后的函数
 */
export const throttle = (fn, wait = 16) => {
	let lastTime = 0;
	let timeout = null;

	return function throttled(...args) {
		const now = Date.now();
		const remaining = wait - (now - lastTime);

		if (remaining <= 0) {
			if (timeout) {
				clearTimeout(timeout);
				timeout = null;
			}
			lastTime = now;
			return fn.apply(this, args);
		} else if (!timeout) {
			timeout = setTimeout(() => {
				lastTime = Date.now();
				timeout = null;
				fn.apply(this, args);
			}, remaining);
		}
	};
};

/**
 * 使用 requestAnimationFrame 优化的批量更新
 * @param {Function} updateFn 更新函数
 * @returns {Function} 优化后的更新函数
 */
export const rafThrottle = (updateFn) => {
	let rafId = null;
	let pending = false;

	return function (...args) {
		if (pending) return;

		pending = true;
		rafId = requestAnimationFrame(() => {
			updateFn.apply(this, args);
			pending = false;
			rafId = null;
		});
	};
};

/**
 * 拖拽边界检测和约束
 * @param {number} value 当前值
 * @param {number} min 最小值
 * @param {number} max 最大值
 * @returns {number} 约束后的值
 */
export const clamp = (value, min, max) => {
	return Math.min(Math.max(value, min), max);
};

/**
 * 拖拽事件管理器
 */
export class DragManager {
	constructor() {
		this.isDragging = false;
		this.startX = 0;
		this.startWidth = 0;
		this.currentWidth = 0;
		this.bounds = { min: 60, max: 300 };
		this.onUpdate = null;
		this.onEnd = null;

		// 绑定事件处理器
		this.handleMouseMove = this.handleMouseMove.bind(this);
		this.handleMouseUp = this.handleMouseUp.bind(this);

		// 创建节流的更新函数
		this.throttledUpdate = rafThrottle((width) => {
			this.currentWidth = width;
			if (this.onUpdate) {
				this.onUpdate(width);
			}
		});
	}

	/**
	 * 开始拖拽
	 * @param {MouseEvent} event 鼠标事件
	 * @param {number} initialWidth 初始宽度
	 * @param {Object} bounds 边界值 {min, max}
	 * @param {Function} onUpdate 更新回调
	 * @param {Function} onEnd 结束回调
	 */
	start(event, initialWidth, bounds = {}, onUpdate = null, onEnd = null) {
		this.isDragging = true;
		this.startX = event.clientX;
		this.startWidth = initialWidth;
		this.currentWidth = initialWidth;
		this.bounds = { ...this.bounds, ...bounds };
		this.onUpdate = onUpdate;
		this.onEnd = onEnd;

		// 添加全局事件监听器
		document.addEventListener("mousemove", this.handleMouseMove);
		document.addEventListener("mouseup", this.handleMouseUp);

		// 添加拖拽状态类
		document.body.classList.add("is-resizing");

		// 阻止默认行为
		event.preventDefault();
	}

	/**
	 * 处理鼠标移动
	 * @param {MouseEvent} event 鼠标事件
	 */
	handleMouseMove(event) {
		if (!this.isDragging) return;

		event.preventDefault();

		const deltaX = event.clientX - this.startX;
		const newWidth = clamp(
			this.startWidth + deltaX,
			this.bounds.min,
			this.bounds.max
		);

		// 使用节流更新
		this.throttledUpdate(newWidth);
	}

	/**
	 * 处理鼠标释放
	 * @param {MouseEvent} event 鼠标事件
	 */
	handleMouseUp(event) {
		if (!this.isDragging) return;

		this.isDragging = false;

		// 移除事件监听器
		document.removeEventListener("mousemove", this.handleMouseMove);
		document.removeEventListener("mouseup", this.handleMouseUp);

		// 移除拖拽状态类
		document.body.classList.remove("is-resizing");

		// 调用结束回调
		if (this.onEnd) {
			this.onEnd(this.currentWidth);
		}
	}

	/**
	 * 销毁拖拽管理器
	 */
	destroy() {
		if (this.isDragging) {
			this.handleMouseUp();
		}

		// 确保清理所有状态
		document.body.classList.remove("is-resizing");
		this.onUpdate = null;
		this.onEnd = null;
	}
}

/**
 * 创建拖拽管理器实例
 * @returns {DragManager} 拖拽管理器实例
 */
export const createDragManager = () => {
	return new DragManager();
};
