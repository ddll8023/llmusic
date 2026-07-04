/**
 * useDraggable — 轻量拖拽组合式函数
 *
 * 将鼠标拖拽事件转化为响应式坐标偏移。
 * 适用于 position:fixed 元素的自由拖拽。
 */
import { ref, onUnmounted } from 'vue'

export interface UseDraggableOptions {
  /** 返回布尔值，控制当前是否可拖拽 */
  enabled: () => boolean
  /** CSS 选择器，命中该选择器的后代元素不触发拖拽 */
  excludeSelector?: string
  /** 是否将坐标钳制在视口内 */
  bounds?: boolean
}

export function useDraggable(options: UseDraggableOptions) {
  const x = ref(0)
  const y = ref(0)
  const isDragging = ref(false)
  const hasMoved = ref(false)

  let startX = 0
  let startY = 0
  let originX = 0
  let originY = 0
  let targetEl: HTMLElement | null = null
  let restoreTransition: string | null = null

  function onMouseDown(e: MouseEvent) {
    if (!options.enabled()) return

    // 排除交互元素（按钮、封面、toggle 等）
    const target = e.target as HTMLElement
    if (options.excludeSelector && target.closest(options.excludeSelector)) {
      return
    }

    e.preventDefault()
    isDragging.value = true
    startX = e.clientX
    startY = e.clientY
    originX = x.value
    originY = y.value

    // 拖拽期间禁止过渡动画，避免卡顿
    if (targetEl) {
      restoreTransition = targetEl.style.transition || ''
      targetEl.style.transition = 'none'
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  function onMouseMove(e: MouseEvent) {
    if (!isDragging.value) return

    let newX = originX + (e.clientX - startX)
    let newY = originY + (e.clientY - startY)

    if (options.bounds && targetEl) {
      const { width, height } = targetEl.getBoundingClientRect()
      newX = Math.max(0, Math.min(window.innerWidth - width, newX))
      newY = Math.max(0, Math.min(window.innerHeight - height, newY))
    }

    x.value = newX
    y.value = newY
    hasMoved.value = true
  }

  function onMouseUp() {
    if (!isDragging.value) return
    isDragging.value = false

    // 恢复过渡动画
    if (targetEl && restoreTransition !== null) {
      targetEl.style.transition = restoreTransition
      restoreTransition = null
    }

    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  function bind(el: HTMLElement) {
    targetEl = el
    el.addEventListener('mousedown', onMouseDown)
  }

  function unbind() {
    if (targetEl) {
      targetEl.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      if (restoreTransition !== null) {
        targetEl.style.transition = restoreTransition
        restoreTransition = null
      }
      targetEl = null
    }
  }

  /** 设置初始位置（一般在刚收缩 / 恢复上次位置时调用） */
  function initPosition(cx: number, cy: number) {
    x.value = cx
    y.value = cy
  }

  /** 保存当前坐标（一般在展开前调用） */
  function savePosition(): { x: number; y: number } {
    return { x: x.value, y: y.value }
  }

  /** 重置为初始位置 */
  function reset() {
    x.value = 0
    y.value = 0
    hasMoved.value = false
  }

  onUnmounted(() => unbind())

  return {
    /** 当前 X 坐标（px） */
    x,
    /** 当前 Y 坐标（px） */
    y,
    /** 是否正在拖拽 */
    isDragging,
    /** 是否曾拖动过 */
    hasMoved,
    /** 绑定拖拽事件到元素 */
    bind,
    /** 解绑拖拽事件 */
    unbind,
    /** 设置初始坐标 */
    initPosition,
    /** 保存当前坐标 */
    savePosition,
    /** 重置坐标 */
    reset,
  }
}
