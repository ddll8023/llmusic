<script setup lang="ts">
withDefaults(
	defineProps<{
		size?: 'small' | 'medium' | 'large'
		text?: string
	}>(),
	{
		size: 'medium',
		text: '',
	}
)

const sizeMap: Record<string, string> = {
	small: 'w-6 h-6 border-2',
	medium: 'w-10 h-10 border-[3px]',
	large: 'w-14 h-14 border-4',
}
</script>

<template>
	<div class="flex flex-col items-center justify-center text-content-secondary">
		<div :class="[sizeMap[size], 'border-line-base rounded-full border-t-accent-green animate-spin']"></div>
		<p v-if="text" class="mt-4 text-sm animate-pulse">{{ text }}</p>
	</div>
</template>
