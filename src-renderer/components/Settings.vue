<script setup>
import { useMediaStore } from '../store/media';
import { usePlayerStore } from '../store/player';
import { useUiStore } from '../store/ui';
import { ref, onMounted } from 'vue';
import FAIcon from './FAIcon.vue'; // 修改为FAIcon组件

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
              <FAIcon name="folder" size="xl" color="secondary" />
            </div>
            <div class="card-info">
              <span class="library-name">{{ lib.name }}</span>
              <span class="library-path">{{ lib.path }}</span>
            </div>
          </div>
          <div class="card-footer">
            <div class="card-stats">
              <FAIcon name="music" size="small" color="secondary" />
              <span>{{ lib.songCount }} 首歌曲</span>
            </div>
            <div class="library-actions">
              <button @click="openEditLibraryModal(lib)" class="btn-icon" title="重命名">
                <FAIcon name="edit" size="medium" color="primary" :clickable="true" />
              </button>
              <button @click="handleRescanLibrary(lib)" class="btn-icon" title="重新扫描">
                <FAIcon name="refresh" size="medium" color="primary" :clickable="true" />
              </button>
              <button @click="handleRemoveLibrary(lib)" class="btn-icon btn-danger" title="移除">
                <FAIcon name="trash" size="medium" color="danger" :clickable="true" />
              </button>
            </div>
          </div>
        </div>

        <!-- 添加新库的卡片 -->
        <div class="library-card add-library-card" @click="handleAddLibrary">
          <FAIcon name="plus" size="xl" color="secondary" />
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
    <div class="modal-overlay" v-if="showEditLibraryModal">
      <div class="modal">
        <div class="modal-content">
          <h3>重命名音乐库</h3>
          <p>为您的音乐库"{{ editingLibrary.name }}"输入一个新名称。</p>
          <input type="text" v-model="newLibraryName" placeholder="新音乐库名称" class="modal-input" />
          <div class="modal-buttons">
            <button class="btn btn--secondary" @click="showEditLibraryModal = false">取消</button>
            <button class="btn btn--primary" @click="handleUpdateLibrary">保存</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 通用确认对话框 -->
    <div class="modal-overlay" v-if="showConfirmModal">
      <div class="modal">
        <div class="modal-content">
          <h3>{{ confirmModalTitle }}</h3>
          <p>{{ confirmModalMessage }}</p>
          <div class="modal-buttons">
            <button class="btn btn--secondary" @click="closeConfirmModal">取消</button>
            <button class="btn btn--danger" @click="executeConfirmAction">确认</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 通用信息提示弹窗 -->
    <div class="modal-overlay" v-if="showInfoModal">
      <div class="modal">
        <div class="modal-content">
          <h3>{{ infoModalTitle }}</h3>
          <p class="final-message">{{ infoModalMessage }}</p>
          <div class="modal-buttons">
            <button class="btn btn--primary" @click="closeInfoModal">
              确定
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// 导入样式变量
@use "../styles/variables/_colors" as *;
@use "../styles/variables/_layout" as *;
@use "sass:color";

.settings-page {
  padding: ($content-padding * 1.5);
  color: $text-primary;
  height: 100%;
  overflow-y: auto;

  @include respond-to("sm") {
    padding: $content-padding;
  }

  h2 {
    font-size: $font-size-xl;
    margin-bottom: ($content-padding * 1.5);
    font-weight: $font-weight-bold;

    @include respond-to("sm") {
      font-size: $font-size-lg;
      margin-bottom: $content-padding;
    }
  }
}

.settings-section {
  margin-bottom: ($content-padding * 1.5);

  @include respond-to("sm") {
    margin-bottom: $content-padding;
  }

  h3 {
    font-size: $font-size-base;
    color: $text-secondary;
    margin-bottom: $content-padding;
    border-bottom: 1px solid $bg-tertiary;
    padding-bottom: ($content-padding * 0.5);
    font-weight: $font-weight-medium;

    @include respond-to("sm") {
      font-size: $font-size-sm;
    }
  }
}

.settings-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ($content-padding * 0.75) 0;

  @include respond-to("sm") {
    flex-direction: column;
    align-items: flex-start;
    gap: ($content-padding * 0.5);
  }

  span {
    font-size: $font-size-sm;
    color: $text-primary;

    @include respond-to("sm") {
      font-size: $font-size-xs;
    }
  }
}

.select-container {
  position: relative;

  &::after {
    content: '▼';
    position: absolute;
    right: ($content-padding * 0.625);
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    font-size: $font-size-xs;
    color: $text-secondary;
  }

  select {
    background-color: $bg-tertiary;
    color: $text-primary;
    border: 1px solid $bg-tertiary;
    padding: ($content-padding * 0.5) $content-padding;
    border-radius: $border-radius;
    cursor: pointer;
    transition: all $transition-base;
    appearance: none;
    padding-right: ($content-padding * 1.875);
    font-size: $font-size-sm;

    &:hover {
      background-color: color.adjust($bg-tertiary, $lightness: 5%);
      border-color: $overlay-light;
    }

    &:focus {
      outline: none;
      border-color: $accent-green;
    }

    @include respond-to("sm") {
      width: 100%;
      font-size: $font-size-xs;
    }
  }
}

.settings-item-description {
  font-size: $font-size-xs;
  color: $text-secondary;
  margin-top: (-$content-padding * 0.5);
  padding-bottom: $content-padding;
  line-height: 1.4;

  @include respond-to("sm") {
    margin-top: 0;
    padding-bottom: ($content-padding * 0.75);
  }
}

