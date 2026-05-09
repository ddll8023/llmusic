<script setup>
import { computed } from 'vue';

const props = defineProps({
    name: {
        type: String,
        required: true,
    },
    size: {
        type: String,
        default: 'medium',
        validator: (value) => ['small', 'medium', 'large', 'xl'].includes(value)
    },
    color: {
        type: String,
        default: 'primary',
        validator: (value) => ['primary', 'secondary', 'accent', 'danger', 'disabled'].includes(value)
    },
    clickable: {
        type: Boolean,
        default: false
    }
});

// 尺寸映射 — Tailwind 类名
const sizeMap = {
    small: 'text-xs',
    medium: 'text-base',
    large: 'text-xl',
    xl: 'text-2xl',
};

// 颜色映射 — Tailwind 主题色
const colorMap = {
    primary: 'text-content-base',
    secondary: 'text-content-secondary',
    accent: 'text-accent-green',
    danger: 'text-accent-danger',
    disabled: 'text-content-disabled',
};

// 计算图标的 Tailwind 类名
const iconClasses = computed(() => [
    'fa',
    `fa-${props.name}`,
    'inline-block align-middle',
    sizeMap[props.size],
    colorMap[props.color],
    props.clickable
        ? 'cursor-pointer transition-all duration-200 hover:text-accent-green-hover hover:scale-110 active:scale-95'
        : '',
]);
</script>

<template>
    <i :class="iconClasses" aria-hidden="true"></i>
</template>
