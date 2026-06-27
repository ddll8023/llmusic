<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import FAIcon from '../common/FAIcon.vue';

interface SelectOption {
	value: string | number
	label: string
}

const props = withDefaults(defineProps<{
	modelValue?: string | number
	options?: SelectOption[]
	size?: 'small' | 'medium' | 'large'
	placeholder?: string
	disabled?: boolean
	customClass?: string
	placement?: 'top' | 'bottom'
}>(), {
	modelValue: '',
	options: () => [],
	size: 'medium',
	placeholder: '请选择',
	disabled: false,
	customClass: '',
	placement: 'bottom',
});

const emit = defineEmits<{
	(e: 'update:modelValue', value: string | number): void
	(e: 'change', value: string | number): void
}>();

const isOpen = ref(false);
const selectRef = ref<any>(null);

const selectedOption = computed(() => props.options.find((opt: any) => opt.value === props.modelValue));

const sizeTriggerMap: Record<string, string> = {
	small: 'min-h-[32px] px-2 text-xs',
	medium: 'min-h-[40px] px-3 text-sm',
	large: 'min-h-[48px] px-4 text-base',
};

const sizeOptionsMap: Record<string, string> = {
	small: 'max-h-[160px]',
	medium: 'max-h-[200px]',
	large: 'max-h-[240px]',
};

const triggerClasses = computed(() => {
	const base = 'w-full flex items-center justify-between border border-line-base rounded cursor-pointer transition-colors duration-200 hover:border-accent-green';
	const size = sizeTriggerMap[props.size] || sizeTriggerMap.medium;
	const state = props.disabled ? 'opacity-50 cursor-not-allowed bg-surface-base' : 'bg-surface-elevated';
	return [base, size, state].join(' ');
});

const handleSelect = (option: any) => {
	if (props.disabled) return;
	emit('update:modelValue', option.value);
	emit('change', option.value);
	isOpen.value = false;
};

const handleToggle = () => {
	if (props.disabled) return;
	isOpen.value = !isOpen.value;
};

const handleClickOutside = (event: any) => {
	if (selectRef.value && !selectRef.value.contains(event.target)) {
		isOpen.value = false;
	}
};

onMounted(() => document.addEventListener('click', handleClickOutside));
onUnmounted(() => document.removeEventListener('click', handleClickOutside));
</script>

<template>
	<div ref="selectRef" class="relative" :class="customClass">
		<div :class="triggerClasses" @click="handleToggle">
			<span :class="selectedOption ? 'text-content-base' : 'text-content-disabled'">
				{{ selectedOption ? selectedOption.label : placeholder }}
			</span>
			<FAIcon :name="isOpen ? 'chevron-up' : 'chevron-down'" size="small" color="secondary" />
		</div>

		<Transition name="fade">
			<div v-if="isOpen && !disabled"
				:class="['absolute left-0 right-0 z-[300] bg-surface-elevated border border-line-base rounded shadow-lg overflow-y-auto', sizeOptionsMap[props.size] || sizeOptionsMap.medium]">
				<div v-for="(option, index) in options" :key="index"
					class="px-3 py-2 cursor-pointer text-sm transition-colors duration-150 hover:bg-overlay-light"
					:class="option.value === props.modelValue ? 'text-accent-green bg-overlay-light/50' : 'text-content-base'"
					@click="handleSelect(option)">
					{{ option.label }}
				</div>
			</div>
		</Transition>
	</div>
</template>
