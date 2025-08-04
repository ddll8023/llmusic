<script setup>
import { ref, computed, onMounted } from 'vue';
import TagEditor from './TagEditor.vue';
import FAIcon from './FAIcon.vue';
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

// 文件导入相关
const isImporting = ref(false);
const isDragging = ref(false);
const importStatus = ref('idle'); // idle, importing, success, error
const importResultMessage = ref('');

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

// 选择歌曲
const toggleSelectSong = (song) => {
    const index = selectedSongs.value.findIndex(s => s.id === song.id);
    if (index >= 0) {
        selectedSongs.value.splice(index, 1);
    } else {
        selectedSongs.value.push(song);
    }
};

// 编辑单首歌曲
const editSong = (song) => {
    if (tagEditorRef.value) {
        tagEditorRef.value.openEditor(song);
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

    try {
        importStatus.value = 'importing';
        isImporting.value = true;

        // 调用主进程方法导入文件
        const result = await window.electronAPI.importMusicFiles(filePaths);

        if (result && result.success) {
            importStatus.value = 'success';
            importResultMessage.value = `成功导入 ${result.importedCount} 首歌曲`;

            // 将导入的歌曲添加到本地显示列表
            if (result.importedSongs && Array.isArray(result.importedSongs)) {
                localSongs.value.push(...result.importedSongs);
            } else {
                // 如果后端没有返回导入的歌曲详情，则从filePaths重新解析
                const newSongs = await Promise.all(filePaths.map(async (filePath) => {
                    try {
                        const songResult = await window.electronAPI.parseSongFromFile(filePath);
                        return songResult.success ? songResult.song : null;
                    } catch (error) {
                        console.error('解析歌曲失败:', error);
                        return null;
                    }
                }));
                const validSongs = newSongs.filter(song => song !== null);
                localSongs.value.push(...validSongs);
            }
        } else {
            importStatus.value = 'error';
            importResultMessage.value = result.error || '导入过程中发生错误';
        }
    } catch (error) {
        console.error('处理导入文件失败:', error);
        importStatus.value = 'error';
        importResultMessage.value = `导入失败: ${error.message}`;
    } finally {
        isImporting.value = false;
        // 5秒后自动清除导入状态信息
        setTimeout(() => {
            if (importStatus.value !== 'importing') {
                importStatus.value = 'idle';
                importResultMessage.value = '';
            }
        }, 5000);
    }
};

// 处理文件拖拽
const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging.value = true;
};

const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging.value = false;
};

