<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import FAIcon from '../common/FAIcon.vue';

const props = defineProps({
  modelValue: {
    type: [String, Number],
    default: ''
  },
  options: {
    type: Array,
    required: true,
    default: () => []
  },
  size: {
    type: String,
    default: 'medium',
    validator: (value) => ['small', 'medium', 'large'].includes(value)
  },
  placeholder: {
    type: String,
    default: '请选择'
  },
  disabled: {
    type: Boolean,
    default: false
  },
  customClass: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['update:modelValue', 'change']);

const isOpen = ref(false);
const selectRef = ref(null);
const dropdownRef = ref(null);

const selectedOption = computed(() => {
  return props.options.find(opt => opt.value === props.modelValue);
});

const selectClasses = computed(() => {
  const classes = ['custom-select'];
  classes.push(`custom-select--${props.size}`);
  if (props.disabled && classes.push('custom-select--disabled'));
  if (isOpen.value && classes.push('custom-select--open'));
  if (props.customClass && classes.push(props.customClass));
  return classes;
});

const handleClick = () => {
  if (props.disabled) return;
  isOpen.value = !isOpen.value;
};

const handleOptionClick = (option) => {
  if (option.disabled) return;
  emit('update:modelValue', option.value);
  emit('change', option.value);
  isOpen.value = false;
};

const handleClickOutside = (event) => {
  if (selectRef.value && !selectRef.value.contains(event.target)) {
    isOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <div ref="selectRef" :class="selectClasses">
    <div class="custom-select__trigger" @click="handleClick">
      <span class="custom-select__value">
        {{ selectedOption?.label || placeholder }}
      </span>
      <FAIcon name="chevron-down" size="small" color="secondary" class="custom-select__arrow" />
    </div>

    <div v-if="isOpen" ref="dropdownRef" class="custom-select__dropdown">
      <div
        v-for="option in options"
        :key="option.value"
        class="custom-select__option"
        :class="{
          'custom-select__option--selected': option.value === modelValue,
          'custom-select__option--disabled': option.disabled
        }"
        @click="handleOptionClick(option)"
      >
        {{ option.label }}
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use "sass:color";
@use "@/styles/variables" as *;

.custom-select {
  position: relative;
  display: inline-block;
  width: 100%;
  font-family: $font-family-base;

  // 尺寸
  &--small {
    .custom-select__trigger {
      min-height: 32px;
      padding: 0 ($content-padding * 0.5) ($content-padding * 0.75);
      font-size: $font-size-sm;
    }
  }

  &--medium {
    .custom-select__trigger {
      min-height: 40px;
      padding: 0 ($content-padding * 0.75) ($content-padding * 1);
      font-size: $font-size-base;
    }
  }

  &--large {
    .custom-select__trigger {
      min-height: 48px;
      padding: 0 ($content-padding * 1) ($content-padding * 1.25);
      font-size: $font-size-base;
    }
  }

  // 状态
  &--disabled {
    .custom-select__trigger {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &--open {
    .custom-select__arrow {
      transform: rotate(180deg);
    }
  }
}

.custom-select__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: $bg-tertiary;
  color: $text-primary;
  border: 1px solid $bg-tertiary;
  border-radius: $border-radius;
  cursor: pointer;
  transition: all $transition-base;
  user-select: none;

  &:hover:not(.custom-select--disabled) {
    background-color: color.adjust($bg-tertiary, $lightness: 5%);
    border-color: $overlay-light;
  }

  &:focus-within {
    border-color: $accent-green;
  }
}

.custom-select__value {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.custom-select__arrow {
  flex-shrink: 0;
  margin-left: ($content-padding * 0.5);
  transition: transform $transition-base;
}

.custom-select__dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background-color: $bg-secondary;
  border: 1px solid $bg-tertiary;
  border-radius: $border-radius;
  box-shadow: $box-shadow-hover;
  z-index: $z-dropdown;
  max-height: 200px;
  overflow-y: auto;
  animation: dropdownFadeIn $transition-fast ease-out;
}

.custom-select__option {
  padding: ($content-padding * 0.5) ($content-padding * 0.75);
  cursor: pointer;
  transition: background-color $transition-base;
  color: $text-primary;
  font-size: $font-size-sm;

  &:first-child {
    border-top-left-radius: $border-radius;
    border-top-right-radius: $border-radius;
  }

  &:last-child {
    border-bottom-left-radius: $border-radius;
    border-bottom-right-radius: $border-radius;
  }

  &:hover:not(.custom-select__option--disabled) {
    background-color: $overlay-light;
  }

  &--selected {
    background-color: rgba($accent-green, 0.1);
    color: $accent-green;
    font-weight: $font-weight-medium;
  }

  &--disabled {
    color: $text-disabled;
    cursor: not-allowed;
    opacity: 0.5;
  }
}

@keyframes dropdownFadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

// 响应式适配
@include respond-to("sm") {
  .custom-select {
    &--small {
      .custom-select__trigger {
        min-height: 36px;
      }
    }

    &--medium {
      .custom-select__trigger {
        min-height: 44px;
      }
    }

    &--large {
      .custom-select__trigger {
        min-height: 52px;
      }
    }
  }
}

// 高对比度模式支持
@media (prefers-contrast: high) {
  .custom-select {
    .custom-select__trigger,
    .custom-select__dropdown {
      border-width: 2px;
    }

    &--open .custom-select__trigger {
      border-color: $text-primary;
    }
  }
}

// 减少动画模式支持
@media (prefers-reduced-motion: reduce) {
  .custom-select,
  .custom-select__trigger,
  .custom-select__arrow,
  .custom-select__option {
    transition: none !important;
  }

  .custom-select__dropdown {
    animation: none !important;
  }
}
</style>
