<script setup lang="ts">
import { computed } from 'vue'
import FAIcon from './FAIcon.vue'

const props = withDefaults(defineProps<{
  variant?: 'default' | 'accent'
  size?: 'sm' | 'md' | 'lg'
  icon?: string
  iconSize?: 'small' | 'medium' | 'large'
  disabled?: boolean
  loading?: boolean
  circle?: boolean
  title?: string
  customClass?: string
}>(), {
  variant: 'default',
  size: 'md',
  icon: '',
  iconSize: 'medium',
  disabled: false,
  loading: false,
  circle: false,
  title: '',
  customClass: '',
})

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()

const sizeStyles: Record<string, string> = {
  sm: 'py-1.5 px-3 text-xs min-h-[32px]',
  md: 'py-2 px-4 text-sm min-h-[40px]',
  lg: 'py-3 px-6 text-lg min-h-[48px]',
}

const circleSize: Record<string, string> = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
}

const buttonClasses = computed(() => {
  const base = 'inline-flex items-center justify-center gap-2 font-sans font-medium cursor-pointer select-none whitespace-nowrap overflow-hidden transition-all duration-250'
  const glass = [
    'bg-[var(--glass-bg)]',
    'backdrop-blur-[var(--glass-blur)] backdrop-saturate-[var(--glass-saturate)] backdrop-brightness-[var(--glass-brightness)]',
    'shadow-[var(--glass-btn-shadow)]',
    'hover:bg-[var(--glass-btn-hover-bg)]',
    'hover:shadow-[var(--glass-btn-hover-shadow)]',
    'rounded-[var(--glass-radius)]',
  ]
  const accent = props.variant === 'accent' ? 'bg-[rgba(76,175,80,.15)] text-accent-green hover:bg-[rgba(76,175,80,.25)]' : 'text-content-base'
  const state = props.disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
  const loadingCls = props.loading ? 'cursor-wait' : ''
  const circleCls = props.circle ? `${circleSize[props.size]} rounded-full p-0!` : ''
  const custom = props.customClass || ''

  return [
    base,
    ...glass,
    accent,
    sizeStyles[props.size],
    circleCls,
    state,
    loadingCls,
    custom,
  ].filter(Boolean).join(' ')
})

const iconColor = computed(() => {
  if (props.disabled || props.loading) return 'disabled'
  return props.variant === 'accent' ? 'primary' : 'secondary'
})

const handleClick = (event: MouseEvent) => {
  if (props.disabled || props.loading) return
  emit('click', event)
}
</script>

<template>
  <button :class="buttonClasses" :disabled="disabled || loading" :title="title" @click="handleClick">
    <FAIcon v-if="loading" name="spinner" :size="iconSize" color="secondary" class="spin" />
    <FAIcon v-else-if="icon" :name="icon" :size="iconSize" :color="iconColor" />
    <span v-if="$slots.default" class="leading-none">
      <slot />
    </span>
  </button>
</template>
