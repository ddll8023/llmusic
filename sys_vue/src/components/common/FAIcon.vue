<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
	defineProps<{
		name: string
		size?: 'small' | 'medium' | 'large' | 'xl'
		color?: 'primary' | 'secondary' | 'accent' | 'danger' | 'disabled'
		clickable?: boolean
	}>(),
	{
		size: 'medium',
		color: 'primary',
		clickable: false,
	}
)

// 尺寸映射 — Tailwind 类名
const sizeMap: Record<string, string> = {
	small: 'text-xs',
	medium: 'text-base',
	large: 'text-xl',
	xl: 'text-2xl',
}

// 颜色映射 — Tailwind 主题色
const colorMap: Record<string, string> = {
	primary: 'text-content-base',
	secondary: 'text-content-secondary',
	accent: 'text-accent-green',
	danger: 'text-accent-danger',
	disabled: 'text-content-disabled',
}

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
])
</script>

<template>
	<i :class="iconClasses" aria-hidden="true"></i>
</template>
