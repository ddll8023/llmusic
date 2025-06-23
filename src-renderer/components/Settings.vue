<script setup>
import { useMediaStore } from '../store/media';
import { usePlayerStore } from '../store/player';
import { useUiStore } from '../store/ui';
import { ref, onMounted } from 'vue';
import Icon from './Icon.vue'; // 引入Icon组件

const mediaStore = useMediaStore();
const playerStore = usePlayerStore();
const uiStore = useUiStore();

// --- 音乐库管理 State ---
const showEditLibraryModal = ref(false);
const editingLibrary = ref(null);
const newLibraryName = ref("");

// --- 通用弹窗 State ---
const showConfirmModal = ref(false);
const confirmModalTitle = ref("");
const confirmModalMessage = ref("");
const confirmAction = ref(null);

const showInfoModal = ref(false);
const infoModalTitle = ref("");
const infoModalMessage = ref("");

onMounted(() => {
  mediaStore.loadLibraries();
});


// --- 音乐库管理 Actions ---
const handleAddLibrary = async () => {
  const result = await mediaStore.addLibrary();

  if (!result.success && !result.canceled) {
    infoModalTitle.value = "添加失败";
    infoModalMessage.value = result.error || "发生未知错误";
    showInfoModal.value = true;
  }
};

const openEditLibraryModal = (library) => {
  editingLibrary.value = library;
  newLibraryName.value = library.name;
  showEditLibraryModal.value = true;
};

const handleUpdateLibrary = async () => {
  if (!newLibraryName.value.trim()) {
    infoModalTitle.value = "操作失败";
    infoModalMessage.value = "音乐库名称不能为空";
    showInfoModal.value = true;
    return;
  }
  await mediaStore.updateLibrary(editingLibrary.value.id, { name: newLibraryName.value });
  showEditLibraryModal.value = false;
};

const handleRemoveLibrary = (library) => {
  confirmModalTitle.value = `确认移除音乐库`;
  confirmModalMessage.value = `您确定要移除 "${library.name}" 吗？所有属于该库的歌曲记录都将被删除（原始文件不会被删除）。`;
  confirmAction.value = async () => {
    const result = await mediaStore.removeLibrary(library.id);
    if (!result.success) {
      infoModalTitle.value = "移除失败";
      infoModalMessage.value = result.error || "发生未知错误";
      showInfoModal.value = true;
    }
  };
  showConfirmModal.value = true;
};

const handleRescanLibrary = async (library) => {
  infoModalTitle.value = "开始扫描";
  infoModalMessage.value = `正在重新扫描音乐库 "${library.name}"...`;
  showInfoModal.value = true;

  await mediaStore.scanMusic(library.id, true);
  // 扫描结果由 store 中的 watcher 或其他地方处理，这里只提示开始
};


// --- 通用弹窗 Actions ---
const closeConfirmModal = () => {
  showConfirmModal.value = false;
  confirmAction.value = null;
};

const executeConfirmAction = () => {
  if (confirmAction.value) {
    confirmAction.value();
  }
  closeConfirmModal();
};

const closeInfoModal = () => {
  showInfoModal.value = false;
};


// --- 其他设置 Actions ---
// 设置歌词动画效果
const setLyricsAnimation = (style) => {
  uiStore.setLyricsAnimationStyle(style);
};

// 设置窗口关闭行为
const setCloseBehavior = async (behavior) => {
  const result = await uiStore.setCloseBehavior(behavior);
  if (!result) {
    infoModalTitle.value = "设置失败";
    infoModalMessage.value = "无法设置窗口关闭行为";
    showInfoModal.value = true;
  }
};
</script>

