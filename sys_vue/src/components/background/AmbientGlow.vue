<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { usePlayerStore } from '../../store/player'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const playerStore = usePlayerStore()

let ctx: CanvasRenderingContext2D | null = null
let W = 0, H = 0
let mx = 0.5, my = 0.5, tx = 0.5, ty = 0.5
let time = 0
let lastFrame = 0
let rafId = 0
let paused = false

interface Orb {
  x: number; y: number
  vx: number; vy: number
  d: number
  r: number; g: number; b: number
  size: number; a: number
}

const orbs: Orb[] = [
  { x: .2, y: .2, vx: .3, vy: .7, d: 0,   r: 18,  g: 120, b: 255, size: .65, a: 1.8 },
  { x: .8, y: .7, vx: .5, vy: .2, d: 2,   r: 76,  g: 175, b: 80,  size: .60, a: 1.6 },
  { x: .5, y: .3, vx: .7, vy: .4, d: 4,   r: 110, g: 50,  b: 200, size: .55, a: 1.4 },
  { x: .3, y: .8, vx: .2, vy: .5, d: 6,   r: 30,  g: 140, b: 160, size: .50, a: 1.2 },
  { x: .7, y: .4, vx: .6, vy: .3, d: 8,   r: 200, g: 80,  b: 120, size: .45, a: 1.0 },
  { x: .4, y: .6, vx: .4, vy: .6, d: 1.5, r: 60,  g: 180, b: 220, size: .40, a: 0.9 },
  { x: .6, y: .2, vx: .8, vy: .5, d: 3.5, r: 150, g: 60,  b: 180, size: .35, a: 0.8 },
]

function onMouseMove(e: MouseEvent) {
  tx = e.clientX / W
  ty = e.clientY / H
}

function onResize() {
  if (!canvasRef.value) return
  W = window.innerWidth
  H = window.innerHeight
  canvasRef.value.width = W
  canvasRef.value.height = H
}

function loop(timestamp: number) {
  const elapsed = timestamp - lastFrame
  if (elapsed < 1000 / 60) {
    rafId = requestAnimationFrame(loop)
    return
  }
  lastFrame = timestamp
  time += elapsed / 1000

  mx += (tx - mx) * 0.12
  my += (ty - my) * 0.12

  if (!ctx || paused) {
    rafId = requestAnimationFrame(loop)
    return
  }

  ctx.clearRect(0, 0, W, H)

  // 基底
  const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7)
  bg.addColorStop(0, '#0c0c1a')
  bg.addColorStop(1, '#050508')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // 光晕 screen 叠加
  for (const o of orbs) {
    const follow = 0.4 + (1 - o.d / 10) * 0.3
    const delay = o.d * 0.08
    const emx = mx + Math.sin(time * o.vx * 2 + delay) * 0.08
    const emy = my + Math.sin(time * o.vy * 2 + delay) * 0.08

    const idleX = 0.5 + Math.sin(time * o.vx * 0.8 + delay) * 0.3
    const idleY = 0.5 + Math.sin(time * o.vy * 0.8 + delay + 1) * 0.3

    const targetX = idleX + (emx - 0.5) * follow * 2.5
    const targetY = idleY + (emy - 0.5) * follow * 2.5

    o.x += (targetX - o.x) * 0.08

    const cx = o.x * W
    const cy = o.y * H
    const radius = Math.max(W, H) * o.size

    let intensity = o.a
    if (playerStore.playing) intensity *= 1.5

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
    grad.addColorStop(0, `rgba(${o.r},${o.g},${o.b},${intensity})`)
    grad.addColorStop(0.5, `rgba(${o.r},${o.g},${o.b},${intensity * 0.35})`)
    grad.addColorStop(1, 'transparent')

    ctx.globalCompositeOperation = 'screen'
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)
  }

  // hard-light 叠加
  ctx.globalCompositeOperation = 'hard-light'
  for (const o of orbs.slice(0, 4)) {
    const cx = o.x * W
    const cy = o.y * H
    const radius = Math.max(W, H) * o.size * 1.2
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
    grad.addColorStop(0, `rgba(${o.r},${o.g},${o.b},${o.a * 0.5})`)
    grad.addColorStop(0.6, `rgba(${o.r},${o.g},${o.b},${o.a * 0.15})`)
    grad.addColorStop(1, 'transparent')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)
  }
  ctx.globalCompositeOperation = 'source-over'

  // 底部光晕（跟随鼠标）
  const bx = mx * W
  const glow = ctx.createRadialGradient(bx, H + 30, 0, bx, H + 30, H * 0.6)
  const ga = playerStore.playing ? 0.09 : 0.035
  glow.addColorStop(0, `rgba(76,175,80,${ga})`)
  glow.addColorStop(0.5, `rgba(18,18,18,${ga * 0.3})`)
  glow.addColorStop(1, 'transparent')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  // 暗角
  const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.15, W / 2, H / 2, Math.max(W, H) * 0.7)
  vig.addColorStop(0, 'transparent')
  vig.addColorStop(1, 'rgba(0,0,0,.3)')
  ctx.fillStyle = vig
  ctx.fillRect(0, 0, W, H)

  rafId = requestAnimationFrame(loop)
}

onMounted(() => {
  if (!canvasRef.value) return
  ctx = canvasRef.value.getContext('2d')
  onResize()

  document.addEventListener('mousemove', onMouseMove)
  window.addEventListener('resize', onResize)

  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  paused = mq.matches
  mq.addEventListener('change', (e) => { paused = e.matches })

  rafId = requestAnimationFrame(loop)
})

onUnmounted(() => {
  cancelAnimationFrame(rafId)
  document.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <canvas ref="canvasRef" class="ambient-glow"></canvas>
</template>

<style scoped>
.ambient-glow {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
  pointer-events: none;
  display: block;
}
</style>
