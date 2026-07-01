<script setup lang="ts">
import { computed } from 'vue'
import { useGlassStyles, type GlassVariant, type GlassPerformance } from '../../composables/useGlassStyles'

const props = withDefaults(defineProps<{
  variant?: GlassVariant
  radius?: number
  blur?: number
  saturate?: number
  brightness?: number
  performance?: GlassPerformance
  padding?: 'sm' | 'md' | 'lg' | 'none'
  tag?: string
}>(), {
  variant: 'panel',
  radius: 50,
  blur: 12,
  saturate: 1.8,
  brightness: 1.16,
  performance: 'balanced',
  padding: 'md',
  tag: 'div',
})

const { style, tokens } = useGlassStyles({
  variant: props.variant,
  radius: props.radius,
  blur: props.blur,
  saturate: props.saturate,
  brightness: props.brightness,
  performance: props.performance,
})

const paddingClass = computed(() => {
  const map: Record<string, string> = {
    none: '',
    sm: 'p-2',
    md: 'p-4',
    lg: 'p-6',
  }
  return map[props.padding]
})

const cls = computed(() => [
  'relative overflow-hidden',
  paddingClass.value,
  props.performance === 'eco' ? 'shadow-custom' : '',
].filter(Boolean).join(' '))
</script>

<template>
  <component :is="tag" :style="style" :class="cls">
    <slot />
  </component>
</template>
