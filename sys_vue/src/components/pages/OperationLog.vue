<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useOperationLogStore } from '../../store/operationLog';
import { useNotificationStore } from '../../store/notification';
import CustomButton from '../custom/CustomButton.vue';
import CustomInput from '../custom/CustomInput.vue';
import CustomModal from '../custom/CustomModal.vue';
import CustomSelect from '../custom/CustomSelect.vue';

const operationLogStore = useOperationLogStore();
const notification = useNotificationStore();

const keywordInput = ref('');
const cleanupDialogVisible = ref(false);
const cleanupRetentionDays = ref<7 | 30>(30);

const levelOptions = [
  { value: '', label: '全部级别' },
  { value: 'INFO', label: 'INFO' },
  { value: 'WARNING', label: 'WARNING' },
  { value: 'ERROR', label: 'ERROR' },
];

const typeOptions = [
  { value: '', label: '全部类型' },
  { value: 'request', label: '网络请求' },
  { value: 'auth', label: '认证操作' },
];

const cleanupOptions = [
  { value: 7, label: '保留最近 7 天' },
  { value: 30, label: '保留最近 30 天' },
];

onMounted(async () => {
  await refresh();
});

async function refresh() {
  try {
    await operationLogStore.loadLogs();
  } catch (e) {
    notification.notifyError(e);
  }
}

function onLevelChange(value: string | number) {
  operationLogStore.setLevel(String(value) as 'INFO' | 'WARNING' | 'ERROR' | '').catch(notification.notifyError);
}

function onTypeChange(value: string | number) {
  operationLogStore.setLogType(String(value) as 'request' | 'auth' | '').catch(notification.notifyError);
}

function onSearch() {
  operationLogStore.setKeyword(keywordInput.value).catch(notification.notifyError);
}

function openCleanupDialog() {
  cleanupDialogVisible.value = true;
}

function closeCleanupDialog() {
  if (!operationLogStore.cleaning) cleanupDialogVisible.value = false;
}

function onCleanupRetentionChange(value: string | number) {
  const days = Number(value);
  if (days === 7 || days === 30) cleanupRetentionDays.value = days;
}

async function confirmCleanup() {
  try {
    const result = await operationLogStore.cleanupLogs(cleanupRetentionDays.value);
    cleanupDialogVisible.value = false;
    notification.success(`已清理 ${result.deleted_count} 条过期日志`);
  } catch (e) {
    notification.notifyError(e);
  }
}

function prevPage() {
  if (operationLogStore.page <= 1) return;
  operationLogStore.setPage(operationLogStore.page - 1).catch(notification.notifyError);
}

function nextPage() {
  if (operationLogStore.page >= operationLogStore.totalPages) return;
  operationLogStore.setPage(operationLogStore.page + 1).catch(notification.notifyError);
}

function levelClass(level: string) {
  if (level === 'ERROR') return 'text-accent-danger';
  if (level === 'WARNING') return 'text-yellow-500';
  return 'text-accent-green';
}
</script>

