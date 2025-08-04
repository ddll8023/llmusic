<script setup>
import { ref, watch } from 'vue';
import FAIcon from './FAIcon.vue';

// 接收父组件属性
const props = defineProps({
    title: {
        type: String,
        required: true
    },
    subtitle: {
        type: String,
        default: ''
    },
    metaText: {
        type: String,
        default: ''
    },
    showSearch: {
        type: Boolean,
        default: false
    },
    searchValue: {
        type: String,
        default: ''
    },
    searchPlaceholder: {
        type: String,
        default: '搜索...'
    },
    actions: {
        type: Array,
        default: () => []
    }
});

// 定义事件
const emit = defineEmits(['search-input', 'action-click']);

// 本地搜索值
const localSearchValue = ref(props.searchValue);

// 防抖函数
const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
};

// 创建防抖版的搜索事件发射
const debouncedEmitSearch = debounce((value) => {
    emit('search-input', value);
}, 300);

// 处理搜索输入
const handleSearchInput = (event) => {
    localSearchValue.value = event.target.value;
};

// 监听本地搜索值变化
watch(localSearchValue, (newValue) => {
    debouncedEmitSearch(newValue);
});

// 监听外部搜索值变化
watch(() => props.searchValue, (newValue) => {
    localSearchValue.value = newValue;
});

// 处理操作按钮点击
const handleActionClick = (actionKey) => {
    emit('action-click', actionKey);
};
</script>

<template>
    <div class="content-header">
        <div class="content-header__info">
            <div class="content-header__text">
                <h2 class="content-header__title">{{ title }}</h2>
                <div v-if="subtitle" class="content-header__subtitle">{{ subtitle }}</div>
                <div v-if="metaText" class="content-header__meta">{{ metaText }}</div>
            </div>

            <!-- 搜索框 -->
            <div v-if="showSearch" class="content-header__search">
                <FAIcon name="search" size="medium" color="secondary" class="search-icon" />
                <input type="text" :value="localSearchValue" @input="handleSearchInput" class="search-input"
                    :placeholder="searchPlaceholder" />
            </div>
        </div>

        <!-- 操作按钮组 -->
        <div v-if="actions.length > 0" class="content-header__actions">
            <button v-for="action in actions" :key="action.key" @click="handleActionClick(action.key)"
                :disabled="action.disabled" :class="[
                    'action-button',
                    `action-button--${action.type}`,
                    { 'action-button--disabled': action.disabled }
                ]">
                <FAIcon :name="action.icon" size="medium"
                    :color="action.type === 'primary' ? 'primary' : action.type === 'danger' ? 'danger' : 'secondary'" />
                <span>{{ action.label }}</span>
            </button>
        </div>
    </div>
</template>

<style lang="scss" scoped>
@use "../styles/variables/_colors" as *;
@use "../styles/variables/_layout" as *;
@use "../styles/variables/_typography" as *;
@use "sass:color";

.content-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: $content-padding;
    background: linear-gradient(to bottom, $bg-tertiary, $bg-primary);
    border-bottom: 1px solid $bg-tertiary;

    @include respond-to("sm") {
        flex-direction: column;
        gap: ($content-padding * 0.875);
        align-items: stretch;
        padding: $content-padding;
    }
}

.content-header__info {
    display: flex;
    align-items: center;
    gap: 24px;
    flex: 1;
    min-width: 0;

    @include respond-to("sm") {
        flex-direction: column;
        gap: $content-padding;
        align-items: stretch;
    }
}

.content-header__text {
    flex: 1;
    min-width: 0;

    @include respond-to("sm") {
        width: 100%;
    }
}

.content-header__title {
    font-size: $font-size-xl;
    font-weight: $font-weight-bold;
    color: $text-primary;
    margin: 0 0 ($content-padding * 0.5) 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    @include respond-to("sm") {
        font-size: $font-size-lg;
        white-space: normal;
        overflow: visible;
        text-overflow: initial;
        text-align: center;
    }
}

.content-header__subtitle {
    font-size: $font-size-base;
    color: $text-secondary;
    margin-bottom: ($content-padding * 0.75);
    line-height: 1.4;

    @include respond-to("sm") {
        font-size: $font-size-sm;
        text-align: center;
    }
}

