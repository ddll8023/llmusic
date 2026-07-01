<template>
	<Transition name="modal-overlay">
		<div v-if="show"
			class="fixed inset-0 bg-overlay-dark flex items-center justify-center z-[100]"
			@click="!loading && handleCancel()">
			<Transition name="modal-content">
				<div class="bg-surface-elevated rounded-lg shadow-custom-hover w-[480px] max-w-[90vw]"
					@click.stop>
					<div class="flex items-center justify-between p-4 border-b border-line-base">
						<h3 class="text-lg font-semibold text-content-base">确认删除</h3>
						<CustomButton type="icon-only" icon="times" iconSize="medium" :disabled="loading" @click="handleCancel" title="关闭" />
					</div>

					<div class="flex gap-4 p-6">
						<div class="w-12 h-12 flex items-center justify-center shrink-0">
							<FAIcon name="exclamation-triangle" size="large" color="danger" />
						</div>
						<div class="flex-1">
							<p class="text-sm text-content-base mb-2">您确定要删除这首歌曲吗？</p>
							<div class="bg-surface-base rounded p-3 mb-3">
								<div class="text-sm font-medium text-content-base">{{ song?.title || '未知歌曲' }}</div>
								<div class="text-xs text-content-secondary mt-1">
									<span>{{ song?.artist || '未知艺术家' }}</span>
									<span class="mx-1">•</span>
									<span>{{ song?.album || '未知专辑' }}</span>
								</div>
							</div>
							<p class="text-xs text-content-tertiary">此操作将从音乐库中移除并删除本地文件，无法撤销。</p>
						</div>
					</div>

					<div class="flex justify-end gap-2 p-4 border-t border-line-base">
						<CustomButton type="secondary" @click="handleCancel" :disabled="loading">取消</CustomButton>
						<CustomButton type="danger" @click="handleConfirm" :disabled="loading" :loading="loading">删除</CustomButton>
					</div>

					<div v-if="error" class="flex items-center gap-2 px-6 pb-4">
						<FAIcon name="exclamation-circle" size="small" color="danger" />
						<span class="text-xs text-accent-danger">{{ error }}</span>
					</div>
				</div>
			</Transition>
		</div>
	</Transition>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import FAIcon from './FAIcon.vue'
import CustomButton from '../custom/CustomButton.vue'
import type { Song } from '@/types'

const props = withDefaults(
	defineProps<{
		show?: boolean
		song?: Song | null
	}>(),
	{
		show: false,
		song: null,
	}
)

const emit = defineEmits<{
	(e: 'close'): void
	(e: 'confirm', song: Song): void
}>()

const loading = ref(false)
const error = ref('')

watch(
	() => props.show,
	(newShow) => {
		if (newShow) {
			loading.value = false
			error.value = ''
		}
	}
)

const handleCancel = () => {
	emit('close')
}

const handleConfirm = async () => {
	loading.value = true
	error.value = ''
	try {
		if (props.song) emit('confirm', props.song)
	} catch (e) {
		error.value = e instanceof Error ? e.message : '删除失败'
	} finally {
		loading.value = false
	}
}
</script>

<style scoped>
.modal-overlay-enter-active,
.modal-overlay-leave-active {
  transition: opacity var(--duration-base) cubic-bezier(.16,1,.3,1);
}
.modal-overlay-enter-from,
.modal-overlay-leave-to {
  opacity: 0;
}
.modal-overlay-enter-to,
.modal-overlay-leave-from {
  opacity: 1;
}

.modal-content-enter-active,
.modal-content-leave-active {
  transition: opacity var(--duration-base) cubic-bezier(.16,1,.3,1),
              transform var(--duration-base) cubic-bezier(.16,1,.3,1);
}
.modal-content-enter-from,
.modal-content-leave-to {
  opacity: 0;
  transform: scale(0.9) translateY(-10px);
}
.modal-content-enter-to,
.modal-content-leave-from {
  opacity: 1;
  transform: scale(1) translateY(0);
}

.modal-overlay-enter-active > div,
.modal-overlay-leave-active > div,
.modal-content-enter-active,
.modal-content-leave-active {
  will-change: transform, opacity;
}
</style>
