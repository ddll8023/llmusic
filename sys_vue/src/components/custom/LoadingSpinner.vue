<script setup>
const props = defineProps({
  size: {
    type: String,
    default: 'medium',
    validator: (value) => ['small', 'medium', 'large'].includes(value)
  },
  text: { type: String, default: '' },
})

const sizeMap = {
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
