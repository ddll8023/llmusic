<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue';
import { useMediaStore } from '../../store/media';
import FAIcon from '../common/FAIcon.vue';
import SongTable from '../common/SongTable.vue';
import TagEditor from '../common/TagEditor.vue';
import CustomButton from '../custom/CustomButton.vue';
import CustomInput from '../custom/CustomInput.vue';
import CustomModal from '../custom/CustomModal.vue';

const selectedSongs = ref<any[]>([]);
const searchQuery = ref('');
const isLoading = ref(false);

// 清除确认对话框状态
const showClearConfirm = ref(false);
const isClearing = ref(false);

// 标签编辑器相关
const tagEditorRef = ref<any>(null);

// 在线搜索状态
const onlineSearchStatus = ref('idle'); // idle, loading, success, error
const onlineSearchResults = ref<any[]>([]);
const selectedOnlineResult = ref<any>(null);
const currentSearchingSong = ref<any>(null);

// MetadataManager专用的歌曲列表（只显示用户导入的歌曲）
const localSongs = ref<any[]>([]);

// 工作区封面缓存（独立于数据库）
const workspaceCoverCache = reactive<Record<string, any>>({});

// 文件导入相关
const isImporting = ref(false);
const isDragging = ref(false);
const importStatus = ref('idle'); // idle, importing, success, error
const importResultMessage = ref('');

// SongTable组件引用
const songTableRef = ref<any>(null);

// 计算属性：过滤后的歌曲列表（只显示localSongs中的歌曲）
const filteredSongs = computed(() => {
    if (!searchQuery.value) {
        return localSongs.value;
    }

    const query = searchQuery.value.toLowerCase();
    return localSongs.value.filter(song =>
        song.title?.toLowerCase().includes(query) ||
        song.artist?.toLowerCase().includes(query) ||
        song.album?.toLowerCase().includes(query)
    );
});

// 选中的歌曲ID数组
const selectedSongIds = computed<string[]>(() => selectedSongs.value.map(song => song.id));

// 处理SongTable的选择变化
const handleSelectionChange = ({ selectedIds }: { selectedIds: any[] }) => {
    selectedSongs.value = filteredSongs.value.filter(song => selectedIds.includes(song.id));
};

// 处理SongTable的操作按钮点击
const handleActionClick = ({ action, song }: { action: any; song: any }) => {
    switch (action) {
        case 'edit':
            editSong(song);
            break;
        case 'search-online':
            searchOnlineMetadata(song);
            break;
    }
};

// 选择歌曲（保留原有方法供兼容）
const toggleSelectSong = (song: any) => {
    const index = selectedSongs.value.findIndex(s => s.id === song.id);
    if (index >= 0) {
        selectedSongs.value.splice(index, 1);
    } else {
        selectedSongs.value.push(song);
    }
};

// 编辑单首歌曲（工作区模式）
const editSong = (song: any) => {
    if (tagEditorRef.value) {
        // 使用工作区专用的编辑器方法
        tagEditorRef.value.openEditorForFile(song);
    }
};

// 导入音乐文件
const importMusicFiles = async () => {
    try {
        // 调用Electron对话框选择文件
        if (!window.electronAPI || !window.electronAPI.showOpenDialog) {
            throw new Error('electronAPI.showOpenDialog 方法未定义，请检查预加载脚本');
        }

        const result = await (window.electronAPI.showOpenDialog({
            title: '选择音乐文件',
            filters: [
                { name: '音频文件', extensions: ['mp3', 'flac', 'wav', 'm4a', 'ogg', 'aac'] }
            ],
            properties: ['openFile', 'multiSelections']
        }) as any);

        if (result.canceled || result.filePaths.length === 0) {
            return;
        }

        await processImportFiles(result.filePaths);
    } catch (error) {
        console.error('导入文件失败:', error);
        importStatus.value = 'error';
        importResultMessage.value = `导入失败: ${(error as any).message}`;
    }
};

