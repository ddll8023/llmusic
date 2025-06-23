<script setup>
import { ref, computed, watch } from 'vue';
import { usePlaylistStore } from '../store/playlist';

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
                <h3>{{ dialogTitle }}</h3>
                <button class="close-btn" @click="playlistStore.closePlaylistDialog()">&times;</button>
            </div>

            <div class="modal-body">
                <!-- 错误提示 -->
                <div class="error-message" v-if="errorMessage">{{ errorMessage }}</div>
                <!-- 成功提示 -->
                <div class="success-message" v-if="showSuccess">操作成功</div>

                <form @submit.prevent="handleSavePlaylist">
                    <div class="form-group">
                        <label for="playlist-name">歌单名称</label>
                        <input type="text" id="playlist-name" v-model="playlistStore.editingPlaylist.name"
                            placeholder="请输入歌单名称" autofocus>
                    </div>

                    <div class="form-group">
                        <label for="playlist-desc">描述 (可选)</label>
                        <textarea id="playlist-desc" v-model="playlistStore.editingPlaylist.description"
                            placeholder="请输入歌单描述" rows="3"></textarea>
                    </div>

                    <div class="button-group">
                        <button type="button" class="cancel-btn"
                            @click="playlistStore.closePlaylistDialog()">取消</button>
                        <button type="submit" class="save-btn" :disabled="playlistStore.loading">
                            <span v-if="playlistStore.loading">保存中...</span>
                            <span v-else>保存</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</template>

<style scoped>
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.modal-content {
    background-color: #282828;
    border-radius: 8px;
    width: 400px;
    max-width: 90%;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    animation: modal-in 0.3s ease;
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid #333;
}

.modal-header h3 {
    margin: 0;
    color: #fff;
    font-size: 18px;
}

.close-btn {
    background: none;
    border: none;
    color: #aaa;
    font-size: 24px;
    cursor: pointer;
    transition: color 0.2s;
}

.close-btn:hover {
    color: #fff;
}

.modal-body {
    padding: 20px;
}

.form-group {
    margin-bottom: 16px;
}

.form-group label {
    display: block;
    margin-bottom: 6px;
    color: #ddd;
    font-size: 14px;
}

.form-group input,
.form-group textarea {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #444;
    border-radius: 4px;
    background-color: #333;
    color: #fff;
    font-size: 14px;
    box-sizing: border-box;
}

.form-group input:focus,
.form-group textarea:focus {
    border-color: #1db954;
    outline: none;
}

.button-group {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 20px;
}

.cancel-btn,
.save-btn {
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    border: none;
    font-weight: 500;
    transition: all 0.2s;
}

.cancel-btn {
    background-color: transparent;
    color: #ddd;
    border: 1px solid #555;
}

.cancel-btn:hover {
    background-color: #333;
    color: #fff;
}

.save-btn {
    background-color: #1db954;
    color: #fff;
}

.save-btn:hover:not(:disabled) {
    background-color: #1ed760;
    transform: translateY(-1px);
}

.save-btn:disabled {
    background-color: #333;
    color: #777;
    cursor: not-allowed;
}

.error-message {
    padding: 8px 12px;
    background-color: rgba(220, 53, 69, 0.2);
    border: 1px solid #dc3545;
    border-radius: 4px;
    color: #ff6b6b;
    margin-bottom: 16px;
    font-size: 14px;
}

.success-message {
    padding: 8px 12px;
    background-color: rgba(40, 167, 69, 0.2);
    border: 1px solid #28a745;
    border-radius: 4px;
    color: #6dff9e;
    margin-bottom: 16px;
    font-size: 14px;
}

@keyframes modal-in {
    from {
        opacity: 0;
        transform: translateY(-20px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}
</style>