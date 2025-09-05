<script setup>
import { ref, computed, watch } from 'vue';
import { usePlaylistStore } from '../../store/playlist';
import FAIcon from '../common/FAIcon.vue';
import CustomButton from '../custom/CustomButton.vue';

const playlistStore = usePlaylistStore();

// 错误提示
const errorMessage = ref('');
// 是否显示成功提示
const showSuccess = ref(false);

// 是否为编辑模式
const isEditMode = computed(() => playlistStore.isEditMode);
// 对话框标题
const dialogTitle = computed(() => isEditMode.value ? '编辑歌单' : '创建歌单');

// 监听错误信息
watch(() => playlistStore.error, (newError) => {
    if (newError) {
        errorMessage.value = newError;
    }
});

// 保存歌单
async function handleSavePlaylist() {
    // 重置错误和成功提示
    errorMessage.value = '';
    showSuccess.value = false;

    // 表单验证
    if (!playlistStore.editingPlaylist.name.trim()) {
        errorMessage.value = '歌单名称不能为空';
        return;
    }

    // 保存歌单
    const result = await playlistStore.savePlaylist();

    if (result.success) {
        showSuccess.value = true;
        // 1秒后关闭对话框
        setTimeout(() => {
            playlistStore.closePlaylistDialog();
            showSuccess.value = false;
        }, 1000);
    } else {
        errorMessage.value = result.error || '保存歌单失败';
    }
}
</script>

<template>
    <div class="modal-overlay" v-if="playlistStore.showPlaylistDialog"
        @click.self="playlistStore.closePlaylistDialog()">
        <div class="modal-content" @click.stop>
            <div class="modal-header">
                <h3 class="modal-title">{{ dialogTitle }}</h3>
                <CustomButton type="icon-only" icon="times" size="medium" @click="playlistStore.closePlaylistDialog()" />
            </div>

            <div class="modal-body">
                <!-- 错误提示 -->
                <div class="message error-message" v-if="errorMessage">
                    <FAIcon name="exclamation-circle" size="medium" color="danger" />
                    {{ errorMessage }}
                </div>

                <!-- 成功提示 -->
                <div class="message success-message" v-if="showSuccess">
                    <FAIcon name="check-circle" size="medium" color="accent" />
                    操作成功
                </div>

                <form @submit.prevent="handleSavePlaylist">
                    <div class="form-group">
                        <label for="playlist-name" class="form-label">歌单名称</label>
                        <input type="text" id="playlist-name" class="form-input"
                            v-model="playlistStore.editingPlaylist.name" placeholder="请输入歌单名称" autofocus>
                    </div>

                    <div class="form-group">
                        <label for="playlist-desc" class="form-label">描述 (可选)</label>
                        <textarea id="playlist-desc" class="form-textarea"
                            v-model="playlistStore.editingPlaylist.description" placeholder="请输入歌单描述"
                            rows="3"></textarea>
                    </div>

                    <div class="button-group">
                        <CustomButton type="secondary" @click="playlistStore.closePlaylistDialog()">
                            取消
                        </CustomButton>
                        <CustomButton type="primary" :disabled="playlistStore.loading" @click="$event.target.closest('form').requestSubmit()">
                            <span v-if="playlistStore.loading">保存中...</span>
                            <span v-else>保存</span>
                        </CustomButton>
                    </div>
                </form>
            </div>
        </div>
    </div>
</template>

<style lang="scss" scoped>
@use "sass:color";

.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: $overlay-dark;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: $z-modal;
    animation: fadeIn $transition-fast ease-out;
}

@keyframes fadeIn {
    from {
        opacity: 0;
    }

    to {
        opacity: 1;
    }
}

.modal-content {
    background-color: $bg-tertiary;
    border-radius: $border-radius;
    width: 400px;
    max-width: 90%;
    box-shadow: $box-shadow-hover;
    animation: modalIn $transition-slow ease-out;
    border: 1px solid $bg-tertiary;
    overflow: hidden;

    @include respond-to("sm") {
        width: 320px;
        max-width: 95%;
    }
}

@keyframes modalIn {
    from {
        opacity: 0;
        transform: translateY(-20px) scale(0.95);
    }

    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: $content-padding (
        $content-padding * 1.25
    );
background-color: $bg-secondary;
border-bottom: 1px solid $bg-tertiary;

@include respond-to("sm") {
    padding: ($content-padding * 0.75) $content-padding;
}
}

.modal-title {
    margin: 0;
    color: $text-primary;
    font-size: $font-size-lg;
    font-weight: $font-weight-medium;

    @include respond-to("sm") {
        font-size: $font-size-base;
    }
}

.close-btn {
    background: none;
    border: none;
    color: $text-secondary;
    cursor: pointer;
    padding: ($content-padding * 0.375);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: $border-radius;
    transition: all $transition-base;
    min-width: 32px;
    min-height: 32px;

    &:hover {
        color: $text-primary;
        background-color: $overlay-light;
        transform: scale(1.05);
    }

    &:active {
        transform: scale(0.95);
    }

    @include respond-to("sm") {
        min-width: 28px;
        min-height: 28px;
        padding: ($content-padding * 0.25);
    }
}



