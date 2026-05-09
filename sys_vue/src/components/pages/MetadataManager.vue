<script setup>
import { ref, computed, onMounted, onUnmounted, watch, reactive } from 'vue';
import { useMediaStore } from '../../store/media';
import FAIcon from '../common/FAIcon.vue';
import SongTable from '../common/SongTable.vue';
import TagEditor from '../common/TagEditor.vue';
import CustomButton from '../custom/CustomButton.vue';
import CustomInput from '../custom/CustomInput.vue';

const selectedSongs = ref([]);
const searchQuery = ref('');
const isLoading = ref(false);

// 清除确认对话框状态
const showClearConfirm = ref(false);
const isClearing = ref(false);

// 标签编辑器相关
const tagEditorRef = ref(null);

// 在线搜索状态
const onlineSearchStatus = ref('idle'); // idle, loading, success, error
const onlineSearchResults = ref([]);
const selectedOnlineResult = ref(null);
const currentSearchingSong = ref(null);

// MetadataManager专用的歌曲列表（只显示用户导入的歌曲）
const localSongs = ref([]);

// 工作区封面缓存（独立于数据库）
const workspaceCoverCache = reactive({});

// 文件导入相关
const isImporting = ref(false);
const isDragging = ref(false);
const importStatus = ref('idle'); // idle, importing, success, error
const importResultMessage = ref('');

// SongTable组件引用
const songTableRef = ref(null);

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
const selectedSongIds = computed(() => selectedSongs.value.map(song => song.id));

// 处理SongTable的选择变化
const handleSelectionChange = ({ selectedIds }) => {
    selectedSongs.value = filteredSongs.value.filter(song => selectedIds.includes(song.id));
};

// 处理SongTable的操作按钮点击
const handleActionClick = ({ action, song }) => {
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
const toggleSelectSong = (song) => {
    const index = selectedSongs.value.findIndex(s => s.id === song.id);
    if (index >= 0) {
        selectedSongs.value.splice(index, 1);
    } else {
        selectedSongs.value.push(song);
    }
};

// 编辑单首歌曲（工作区模式）
const editSong = (song) => {
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

        const result = await window.electronAPI.showOpenDialog({
            title: '选择音乐文件',
            filters: [
                { name: '音频文件', extensions: ['mp3', 'flac', 'wav', 'm4a', 'ogg', 'aac'] }
            ],
            properties: ['openFile', 'multiSelections']
        });

        if (result.canceled || result.filePaths.length === 0) {
            return;
        }

        await processImportFiles(result.filePaths);
    } catch (error) {
        console.error('导入文件失败:', error);
        importStatus.value = 'error';
        importResultMessage.value = `导入失败: ${error.message}`;
    }
};

// 处理导入的文件
const processImportFiles = async (filePaths) => {
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
                        song.filePath === parseResult.song.filePath
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
        importResultMessage.value = `处理失败: ${error.message}`;
    } finally {
        isImporting.value = false;
    }
};

// 拖拽相关处理
const handleDragOver = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    isDragging.value = true;
};

const handleDragLeave = (event) => {
    event.preventDefault();
    if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget)) {
        isDragging.value = false;
    }
};

