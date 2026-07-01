import { computed, type ComputedRef } from 'vue'

export type GlassVariant = 'panel' | 'elevated' | 'button'
export type GlassPerformance = 'high' | 'balanced' | 'eco'

export interface GlassOptions {
  variant?: GlassVariant
  radius?: number
  blur?: number
  saturate?: number
  brightness?: number
  performance?: GlassPerformance
  padding?: 'sm' | 'md' | 'lg' | 'none'
}

export interface GlassStyles {
  style: ComputedRef<Record<string, string>>
  classes: ComputedRef<string>
  tokens: {
    background: string
    backdropFilter: string
    boxShadow: string
    borderRadius: string
  }
}

const variantConfigs: Record<GlassVariant, {
  shadow: string
  hoverShadow?: string
  hoverBg?: string
}> = {
  panel: {
    shadow: [
      'inset 0 0 2px 1px rgba(255,255,255,.35)',
      'inset 0 0 10px 4px rgba(255,255,255,.15)',
      '0 4px 16px rgba(17,17,26,.05)',
      '0 8px 24px rgba(17,17,26,.05)',
      '0 16px 56px rgba(17,17,26,.05)',
      'inset 0 4px 16px rgba(17,17,26,.05)',
      'inset 0 8px 24px rgba(17,17,26,.05)',
      'inset 0 16px 56px rgba(17,17,26,.05)',
    ].join(', '),
  },
  elevated: {
    shadow: [
      'inset 0 0 2px 1px rgba(255,255,255,.35)',
      'inset 0 0 10px 4px rgba(255,255,255,.15)',
      '0 4px 16px rgba(17,17,26,.05)',
      '0 8px 24px rgba(17,17,26,.05)',
      '0 16px 56px rgba(17,17,26,.05)',
      'inset 0 4px 16px rgba(17,17,26,.05)',
      'inset 0 8px 24px rgba(17,17,26,.05)',
      'inset 0 16px 56px rgba(17,17,26,.05)',
    ].join(', '),
    hoverShadow: [
      'inset 0 0 2px 1px rgba(255,255,255,.42)',
      'inset 0 0 12px 5px rgba(255,255,255,.17)',
      '0 12px 34px rgba(0,0,0,.22)',
      '0 0 18px rgba(255,255,255,.06)',
    ].join(', '),
    hoverBg: 'rgba(255,255,255,.055)',
  },
  button: {
    shadow: [
      'inset 0 0 2px 1px rgba(255,255,255,.34)',
      'inset 0 0 10px 4px rgba(255,255,255,.13)',
      '0 10px 30px rgba(0,0,0,.18)',
    ].join(', '),
    hoverShadow: [
      'inset 0 0 2px 1px rgba(255,255,255,.42)',
      'inset 0 0 12px 5px rgba(255,255,255,.17)',
      '0 12px 34px rgba(0,0,0,.22)',
      '0 0 18px rgba(255,255,255,.06)',
    ].join(', '),
    hoverBg: 'rgba(255,255,255,.055)',
  },
}

const performanceAdjustments: Record<GlassPerformance, {
  shadowLayers: number
  blurReduce: number
}> = {
  high: { shadowLayers: 8, blurReduce: 0 },
  balanced: { shadowLayers: 4, blurReduce: 0 },
  eco: { shadowLayers: 2, blurReduce: 0.5 },
}

const paddingMap = { none: '0', sm: '8px', md: '16px', lg: '24px' }

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
  const perf = performanceAdjustments[performance]

  const tokens = {
    background: 'rgba(0,0,0,.10)',
    backdropFilter: `blur(${Math.round(blur * (1 - perf.blurReduce))}px) saturate(${saturate}) brightness(${brightness})`,
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

  const classes = computed(() => {
    const list = ['relative']
    if (perf.shadowLayers < 4) {
      list.push('shadow-custom')
    }
    return list.join(' ')
  })

  return { style, classes, tokens }
}
