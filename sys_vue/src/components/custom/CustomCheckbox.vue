<script setup>
/**
 * CustomCheckbox - 自定义复选框组件
 * 功能描述：支持选中/半选/禁用状态、多尺寸、文本标签的自定义复选框
 * 依赖组件：FAIcon
 */
import { computed, ref, watch, onMounted, nextTick } from 'vue'
import FAIcon from '../common/FAIcon.vue'

const props = defineProps({
	modelValue: { type: Boolean, default: false },
	checked: { type: Boolean, default: undefined },
	indeterminate: { type: Boolean, default: false },
	disabled: { type: Boolean, default: false },
	size: {
		type: String,
		default: 'small',
		validator: (value) => ['small', 'medium', 'large'].includes(value)
	},
	label: { type: String, default: '' },
	customClass: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue', 'change'])

const inputRef = ref(null)

const effectiveChecked = computed(() =>
	props.checked !== undefined ? props.checked : props.modelValue
)

const sizeBoxMap = { small: 'w-4 h-4', medium: 'w-5 h-5', large: 'w-6 h-6' }
const iconSizeMap = { small: 'small', medium: 'small', large: 'medium' }

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
