<script setup lang="ts">
import { computed } from 'vue'

export interface ProgressBarProps {
	value?: number
	max?: number
	height?: string
	color?: string
	showLabel?: boolean
}

const props = withDefaults(defineProps<ProgressBarProps>(), {
	value: 0,
	max: 100,
	height: '8px',
	color: 'accent',
	showLabel: false,
})

const colorMap: Record<string, string> = {
	accent: 'bg-accent-green',
	primary: 'bg-accent-green',
	secondary: 'bg-content-secondary',
	danger: 'bg-accent-danger',
	warning: 'bg-accent-warning',
}

const percent = computed(() =>
	props.max > 0 ? `${Math.min((props.value / props.max) * 100, 100)}%` : '0%'
)

const barColor = computed(() => colorMap[props.color] || colorMap.accent)
</script>

<template>
	<div class="flex flex-col gap-1.5 w-full">
		<div v-if="showLabel" class="flex justify-between text-2xs text-content-secondary">
			<span>{{ value }} / {{ max }}</span>
			<span>{{ percent }}</span>
		</div>
		<div class="bg-surface-elevated rounded overflow-hidden" :style="{ height }">
			<div class="h-full transition-all duration-200 rounded" :class="barColor" :style="{ width: percent }"></div>
		</div>
	</div>
</template>