// 处理导入的文件
const processImportFiles = async (filePaths: any) => {
    if (!filePaths || filePaths.length === 0) return;

    isImporting.value = true;
    importStatus.value = 'importing';
    importResultMessage.value = '';

    try {
        // 直接解析文件元数据，不添加到数据库（保持工作区独立）
        let successCount = 0;
        const failedFiles = [];

        // 循环处理每个文件
        for (const filePath of filePaths) {
            try {
                const parseResult = await window.electronAPI.parseSongFromFile(filePath);

                if (parseResult.success && parseResult.song) {
                    // 检查是否已存在于工作区，避免重复
                    const existingIndex = localSongs.value.findIndex(song =>
                        song.filePath === parseResult.song!.filePath
                    );

                    if (existingIndex === -1) {
                        // 添加新歌曲到工作区
                        localSongs.value.push(parseResult.song);
                        successCount++;

                        // 异步加载封面
                        loadWorkspaceSongCover(parseResult.song);
                    } else {
                        // 更新现有歌曲信息
                        localSongs.value[existingIndex] = parseResult.song;
                        successCount++;

                        // 重新加载封面
                        loadWorkspaceSongCover(parseResult.song);
                    }
                } else {
                    failedFiles.push(filePath);
                }
            } catch (parseError) {
                console.error(`解析文件失败: ${filePath}`, parseError);
                failedFiles.push(filePath);
            }
        }

        // 设置导入结果
        if (successCount > 0) {
            importStatus.value = 'success';
            importResultMessage.value = `成功添加 ${successCount} 首歌曲到工作区`;

            if (failedFiles.length > 0) {
                importResultMessage.value += `，${failedFiles.length} 个文件解析失败`;
            }
        } else {
            importStatus.value = 'error';
            importResultMessage.value = `所有文件解析失败${failedFiles.length > 0 ? `，失败文件：${failedFiles.slice(0, 3).join(', ')}${failedFiles.length > 3 ? '...' : ''}` : ''}`;
        }
    } catch (error) {
        console.error('处理导入文件失败:', error);
        importStatus.value = 'error';
        importResultMessage.value = `处理失败: ${(error as any).message}`;
    } finally {
        isImporting.value = false;
    }
};

// 拖拽相关处理
const handleDragOver = (event: any) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    isDragging.value = true;
};

const handleDragLeave = (event: any) => {
    event.preventDefault();
    if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget)) {
        isDragging.value = false;
    }
};

const handleDrop = async (event: any) => {
    event.preventDefault();
    isDragging.value = false;

    const files = Array.from(event.dataTransfer.files) as any[];
    const audioFiles = files.filter(file => {
        const ext = file.name.split('.').pop().toLowerCase();
        return ['mp3', 'flac', 'wav', 'm4a', 'ogg', 'aac'].includes(ext);
    });

    if (audioFiles.length === 0) {
        importStatus.value = 'error';
        importResultMessage.value = '没有发现有效的音频文件';
        return;
    }

    const filePaths = audioFiles.map(file => file.path);
    if (!filePaths || filePaths.length === 0) {
        importStatus.value = 'error';
        importResultMessage.value = '无法获取文件路径';
        return;
    }

    await processImportFiles(filePaths);
};

// 搜索在线元数据
const searchOnlineMetadata = async (song: any) => {
    if (!song) return;

    currentSearchingSong.value = song;
    onlineSearchStatus.value = 'loading';
    onlineSearchResults.value = [];
    selectedOnlineResult.value = null;

    try {
        // 构造搜索查询
        const searchUrl = `${song.title} ${song.artist || ''}`;
        const searchParams = {
            requestId: Date.now().toString(),
            urlType: 'song',
            searchUrl: searchUrl,
            page: 1,
            pageSize: 10
        };

        // 调用Python API搜索
        const result = await (window.electronAPI.searchOnlineMetadata(searchParams as any) as any);

        if (result && result.code === 200 && result.data && result.data.length > 0) {
            onlineSearchResults.value = result.data;
            onlineSearchStatus.value = 'success';
        } else {
            onlineSearchStatus.value = 'error';
        }
    } catch (error) {
        console.error('搜索在线元数据失败:', error);
        onlineSearchStatus.value = 'error';
    }
};

// 应用在线元数据
const applyOnlineMetadata = async (song: any, onlineData: any) => {
    if (!song || !onlineData) return;

    isLoading.value = true;

    try {
        // 构造新的标签数据
        const newTags = {
            title: onlineData.songName || song.title,
            artist: onlineData.singer || song.artist,
            album: onlineData.album?.albumName || song.album,
            year: onlineData.createTime ? new Date(onlineData.createTime).getFullYear().toString() : song.year
        };

        // 更新标签
        const updateResult = await (window.electronAPI.updateSongTags(song.id, newTags) as any);

        if (updateResult && updateResult.success) {
            alert('元数据更新成功！');
        } else {
            alert('更新标签失败: ' + (updateResult.error || '未知错误'));
        }
    } catch (error) {
        console.error('应用在线元数据失败:', error);
        alert('应用在线元数据失败: ' + (error as any).message);
    } finally {
        isLoading.value = false;
    }
};

// 全选/取消全选
const toggleSelectAll = () => {
    if (selectedSongs.value.length === filteredSongs.value.length) {
        // 取消全选
        selectedSongs.value = [];
    } else {
        // 全选
        selectedSongs.value = [...filteredSongs.value];
    }
};