<template>
  <div class="settings-page">
    <h2>设置</h2>

    <div class="settings-section">
      <h3>音乐库管理</h3>
      <div class="library-grid">
        <!-- 循环显示已有的音乐库 -->
        <div v-for="lib in mediaStore.libraries" :key="lib.id" class="library-card">
          <div class="card-content">
            <div class="card-icon">
              <Icon name="local" :size="48" />
            </div>
            <div class="card-info">
              <span class="library-name">{{ lib.name }}</span>
              <span class="library-path">{{ lib.path }}</span>
            </div>
          </div>
          <div class="card-footer">
            <div class="card-stats">
              <Icon name="music" :size="14" />
              <span>{{ lib.songCount }} 首歌曲</span>
            </div>
            <div class="library-actions">
              <button @click="openEditLibraryModal(lib)" class="btn-icon" title="重命名">
                <Icon name="edit" />
              </button>
              <button @click="handleRescanLibrary(lib)" class="btn-icon" title="重新扫描">
                <Icon name="scan" />
              </button>
              <button @click="handleRemoveLibrary(lib)" class="btn-icon btn-danger" title="移除">
                <Icon name="delete" />
              </button>
            </div>
          </div>
        </div>

        <!-- 添加新库的卡片 -->
        <div class="library-card add-library-card" @click="handleAddLibrary">
          <Icon name="add" :size="48" />
          <span>添加新库</span>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h3>界面</h3>
      <div class="settings-item">
        <span>歌词页面动画效果</span>
        <div class="select-container">
          <select :value="uiStore.lyricsAnimationStyle" @change="e => setLyricsAnimation(e.target.value)">
            <option value="fade">淡入淡出</option>
            <option value="slide">上滑动画</option>
          </select>
        </div>
      </div>
      <div class="settings-item-description">
        选择歌词页面显示和隐藏时的动画效果。
      </div>

      <div class="settings-item">
        <span>窗口关闭行为</span>
        <div class="select-container">
          <select :value="uiStore.closeBehavior" @change="e => setCloseBehavior(e.target.value)">
            <option value="exit">退出应用</option>
            <option value="minimize">最小化到托盘</option>
          </select>
        </div>
      </div>
      <div class="settings-item-description">
        选择点击窗口关闭按钮时的行为：完全退出应用或最小化到系统托盘。最小化后可通过点击托盘图标恢复窗口。
      </div>
    </div>

    <!-- 编辑音乐库 Modal -->
    <div class="modal" v-if="showEditLibraryModal">
      <div class="modal-content">
        <h3>重命名音乐库</h3>
        <p>为您的音乐库"{{ editingLibrary.name }}"输入一个新名称。</p>
        <input type="text" v-model="newLibraryName" placeholder="新音乐库名称" class="modal-input" />
        <div class="modal-buttons">
          <button class="cancel-button" @click="showEditLibraryModal = false">取消</button>
          <button class="confirm-button" @click="handleUpdateLibrary">保存</button>
        </div>
      </div>
    </div>

    <!-- 通用确认对话框 -->
    <div class="modal" v-if="showConfirmModal">
      <div class="modal-content">
        <h3>{{ confirmModalTitle }}</h3>
        <p>{{ confirmModalMessage }}</p>
        <div class="modal-buttons">
          <button class="cancel-button" @click="closeConfirmModal">取消</button>
          <button class="confirm-button" @click="executeConfirmAction">确认</button>
        </div>
      </div>
    </div>

    <!-- 通用信息提示弹窗 -->
    <div class="modal" v-if="showInfoModal">
      <div class="modal-content">
        <h3>{{ infoModalTitle }}</h3>
        <p class="final-message">{{ infoModalMessage }}</p>
        <div class="modal-buttons">
          <button class="confirm-button" @click="closeInfoModal">
            确定
          </button>
        </div>
      </div>
    </div>

    <!-- 覆盖层，用于在弹窗显示时禁用背景交互 -->
    <div class="modal-overlay" v-if="showEditLibraryModal || showConfirmModal || showInfoModal"></div>
  </div>
</template>

