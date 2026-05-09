<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import FAIcon from '../common/FAIcon.vue';

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, required: true, default: () => [] },
  size: {
    type: String, default: 'medium',
    validator: (value) => ['small', 'medium', 'large'].includes(value)
  },
  placeholder: { type: String, default: '请选择' },
  disabled: { type: Boolean, default: false },
  customClass: { type: String, default: '' }
});

const emit = defineEmits(['update:modelValue', 'change']);

const isOpen = ref(false);
const selectRef = ref(null);

const selectedOption = computed(() => props.options.find(opt => opt.value === props.modelValue));

const sizeTriggerMap = {
  small: 'min-h-[32px] px-2 text-xs',
  medium: 'min-h-[40px] px-3 text-sm',
  large: 'min-h-[48px] px-4 text-sm',
};
const selectedTriggerSize = computed(() => sizeTriggerMap[props.size]);

const selectClasses = computed(() => {
  return [
    'relative inline-block w-full font-sans',
    props.disabled ? 'opacity-50 pointer-events-none' : '',
    isOpen.value ? 'z-[100]' : '',
    props.customClass || '',
  ].filter(Boolean).join(' ');
});

const triggerClasses = computed(() => {
  return [
    'flex items-center justify-between bg-surface-overlay text-content-base border border-line-base rounded cursor-pointer transition-all duration-200 select-none w-full',
    selectedTriggerSize.value,
    isOpen.value ? 'border-accent-green' : '',
    'hover:bg-[#383838] hover:border-overlay-light',
    'focus-within:border-accent-green',
  ].join(' ');
});

const dropdownClasses = 'absolute top-full left-0 right-0 mt-1 bg-surface-elevated border border-line-base rounded shadow-custom-hover z-[100] max-h-[200px] overflow-y-auto';

const optionBase = 'px-3 py-2 cursor-pointer transition-colors duration-200 text-content-base text-xs';

const handleClick = () => { if (!props.disabled) isOpen.value = !isOpen.value; };

const handleOptionClick = (option) => {
  if (option.disabled) return;
  emit('update:modelValue', option.value);
  emit('change', option.value);
  isOpen.value = false;
};

const handleClickOutside = (event) => {
  if (selectRef.value && !selectRef.value.contains(event.target)) isOpen.value = false;
};

onMounted(() => document.addEventListener('click', handleClickOutside));
onUnmounted(() => document.removeEventListener('click', handleClickOutside));
</script>

<template>
  <div ref="selectRef" :class="selectClasses">
    <div :class="triggerClasses" @click="handleClick">
      <span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
        {{ selectedOption?.label || placeholder }}
      </span>
      <FAIcon name="chevron-down" size="small" color="secondary"
        :class="['shrink-0 ml-2 transition-transform duration-200', isOpen ? 'rotate-180' : '']" />
    </div>

    <div v-if="isOpen" :class="dropdownClasses">
      <div v-for="option in options" :key="option.value"
        :class="[
          optionBase,
          option.value === modelValue ? 'bg-accent-green/10 text-accent-green font-medium' : '',
          option.disabled ? 'text-content-disabled cursor-not-allowed opacity-50' : 'hover:bg-overlay-light',
          'first:rounded-t last:rounded-b',
        ]"
        @click="handleOptionClick(option)">
        {{ option.label }}
      </div>
    </div>
  </div>
</template>
