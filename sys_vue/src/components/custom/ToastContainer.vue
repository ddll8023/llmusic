<script setup lang="ts">
/**
 * ToastContainer
 * 全局 Toast 反馈容器：右上角堆叠展示 notification store 中的消息，点击可关闭
 * 依赖组件：FAIcon
 */
import { useNotificationStore } from '@/store/notification'
import type { ToastType } from '@/store/notification'
import FAIcon from '@/components/common/FAIcon.vue'

const notificationStore = useNotificationStore()

// 类型 → 图标名
const iconMap: Record<ToastType, string> = {
	success: 'check',
	error: 'exclamation-circle',
	info: 'info-circle',
	warning: 'exclamation-triangle',
}

// 类型 → 图标颜色类
const iconColorMap: Record<ToastType, string> = {
	success: 'text-accent-green',
	error: 'text-accent-danger',
	info: 'text-content-secondary',
	warning: 'text-amber-400',
}
</script>

<template>
	<Teleport to="body">
		<!-- 右上角堆叠，避开 32px TitleBar -->
		<div class="fixed top-[44px] right-4 z-[9999] flex flex-col items-end gap-2 pointer-events-none">
			<TransitionGroup name="toast">
				<div v-for="toast in notificationStore.toasts" :key="toast.id"
					class="pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 max-w-[360px] rounded-[10px] cursor-pointer
					       bg-surface-elevated/90 backdrop-blur-md border border-line-base shadow-lg"
					@click="notificationStore.remove(toast.id)">
					<span class="shrink-0" :class="iconColorMap[toast.type]">
						<FAIcon :name="iconMap[toast.type]" size="small" color="current" />
					</span>
					<span class="text-xs text-content-base leading-relaxed break-all">{{ toast.message }}</span>
				</div>
			</TransitionGroup>
		</div>
	</Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active,
.toast-move {
	transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1),
	            transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-enter-from {
	opacity: 0;
	transform: translateX(24px);
}

.toast-leave-to {
	opacity: 0;
	transform: translateX(24px) scale(0.95);
}

.toast-leave-active {
	position: absolute;
	right: 0;
}
</style>