.library-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: ($content-padding * 1.25);
  margin-top: $content-padding;

  @include respond-to("sm") {
    grid-template-columns: 1fr;
    gap: $content-padding;
  }
}

.library-card {
  background-color: $bg-tertiary;
  border-radius: ($border-radius * 2);
  padding: $content-padding;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border: 1px solid transparent;
  transition: all $transition-base;
  min-height: 160px;
  animation: fadeIn $transition-base ease-out;

  &:hover {
    border-color: $overlay-light;
    transform: translateY(-2px);
    box-shadow: $box-shadow-hover;
  }

  @include respond-to("sm") {
    min-height: 140px;
    padding: ($content-padding * 0.75);
  }
}

.card-content {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.card-icon {
  color: $text-secondary;
  margin-bottom: ($content-padding * 0.75);

  @include respond-to("sm") {
    margin-bottom: ($content-padding * 0.5);
  }
}

.card-info {
  flex: 1;

  .library-name {
    font-size: $font-size-base;
    font-weight: $font-weight-bold;
    color: $text-primary;
    display: block;
    margin-bottom: ($content-padding * 0.25);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    @include respond-to("sm") {
      font-size: $font-size-sm;
    }
  }

  .library-path {
    font-size: $font-size-xs;
    color: $text-secondary;
    word-break: break-all;
    margin-bottom: ($content-padding * 0.5);
    white-space: normal;
    line-height: 1.4;
    flex-grow: 1;
  }
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: ($content-padding * 0.75);

  @include respond-to("sm") {
    margin-top: ($content-padding * 0.5);
  }
}

.card-stats {
  display: flex;
  align-items: center;
  gap: ($content-padding * 0.375);
  font-size: $font-size-xs;
  color: $text-secondary;
}

.library-actions {
  display: flex;
  gap: ($content-padding * 0.5);
  opacity: 0;
  transition: opacity $transition-base;

  @include respond-to("sm") {
    opacity: 1;
  }
}

.library-card:hover .library-actions {
  opacity: 1;
}

.btn-icon {
  background: $bg-secondary;
  border: 1px solid $overlay-light;
  color: $text-primary;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all $transition-base;

  &:hover {
    background: $overlay-light;
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }

  &.btn-danger:hover {
    background: $danger;
    border-color: $danger;
  }

  @include respond-to("sm") {
    width: 28px;
    height: 28px;
  }
}

.add-library-card {
  border: 2px dashed $overlay-light;
  background-color: transparent;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: $text-secondary;
  gap: ($content-padding * 0.75);

  &:hover {
    background-color: $bg-tertiary;
    border-color: $accent-green;
    color: $text-primary;
    transform: translateY(-2px);
  }
}

// Modal styles
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

.modal {
  animation: modalSlideIn $transition-base ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes modalSlideIn {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(-20px);
  }

  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.modal-content {
  background-color: $bg-secondary;
  color: $text-primary;
  padding: ($content-padding * 1.875);
  border-radius: ($border-radius * 3);
  box-shadow: $box-shadow-hover;
  width: 90%;
  max-width: 450px;
  text-align: center;
  border: 1px solid $bg-tertiary;

  @include respond-to("sm") {
    padding: ($content-padding * 1.25);
    max-width: 320px;
  }

  h3 {
    margin-top: 0;
    font-size: $font-size-lg;
    margin-bottom: ($content-padding * 1.25);
    font-weight: $font-weight-bold;

    @include respond-to("sm") {
      font-size: $font-size-base;
      margin-bottom: $content-padding;
    }
  }

  p {
    color: $text-secondary;
    margin-bottom: ($content-padding * 1.25);
    font-size: $font-size-sm;
    line-height: 1.5;

    @include respond-to("sm") {
      font-size: $font-size-xs;
      margin-bottom: $content-padding;
    }
  }
}

.modal-buttons {
  display: flex;
  justify-content: center;
  gap: ($content-padding * 1.25);
  margin-top: ($content-padding * 1.5625);

  @include respond-to("sm") {
    gap: $content-padding;
    margin-top: ($content-padding * 1.25);
  }
}

.final-message {
  font-size: $font-size-base;
  margin: ($content-padding * 1.25) 0;
  min-height: 22px;

  @include respond-to("sm") {
    font-size: $font-size-sm;
    margin: $content-padding 0;
  }
}

.modal-input {
  width: 100%;
  padding: ($content-padding * 0.625);
  margin: $content-padding 0;
  background-color: $bg-tertiary;
  border: 1px solid $overlay-light;
  color: $text-primary;
  border-radius: $border-radius;
  font-size: $font-size-sm;
  transition: border-color $transition-base;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: $accent-green;
  }

  &::placeholder {
    color: $text-disabled;
  }

  @include respond-to("sm") {
    font-size: $font-size-xs;
    padding: ($content-padding * 0.5);
  }
}

// 高对比度模式支持
@media (prefers-contrast: high) {

  .library-card,
  .modal-content {
    border-width: 2px;
    border-color: $text-primary;
  }

  .modal-input,
  select {
    border-width: 2px;
  }
}

// 减少动画模式支持
@media (prefers-reduced-motion: reduce) {

  .library-card,
  .btn-icon,
  .modal-overlay,
  .modal,
  select,
  .modal-input {
    animation: none;
    transition: none;
  }

  .library-card:hover,
  .btn-icon:hover,
  .add-library-card:hover {
    transform: none;
  }
}
</style>