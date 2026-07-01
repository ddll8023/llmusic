<script setup lang="ts">
import { useSlots } from 'vue'
import CustomButton from './CustomButton.vue'

export interface CustomModalProps {
	show?: boolean
	title?: string
	width?: string
	closable?: boolean
	confirmText?: string
	cancelText?: string
	showFooter?: boolean
	closeOnOverlay?: boolean
	confirmType?: 'primary' | 'secondary' | 'danger' | 'icon-only'
	confirmLoading?: boolean
	confirmDisabled?: boolean
	showCloseIcon?: boolean
}

const props = withDefaults(defineProps<CustomModalProps>(), {
	show: false,
	title: '',
	width: '450px',
	closable: true,
	confirmText: '确认',
	cancelText: '取消',
	showFooter: true,
	closeOnOverlay: true,
	confirmType: 'primary',
	confirmLoading: false,
	confirmDisabled: false,
	showCloseIcon: true,
})

const emit = defineEmits<{
	(e: 'close'): void
	(e: 'confirm'): void
	(e: 'cancel'): void
}>()
const slots = useSlots()

const handleOverlayClick = () => {
	if (props.closeOnOverlay) emit('close')
}
</script>

<template>
	<Teleport to="body">
		<Transition name="modal-overlay">
			<div v-if="show"
				class="fixed inset-0 bg-overlay-dark flex items-center justify-center z-[200]"
				@click.self="handleOverlayClick">
				<Transition name="modal-content">
					<div class="bg-surface-elevated text-content-base p-[30px] rounded-[12px] shadow-lg w-[90%] border border-line-base max-md:p-5"
						:style="{ maxWidth: width }">
						<div v-if="slots.header || title" class="flex items-center justify-between mb-5">
							<slot name="header">
								<h3 class="m-0 text-lg font-semibold max-md:text-sm">{{ title }}</h3>
							</slot>
							<CustomButton v-if="showCloseIcon && closable" type="icon-only" icon="times" size="small"
								@click="emit('close')" />
						</div>

						<div class="text-content-secondary text-xs leading-relaxed max-md:text-[10px]">
							<slot />
						</div>

						<div v-if="showFooter"
							class="flex justify-end items-center gap-3 mt-5 pt-5 border-t border-line-base max-md:flex-col max-md:gap-2">
							<slot name="footer">
								<CustomButton type="secondary" @click="emit('cancel')">{{ cancelText }}</CustomButton>
								<CustomButton :type="confirmType" @click="emit('confirm')" :loading="confirmLoading"
									:disabled="confirmDisabled">{{ confirmText }}</CustomButton>
							</slot>
						</div>
					</div>
				</Transition>
			</div>
		</Transition>
	</Teleport>
</template>

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