// 清除工作区
const clearWorkspace = () => {
    showClearConfirm.value = false;
    isClearing.value = true;

    // 直接清除本地状态，不涉及数据库操作
    resetAllStates();

    importStatus.value = 'success';
    importResultMessage.value = '工作区已清空';

    isClearing.value = false;

    // 3秒后自动清除状态信息
    setTimeout(() => {
        importStatus.value = 'idle';
        importResultMessage.value = '';
    }, 3000);
};

// 显示清除工作区确认对话框
const showClearWorkspaceDialog = () => {
    if (localSongs.value.length === 0) {
        importStatus.value = 'error';
        importResultMessage.value = '工作区为空，无需清除';
        return;
    }
    showClearConfirm.value = true;
};

// 加载工作区歌曲封面
const loadWorkspaceSongCover = async (song: any) => {
    if (!song || !song.filePath || workspaceCoverCache[song.id]) {
        return; // 如果已有缓存则跳过
    }

    try {
        const result = await (window.electronAPI.getCoverFromFile(song.filePath) as any);
        if (result.success && result.cover) {
            const imageFormat = result.format || 'image/jpeg';
            workspaceCoverCache[song.id] = `data:${imageFormat};base64,${result.cover}`;
        }
    } catch (error) {
        console.error('加载工作区封面失败:', error);
    }
};

// 重置所有状态
const resetAllStates = () => {
    selectedSongs.value = [];
    searchQuery.value = '';
    localSongs.value = [];
    // 清空封面缓存
    Object.keys(workspaceCoverCache).forEach(key => delete workspaceCoverCache[key]);
    onlineSearchStatus.value = 'idle';
    onlineSearchResults.value = [];
    selectedOnlineResult.value = null;
    currentSearchingSong.value = null;
    importStatus.value = 'idle';
    importResultMessage.value = '';
    showClearConfirm.value = false;
    isClearing.value = false;
    isLoading.value = false;
    isDragging.value = false;
};

// 初始化
onMounted(async () => {
    // MetadataManager 初始化完成
});
</script>

