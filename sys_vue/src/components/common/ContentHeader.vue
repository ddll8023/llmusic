<script setup>
import { ref, watch } from 'vue';
import FAIcon from './FAIcon.vue';
import CustomButton from '../custom/CustomButton.vue';
import CustomInput from '../custom/CustomInput.vue';

const props = defineProps({
    title: { type: String, required: true },
    subtitle: { type: String, default: '' },
    metaText: { type: String, default: '' },
    showSearch: { type: Boolean, default: false },
    searchValue: { type: String, default: '' },
    searchPlaceholder: { type: String, default: '搜索...' },
    actions: { type: Array, default: () => [] }
});

const emit = defineEmits(['search-input', 'action-click']);

const localSearchValue = ref(props.searchValue);

const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
};

const debouncedEmitSearch = debounce((value) => { emit('search-input', value); }, 300);

watch(localSearchValue, (newValue) => { debouncedEmitSearch(newValue); });
watch(() => props.searchValue, (newValue) => { localSearchValue.value = newValue; });
</script>

<template>
    <div class="flex justify-between items-center p-4 bg-gradient-to-b from-surface-overlay to-surface-base border-b border-line-base max-md:flex-col max-md:gap-3.5 max-md:items-stretch">
        <div class="flex items-center gap-3 flex-1 min-w-0 max-md:flex-col max-md:gap-2 max-md:items-stretch">
            <div class="min-w-0 max-md:w-full">
                <h2 class="text-xl font-bold text-content-base mb-2 truncate max-md:text-lg max-md:whitespace-normal max-md:text-center">{{ title }}</h2>
                <div v-if="subtitle" class="text-sm text-content-secondary mb-3 leading-relaxed max-md:text-xs max-md:text-center">{{ subtitle }}</div>
                <div v-if="metaText" class="text-xs text-content-secondary font-medium max-md:text-2xs max-md:text-center">{{ metaText }}</div>
            </div>
            <div v-if="showSearch" class="shrink-0 max-md:w-full">
                <CustomInput v-model="localSearchValue" type="text" :placeholder="searchPlaceholder"
                    prefixIcon="search" clearable customClass="w-[300px] max-md:w-full" />
            </div>
        </div>

        <div v-if="actions.length > 0" class="flex items-center gap-2.5 shrink-0 max-w-[400px] max-md:w-full max-md:gap-1.5 max-md:flex-wrap max-md:justify-center max-md:max-w-none">
            <CustomButton v-for="action in actions" :key="action.key"
                :type="action.type" :icon="action.icon" :disabled="action.disabled"
                @click="emit('action-click', action.key)" class="max-md:flex-1 max-md:max-w-[180px] max-md:max-w-none">
                {{ action.label }}
            </CustomButton>
        </div>
    </div>
</template>
