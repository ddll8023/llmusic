<script setup>
import { computed, ref } from 'vue';
import FAIcon from '../common/FAIcon.vue';

const props = defineProps({
    type: {
        type: String,
        default: 'text',
        validator: (value) => ['text', 'password', 'email', 'number', 'tel', 'url', 'search'].includes(value)
    },
    size: {
        type: String,
        default: 'medium',
        validator: (value) => ['small', 'medium', 'large'].includes(value)
    },
    modelValue: { type: [String, Number], default: '' },
    placeholder: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
    readonly: { type: Boolean, default: false },
    required: { type: Boolean, default: false },
    autofocus: { type: Boolean, default: false },
    error: { type: Boolean, default: false },
    success: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
    prefixIcon: { type: String, default: '' },
    suffixIcon: { type: String, default: '' },
    clearable: { type: Boolean, default: false },
    showPassword: { type: Boolean, default: false },
    label: { type: String, default: '' },
    helperText: { type: String, default: '' },
    errorMessage: { type: String, default: '' },
    min: { type: [String, Number], default: undefined },
    max: { type: [String, Number], default: undefined },
    step: { type: [String, Number], default: undefined },
    maxlength: { type: [String, Number], default: undefined },
    customClass: { type: String, default: '' }
});

const emit = defineEmits(['update:modelValue', 'input', 'change', 'focus', 'blur', 'clear', 'enter']);

const inputRef = ref(null);
const isFocused = ref(false);
const showPasswordToggle = ref(false);

const computedType = computed(() => props.type === 'password' && showPasswordToggle.value ? 'text' : props.type);

const showClearButton = computed(() => props.clearable && props.modelValue && !props.disabled && !props.readonly);
const showPasswordButton = computed(() => props.showPassword && props.type === 'password' && !props.disabled);
const hasIcon = computed(() => props.prefixIcon || props.suffixIcon || showClearButton.value || showPasswordButton.value || props.loading);

// 尺寸映射
const sizeMap = { small: 'min-h-[32px] px-3', medium: 'min-h-[40px] px-4', large: 'min-h-[48px] px-5' };
const prefixPaddingMap = { small: 'pl-1.5', medium: 'pl-2', large: 'pl-3' };
const suffixPaddingMap = { small: 'pr-1.5', medium: 'pr-2', large: 'pr-3' };
const iconSizeMap = { small: 'small', medium: 'small', large: 'medium' };

// 状态类
const stateClasses = computed(() => {
    if (isFocused.value) return 'border-accent-green shadow-[0_0_0_2px_rgba(76,175,80,0.2)]';
    if (props.error) return 'border-accent-danger shadow-[0_0_0_2px_rgba(244,67,54,0.2)]';
    if (props.success) return 'border-accent-green shadow-[0_0_0_2px_rgba(76,175,80,0.2)]';
    return '';
});

const isDisabled = computed(() => props.disabled ? 'bg-surface-overlay border-line-base cursor-not-allowed opacity-60' : '');
const isReadonly = computed(() => props.readonly ? 'bg-surface-elevated cursor-default' : '');

const inputWrapperClasses = computed(() => {
    return [
        'relative flex items-center bg-surface-base border-2 border-line-base rounded-lg transition-all duration-200 overflow-hidden',
        sizeMap[props.size],
        stateClasses.value,
        isDisabled.value,
        isReadonly.value,
        props.loading ? 'cursor-wait' : '',
        props.prefixIcon || props.loading ? prefixPaddingMap[props.size] : '',
        hasIcon.value && (props.suffixIcon || showClearButton.value || showPasswordButton.value) ? suffixPaddingMap[props.size] : '',
        'hover:border-line-light',
        isFocused.value ? 'hover:border-accent-green' : '',
        props.customClass || '',
    ].filter(Boolean).join(' ');
});

// 图标颜色
const iconColor = computed(() => props.error ? 'danger' : props.success ? 'accent' : 'secondary');

const handleInput = (event) => {
    const value = event.target.value;
    emit('update:modelValue', value);
    emit('input', value, event);
};
const handleChange = (event) => { emit('change', event.target.value, event); };
const handleFocus = (event) => { isFocused.value = true; emit('focus', event); };
const handleBlur = (event) => { isFocused.value = false; emit('blur', event); };
const handleKeydown = (event) => { if (event.key === 'Enter') emit('enter', event); };
const handleClear = () => { emit('update:modelValue', ''); emit('clear'); inputRef.value?.focus(); };
const togglePasswordVisibility = () => { showPasswordToggle.value = !showPasswordToggle.value; inputRef.value?.focus(); };
const focus = () => inputRef.value?.focus();
const blur = () => inputRef.value?.blur();
const labelClasses = 'text-xs font-medium text-content-base transition-colors duration-200 hover:text-accent-green';
defineExpose({ focus, blur });
</script>

<template>
    <div class="flex flex-col gap-1.5 w-full">
        <!-- 标签 -->
        <label v-if="label" :class="[labelClasses, required ? 'required' : '']">
            {{ label }}
        </label>

        <!-- 输入框容器 -->
        <div :class="inputWrapperClasses">
            <!-- 前缀图标 -->
            <div v-if="prefixIcon || loading" class="flex items-center gap-1.5 shrink-0">
                <FAIcon v-if="loading" name="spinner" :size="iconSizeMap[size]" color="secondary" class="spin" />
                <FAIcon v-else-if="prefixIcon" :name="prefixIcon" :size="iconSizeMap[size]" :color="iconColor" />
            </div>

            <!-- 输入框 -->
            <input ref="inputRef"
                :type="computedType" :value="modelValue" :placeholder="placeholder"
                :disabled="disabled" :readonly="readonly" :required="required" :autofocus="autofocus"
                :min="min" :max="max" :step="step" :maxlength="maxlength"
                class="flex-1 border-none outline-none bg-transparent text-content-base text-sm leading-normal
                       placeholder:text-content-disabled disabled:text-content-disabled disabled:cursor-not-allowed
                       [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
                       [&[type=number]]:[-moz-appearance:textfield]"
                @input="handleInput" @change="handleChange"
                @focus="handleFocus" @blur="handleBlur" @keydown="handleKeydown" />

            <!-- 后缀图标区域 -->
            <div v-if="hasIcon && (suffixIcon || showClearButton || showPasswordButton)" class="flex items-center gap-1.5 shrink-0">
                <FAIcon v-if="showClearButton" name="times" size="small" color="secondary" :clickable="true"
                    class="opacity-70 hover:opacity-100 transition-opacity duration-200" @click="handleClear" />
                <FAIcon v-if="showPasswordButton" :name="showPasswordToggle ? 'eye-slash' : 'eye'" size="small"
                    color="secondary" :clickable="true"
                    class="opacity-70 hover:opacity-100 transition-opacity duration-200" @click="togglePasswordVisibility" />
                <FAIcon v-if="suffixIcon && !showClearButton && !showPasswordButton"
                    :name="suffixIcon" :size="iconSizeMap[size]" :color="iconColor" />
            </div>
        </div>

        <!-- 帮助文本和错误信息 -->
        <div v-if="helperText || errorMessage" class="text-2xs leading-normal">
            <span v-if="error && errorMessage" class="text-accent-danger font-medium">{{ errorMessage }}</span>
            <span v-else-if="helperText" class="text-content-secondary">{{ helperText }}</span>
        </div>
    </div>
</template>

<style scoped>
label.required::after {
  content: " *";
  color: #f44336;
}
</style>