const handleDrop = async (event) => {
    event.preventDefault();
    isDragging.value = false;

    const files = Array.from(event.dataTransfer.files);
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
const searchOnlineMetadata = async (song) => {
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
        const result = await window.electronAPI.searchOnlineMetadata(searchParams);

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
const applyOnlineMetadata = async (song, onlineData) => {
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
        const updateResult = await window.electronAPI.updateSongTags(song.id, newTags);

        if (updateResult && updateResult.success) {
            alert('元数据更新成功！');
        } else {
            alert('更新标签失败: ' + (updateResult.error || '未知错误'));
        }
    } catch (error) {
        console.error('应用在线元数据失败:', error);
        alert('应用在线元数据失败: ' + error.message);
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
const loadWorkspaceSongCover = async (song) => {
    if (!song || !song.filePath || workspaceCoverCache[song.id]) {
        return; // 如果已有缓存则跳过
    }

    try {
        const result = await window.electronAPI.getCoverFromFile(song.filePath);
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
    <div class="metadata-manager" :class="{ 'dragging': isDragging }" @dragover="handleDragOver"
        @dragleave="handleDragLeave" @drop="handleDrop">
        <div class="metadata-header">
            <h1>音乐元数据管理</h1>
            <div class="search-box">
                <CustomInput :model-value="searchQuery" @update:model-value="val => searchQuery = val" type="text"
                    placeholder="搜索歌曲..." prefix-icon="search" size="medium" />
            </div>
        </div>

        <div class="metadata-toolbar">
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
        <div v-if="importStatus !== 'idle'" class="import-status-bar" :class="importStatus">
            <div class="import-status-message">
                <FAIcon :name="importStatus === 'importing' ? 'spinner' :
                    importStatus === 'success' ? 'check' : 'exclamation-triangle'" size="small"
                    :color="importStatus === 'success' ? 'accent' : importStatus === 'error' ? 'danger' : 'primary'"
                    :class="{ 'loading-icon': importStatus === 'importing' }" />
                <span>{{ importResultMessage || (importStatus === 'importing' ? '正在导入音乐文件...' : '') }}</span>
            </div>
            <CustomButton v-if="importStatus !== 'importing'" type="icon-only" size="small" icon="times"
                @click="importStatus = 'idle'" title="关闭" />
        </div>

        <div class="metadata-content">
            <!-- 歌曲表格 -->
            <SongTable ref="songTableRef" :songs="filteredSongs" :loading="isLoading" :show-sortable="false"
                :show-play-count="false" :show-action-column="true" :action-column-type="'metadata'"
                :show-selection="true" :selected-song-ids="selectedSongIds" :context-menu-type="'metadata'"
                :current-list-id="'metadata'" :empty-text="'请导入音乐文件或拖拽文件到此区域'" :empty-icon="'upload'"
                :external-cover-cache="workspaceCoverCache" @action-click="handleActionClick"
                @selection-change="handleSelectionChange" />

            <!-- 在线搜索面板 -->
            <div class="online-search-panel" v-if="onlineSearchStatus !== 'idle'">
                <div class="panel-header">
                    <h3>在线元数据搜索结果</h3>
                    <CustomButton type="icon-only" size="small" icon="times"
                        @click="onlineSearchStatus = 'idle'; currentSearchingSong = null" title="关闭" />
                </div>
                <div class="panel-content">
                    <div v-if="onlineSearchStatus === 'loading'" class="loading-state">
                        <FAIcon name="spinner" size="large" color="primary" class="loading-icon" />
                        <span>搜索中...</span>
                    </div>
                    <div v-else-if="onlineSearchStatus === 'error'" class="error-state">
                        <FAIcon name="exclamation-triangle" size="large" color="danger" />
                        <span>搜索失败，请重试</span>
                    </div>
                    <div v-else-if="onlineSearchResults.length === 0" class="empty-state">
                        未找到匹配的在线元数据
                    </div>
                    <div v-else class="result-list">
                        <div v-for="result in onlineSearchResults" :key="result.songId" class="result-item"
                            :class="{ 'selected': selectedOnlineResult === result }"
                            @click="selectedOnlineResult = result">
                            <div class="result-title">{{ result.songName }}</div>
                            <div class="result-info">
                                <span class="result-artist">{{ result.singer }}</span>
                                <span class="result-divider">-</span>
                                <span class="result-album">{{ result.album?.albumName }}</span>
                            </div>
                        </div>
                        <div class="apply-actions" v-if="selectedOnlineResult">
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
        <div v-if="isDragging" class="drag-overlay">
            <div class="drag-message">
                <FAIcon name="upload" size="xl" color="accent" />
                <h2>松开鼠标导入音乐文件</h2>
                <p>支持 MP3, FLAC, WAV, M4A, OGG, AAC 格式</p>
            </div>
        </div>

        <!-- 清除确认对话框 -->
        <div v-if="showClearConfirm" class="confirm-dialog-overlay">
            <div class="confirm-dialog">
                <div class="confirm-header">
                    <FAIcon name="info-circle" size="large" color="primary" />
                    <h3>确认清空工作区</h3>
                </div>
                <div class="confirm-content">
                    <p>您确定要清空当前工作区吗？这将清除您在此次会话中导入的歌曲列表。</p>
                    <p class="info-text">
                        <strong>说明：</strong>此操作只会清空工作区内容，不会影响音乐库中的数据，也不会删除您的音乐文件。
                    </p>
                    <div class="song-count">
                        工作区中共有 <strong>{{ localSongs.length }}</strong> 首歌曲将被清除
                    </div>
                </div>
                <div class="confirm-actions">
                    <CustomButton type="secondary" @click="showClearConfirm = false">取消</CustomButton>
                    <CustomButton type="primary" icon="trash" @click="clearWorkspace">
                        清空工作区
                    </CustomButton>
                </div>
            </div>
        </div>

        <!-- 标签编辑器组件 -->
        <TagEditor ref="tagEditorRef" />
    </div>
</template>

<style lang="scss" scoped>
/* comment */
@use "sass:color";

.metadata-manager {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 16px;
    color: #ffffff;
    overflow: hidden;
    position: relative;
}

.metadata-manager.dragging {
    border: 3px dashed #4caf50;
    background-color: rgba(76, 175, 80, 0.05);
}

.metadata-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
}

.metadata-header h1 {
    font-size: 20px;
    font-weight: 500;
}

.search-box {
    width: 300px;
}

.metadata-toolbar {
    display: flex;
    gap: (16px * 0.625);
    margin-bottom: 16px;
}

.import-btn,
.select-all-btn,
.clear-all-btn {
    background: #181818;
    color: #ffffff;
    border: none;
    padding: (16px * 0.5) 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    align-items: center;
    gap: (16px * 0.375);
}

.import-btn {
    background: #4caf50;

    &:hover {
        background: #66bb6a;
    }
}

.select-all-btn:hover {
    background: color.adjust(#181818, $lightness: 10%);
}

.clear-all-btn {
    background: #535353;

    &:hover {
        background: color.adjust(#535353, $lightness: 10%);
    }
}

.import-btn:disabled,
.clear-all-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.import-status-bar {
    padding: (16px * 0.75) 16px;
    margin-bottom: (16px * 0.9375);
    border-radius: 4px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.import-status-bar.importing {
    background-color: #2962FF;
}

.import-status-bar.success {
    background-color: #4caf50;
}

.import-status-bar.error {
    background-color: #f44336;
}

.import-status-message {
    display: flex;
    align-items: center;
    gap: (16px * 0.5);
}

.loading-icon {
    animation: spin 1.5s infinite linear;
}

.metadata-content {
    flex: 1;
    display: flex;
    overflow: hidden;
    position: relative;
}

.song-table-container {
    flex: 1;
    overflow: auto;
}

.song-table {
    width: 100%;
    border-collapse: collapse;
}

.song-table th,
.song-table td {
    padding: (16px * 0.75);
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.song-table th {
    background: #181818;
    position: sticky;
    top: 0;
    z-index: 1;
}

.song-row {
    transition: background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

.song-row:hover {
    background: rgba(255,255,255,0.1);
}

.checkbox-column {
    width: 40px;
}

.title-column {
    width: 35%;
}

.artist-column,
.album-column {
    width: 25%;
}

.actions-column {
    width: 100px;
    text-align: center;
}

.edit-btn,
.search-btn {
    background: none;
    border: none;
    color: #b3b3b3;
    cursor: pointer;
    padding: (16px * 0.25);
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    margin: 0 (16px * 0.25);
}

.edit-btn:hover,
.search-btn:hover {
    color: #ffffff;
    transform: scale(1.1);
}

.empty-row td {
    text-align: center;
    padding: (16px * 2.5);
    color: #b3b3b3;
}

.online-search-panel {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 350px;
    background: #181818;
    border-radius: (4px * 2);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15)-hover;
    display: flex;
    flex-direction: column;
    z-index: 100;
}

.panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: (16px * 0.9375);
    border-bottom: 1px solid #282828;
}

.panel-header h3 {
    margin: 0;
    font-size: 14px;
}

.panel-content {
    flex: 1;
    overflow: auto;
    padding: (16px * 0.9375);
}

.loading-state,
.error-state,
.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: (16px * 2.5) 0;
    color: #b3b3b3;
    text-align: center;
}

.loading-icon {
    animation: spin 1.5s infinite linear;
    margin-bottom: (16px * 0.625);
}

@keyframes spin {
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
}

.result-list {
    display: flex;
    flex-direction: column;
    gap: (16px * 0.625);
}

.result-item {
    padding: (16px * 0.625);
    border-radius: (4px * 1.5);
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    border: 1px solid transparent;
}

.result-item:hover {
    background: #282828;
}

.result-item.selected {
    background: #282828;
    border-color: #4caf50;
}

.result-title {
    font-weight: 500;
    font-size: 12px;
    margin-bottom: (16px * 0.25);
}

.result-info {
    font-size: 10px;
    color: #b3b3b3;
}

.result-divider {
    margin: 0 (16px * 0.25);
}

.apply-actions {
    margin-top: 16px;
    display: flex;
    justify-content: center;
}

.apply-btn {
    background: #4caf50;
    color: #ffffff;
    border: none;
    padding: (16px * 0.5) 16px;
    border-radius: (4px * 5);
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.apply-btn:hover {
    background: #66bb6a;
    transform: translateY(-2px);
}

.apply-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
}

.drag-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.3);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 300;
    border-radius: (4px * 2);
}

.drag-message {
    text-align: center;
    color: #ffffff;
    background: rgba(76, 175, 80, 0.2);
    padding: (16px * 2.5);
    border-radius: (4px * 3);
    border: 2px dashed #4caf50;
}

.drag-message h2 {
    margin: (16px * 0.9375) 0 (16px * 0.5);
    font-size: 36px;
}

.drag-message p {
    font-size: 12px;
    color: #b3b3b3;
    margin: (16px * 0.3125) 0 0;
}

/* 确认对话框样式 */
.confirm-dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.3);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 100;
}

.confirm-dialog {
    background: #181818;
    border-radius: (4px * 2);
    padding: (16px * 1.5);
    max-width: 480px;
    width: 90%;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15)-hover;
}

.confirm-header {
    display: flex;
    align-items: center;
    gap: (16px * 0.75);
    margin-bottom: 16px;
    color: #4caf50;
}

.confirm-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 500;
}

