<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import FAIcon from './FAIcon.vue'
import CustomButton from '../custom/CustomButton.vue'
import CustomInput from '../custom/CustomInput.vue'

interface ActionItem {
	key: string
	label: string
	type?: 'primary' | 'secondary' | 'danger' | 'icon-only'
	icon?: string
	disabled?: boolean
}

const props = withDefaults(
	defineProps<{
		title: string
		subtitle?: string
		metaText?: string
		showSearch?: boolean
		manualSearch?: boolean
		searchValue?: string
		searchPlaceholder?: string
		actions?: ActionItem[]
	}>(),
	{
		subtitle: '',
		metaText: '',
		showSearch: false,
		manualSearch: false,
		searchValue: '',
		searchPlaceholder: '搜索...',
		actions: () => [],
	}
)

const emit = defineEmits<{
	(e: 'search-input', value: string): void
	(e: 'action-click', key: string): void
	(e: 'search', value: string): void
}>()

const localSearchValue = ref(props.searchValue)

const debounce = <T extends (...args: any[]) => unknown>(func: T, delay: number) => {
	let timeout: ReturnType<typeof setTimeout>
	return (...args: Parameters<T>) => {
		clearTimeout(timeout)
		timeout = setTimeout(() => func(...args), delay)
	}
}

const debouncedEmitSearch = debounce((value: string) => {
	emit('search-input', value)
}, 300)

watch(localSearchValue, (newValue) => {
	if (props.manualSearch) return
	debouncedEmitSearch(newValue)
})

watch(
	() => props.searchValue,
	(newValue) => {
		if (!props.manualSearch || localSearchValue.value !== newValue) {
			localSearchValue.value = newValue
		}
	}
)

const searchDisabled = computed(() => props.manualSearch && !localSearchValue.value.trim())

function handleManualSearch() {
	emit('search', localSearchValue.value)
}

function handleClear() {
	if (props.manualSearch) {
		emit('search', '')
	}
}

function handleEnter() {
	if (props.manualSearch) {
		handleManualSearch()
	}
}
</script>

<template>
	<div
		class="flex justify-between items-center p-4 bg-gradient-to-b from-surface-overlay to-surface-base border-b border-line-base max-md:flex-col max-md:gap-3.5 max-md:items-stretch">
		<div
			class="flex items-center gap-3 flex-1 min-w-0 max-md:flex-col max-md:gap-2 max-md:items-stretch">
			<div class="min-w-0 max-md:w-full">
				<h2
					class="text-xl font-bold text-content-base mb-2 truncate max-md:text-lg max-md:whitespace-normal max-md:text-center">
					{{ title }}</h2>
				<div v-if="subtitle"
					class="text-sm text-content-secondary mb-3 leading-relaxed max-md:text-xs max-md:text-center">
					{{ subtitle }}</div>
				<div v-if="metaText"
					class="text-xs text-content-secondary font-medium max-md:text-2xs max-md:text-center">
					{{ metaText }}</div>
			</div>
			<div v-if="showSearch" class="shrink-0 max-md:w-full flex items-center gap-2">
				<CustomInput v-model="localSearchValue" type="text" :placeholder="searchPlaceholder"
					prefixIcon="search" clearable customClass="w-[300px] max-md:w-full"
					@enter="handleEnter"
					@clear="handleClear" />
				<CustomButton v-if="manualSearch" type="primary" size="small" icon="search"
					:disabled="searchDisabled" @click="handleManualSearch">
					搜索
				</CustomButton>
			</div>
		</div>

		<div v-if="actions.length > 0"
			class="flex items-center gap-2.5 shrink-0 max-w-[400px] max-md:w-full max-md:gap-1.5 max-md:flex-wrap max-md:justify-center max-md:max-w-none">
			<CustomButton v-for="action in actions" :key="action.key" :type="action.type" :icon="action.icon"
				:disabled="action.disabled" @click="emit('action-click', action.key)"
				class="max-md:flex-1 max-md:max-w-[180px] max-md:max-w-none">
				{{ action.label }}
			</CustomButton>
		</div>
	</div>
</template>
