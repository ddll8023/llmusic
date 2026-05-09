<script setup>
/**
 * CustomButton - 通用按钮组件
 * 功能描述：支持多种类型(primary/secondary/danger/icon-only)、尺寸(small/medium/large)、
 *          状态(禁用/加载/圆形)及图标的自定义按钮
 * 依赖组件：FAIcon
 * Source: Vue 3 官方文档
 */

import { computed } from 'vue'
import FAIcon from '../common/FAIcon.vue'

const props = defineProps({
  type: {
    type: String,
    default: 'secondary',
    validator: (value) => ['primary', 'secondary', 'danger', 'icon-only'].includes(value)
  },
  size: {
    type: String,
    default: 'medium',
    validator: (value) => ['small', 'medium', 'large'].includes(value)
  },
  icon: { type: String, default: '' },
  iconSize: {
    type: String,
    default: 'medium',
    validator: (value) => ['small', 'medium', 'large'].includes(value)
  },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  circle: { type: Boolean, default: false },
  customClass: { type: String, default: '' },
  title: { type: String, default: '' }
})

const emit = defineEmits(['click']);

// 类型 → Tailwind 类映射
const typeStyles = {
  primary: 'bg-accent-green text-content-base shadow-custom font-semibold hover:bg-accent-green-hover hover:-translate-y-px hover:shadow-custom-hover active:translate-y-0 active:shadow-custom',
  secondary: 'bg-transparent text-content-secondary border border-line-base hover:border-content-base hover:text-content-base hover:bg-overlay-light hover:-translate-y-px active:translate-y-0',
  danger: 'bg-transparent text-accent-danger border border-accent-danger hover:bg-accent-danger/10 hover:-translate-y-px active:translate-y-0',
  'icon-only': 'bg-transparent text-content-secondary border-none p-2 hover:bg-overlay-light hover:text-content-base hover:scale-110 active:scale-95',
};

// 尺寸 → Tailwind 类映射
const sizeStyles = {
  small: 'py-1.5 px-3 text-xs min-h-[32px]',
  medium: 'py-2 px-4 text-sm min-h-[40px]',
  large: 'py-3 px-6 text-lg min-h-[48px]',
};

// 圆形按钮尺寸
const circleSize = { small: 'w-8 h-8', medium: 'w-10 h-10', large: 'w-12 h-12' };

const buttonClasses = computed(() => {
  const classes = [
    'inline-flex items-center justify-center gap-2 rounded font-sans font-medium cursor-pointer transition-all duration-200 outline-none relative overflow-hidden whitespace-nowrap select-none',
    typeStyles[props.type],
    sizeStyles[props.size],
    props.circle ? `${circleSize[props.size]} rounded-full p-0!` : '',
    props.disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : '',
    props.loading ? 'cursor-wait' : '',
    props.customClass || '',
  ];
  return classes.filter(Boolean);
});

const iconColor = computed(() => {
  if (props.disabled || props.loading) return 'disabled';
  switch (props.type) {
    case 'primary': return 'primary';
    case 'danger': return 'danger';
    default: return 'secondary';
  }
});

const handleClick = (event) => {
  if (props.disabled || props.loading) return;
  emit('click', event);
};
</script>

<template>
  <button :class="buttonClasses" :disabled="disabled || loading" :title="title" @click="handleClick">
    <FAIcon v-if="loading" name="spinner" :size="iconSize" color="secondary" class="spin" />
    <FAIcon v-else-if="icon" :name="icon" :size="iconSize" :color="iconColor" />
    <span v-if="$slots.default && type !== 'icon-only'" class="leading-none">
      <slot />
    </span>
  </button>
</template>
