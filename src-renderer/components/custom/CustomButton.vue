<script setup>
import { computed } from 'vue';
import FAIcon from '../common/FAIcon.vue';

// Props定义
const props = defineProps({
  // 按钮类型
  type: {
    type: String,
    default: 'secondary',
    validator: (value) => ['primary', 'secondary', 'danger', 'icon-only'].includes(value)
  },
  // 按钮尺寸
  size: {
    type: String,
    default: 'medium',
    validator: (value) => ['small', 'medium', 'large'].includes(value)
  },
  // 图标名称
  icon: {
    type: String,
    default: ''
  },
  // 图标尺寸
  iconSize: {
    type: String,
    default: 'medium',
    validator: (value) => ['small', 'medium', 'large'].includes(value)
  },
  // 禁用状态
  disabled: {
    type: Boolean,
    default: false
  },
  // 加载状态
  loading: {
    type: Boolean,
    default: false
  },
  // 是否为圆形按钮
  circle: {
    type: Boolean,
    default: false
  },
  // 自定义类名
  customClass: {
    type: String,
    default: ''
  },
  // 提示文本
  title: {
    type: String,
    default: ''
  }
});

// 定义事件
const emit = defineEmits(['click']);

// 计算按钮类名
const buttonClasses = computed(() => {
  const classes = ['custom-button'];

  // 按钮类型
  classes.push(`custom-button--${props.type}`);

  // 按钮尺寸
  classes.push(`custom-button--${props.size}`);

  // 状态类
  if (props.disabled) classes.push('custom-button--disabled');
  if (props.loading) classes.push('custom-button--loading');
  if (props.circle) classes.push('custom-button--circle');

  // 自定义类名
  if (props.customClass) classes.push(props.customClass);

  return classes;
});

// 计算图标颜色
const iconColor = computed(() => {
  if (props.disabled || props.loading) return 'disabled';

  switch (props.type) {
    case 'primary':
      return 'primary';
    case 'danger':
      return 'danger';
    case 'icon-only':
      return 'secondary';
    default:
      return 'secondary';
  }
});

// 处理点击事件
const handleClick = (event) => {
  if (props.disabled || props.loading) return;
  emit('click', event);
};
</script>

<template>
  <button :class="buttonClasses" :disabled="disabled || loading" :title="title" @click="handleClick">
    <!-- 加载状态图标 -->
    <FAIcon v-if="loading" name="spinner" :size="iconSize" color="secondary" class="loading-icon" />

    <!-- 普通图标 -->
    <FAIcon v-else-if="icon" :name="icon" :size="iconSize" :color="iconColor" />

    <!-- 按钮文本 -->
    <span v-if="$slots.default && type !== 'icon-only'" class="button-text">
      <slot />
    </span>
  </button>
</template>

<style lang="scss" scoped>
.custom-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ($content-padding * 0.5);
  border: none;
  border-radius: $border-radius;
  font-family: $font-family-base;
  font-weight: $font-weight-medium;
  cursor: pointer;
  transition: all $transition-base;
  outline: none;
  position: relative;
  overflow: hidden;
  white-space: nowrap;
  user-select: none;

  // 禁用状态
  &--disabled {
    opacity: 0.5;
    cursor: not-allowed;

    &:hover {
      transform: none !important;
    }
  }

  // 加载状态
  &--loading {
    cursor: wait;

    .loading-icon {
      animation: spin 1s linear infinite;
    }
  }

  // 圆形按钮
  &--circle {
    border-radius: 50%;
    aspect-ratio: 1;
    padding: 0 !important;
  }

  // 按钮尺寸
  &--small {
    padding: ($content-padding * 0.375) ($content-padding * 0.75);
    font-size: $font-size-sm;
    min-height: 32px;

    &.custom-button--circle {
      width: 32px;
      height: 32px;
    }
  }

  &--medium {
    padding: ($content-padding * 0.5) ($content-padding * 1);
    font-size: $font-size-base;
    min-height: 40px;

    &.custom-button--circle {
      width: 40px;
      height: 40px;
    }
  }

  &--large {
    padding: ($content-padding * 0.75) ($content-padding * 1.5);
    font-size: $font-size-lg;
    min-height: 48px;

    &.custom-button--circle {
      width: 48px;
      height: 48px;
    }
  }

  // 按钮类型样式
  &--primary {
    background-color: $accent-green;
    color: $text-primary;
    box-shadow: $box-shadow;
    font-weight: $font-weight-semibold;

    &:hover:not(.custom-button--disabled):not(.custom-button--loading) {
      background-color: $accent-hover;
      transform: translateY(-1px);
      box-shadow: $box-shadow-hover;
    }

    &:active:not(.custom-button--disabled):not(.custom-button--loading) {
      transform: translateY(0);
      box-shadow: $box-shadow;
    }
  }

  &--secondary {
    background-color: transparent;
    color: $text-secondary;
    border: 1px solid $bg-tertiary;

    &:hover:not(.custom-button--disabled):not(.custom-button--loading) {
      border-color: $text-primary;
      color: $text-primary;
      background-color: $overlay-light;
      transform: translateY(-1px);
    }

    &:active:not(.custom-button--disabled):not(.custom-button--loading) {
      transform: translateY(0);
    }
  }

  &--danger {
    background-color: transparent;
    color: $danger;
    border: 1px solid $danger;

    &:hover:not(.custom-button--disabled):not(.custom-button--loading) {
      background-color: rgba($danger, 0.1);
      transform: translateY(-1px);
    }

    &:active:not(.custom-button--disabled):not(.custom-button--loading) {
      transform: translateY(0);
    }
  }

  &--icon-only {
    background-color: transparent;
    color: $text-secondary;
    border: none;
    padding: ($content-padding * 0.5);

    &:hover:not(.custom-button--disabled):not(.custom-button--loading) {
      background-color: $overlay-light;
      color: $text-primary;
      transform: scale(1.1);
    }

    &:active:not(.custom-button--disabled):not(.custom-button--loading) {
      transform: scale(0.95);
    }
  }
}

.button-text {
  line-height: 1;
}

// 旋转动画
@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

// 响应式适配
@include respond-to("sm") {
  .custom-button {
    &--small {
      min-height: 36px;

      &.custom-button--circle {
        width: 36px;
        height: 36px;
      }
    }

    &--medium {
      min-height: 44px;

      &.custom-button--circle {
        width: 44px;
        height: 44px;
      }
    }

    &--large {
      min-height: 52px;

      &.custom-button--circle {
        width: 52px;
        height: 52px;
      }
    }
  }
}

// 高对比度模式支持
@media (prefers-contrast: high) {
  .custom-button {

    &--secondary,
    &--danger {
      border-width: 2px;
    }

    &--primary {
      border: 2px solid transparent;
    }
  }
}

// 减少动画模式支持
@media (prefers-reduced-motion: reduce) {
  .custom-button {
    transition: none !important;

    &:hover,
    &:active {
      transform: none !important;
    }
  }

  .loading-icon {
    animation: none !important;
  }
}
</style>