.content-header__meta {
    font-size: $font-size-sm;
    color: $text-secondary;
    font-weight: $font-weight-medium;

    @include respond-to("sm") {
        font-size: $font-size-xs;
        text-align: center;
    }
}

.content-header__search {
    position: relative;
    flex-shrink: 0;

    @include respond-to("sm") {
        width: 100%;
    }
}

.search-icon {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 1;
}

.search-input {
    background-color: $bg-tertiary;
    border: 1px solid $bg-tertiary;
    border-radius: 20px;
    color: $text-primary;
    padding: 8px 12px 8px 36px;
    width: 300px;
    font-size: $font-size-base;
    transition: all $transition-base;

    &::placeholder {
        color: $text-secondary;
    }

    &:focus {
        border-color: $accent-green;
        outline: none;
        box-shadow: 0 0 0 2px rgba($accent-green, 0.2);
    }

    &:hover {
        border-color: color.adjust($bg-tertiary, $lightness: 10%);
    }

    @include respond-to("sm") {
        width: 100%;
        font-size: $font-size-sm;
    }
}

.content-header__actions {
    display: flex;
    gap: ($content-padding * 0.625);
    align-items: center;
    flex-shrink: 0;
    max-width: 400px;

    @include respond-to("sm") {
        width: 100%;
        gap: ($content-padding * 0.375);
        flex-wrap: wrap;
        justify-content: center;
        max-width: none;
    }
}

.action-button {
    display: flex;
    align-items: center;
    gap: ($content-padding * 0.5);
    padding: ($content-padding * 0.5) ($content-padding * 1.125);
    border-radius: ($border-radius * 5);
    border: none;
    font-weight: $font-weight-semibold;
    font-size: $font-size-base;
    cursor: pointer;
    transition: all $transition-base;
    white-space: nowrap;
    min-height: 40px;
    min-width: 120px;
    justify-content: center;

    &:disabled,
    &--disabled {
        opacity: 0.5;
        cursor: not-allowed;

        &:hover {
            transform: none;
        }
    }

    @include respond-to("sm") {
        padding: ($content-padding * 0.5) ($content-padding * 0.875);
        font-size: $font-size-sm;
        min-height: 44px;
        min-width: 100px;
        gap: ($content-padding * 0.375);
        flex: 1;
        max-width: 200px;
    }
}

.action-button--primary {
    background-color: $accent-green;
    color: $text-primary;
    box-shadow: $box-shadow;
    font-weight: $font-weight-bold;

    &:hover:not(:disabled):not(.action-button--disabled) {
        background-color: $accent-hover;
        transform: scale(1.02) translateY(-1px);
        box-shadow: $box-shadow-hover;
    }

    &:active {
        transform: scale(0.98);
    }
}

.action-button--secondary {
    background-color: transparent;
    color: $text-secondary;
    border: 1px solid $bg-tertiary;
    font-weight: $font-weight-medium;

    &:hover:not(:disabled):not(.action-button--disabled) {
        border-color: $text-primary;
        color: $text-primary;
        background-color: $overlay-light;
        transform: translateY(-1px);
    }

    &:active {
        transform: translateY(0);
    }
}

.action-button--danger {
    background-color: transparent;
    color: $danger;
    border: 1px solid $danger;

    &:hover:not(:disabled):not(.action-button--disabled) {
        background-color: rgba($danger, 0.1);
        transform: translateY(-2px);
    }

    &:active {
        transform: translateY(0);
    }
}

// 多按钮布局优化
.content-header__actions:has(.action-button:nth-child(2)) {
    .action-button {
        flex: 1;
        max-width: 180px;

        @include respond-to("sm") {
            max-width: none;
        }
    }
}

// 高对比度模式支持
@media (prefers-contrast: high) {
    .content-header {
        border: 2px solid $text-primary;
    }

    .action-button {
        border: 2px solid currentColor;
    }

    .search-input {
        border: 2px solid $bg-tertiary;

        &:focus {
            border: 2px solid $accent-green;
        }
    }
}

// 减少动画模式支持
@media (prefers-reduced-motion: reduce) {

    *,
    *::before,
    *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
    }

    .action-button {

        &:hover,
        &:active {
            transform: none;
        }
    }
}
</style>