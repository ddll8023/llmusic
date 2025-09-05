<script setup>
import { computed, ref } from 'vue';
import FAIcon from '../common/FAIcon.vue';

// Props 定义
const props = defineProps({
    // 基础属性
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
    modelValue: {
        type: [String, Number],
        default: ''
    },
    placeholder: {
        type: String,
        default: ''
    },
    disabled: {
        type: Boolean,
        default: false
    },
    readonly: {
        type: Boolean,
        default: false
    },
    required: {
        type: Boolean,
        default: false
    },
    autofocus: {
        type: Boolean,
        default: false
    },

    // 视觉状态
    error: {
        type: Boolean,
        default: false
    },
    success: {
        type: Boolean,
        default: false
    },
    loading: {
        type: Boolean,
        default: false
    },

    // 图标
    prefixIcon: {
        type: String,
        default: ''
    },
    suffixIcon: {
        type: String,
        default: ''
    },

    // 功能
    clearable: {
        type: Boolean,
        default: false
    },
    showPassword: {
        type: Boolean,
        default: false
    },

    // 文本
    label: {
        type: String,
        default: ''
    },
    helperText: {
        type: String,
        default: ''
    },
    errorMessage: {
        type: String,
        default: ''
    },

    // 数字类型专用
    min: {
        type: [String, Number],
        default: undefined
    },
    max: {
        type: [String, Number],
        default: undefined
    },
    step: {
        type: [String, Number],
        default: undefined
    },

    // 样式
    customClass: {
        type: String,
        default: ''
    }
});

// 事件定义
const emit = defineEmits(['update:modelValue', 'input', 'change', 'focus', 'blur', 'clear', 'enter']);

// 响应式数据
const inputRef = ref(null);
const isFocused = ref(false);
const showPasswordToggle = ref(false);

// 计算属性
const computedType = computed(() => {
    if (props.type === 'password' && showPasswordToggle.value) {
        return 'text';
    }
    return props.type;
});

const showClearButton = computed(() => {
    return props.clearable && props.modelValue && !props.disabled && !props.readonly;
});

const showPasswordButton = computed(() => {
    return props.showPassword && props.type === 'password' && !props.disabled;
});

const hasIcon = computed(() => {
    return props.prefixIcon || props.suffixIcon || showClearButton.value || showPasswordButton.value || props.loading;
});

const inputClasses = computed(() => {
    const classes = ['custom-input'];

    // 尺寸
    classes.push(`custom-input--${props.size}`);

    // 状态
    if (props.disabled) classes.push('custom-input--disabled');
    if (props.readonly) classes.push('custom-input--readonly');
    if (props.error) classes.push('custom-input--error');
    if (props.success) classes.push('custom-input--success');
    if (props.loading) classes.push('custom-input--loading');
    if (isFocused.value) classes.push('custom-input--focused');

    // 图标
    if (props.prefixIcon || props.loading) classes.push('custom-input--prefix');
    if (hasIcon.value && (props.suffixIcon || showClearButton.value || showPasswordButton.value)) {
        classes.push('custom-input--suffix');
    }

    // 自定义类
    if (props.customClass) classes.push(props.customClass);

    return classes;
});

const containerClasses = computed(() => {
    const classes = ['custom-input-container'];
    if (props.label) classes.push('custom-input-container--with-label');
    if (props.helperText || props.errorMessage) classes.push('custom-input-container--with-helper');
    return classes;
});

// 方法
const handleInput = (event) => {
    const value = event.target.value;
    emit('update:modelValue', value);
    emit('input', value, event);
};

const handleChange = (event) => {
    emit('change', event.target.value, event);
};

const handleFocus = (event) => {
    isFocused.value = true;
    emit('focus', event);
};

const handleBlur = (event) => {
    isFocused.value = false;
    emit('blur', event);
};

const handleKeydown = (event) => {
    if (event.key === 'Enter') {
        emit('enter', event);
    }
};

const handleClear = () => {
    emit('update:modelValue', '');
    emit('clear');
    inputRef.value?.focus();
};

const togglePasswordVisibility = () => {
    showPasswordToggle.value = !showPasswordToggle.value;
    inputRef.value?.focus();
};

const focus = () => {
    inputRef.value?.focus();
};

const blur = () => {
    inputRef.value?.blur();
};

// 暴露方法
defineExpose({
    focus,
    blur
});
</script>

