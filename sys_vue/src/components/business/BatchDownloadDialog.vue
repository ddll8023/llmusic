<script setup lang="ts">
/**
 * BatchDownloadDialog - 批量下载进度弹窗
 * 功能描述：展示批量下载的总进度与逐条状态；完成后支持关闭与一键重试失败项
 * 依赖组件：FAIcon、CustomButton
 */
import FAIcon from '../common/FAIcon.vue'
import CustomButton from '../custom/CustomButton.vue'
import type { BatchDownloadProgress } from '@/composables/useDownloadManager'

defineProps<{
	progress: BatchDownloadProgress
}>()

const emit = defineEmits<{
	(e: 'close'): void
	(e: 'retry'): void
}>()
</script>

<template>
	<transition name="fade">
		<div v-if="progress.active || progress.completed > 0"
			class="fixed inset-0 bg-overlay-dark flex items-center justify-center z-[300]"
			@click.self="emit('close')">
			<div class="bg-surface-elevated border border-line-base rounded-lg p-5 w-[440px] max-h-[70vh] flex flex-col shadow-[0_10px_25px_rgba(0,0,0,0.5)]">
				<h3 class="text-base font-medium text-content-base mb-3 flex items-center gap-2">
					<FAIcon name="download" size="small" color="primary" />
					批量下载
				</h3>

				<!-- 进度条 -->
				<div class="mb-3">
					<div class="flex justify-between text-xs text-content-secondary mb-1">
						<span>进度 {{ progress.completed }}/{{ progress.total }}</span>
						<span>成功 {{ progress.succeeded }} / 失败 {{ progress.failed }}</span>
					</div>
					<div class="w-full h-2 bg-surface-overlay rounded-full overflow-hidden">
						<div class="h-full rounded-full bg-accent-green transition-all duration-300"
							:class="{ 'animate-pulse': progress.active }"
							:style="{ width: progress.total > 0 ? (progress.completed / progress.total) * 100 + '%' : '0%' }">
						</div>
					</div>
				</div>

				<!-- 歌曲列表 -->
				<div class="flex-1 overflow-y-auto max-h-[300px] space-y-1">
					<div v-for="(item, idx) in progress.items" :key="idx"
						class="px-2 py-1.5 rounded text-xs"
						:class="item.status === 'success' ? 'bg-accent-green/5' : item.status === 'failed' ? 'bg-accent-danger/5' : item.status === 'downloading' ? 'bg-accent-blue/5' : ''">
						<div class="flex items-center gap-2">
							<FAIcon v-if="item.status === 'pending'" name="circle-o" size="small" color="disabled" />
							<FAIcon v-else-if="item.status === 'downloading'" name="spinner" size="small" color="primary" class="animate-spin" />
							<FAIcon v-else-if="item.status === 'success'" name="check-circle" size="small" color="primary" />
							<FAIcon v-else-if="item.status === 'failed'" name="times-circle" size="small" color="danger" />
							<span class="truncate flex-1"
								:class="item.status === 'success' ? 'text-content-base' : item.status === 'failed' ? 'text-accent-danger' : 'text-content-secondary'">
								{{ item.songName }} - {{ item.singer }}
							</span>
						</div>
						<!-- 失败原因明细 -->
						<div v-if="item.status === 'failed' && item.error" class="text-accent-danger text-[10px] break-all pl-6 mt-0.5">
							{{ item.error }}
						</div>
					</div>
				</div>

				<!-- 操作区 -->
				<div v-if="!progress.active" class="mt-3 flex justify-end gap-2">
					<CustomButton v-if="progress.failed > 0" type="secondary" size="small" icon="refresh" @click="emit('retry')">
						重试失败项（{{ progress.failed }}）
					</CustomButton>
					<CustomButton type="primary" size="small" @click="emit('close')">关闭</CustomButton>
				</div>
			</div>
		</div>
	</transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
	transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}
</style>
