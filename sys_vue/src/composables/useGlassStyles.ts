import { computed, type ComputedRef } from 'vue'

export type GlassVariant = 'panel' | 'button'
export type GlassPerformance = 'high' | 'balanced' | 'eco'

export interface GlassOptions {
  variant?: GlassVariant
  radius?: number
  blur?: number
  saturate?: number
  brightness?: number
  performance?: GlassPerformance
}

export interface GlassStyles {
  style: ComputedRef<Record<string, string>>
  tokens: {
    background: string
    backdropFilter: string
    boxShadow: string
    borderRadius: string
  }
}

/* 阴影值统一在 tailwind-entry.css :root 中定义，通过 CSS 变量引用 */
const variantConfigs: Record<GlassVariant, {
  shadow: string
}> = {
  panel: {
    shadow: 'var(--glass-panel-shadow)',
  },
  button: {
    shadow: 'var(--glass-btn-shadow)',
  },
}

const blurReduceMap: Record<GlassPerformance, number> = {
  high: 0,
  balanced: 0,
  eco: 0.5,
}

export function useGlassStyles(options: GlassOptions = {}): GlassStyles {
  const {
    variant = 'panel',
    radius = 50,
    blur = 12,
    saturate = 1.8,
    brightness = 1.16,
    performance = 'balanced',
  } = options

  const config = variantConfigs[variant]
  const blurReduce = blurReduceMap[performance]

  const tokens = {
    background: 'var(--glass-bg)',
    backdropFilter: `blur(${Math.round(blur * (1 - blurReduce))}px) saturate(${saturate}) brightness(${brightness})`,
    boxShadow: config.shadow,
    borderRadius: `${radius}px`,
  }

  const style = computed(() => ({
    background: tokens.background,
    backdropFilter: tokens.backdropFilter,
    WebkitBackdropFilter: tokens.backdropFilter,
    boxShadow: tokens.boxShadow,
    borderRadius: tokens.borderRadius,
  }))

  return { style, tokens }
}
