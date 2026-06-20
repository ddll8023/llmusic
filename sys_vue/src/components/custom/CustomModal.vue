<script setup>
import { useSlots } from 'vue'
import CustomButton from './CustomButton.vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: '' },
  width: { type: String, default: '450px' },
  closable: { type: Boolean, default: true },
  confirmText: { type: String, default: '确认' },
  cancelText: { type: String, default: '取消' },
  showFooter: { type: Boolean, default: true },
  closeOnOverlay: { type: Boolean, default: true },
  confirmType: { type: String, default: 'primary' },
  confirmLoading: { type: Boolean, default: false },
  confirmDisabled: { type: Boolean, default: false },
  showCloseIcon: { type: Boolean, default: true },
})

const emit = defineEmits(['close', 'confirm', 'cancel'])
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
          <CustomButton v-if="showCloseIcon && closable" type="icon-only" icon="times" size="small" @click="emit('close')" />
        </div>

        <div class="text-content-secondary text-xs leading-relaxed max-md:text-[10px]">
          <slot />
        </div>

        <div v-if="showFooter" class="flex justify-center gap-5 mt-[25px] max-md:gap-4 max-md:mt-5">
          <slot name="footer">
            <CustomButton v-if="cancelText" type="secondary" @click="emit('cancel')">{{ cancelText }}</CustomButton>
            <CustomButton v-if="confirmText" :type="confirmType" :loading="confirmLoading" :disabled="confirmDisabled" @click="emit('confirm')">{{ confirmText }}</CustomButton>
          </slot>
        </div>
      </div>
    </div>
  </Teleport>
</template>