<template>
    <div class="w-full h-full flex flex-col p-4 max-md:p-3 text-content-base overflow-hidden relative"
        :class="isDragging ? 'border-[3px] border-dashed border-accent-green bg-accent-green/5' : ''"
        @dragover="handleDragOver" @dragleave="handleDragLeave" @drop="handleDrop">

        <div class="flex justify-between items-center mb-4 max-md:flex-col max-md:items-start max-md:gap-3 max-md:mb-3">
            <h1 class="text-xl font-medium">音乐元数据管理</h1>
            <div class="w-[300px] max-md:w-full">
                <CustomInput :model-value="searchQuery" @update:model-value="(val: any) => searchQuery = (val as string)" type="text"
                    placeholder="搜索歌曲..." prefix-icon="search" size="medium" />
            </div>
        </div>

        <div class="flex gap-2.5 mb-4 max-md:flex-wrap max-md:gap-2">
            <CustomButton type="primary" :disabled="isImporting" :loading="isImporting" icon="download"
                @click="importMusicFiles">
                {{ isImporting ? '正在导入...' : '导入歌曲' }}
            </CustomButton>

            <CustomButton type="secondary" @click="toggleSelectAll">
                {{ selectedSongs.length === filteredSongs.length ? '取消全选' : '全选' }}
            </CustomButton>
            <CustomButton type="secondary" :disabled="isClearing" :loading="isClearing" icon="trash"
                @click="showClearWorkspaceDialog">
                {{ isClearing ? '清除中...' : '清空工作区' }}
            </CustomButton>
        </div>

        <!-- 导入状态提示 -->
        <div v-if="importStatus !== 'idle'" class="p-3 mb-[15px] rounded flex justify-between items-center"
            :class="importStatus === 'importing' ? 'bg-accent-info' : importStatus === 'success' ? 'bg-accent-green' : 'bg-accent-danger'">
            <div class="flex items-center gap-2">
                <FAIcon :name="importStatus === 'importing' ? 'spinner' :
                    importStatus === 'success' ? 'check' : 'exclamation-triangle'" size="small"
                    :color="importStatus === 'success' ? 'accent' : importStatus === 'error' ? 'danger' : 'primary'"
                    :class="importStatus === 'importing' ? 'spin' : ''" />
                <span>{{ importResultMessage || (importStatus === 'importing' ? '正在导入音乐文件...' : '') }}</span>
            </div>
            <CustomButton v-if="importStatus !== 'importing'" type="icon-only" size="small" icon="times"
                @click="importStatus = 'idle'" title="关闭" />
        </div>

        <div class="flex-1 flex overflow-hidden relative">
            <!-- 歌曲表格 -->
            <SongTable ref="songTableRef" :songs="filteredSongs as any" :loading="isLoading" :show-sortable="false"
                :show-play-count="false" :show-action-column="true" :action-column-type="'metadata'"
                :show-selection="true" :selected-song-ids="selectedSongIds" :context-menu-type="'metadata'"
                :current-list-id="'metadata'" :empty-text="'请导入音乐文件或拖拽文件到此区域'" :empty-icon="'upload'"
                container-height="100%" :external-cover-cache="workspaceCoverCache as any"
                @action-click="handleActionClick"
                @selection-change="handleSelectionChange" />

            <!-- 在线搜索面板 -->
            <div v-if="onlineSearchStatus !== 'idle'"
                class="absolute right-0 top-0 bottom-0 w-[350px] bg-surface-elevated rounded-lg shadow-md flex flex-col z-[100] max-md:w-full max-md:fixed max-md:inset-0 max-md:rounded-none">
                <div class="flex justify-between items-center p-[15px] border-b border-line-base">
                    <h3 class="m-0 text-sm">在线元数据搜索结果</h3>
                    <CustomButton type="icon-only" size="small" icon="times"
                        @click="onlineSearchStatus = 'idle'; currentSearchingSong = null" title="关闭" />
                </div>
                <div class="flex-1 overflow-auto p-[15px]">
                    <div v-if="onlineSearchStatus === 'loading'"
                        class="flex flex-col items-center justify-center py-10 text-content-secondary text-center">
                        <FAIcon name="spinner" size="large" color="primary" class="spin mb-2.5" />
                        <span>搜索中...</span>
                    </div>
                    <div v-else-if="onlineSearchStatus === 'error'"
                        class="flex flex-col items-center justify-center py-10 text-content-secondary text-center">
                        <FAIcon name="exclamation-triangle" size="large" color="danger" />
                        <span>搜索失败，请重试</span>
                    </div>
                    <div v-else-if="onlineSearchResults.length === 0"
                        class="flex flex-col items-center justify-center py-10 text-content-secondary text-center">
                        未找到匹配的在线元数据
                    </div>
                    <div v-else class="flex flex-col gap-2.5">
                        <div v-for="result in onlineSearchResults" :key="result.songId"
                            class="p-2.5 rounded-[6px] cursor-pointer transition-all duration-200 border border-transparent hover:bg-surface-overlay"
                            :class="selectedOnlineResult === result ? 'bg-surface-overlay border-accent-green' : ''"
                            @click="selectedOnlineResult = result">
                            <div class="font-medium text-xs mb-1">{{ result.songName }}</div>
                            <div class="text-[10px] text-content-secondary">
                                <span>{{ result.singer }}</span>
                                <span class="mx-1">-</span>
                                <span>{{ result.album?.albumName }}</span>
                            </div>
                        </div>
                        <div class="mt-4 flex justify-center" v-if="selectedOnlineResult">
                            <CustomButton type="primary" :disabled="isLoading" :loading="isLoading"
                                @click="applyOnlineMetadata(currentSearchingSong, selectedOnlineResult)">
                                {{ isLoading ? '应用中...' : '应用选中元数据' }}
                            </CustomButton>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 拖拽区域提示 -->
        <div v-if="isDragging" class="absolute inset-0 bg-overlay-dark flex justify-center items-center z-[300] rounded-lg">
            <div class="text-center text-content-base bg-accent-green/20 p-10 rounded-xl border-2 border-dashed border-accent-green max-md:p-4">
                <FAIcon name="upload" size="xl" color="accent" />
                <h2 class="mt-[15px] mb-2 text-4xl max-md:text-xl">松开鼠标导入音乐文件</h2>
                <p class="text-xs text-content-secondary mt-[5px]">支持 MP3, FLAC, WAV, M4A, OGG, AAC 格式</p>
            </div>
        </div>

        <CustomModal :show="showClearConfirm" title="确认清空工作区" confirm-text="清空工作区" confirm-type="primary" width="480px" @close="showClearConfirm = false" @confirm="clearWorkspace" @cancel="showClearConfirm = false">
            <p class="mb-3 text-content-base text-sm">您确定要清空当前工作区吗？这将清除您在此次会话中导入的歌曲列表。</p>
            <p class="bg-accent-green/10 border border-accent-green/30 rounded p-2 px-3 text-[10px] mb-3">
                <strong>说明：</strong>此操作只会清空工作区内容，不会影响音乐库中的数据，也不会删除您的音乐文件。
            </p>
            <div class="bg-overlay-light rounded p-2 px-3 text-xs text-content-base">
                工作区中共有 <strong>{{ localSongs.length }}</strong> 首歌曲将被清除
            </div>
        </CustomModal>

        <!-- 标签编辑器组件 -->
        <TagEditor ref="tagEditorRef" />
    </div>
</template>
