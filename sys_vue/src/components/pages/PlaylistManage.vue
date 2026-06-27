<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { usePlaylistStore } from '../../store/playlist';
import FAIcon from '../common/FAIcon.vue';
import CustomButton from '../custom/CustomButton.vue';
import CustomInput from '../custom/CustomInput.vue';

const playlistStore = usePlaylistStore();

const errorMessage = ref('');
const showSuccess = ref(false);

const isEditMode = computed(() => playlistStore.isEditMode);
const dialogTitle = computed(() => isEditMode.value ? '编辑歌单' : '创建歌单');

watch(() => playlistStore.error, (newError) => { if (newError) errorMessage.value = newError; });

async function handleSavePlaylist() {
    errorMessage.value = '';
    showSuccess.value = false;
    if (!playlistStore.editingPlaylist.name.trim()) { errorMessage.value = '歌单名称不能为空'; return; }
    const result = await playlistStore.savePlaylist();
    if (result.success) {
        showSuccess.value = true;
        setTimeout(() => { playlistStore.closePlaylistDialog(); showSuccess.value = false; }, 1000);
    } else { errorMessage.value = result.error || '保存歌单失败'; }
}
</script>

<template>
    <div v-if="playlistStore.showPlaylistDialog"
        class="fixed inset-0 bg-overlay-dark flex items-center justify-center z-[100]"
        @click.self="playlistStore.closePlaylistDialog()">
        <div class="bg-surface-overlay rounded w-[400px] max-w-[90%] shadow-custom-hover border border-surface-overlay overflow-hidden
                    max-sm:w-[320px] max-sm:max-w-[95%]"
            @click.stop>
            <div class="flex justify-between items-center p-4 px-5 bg-surface-elevated border-b border-surface-overlay max-sm:p-3 max-sm:px-4">
                <h3 class="m-0 text-lg font-medium text-content-base max-sm:text-base">{{ dialogTitle }}</h3>
                <CustomButton type="icon-only" icon="times" size="medium" @click="playlistStore.closePlaylistDialog()" />
            </div>

            <div class="p-5 max-sm:p-4">
                <div v-if="errorMessage"
                    class="flex items-center gap-3 px-4 py-3 rounded mb-4 bg-accent-danger/10 text-accent-danger text-sm">
                    <FAIcon name="exclamation-circle" size="medium" color="danger" />
                    {{ errorMessage }}
                </div>

                <div v-if="showSuccess"
                    class="flex items-center gap-3 px-4 py-3 rounded mb-4 bg-accent-green/10 text-accent-green text-sm">
                    <FAIcon name="check-circle" size="medium" color="accent" />
                    操作成功
                </div>

                <form @submit.prevent="handleSavePlaylist" class="flex flex-col gap-4">
                    <div class="flex flex-col gap-1.5">
                        <label for="playlist-name" class="text-xs font-medium text-content-base">歌单名称</label>
                        <CustomInput type="text" v-model="playlistStore.editingPlaylist.name" placeholder="请输入歌单名称" label="歌单名称" />
                    </div>

                    <div class="flex flex-col gap-1.5">
                        <label for="playlist-desc" class="text-xs font-medium text-content-base">描述 (可选)</label>
                        <textarea id="playlist-desc"
                            class="w-full px-3 py-2 text-sm bg-surface-base border border-line-base rounded text-content-base
                                   placeholder:text-content-disabled focus:border-accent-green focus:outline-none transition-colors duration-200 resize-none"
                            v-model="playlistStore.editingPlaylist.description" placeholder="请输入歌单描述" rows="3"></textarea>
                    </div>

                    <div class="flex justify-end gap-3 mt-2">
                        <CustomButton type="secondary" @click="playlistStore.closePlaylistDialog()">取消</CustomButton>
                        <CustomButton type="primary" :disabled="playlistStore.loading" @click="playlistStore.savePlaylist()">
                            <span v-if="playlistStore.loading">保存中...</span>
                            <span v-else>保存</span>
                        </CustomButton>
                    </div>
                </form>
            </div>
        </div>
    </div>
</template>