const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging.value = false;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // 过滤音频文件
    const audioExtensions = ['mp3', 'flac', 'wav', 'm4a', 'ogg', 'aac'];
    const audioFiles = files.filter(file => {
        const extension = file.name.split('.').pop().toLowerCase();
        return audioExtensions.includes(extension);
    });

    if (audioFiles.length === 0) {
        importStatus.value = 'error';
        importResultMessage.value = '没有找到支持的音频文件';
        return;
    }

    // 获取文件路径并导入
    const filePathPromises = audioFiles.map(async file => {
        // 在Electron渲染进程中，需要使用electronAPI.getPathForFile来获取文件路径
        try {
            const result = await window.electronAPI.getPathForFile(file);
            return result.success ? result.filePath : null;
        } catch (error) {
            console.error('获取文件路径失败:', error);
            return null;
        }
    });

    const filePaths = (await Promise.all(filePathPromises)).filter(path => path !== null);

    if (filePaths.length === 0) {
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

        // 注意：专辑封面下载功能暂未实现

        // 更新标签
        const updateResult = await window.electronAPI.updateSongTags(song.id, newTags);

        if (updateResult && updateResult.success) {
            // 不再自动刷新歌曲列表，保持MetadataManager的独立性
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

// 初始化
onMounted(async () => {
    // 不再自动加载歌曲库，用户需要主动导入或扫描

    // MetadataManager 初始化完成
});



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

// 重置所有状态
const resetAllStates = () => {
    selectedSongs.value = [];
    searchQuery.value = '';
    localSongs.value = [];
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
</script>

<template>
    <div class="metadata-manager" :class="{ 'dragging': isDragging }" @dragover="handleDragOver"
        @dragleave="handleDragLeave" @drop="handleDrop">
        <div class="metadata-header">
            <h1>音乐元数据管理</h1>
            <div class="search-box">
                <FAIcon name="search" size="medium" color="secondary" />
                <input v-model="searchQuery" type="text" placeholder="搜索歌曲..." class="search-input" />
            </div>
        </div>

        <div class="metadata-toolbar">
            <button class="btn btn--primary import-btn" :disabled="isImporting" @click="importMusicFiles">
                <FAIcon :name="isImporting ? 'spinner' : 'download'" size="small" color="primary"
                    :class="{ 'loading-icon': isImporting }" />
                {{ isImporting ? '正在导入...' : '导入歌曲' }}
            </button>

            <button class="btn btn--secondary select-all-btn" @click="toggleSelectAll">
                {{ selectedSongs.length === filteredSongs.length ? '取消全选' : '全选' }}
            </button>
            <button class="btn btn--secondary clear-all-btn" :disabled="isClearing" @click="showClearWorkspaceDialog">
                <FAIcon :name="isClearing ? 'spinner' : 'trash'" size="small" color="secondary"
                    :class="{ 'loading-icon': isClearing }" />
                {{ isClearing ? '清除中...' : '清空工作区' }}
            </button>

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
            <button v-if="importStatus !== 'importing'" class="close-status-btn"
                @click="importStatus = 'idle'">×</button>
        </div>

        <div class="metadata-content">
            <div class="song-table-container">
                <table class="song-table">
                    <thead>
                        <tr>
                            <th class="checkbox-column"></th>
                            <th class="title-column">标题</th>
                            <th class="artist-column">艺术家</th>
                            <th class="album-column">专辑</th>
                            <th class="actions-column">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="song in filteredSongs" :key="song.id" class="song-row">
                            <td class="checkbox-column">
                                <input type="checkbox" :checked="selectedSongs.some(s => s.id === song.id)"
                                    @change="toggleSelectSong(song)" />
                            </td>
                            <td class="title-column">{{ song.title || '未知歌曲' }}</td>
                            <td class="artist-column">{{ song.artist || '未知艺术家' }}</td>
                            <td class="album-column">{{ song.album || '未知专辑' }}</td>
                            <td class="actions-column">
                                <button class="btn btn--icon edit-btn" title="编辑元数据" @click="editSong(song)">
                                    <FAIcon name="edit" size="small" color="primary" :clickable="true" />
                                </button>
                                <button class="btn btn--icon search-btn" title="搜索在线元数据"
                                    @click="searchOnlineMetadata(song)">
                                    <FAIcon name="search" size="small" color="primary" :clickable="true" />
                                </button>
                            </td>
                        </tr>
                        <tr v-if="filteredSongs.length === 0" class="empty-row">
                            <td colspan="5">未找到歌曲</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="online-search-panel" v-if="onlineSearchStatus !== 'idle'">
                <div class="panel-header">
                    <h3>在线元数据搜索结果</h3>
                    <button class="close-btn"
                        @click="onlineSearchStatus = 'idle'; currentSearchingSong = null">×</button>
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
                            <button class="btn btn--primary apply-btn" :disabled="isLoading"
                                @click="applyOnlineMetadata(currentSearchingSong, selectedOnlineResult)">
                                {{ isLoading ? '应用中...' : '应用选中元数据' }}
                            </button>
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
                    <button class="btn btn--secondary cancel-btn" @click="showClearConfirm = false">取消</button>
                    <button class="btn btn--primary confirm-btn" @click="clearWorkspace">
                        <FAIcon name="trash" size="small" color="primary" />
                        清空工作区
                    </button>
                </div>
            </div>
        </div>

        <!-- 标签编辑器组件 -->
        <TagEditor ref="tagEditorRef" />
    </div>
</template>

<style lang="scss" scoped>
// 导入样式变量
@use "../styles/variables/_colors" as *;
@use "../styles/variables/_layout" as *;
@use "sass:color";

.metadata-manager {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: $content-padding;
    color: $text-primary;
    overflow: hidden;
    position: relative;
}

.metadata-manager.dragging {
    border: 3px dashed $accent-green;
    background-color: rgba(76, 175, 80, 0.05);
}

.metadata-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: $content-padding;
}

.metadata-header h1 {
    font-size: $font-size-xl;
    font-weight: $font-weight-medium;
}

.search-box {
    display: flex;
    align-items: center;
    background: $bg-secondary;
    padding: ($content-padding * 0.5) $content-padding;
    border-radius: ($border-radius * 5);
    width: 300px;
}

.search-input {
    background: transparent;
    border: none;
    color: $text-primary;
    margin-left: ($content-padding * 0.5);
    outline: none;
    width: 100%;
}

.metadata-toolbar {
    display: flex;
    gap: ($content-padding * 0.625);
    margin-bottom: $content-padding;
}

.import-btn,
.select-all-btn,
.clear-all-btn {
    background: $bg-secondary;
    color: $text-primary;
    border: none;
    padding: ($content-padding * 0.5) $content-padding;
    border-radius: $border-radius;
    cursor: pointer;
    font-size: $font-size-sm;
    transition: all $transition-base;
    display: flex;
    align-items: center;
    gap: ($content-padding * 0.375);
}

.import-btn {
    background: $accent-green;

    &:hover {
        background: $accent-hover;
    }
}

.select-all-btn:hover {
    background: color.adjust($bg-secondary, $lightness: 10%);
}

.clear-all-btn {
    background: $text-disabled;

    &:hover {
        background: color.adjust($text-disabled, $lightness: 10%);
    }
}

.import-btn:disabled,
.clear-all-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.import-status-bar {
    padding: ($content-padding * 0.75) $content-padding;
    margin-bottom: ($content-padding * 0.9375);
    border-radius: $border-radius;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.import-status-bar.importing {
    background-color: #2962FF;
}

.import-status-bar.success {
    background-color: $accent-green;
}

.import-status-bar.error {
    background-color: $danger;
}

.import-status-message {
    display: flex;
    align-items: center;
    gap: ($content-padding * 0.5);
}

.loading-icon {
    animation: spin 1.5s infinite linear;
}

.close-status-btn {
    background: none;
    border: none;
    color: $text-primary;
    font-size: $font-size-lg;
    cursor: pointer;
    opacity: 0.7;
    transition: opacity $transition-fast;
}

.close-status-btn:hover {
    opacity: 1;
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
    padding: ($content-padding * 0.75);
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.song-table th {
    background: $bg-secondary;
    position: sticky;
    top: 0;
    z-index: $z-base;
}

.song-row {
    transition: background-color $transition-fast;
}

.song-row:hover {
    background: $overlay-light;
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
    color: $text-secondary;
    cursor: pointer;
    padding: ($content-padding * 0.25);
    transition: all $transition-base;
    margin: 0 ($content-padding * 0.25);
}

.edit-btn:hover,
.search-btn:hover {
    color: $text-primary;
    transform: scale(1.1);
}

.empty-row td {
    text-align: center;
    padding: ($content-padding * 2.5);
    color: $text-secondary;
}

.online-search-panel {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 350px;
    background: $bg-secondary;
    border-radius: ($border-radius * 2);
    box-shadow: $box-shadow-hover;
    display: flex;
    flex-direction: column;
    z-index: $z-modal;
}

.panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: ($content-padding * 0.9375);
    border-bottom: 1px solid $bg-tertiary;
}

.panel-header h3 {
    margin: 0;
    font-size: $font-size-base;
}

.close-btn {
    background: none;
    border: none;
    color: $text-secondary;
    font-size: $font-size-xl;
    cursor: pointer;
    transition: color $transition-fast;
}

.close-btn:hover {
    color: $text-primary;
}

.panel-content {
    flex: 1;
    overflow: auto;
    padding: ($content-padding * 0.9375);
}

.loading-state,
.error-state,
.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: ($content-padding * 2.5) 0;
    color: $text-secondary;
    text-align: center;
}

.loading-icon {
    animation: spin 1.5s infinite linear;
    margin-bottom: ($content-padding * 0.625);
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
    gap: ($content-padding * 0.625);
}

.result-item {
    padding: ($content-padding * 0.625);
    border-radius: ($border-radius * 1.5);
    cursor: pointer;
    transition: all $transition-base;
    border: 1px solid transparent;
}

.result-item:hover {
    background: $bg-tertiary;
}

.result-item.selected {
    background: $bg-tertiary;
    border-color: $accent-green;
}

.result-title {
    font-weight: $font-weight-medium;
    font-size: $font-size-sm;
    margin-bottom: ($content-padding * 0.25);
}

.result-info {
    font-size: $font-size-xs;
    color: $text-secondary;
}

.result-divider {
    margin: 0 ($content-padding * 0.25);
}

.apply-actions {
    margin-top: $content-padding;
    display: flex;
    justify-content: center;
}

.apply-btn {
    background: $accent-green;
    color: $text-primary;
    border: none;
    padding: ($content-padding * 0.5) $content-padding;
    border-radius: ($border-radius * 5);
    cursor: pointer;
    transition: all $transition-base;
}

.apply-btn:hover {
    background: $accent-hover;
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
    background: $overlay-dark;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: $z-tooltip;
    border-radius: ($border-radius * 2);
}

.drag-message {
    text-align: center;
    color: $text-primary;
    background: rgba(76, 175, 80, 0.2);
    padding: ($content-padding * 2.5);
    border-radius: ($border-radius * 3);
    border: 2px dashed $accent-green;
}

.drag-message h2 {
    margin: ($content-padding * 0.9375) 0 ($content-padding * 0.5);
    font-size: $font-size-xxl;
}

.drag-message p {
    font-size: $font-size-sm;
    color: $text-secondary;
    margin: ($content-padding * 0.3125) 0 0;
}

/* 确认对话框样式 */
.confirm-dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: $overlay-dark;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: $z-modal;
}

.confirm-dialog {
    background: $bg-secondary;
    border-radius: ($border-radius * 2);
    padding: ($content-padding * 1.5);
    max-width: 480px;
    width: 90%;
    box-shadow: $box-shadow-hover;
}

.confirm-header {
    display: flex;
    align-items: center;
    gap: ($content-padding * 0.75);
    margin-bottom: $content-padding;
    color: $accent-green;
}

.confirm-header h3 {
    margin: 0;
    font-size: $font-size-lg;
    font-weight: $font-weight-medium;
}

.confirm-content {
    margin-bottom: ($content-padding * 1.5);
    line-height: 1.5;
}

.confirm-content p {
    margin: 0 0 ($content-padding * 0.75);
    color: $text-primary;
}

.info-text {
    background: rgba(76, 175, 80, 0.1);
    border: 1px solid rgba(76, 175, 80, 0.3);
    border-radius: $border-radius;
    padding: ($content-padding * 0.5) ($content-padding * 0.75);
    font-size: $font-size-xs;
}

.song-count {
    background: $overlay-light;
    border-radius: $border-radius;
    padding: ($content-padding * 0.5) ($content-padding * 0.75);
    margin-top: ($content-padding * 0.75);
    font-size: $font-size-sm;
    color: $text-primary;
}

.confirm-actions {
    display: flex;
    gap: ($content-padding * 0.75);
    justify-content: flex-end;
}

.cancel-btn,
.confirm-btn {
    padding: ($content-padding * 0.5) $content-padding;
    border: none;
    border-radius: $border-radius;
    cursor: pointer;
    font-size: $font-size-sm;
    transition: all $transition-base;
    display: flex;
    align-items: center;
    gap: ($content-padding * 0.375);
}

.cancel-btn {
    background: $text-disabled;
    color: $text-primary;
}

.cancel-btn:hover {
    background: color.adjust($text-disabled, $lightness: 10%);
}

.confirm-btn {
    background: $accent-green;
    color: $text-primary;
}

.confirm-btn:hover {
    background: $accent-hover;
    transform: translateY(-1px);
}

/* 响应式适配 */
@include respond-to("sm") {
    .metadata-manager {
        padding: ($content-padding * 0.75);
    }

    .metadata-header {
        flex-direction: column;
        align-items: flex-start;
        gap: ($content-padding * 0.75);
        margin-bottom: ($content-padding * 0.75);
    }

    .search-box {
        width: 100%;
        max-width: none;
    }

    .metadata-toolbar {
        flex-wrap: wrap;
        gap: ($content-padding * 0.5);
    }

    .import-btn,
    .select-all-btn,
    .clear-all-btn {
        font-size: $font-size-xs;
        padding: ($content-padding * 0.375) ($content-padding * 0.75);
    }

    .song-table th,
    .song-table td {
        padding: ($content-padding * 0.5);
        font-size: $font-size-sm;
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
        padding: $content-padding;
    }

    .drag-message {
        padding: $content-padding;
    }

    .drag-message h2 {
        font-size: $font-size-xl;
    }
}
</style>