.confirm-content {
    margin-bottom: (16px * 1.5);
    line-height: 1.5;
}

.confirm-content p {
    margin: 0 0 (16px * 0.75);
    color: #ffffff;
}

.info-text {
    background: rgba(76, 175, 80, 0.1);
    border: 1px solid rgba(76, 175, 80, 0.3);
    border-radius: 4px;
    padding: (16px * 0.5) (16px * 0.75);
    font-size: 10px;
}

.song-count {
    background: rgba(255,255,255,0.1);
    border-radius: 4px;
    padding: (16px * 0.5) (16px * 0.75);
    margin-top: (16px * 0.75);
    font-size: 12px;
    color: #ffffff;
}

.confirm-actions {
    display: flex;
    gap: (16px * 0.75);
    justify-content: flex-end;
}

.cancel-btn,
.confirm-btn {
    padding: (16px * 0.5) 16px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    align-items: center;
    gap: (16px * 0.375);
}

.cancel-btn {
    background: #535353;
    color: #ffffff;
}

.cancel-btn:hover {
    background: color.adjust(#535353, $lightness: 10%);
}

.confirm-btn {
    background: #4caf50;
    color: #ffffff;
}

.confirm-btn:hover {
    background: #66bb6a;
    transform: translateY(-1px);
}

/* 响应式适配 */
@media (max-width: 768px) {
    .metadata-manager {
        padding: (16px * 0.75);
    }

    .metadata-header {
        flex-direction: column;
        align-items: flex-start;
        gap: (16px * 0.75);
        margin-bottom: (16px * 0.75);
    }

    .search-box {
        width: 100%;
        max-width: none;
    }

    .metadata-toolbar {
        flex-wrap: wrap;
        gap: (16px * 0.5);
    }

    .import-btn,
    .select-all-btn,
    .clear-all-btn {
        font-size: 10px;
        padding: (16px * 0.375) (16px * 0.75);
    }

    .song-table th,
    .song-table td {
        padding: (16px * 0.5);
        font-size: 12px;
    }

    .online-search-panel {
        width: 100%;
        position: fixed;
        left: 0;
        top: 0;
        right: 0;
        bottom: 0;
        border-radius: 0;
    }

    .confirm-dialog {
        width: 95%;
        padding: 16px;
    }

    .drag-message {
        padding: 16px;
    }

    .drag-message h2 {
        font-size: 20px;
    }
}
</style>