<template>
  <div class="p-6 text-content-base h-full overflow-y-auto max-md:p-4">
    <h2 class="text-xl mb-6 font-bold max-md:text-lg max-md:mb-4">开发者日志</h2>

    <div class="flex flex-wrap gap-3 mb-4 items-center">
      <CustomSelect
        :model-value="operationLogStore.level"
        :options="levelOptions"
        placeholder="全部级别"
        customClass="w-36!"
        @update:model-value="onLevelChange"
      />
      <CustomSelect
        :model-value="operationLogStore.logType"
        :options="typeOptions"
        placeholder="全部类型"
        customClass="w-36!"
        @update:model-value="onTypeChange"
      />
      <CustomInput
        v-model="keywordInput"
        placeholder="搜索关键词"
        size="medium"
        customClass="w-56!"
        @enter="onSearch"
      />
      <CustomButton type="secondary" size="small" @click="onSearch">搜索</CustomButton>
      <CustomButton type="secondary" size="small" @click="refresh">刷新</CustomButton>
      <CustomSelect
        :model-value="cleanupRetentionDays"
        :options="cleanupOptions"
        customClass="w-40!"
        @update:model-value="onCleanupRetentionChange"
      />
      <CustomButton
        type="danger"
        size="small"
        :loading="operationLogStore.cleaning"
        :disabled="operationLogStore.cleaning"
        @click="openCleanupDialog"
      >
        清理过期日志
      </CustomButton>
    </div>

    <div class="bg-surface-overlay rounded-lg overflow-x-auto">
      <table class="w-full text-xs min-w-[720px]">
        <thead>
          <tr class="text-left border-b border-line-base text-content-secondary">
            <th class="px-4 py-2 font-medium whitespace-nowrap">时间</th>
            <th class="px-4 py-2 font-medium whitespace-nowrap">级别</th>
            <th class="px-4 py-2 font-medium whitespace-nowrap">类型</th>
            <th class="px-4 py-2 font-medium">动作</th>
            <th class="px-4 py-2 font-medium">内容</th>
            <th class="px-4 py-2 font-medium whitespace-nowrap">状态</th>
            <th class="px-4 py-2 font-medium whitespace-nowrap">耗时(ms)</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(log, index) in operationLogStore.logs"
            :key="`${log.time}-${index}`"
            class="border-b border-line-base/60 hover:bg-surface-elevated/40"
          >
            <td class="px-4 py-2 whitespace-nowrap text-content-secondary">{{ log.time }}</td>
            <td class="px-4 py-2 whitespace-nowrap" :class="levelClass(log.level)">{{ log.level }}</td>
            <td class="px-4 py-2 whitespace-nowrap">{{ log.type }}</td>
            <td class="px-4 py-2 max-w-[240px] truncate" :title="log.action">{{ log.action }}</td>
            <td class="px-4 py-2 max-w-[320px] truncate" :title="log.message">{{ log.message }}</td>
            <td class="px-4 py-2 whitespace-nowrap">{{ log.status ?? '-' }}</td>
            <td class="px-4 py-2 whitespace-nowrap">{{ log.duration_ms ?? '-' }}</td>
          </tr>
          <tr v-if="!operationLogStore.loading && operationLogStore.logs.length === 0">
            <td colspan="7" class="px-4 py-8 text-center text-content-disabled">暂无日志</td>
          </tr>
          <tr v-if="operationLogStore.loading">
            <td colspan="7" class="px-4 py-8 text-center text-content-disabled">加载中...</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="flex items-center justify-between mt-4 text-xs text-content-secondary">
      <span>共 {{ operationLogStore.total }} 条，第 {{ operationLogStore.page }} / {{ operationLogStore.totalPages || 1 }} 页</span>
      <div class="flex gap-2">
        <CustomButton
          type="secondary"
          size="small"
          :disabled="operationLogStore.page <= 1"
          @click="prevPage"
        >
          上一页
        </CustomButton>
        <CustomButton
          type="secondary"
          size="small"
          :disabled="operationLogStore.page >= operationLogStore.totalPages"
          @click="nextPage"
        >
          下一页
        </CustomButton>
      </div>
    </div>

    <CustomModal
      :show="cleanupDialogVisible"
      title="清理过期日志"
      confirm-text="确认清理"
      confirm-type="danger"
      :confirm-loading="operationLogStore.cleaning"
      :confirm-disabled="operationLogStore.cleaning"
      :closable="!operationLogStore.cleaning"
      :close-on-overlay="!operationLogStore.cleaning"
      @close="closeCleanupDialog"
      @cancel="closeCleanupDialog"
      @confirm="confirmCleanup"
    >
      <p>将删除早于 {{ cleanupRetentionDays }} 天的操作日志，最近 {{ cleanupRetentionDays }} 天的日志会保留。</p>
      <p class="mt-3 text-accent-danger">删除后无法恢复，请确认后继续。</p>
    </CustomModal>
  </div>
</template>