<template>
    <div :class="containerClasses">
        <!-- 标签 -->
        <label v-if="label" class="custom-input-label" :class="{ 'custom-input-label--required': required }">
            {{ label }}
        </label>

        <!-- 输入框容器 -->
        <div :class="inputClasses">
            <!-- 前缀图标 -->
            <div v-if="prefixIcon || loading" class="custom-input__prefix">
                <FAIcon v-if="loading" name="spinner" :size="size === 'large' ? 'medium' : 'small'" color="secondary"
                    class="loading-icon" />
                <FAIcon v-else-if="prefixIcon" :name="prefixIcon" :size="size === 'large' ? 'medium' : 'small'"
                    :color="error ? 'danger' : success ? 'accent' : 'secondary'" />
            </div>

            <!-- 输入框 -->
            <input ref="inputRef" :type="computedType" :value="modelValue" :placeholder="placeholder"
                :disabled="disabled" :readonly="readonly" :required="required" :autofocus="autofocus" :min="min"
                :max="max" :step="step" class="custom-input__field" @input="handleInput" @change="handleChange"
                @focus="handleFocus" @blur="handleBlur" @keydown="handleKeydown" />

            <!-- 后缀图标区域 -->
            <div v-if="hasIcon && (suffixIcon || showClearButton || showPasswordButton)" class="custom-input__suffix">
                <!-- 清除按钮 -->
                <FAIcon v-if="showClearButton" name="times" size="small" color="secondary" :clickable="true"
                    class="clear-button" @click="handleClear" />

                <!-- 密码显示切换按钮 -->
                <FAIcon v-if="showPasswordButton" :name="showPasswordToggle ? 'eye-slash' : 'eye'" size="small"
                    color="secondary" :clickable="true" class="password-toggle" @click="togglePasswordVisibility" />

                <!-- 后缀图标 -->
                <FAIcon v-if="suffixIcon && !showClearButton && !showPasswordButton" :name="suffixIcon"
                    :size="size === 'large' ? 'medium' : 'small'"
                    :color="error ? 'danger' : success ? 'accent' : 'secondary'" />
            </div>
        </div>

        <!-- 帮助文本和错误信息 -->
        <div v-if="helperText || errorMessage" class="custom-input-helper">
            <span v-if="error && errorMessage" class="custom-input-helper--error">
                {{ errorMessage }}
            </span>
            <span v-else-if="helperText" class="custom-input-helper--normal">
                {{ helperText }}
            </span>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.custom-input-container {
    display: flex;
    flex-direction: column;
    gap: ($content-padding * 0.375);
    width: 100%;
}

.custom-input-label {
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    font-family: $font-family-base;
    color: $text-primary;
    line-height: $line-height-base;
    transition: color $transition-base;

    &:hover {
        color: $accent-green;
    }

    &--required::after {
        content: ' *';
        color: $danger;
    }
}

.custom-input {
    position: relative;
    display: flex;
    align-items: center;
    background: $bg-primary;
    border: 2px solid $bg-tertiary;
    border-radius: $border-radius-large;
    transition: all $transition-base;
    overflow: hidden;

    // 尺寸
    &--small {
        min-height: 32px;
        padding: 0 ($content-padding * 0.75);

        &.custom-input--prefix {
            padding-left: ($content-padding * 0.375);
        }

        &.custom-input--suffix {
            padding-right: ($content-padding * 0.375);
        }
    }

    &--medium {
        min-height: 40px;
        padding: 0 ($content-padding * 1);

        &.custom-input--prefix {
            padding-left: ($content-padding * 0.5);
        }

        &.custom-input--suffix {
            padding-right: ($content-padding * 0.5);
        }
    }

    &--large {
        min-height: 48px;
        padding: 0 ($content-padding * 1.25);

        &.custom-input--prefix {
            padding-left: ($content-padding * 0.75);
        }

        &.custom-input--suffix {
            padding-right: ($content-padding * 0.75);
        }
    }

    // 状态
    &--focused {
        border-color: $accent-green;
        box-shadow: 0 0 0 2px rgba($accent-green, 0.2);
    }

    &--error {
        border-color: $danger;
        box-shadow: 0 0 0 2px rgba($danger, 0.2);
    }

    &--success {
        border-color: $success;
        box-shadow: 0 0 0 2px rgba($success, 0.2);
    }

    &--disabled {
        background: $bg-tertiary;
        border-color: $bg-tertiary;
        cursor: not-allowed;
        opacity: 0.6;
    }

    &--readonly {
        background: $bg-secondary;
        cursor: default;
    }

    &--loading {
        cursor: wait;
    }

    &:hover:not(.custom-input--focused):not(.custom-input--disabled) {
        border-color: $bg-tertiary-hover;
    }
}

.custom-input__prefix,
.custom-input__suffix {
    display: flex;
    align-items: center;
    gap: ($content-padding * 0.375);
    flex-shrink: 0;
}

.custom-input__field {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    color: $text-primary;
    font-size: $font-size-base;
    font-family: $font-family-base;
    line-height: $line-height-base;

    // 当有前缀图标时添加左边距
    .custom-input--prefix & {
        margin-left: ($content-padding * 0.375);
    }

    &::placeholder {
        color: $text-disabled;
    }

    &:disabled {
        color: $text-disabled;
        cursor: not-allowed;
    }

    // 移除数字输入框的默认按钮
    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
    }

    &[type="number"] {
        -moz-appearance: textfield;
    }
}

.custom-input-helper {
    font-size: $font-size-xs;
    font-family: $font-family-base;
    line-height: $line-height-base;

    &--normal {
        color: $text-secondary;
    }

    &--error {
        color: $danger;
        font-weight: $font-weight-medium;
    }
}

// 图标动画
.loading-icon {
    animation: spin 1s linear infinite;
}

.clear-button,
.password-toggle {
    opacity: 0.7;
    transition: opacity $transition-base;

    &:hover {
        opacity: 1;
    }
}

// 旋转动画
@keyframes spin {
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
}

// 响应式适配
@include respond-to("sm") {
    .custom-input {
        &--small {
            min-height: 36px;
        }

        &--medium {
            min-height: 44px;
        }

        &--large {
            min-height: 52px;
        }
    }
}

// 高对比度模式支持
@media (prefers-contrast: high) {
    .custom-input {
        border-width: 3px;

        &--focused,
        &--error,
        &--success {
            box-shadow: none;
            border-width: 3px;
        }
    }
}

// 减少动画模式支持
@media (prefers-reduced-motion: reduce) {

    .custom-input,
    .custom-input-label,
    .clear-button,
    .password-toggle {
        transition: none !important;
    }

    .loading-icon {
        animation: none !important;
    }
}
</style>