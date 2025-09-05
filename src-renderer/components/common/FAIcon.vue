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
</script>

<template>
    <i :class="iconClasses" aria-hidden="true"></i>
</template>

<style lang="scss" scoped>
// Font Awesome 图标基础样式
.fa {
    display: inline-block;
    vertical-align: middle;
    transition: color $transition-base;
}

// 图标尺寸样式
.icon--small {
    font-size: 12px;
}

.icon--medium {
    font-size: 16px;
}

.icon--large {
    font-size: 20px;
}

.icon--xl {
    font-size: 24px;
}

// 图标颜色样式
.icon--primary {
    color: $text-primary;
}

.icon--secondary {
    color: $text-secondary;
}

.icon--accent {
    color: $accent-green;
}

.icon--danger {
    color: $danger;
}

// 可点击图标样式
.icon--clickable {
    cursor: pointer;
    transition: color $transition-base, transform $transition-fast;

    &:hover {
        color: $accent-hover;
        transform: scale(1.1);
    }

    &:active {
        transform: scale(0.95);
    }
}
</style>