<style scoped>
.settings-page {
  padding: 24px;
  color: #fff;
  height: 100%;
  overflow-y: auto;
}

.settings-page h2 {
  font-size: 24px;
  margin-bottom: 24px;
}

.settings-section {
  margin-bottom: 24px;
}

.settings-section h3 {
  font-size: 16px;
  color: #b3b3b3;
  margin-bottom: 16px;
  border-bottom: 1px solid #282828;
  padding-bottom: 8px;
}

.settings-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
}

.settings-item span {
  font-size: 14px;
}

.settings-item .btn {
  background-color: #282828;
  color: #fff;
  border: 1px solid #444;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.settings-item .btn:hover {
  background-color: #333;
}

.select-container {
  position: relative;
}

select {
  background-color: #282828;
  color: #fff;
  border: 1px solid #444;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
  appearance: none;
  padding-right: 30px;
}

.select-container::after {
  content: '▼';
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  font-size: 12px;
  color: #b3b3b3;
}

select:hover {
  background-color: #333;
}

.settings-item-description {
  font-size: 12px;
  color: #b3b3b3;
  margin-top: -8px;
  padding-bottom: 16px;
}

.library-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
  margin-top: 16px;
}

.library-card {
  background-color: #282828;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border: 1px solid transparent;
  transition: all 0.3s ease;
  min-height: 160px;
}

.library-card:hover {
  border-color: #535353;
  transform: translateY(-4px);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
}

.card-content {
  display: flex;
  flex-direction: column;
}

.library-card .card-icon {
  color: #b3b3b3;
  margin-bottom: 12px;
}

.card-info .library-name {
  font-size: 16px;
  font-weight: bold;
  color: #fff;
  display: block;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-info .library-path {
  font-size: 12px;
  color: #b3b3b3;
  word-break: break-all;
  margin-bottom: 8px;
  white-space: normal;
  line-height: 1.4;
  flex-grow: 1;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
}

.card-stats {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #888;
}

.library-actions {
  display: flex;
  gap: 8px;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.library-card:hover .library-actions {
  opacity: 1;
}

.btn-icon {
  background: rgba(40, 40, 40, 0.8);
  border: 1px solid #535353;
  color: #fff;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-icon:hover {
  background: #535353;
  transform: scale(1.1);
}

.btn-icon.btn-danger:hover {
  background: #e53935;
  border-color: #e53935;
}

.add-library-card {
  border: 2px dashed #535353;
  background-color: transparent;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #b3b3b3;
  gap: 12px;
}

.add-library-card:hover {
  background-color: #282828;
  border-color: #fff;
  color: #fff;
}

.settings-item-description {
  color: #b3b3b3;
  font-size: 12px;
  margin-top: -8px;
  margin-bottom: 16px;
}

/* 弹窗样式 */
.modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001;
}

.modal-content {
  background-color: #282828;
  color: #fff;
  padding: 30px;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  width: 90%;
  max-width: 450px;
  text-align: center;
  border: 1px solid #444;
}

.modal-content h3 {
  margin-top: 0;
  font-size: 20px;
  margin-bottom: 20px;
}

.modal-content p {
  color: #b3b3b3;
  margin-bottom: 20px;
}

.modal-buttons {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 25px;
}

.modal-buttons button {
  padding: 10px 20px;
  border-radius: 20px;
  border: none;
  cursor: pointer;
  font-weight: bold;
}

.cancel-button {
  background-color: transparent;
  border: 1px solid #fff !important;
  color: #fff;
}

.confirm-button {
  background-color: #e53e3e;
  color: #fff;
  min-width: 120px;
}

.final-message {
  font-size: 16px;
  margin: 20px 0;
  min-height: 22px;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7);
  z-index: 1000;
}

.modal-input {
  width: 100%;
  padding: 10px;
  margin: 16px 0;
  background-color: #333;
  border: 1px solid #555;
  color: #fff;
  border-radius: 4px;
}
</style>