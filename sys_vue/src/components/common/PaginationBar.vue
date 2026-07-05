<script setup lang="ts">
/**
 * PaginationBar
 * 通用分页栏组件，支持页码导航、跳页、每页条数切换
 */
import { computed, ref } from 'vue'
import CustomSelect from '../custom/CustomSelect.vue'
import CustomInput from '../custom/CustomInput.vue'
import FAIcon from './FAIcon.vue'

const props = withDefaults(defineProps<{
  page: number
  pageSize: number
  total: number
  pageSizeOptions?: number[]
  showSizeSelector?: boolean
  size?: 'small' | 'medium'
}>(), {
  pageSizeOptions: () => [10, 20, 50],
  showSizeSelector: true,
  size: 'small',
})

const emit = defineEmits<{
  (e: 'page-change', page: number): void
  (e: 'page-size-change', size: number): void
}>()

const totalPages = computed(() => Math.ceil(props.total / props.pageSize))

const visiblePages = computed(() => {
  const total = totalPages.value
  const current = props.page
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | string)[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  if (start > 2) pages.push('...')
  for (let i = start; i <= end; i++) pages.push(i)
  if (end < total - 1) pages.push('...')
  pages.push(total)
  return pages
})

const jumpPage = ref('')

function handleJumpPage() {
  const n = parseInt(jumpPage.value, 10)
  if (!isNaN(n) && n >= 1 && n <= totalPages.value) {
    emit('page-change', n)
  }
  jumpPage.value = ''
}

function handlePageSizeChange(v: any) {
  emit('page-size-change', Number(v))
}
</script>

<template>
  <footer v-if="totalPages > 1"
    class="flex-shrink-0 flex items-center justify-between px-5 py-3.5 bg-surface-base/80 backdrop-blur-md border-t border-line-base">
    <div class="flex items-center gap-3">
      <span class="text-xs text-content-tertiary">共 {{ total }} 首</span>
      <div v-if="showSizeSelector" class="w-px h-4 bg-line-base"></div>
      <div v-if="showSizeSelector" class="w-[72px]">
        <CustomSelect :model-value="pageSize" :options="pageSizeOptions.map(v => ({ label: String(v), value: v }))"
          :size="size" placement="top" @change="handlePageSizeChange" />
      </div>
      <span v-if="showSizeSelector" class="text-xs text-content-tertiary">首/页</span>
    </div>

    <div class="flex items-center gap-1">
      <button class="page-btn page-btn--default" :class="{ 'page-btn--disabled': page <= 1 }"
        :disabled="page <= 1" @click="emit('page-change', page - 1)">
        <FAIcon name="chevron-left" size="small" color="secondary" />
      </button>
      <template v-for="(p, idx) in visiblePages" :key="idx">
        <button v-if="p !== '...'" class="page-btn"
          :class="p === page ? 'page-btn--active' : 'page-btn--default'"
          @click="emit('page-change', Number(p))">{{ p }}</button>
        <span v-else class="px-1 text-xs text-content-disabled select-none">...</span>
      </template>
      <button class="page-btn page-btn--default" :class="{ 'page-btn--disabled': page >= totalPages }"
        :disabled="page >= totalPages" @click="emit('page-change', page + 1)">
        <FAIcon name="chevron-right" size="small" color="secondary" />
      </button>
    </div>

    <div class="flex items-center gap-2">
      <span class="text-xs text-content-tertiary">跳至</span>
      <CustomInput :model-value="jumpPage" type="number" :min="1" :max="totalPages" size="small"
        custom-class="!w-[52px]" @enter="handleJumpPage"
        @update:model-value="jumpPage = String($event)" />
      <span class="text-xs text-content-tertiary">页</span>
    </div>
  </footer>
</template>

<style scoped>
@reference "../../styles/tailwind-entry.css";
.page-btn {
  @apply w-8 h-8 inline-flex items-center justify-center rounded-lg text-xs font-medium
    transition-[background-color,color,transform,box-shadow] duration-200 cursor-pointer select-none outline-none;
}
.page-btn--default {
  @apply text-content-secondary hover:bg-overlay-light hover:text-content-base
    hover:-translate-y-0.5 active:translate-y-0;
}
.page-btn--active {
  @apply bg-accent-green text-white font-semibold shadow-custom cursor-default;
}
.page-btn--disabled {
  @apply text-content-disabled opacity-40 cursor-not-allowed pointer-events-none;
}
</style>