.modal-body {
    padding: ($content-padding * 1.25);

    @include respond-to("sm") {
        padding: $content-padding;
    }
}

.message {
    display: flex;
    align-items: center;
    gap: ($content-padding * 0.75);
    padding: ($content-padding * 0.75) $content-padding;
    border-radius: $border-radius;
    margin-bottom: $content-padding;
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    animation: slideIn $transition-base ease-out;

    @include respond-to("sm") {
        gap: ($content-padding * 0.5);
        padding: ($content-padding * 0.5) ($content-padding * 0.75);
        font-size: $font-size-xs;
    }
}

@keyframes slideIn {
    from {
        opacity: 0;
        transform: translateY(-10px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}



.error-message {
    background-color: rgba($danger, 0.1);
    border: 1px solid rgba($danger, 0.3);
    color: $danger;
}

.success-message {
    background-color: rgba($accent-green, 0.1);
    border: 1px solid rgba($accent-green, 0.3);
    color: $accent-green;
}

.form-group {
    margin-bottom: $content-padding;

    &:last-of-type {
        margin-bottom: ($content-padding * 1.5);
    }

    @include respond-to("sm") {
        margin-bottom: ($content-padding * 0.75);

        &:last-of-type {
            margin-bottom: $content-padding;
        }
    }
}

.form-label {
    display: block;
    margin-bottom: ($content-padding * 0.375);
    color: $text-secondary;
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;

    @include respond-to("sm") {
        font-size: $font-size-xs;
        margin-bottom: ($content-padding * 0.25);
    }
}

.form-input,
.form-textarea {
    width: 100%;
    padding: ($content-padding * 0.75) $content-padding;
    border: 1px solid $bg-tertiary;
    border-radius: $border-radius;
    background-color: $bg-secondary;
    color: $text-primary;
    font-size: $font-size-base;
    box-sizing: border-box;
    transition: all $transition-base;
    font-family: inherit;

    &::placeholder {
        color: $text-disabled;
    }

    &:focus {
        border-color: $accent-green;
        outline: none;
        box-shadow: 0 0 0 2px rgba($accent-green, 0.2);
    }

    &:hover:not(:focus) {
        border-color: color.adjust($bg-tertiary, $lightness: 10%);
    }

    @include respond-to("sm") {
        padding: ($content-padding * 0.5) ($content-padding * 0.75);
        font-size: $font-size-sm;
    }
}

.form-textarea {
    resize: vertical;
    min-height: 80px;
    line-height: 1.5;

    @include respond-to("sm") {
        min-height: 70px;
    }
}

.button-group {
    display: flex;
    justify-content: flex-end;
    gap: ($content-padding * 0.75);
    margin-top: ($content-padding * 1.25);

    @include respond-to("sm") {
        gap: ($content-padding * 0.5);
        margin-top: $content-padding;
    }
}

.btn {
    padding: ($content-padding * 0.5) ($content-padding * 1.25);
    border-radius: $border-radius;
    cursor: pointer;
    font-size: $font-size-base;
    border: none;
    font-weight: $font-weight-medium;
    transition: all $transition-base;
    min-width: 80px;
    display: flex;
    align-items: center;
    justify-content: center;

    &:active {
        transform: translateY(1px);
    }

    @include respond-to("sm") {
        padding: ($content-padding * 0.375) $content-padding;
        font-size: $font-size-sm;
        min-width: 70px;
    }
}

.btn--secondary {
    background-color: transparent;
    color: $text-secondary;
    border: 1px solid $bg-tertiary;

    &:hover:not(:disabled) {
        background-color: $overlay-light;
        color: $text-primary;
        border-color: color.adjust($bg-tertiary, $lightness: 10%);
    }
}

.btn--primary {
    background-color: $accent-green;
    color: $text-primary;

    &:hover:not(:disabled) {
        background-color: $accent-hover;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba($accent-green, 0.3);
    }

    &:disabled {
        background-color: $bg-tertiary;
        color: $text-disabled;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;

        &:hover {
            background-color: $bg-tertiary;
            transform: none;
            box-shadow: none;
        }
    }
}

// 高对比度模式支持
@media (prefers-contrast: high) {
    .modal-content {
        border: 2px solid $text-primary;
    }

    .form-input,
    .form-textarea {
        border-width: 2px;
    }

    .btn {
        border-width: 2px;
    }
}

// 减少动画模式支持
@media (prefers-reduced-motion: reduce) {

    .modal-overlay,
    .modal-content,
    .message,
    .btn,
    .close-btn,
    .form-input,
    .form-textarea {
        animation: none;
        transition: none;
    }

    .btn:hover,
    .btn:active,
    .close-btn:hover,
    .close-btn:active {
        transform: none;
    }
}
</style>