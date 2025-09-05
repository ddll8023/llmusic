<script setup>
import { ref, watch } from 'vue';
import FAIcon from './FAIcon.vue';
import CustomButton from '../custom/CustomButton.vue';
import CustomInput from '../custom/CustomInput.vue';

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


// 监听本地搜索值变化
watch(localSearchValue, (newValue) => {
    debouncedEmitSearch(newValue);
});

// 监听外部搜索值变化
watch(() => props.searchValue, (newValue) => {
    localSearchValue.value = newValue;
});

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
                <CustomInput v-model="localSearchValue" type="text" :placeholder="searchPlaceholder" prefixIcon="search"
                    clearable customClass="content-header-search-input" />
            </div>
        </div>

        <!-- 操作按钮组 -->
        <div v-if="actions.length > 0" class="content-header__actions">
            <CustomButton v-for="action in actions" :key="action.key" :type="action.type" :icon="action.icon"
                :disabled="action.disabled" @click="emit('action-click', action.key)">
                {{ action.label }}
            </CustomButton>
        </div>
    </div>
</template>

<style lang="scss" scoped>
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
    }
}

.content-header__info {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;

    @include respond-to("sm") {
        flex-direction: column;
        gap: ($content-padding * 0.5);
        align-items: stretch;
    }
}

.content-header__text {
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

// CustomInput 样式定制
:deep(.content-header-search-input) {
    width: 300px;

    @include respond-to("sm") {
        width: 100%;
    }

    .custom-input {
        background: $bg-tertiary;
        border-color: $bg-tertiary;

        &:hover:not(.custom-input--focused):not(.custom-input--disabled) {
            border-color: $bg-tertiary-hover;
        }

        .custom-input__field::placeholder {
            color: $text-secondary;
        }
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

// 多按钮布局优化
.content-header__actions:has(.custom-button:nth-child(2)) .custom-button {
    flex: 1;
    max-width: 180px;

    @include respond-to("sm") {
        max-width: none;
    }
}
</style>