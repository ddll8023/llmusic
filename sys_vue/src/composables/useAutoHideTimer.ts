import { ref, onUnmounted } from 'vue'

export function useAutoHideTimer(delay: number = 5000) {
  const isIdle = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null
  let dragging = false

  function start() {
    clear()
    timer = setTimeout(() => {
      if (!dragging) {
        isIdle.value = true
      }
    }, delay)
  }

  function clear() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function reset() {
    isIdle.value = false
    start()
  }

  function pauseOnDrag() {
    dragging = true
    clear()
  }

  function resumeAfterDrag() {
    dragging = false
    start()
  }

  function stop() {
    clear()
    isIdle.value = false
    dragging = false
  }

  onUnmounted(() => {
    clear()
  })

  return { isIdle, start, clear, reset, stop, pauseOnDrag, resumeAfterDrag }
}
