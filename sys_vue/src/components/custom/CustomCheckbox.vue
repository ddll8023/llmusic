<script setup lang="ts">
/**
 * CustomCheckbox - 自定义复选框组件
 * 功能描述：支持选中/半选/禁用状态、多尺寸、文本标签的自定义复选框
 * 依赖组件：FAIcon
 */
import { computed, ref, watch, onMounted, nextTick } from 'vue'
import FAIcon from '../common/FAIcon.vue'

const props = withDefaults(defineProps<{
	modelValue?: boolean
	checked?: boolean
	indeterminate?: boolean
	disabled?: boolean
	size?: 'small' | 'medium' | 'large'
	label?: string
	customClass?: string
}>(), {
	modelValue: false,
	checked: undefined,
	indeterminate: false,
	disabled: false,
	size: 'small',
	label: '',
	customClass: '',
})

const emit = defineEmits<{
	(e: 'update:modelValue', value: boolean): void
	(e: 'change', value: boolean): void
}>()

const inputRef = ref<any>(null)

const effectiveChecked = computed(() =>
	props.checked !== undefined ? props.checked : props.modelValue
)

const sizeBoxMap: Record<string, string> = { small: 'w-4 h-4', medium: 'w-5 h-5', large: 'w-6 h-6' }
const iconSizeMap: Record<string, "small"|"medium"> = { small: 'small', medium: 'small', large: 'medium' }

const boxClasses = computed(() => {
	const classes = [
		'rounded-[3px] border-2 flex items-center justify-center transition-all duration-200',
		sizeBoxMap[props.size],
	]

	if (effectiveChecked.value || props.indeterminate) {
		classes.push('bg-accent-green border-accent-green')
	} else {
		classes.push('bg-transparent border-line-light')
	}

	if (!props.disabled) {
		classes.push('cursor-pointer')
		if (!effectiveChecked.value && !props.indeterminate) {
			classes.push('hover:border-accent-green hover:bg-accent-green/10')
		} else {
			classes.push('hover:bg-accent-green-hover hover:border-accent-green-hover')
		}
		classes.push('peer-focus:ring-2 peer-focus:ring-accent-green/30')
	} else {
		classes.push('cursor-not-allowed opacity-50')
	}

	if (props.customClass) classes.push(props.customClass)
	return classes.filter(Boolean).join(' ')
})

function syncIndeterminate() {
	if (inputRef.value) {
		inputRef.value.indeterminate = props.indeterminate
	}
}

watch(() => props.indeterminate, () => nextTick(syncIndeterminate))
onMounted(syncIndeterminate)

function handleChange() {
	if (props.disabled) return
	const newValue = !effectiveChecked.value
	emit('update:modelValue', newValue)
	emit('change', newValue)
}
</script>

<template>
	<label class="inline-flex items-center gap-2 select-none"
		:class="[disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer', customClass]">
		<div class="relative">
			<input ref="inputRef" type="checkbox" class="sr-only peer"
				:checked="effectiveChecked" :disabled="disabled" @change="handleChange" />
			<div :class="boxClasses">
				<FAIcon v-if="effectiveChecked && !indeterminate" name="check"
					:size="iconSizeMap[size]" color="primary" />
				<FAIcon v-else-if="indeterminate" name="minus"
					:size="iconSizeMap[size]" color="primary" />
			</div>
		</div>
		<span v-if="label" class="text-sm text-content-base">{{ label }}</span>
	</label>
</template>
