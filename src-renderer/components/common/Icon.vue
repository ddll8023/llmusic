<script setup>
import { h, computed } from 'vue';
import icons from '../assets/icons.js';

const props = defineProps({
  name: {
    type: String,
    required: true,
  },
  size: {
    type: [String, Number],
    default: 'medium'
  },
  color: {
    type: String,
    default: 'primary',
    validator: (value) => ['primary', 'secondary', 'accent', 'danger'].includes(value)
  },
  clickable: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['click']);

// 创建一个包含SVG图标的div元素
const IconComponent = computed(() => {
  const iconName = props.name;
  const svgString = icons[iconName] || '';

  if (!svgString) {
    console.error(`Icon not found: ${iconName}`);
    return h('span', { class: 'icon-error' }, '?');
  }

  // 创建一个div，并设置innerHTML
  return h('div', {
    class: 'svg-container',
    innerHTML: svgString
  });
});

// 计算图标的CSS类
const iconClasses = computed(() => {
  const classes = ['icon-wrapper'];

  // 尺寸类
  if (typeof props.size === 'string') {
    classes.push(`icon--${props.size}`);
  }

  // 颜色类
  classes.push(`icon--${props.color}`);

  // 交互状态类
  if (props.clickable) {
    classes.push('icon--clickable');
  }

  return classes;
});

// 处理点击事件
const handleClick = (event) => {
  if (props.clickable) {
    emit('click', event);
  }
};
</script>

<template>
  <div :class="iconClasses" :style="typeof size === 'number' ? { fontSize: size + 'px' } : {}" @click="handleClick">
    <component :is="IconComponent" />
  </div>
</template>

<style lang="scss" scoped>
.icon-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1em;
  height: 1em;
  color: inherit;
  vertical-align: middle;
  transition: color $transition-base;

  // 尺寸系统
  &.icon--small {
    font-size: 12px;
  }

  &.icon--medium {
    font-size: 16px;
  }

  &.icon--large {
    font-size: 20px;
  }

  &.icon--xl {
    font-size: 24px;
  }

  // 颜色系统
  &.icon--primary {
    color: $text-primary;
  }

  &.icon--secondary {
    color: $text-secondary;
  }

  &.icon--accent {
    color: $accent-green;
  }

  &.icon--danger {
    color: $danger;
  }

  // 交互状态
  &.icon--clickable {
    cursor: pointer;
    transition: all $transition-base;

    &:hover {
      color: $accent-green;
      transform: translateY(-1px);
    }

    &:active {
      transform: translateY(0);
      transition: transform $transition-fast;
    }
  }

  // 响应式适配
  @include respond-to("sm") {
    &.icon--small {
      font-size: 10px;
    }

    &.icon--medium {
      font-size: 14px;
    }

    &.icon--large {
      font-size: 18px;
    }

    &.icon--xl {
      font-size: 22px;
    }

    // 确保移动端可点击区域足够大
    &.icon--clickable {
      min-width: 44px;
      min-height: 44px;

      &.icon--small {
        min-width: 36px;
        min-height: 36px;
      }
    }
  }
}

.svg-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

// 确保SVG元素正确继承样式
:deep(.svg-container svg) {
  width: 100%;
  height: 100%;
  fill: currentColor;
  stroke: currentColor;
}

// 确保所有SVG内部元素都能继承颜色
:deep(.svg-container svg *) {
  fill: inherit;
  stroke: inherit;
}

.icon-error {
  color: $danger;
  font-weight: $font-weight-bold;
  font-size: $font-size-sm;
}
</style>