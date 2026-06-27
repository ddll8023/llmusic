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
		<div v-if="show"
			class="fixed inset-0 bg-overlay-dark flex items-center justify-center z-[200] fade-in"
			@click.self="handleOverlayClick">
			<div class="bg-surface-elevated text-content-base p-[30px] rounded-[12px] shadow-lg w-[90%] border border-line-base modal-fade-in max-md:p-5"
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
		</div>
	</Teleport>
</template>
