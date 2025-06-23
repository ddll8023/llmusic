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
    default: '100%'
  }
});

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
    innerHTML: svgString,
    style: { fontSize: props.size }
  });
});
</script>

<template>
  <div class="icon-wrapper" :style="{ fontSize: size }">
    <component :is="IconComponent" />
  </div>
</template>

<style>
/* 使用非scoped样式以确保更好的渗透 */
.icon-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1em;
  height: 1em;
  color: inherit;
  vertical-align: middle;
}

.svg-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.svg-container svg {
  width: 100%;
  height: 100%;
  fill: currentColor;
  stroke: currentColor;
}

/* 确保所有SVG内部元素都能继承颜色 */
.svg-container svg * {
  fill: inherit;
  stroke: inherit;
}

.icon-error {
  color: red;
  font-weight: bold;
}
</style> 