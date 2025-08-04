<script setup>
import { computed } from 'vue';

const props = defineProps({
    name: {
        type: String,
        required: true,
    },
    size: {
        type: String,
        default: 'medium',
        validator: (value) => ['small', 'medium', 'large', 'xl'].includes(value)
    },
    color: {
        type: String,
        default: 'primary',
        validator: (value) => ['primary', 'secondary', 'accent', 'danger'].includes(value)
    },
    clickable: {
        type: Boolean,
        default: false
    }
});

const emit = defineEmits(['click']);

// 计算图标的CSS类
const iconClasses = computed(() => {
    const classes = ['fa', `fa-${props.name}`];

    // 尺寸类
    classes.push(`icon--${props.size}`);

    // 颜色类
    classes.push(`icon--${props.color}`);

    // 交互状态类
    if (props.clickable) {
        classes.push('icon--clickable');
    }

    return classes;
});

// 处理点击事件
const handleClick = (event) => {
    if (props.clickable) {
        emit('click', event);
    }
};
</script>

<template>
    <i :class="iconClasses" @click="handleClick" aria-hidden="true"></i>
</template>

<style lang="scss" scoped>
// 导入样式变量
@use "../../styles/variables/_colors" as *;
@use "../../styles/variables/_layout" as *;

// Font Awesome 图标基础样式
.fa {
    display: inline-block;
    vertical-align: middle;
    transition: color $transition-base;
}
</style>