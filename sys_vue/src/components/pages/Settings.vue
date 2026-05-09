<script setup>
import { useMediaStore } from '../../store/media';
import { usePlayerStore } from '../../store/player';
import { useUiStore } from '../../store/ui';
import { useAuthStore } from '../../store/auth';
import { ref, onMounted } from 'vue';
import FAIcon from '../common/FAIcon.vue';
import CustomButton from '../custom/CustomButton.vue';
import CustomSelect from '../custom/CustomSelect.vue';

const mediaStore = useMediaStore();
const playerStore = usePlayerStore();
const uiStore = useUiStore();
const authStore = useAuthStore();

// --- 音乐库管理 State ---
const showEditLibraryModal = ref(false);
const editingLibrary = ref(null);
const newLibraryName = ref("");

// --- 通用弹窗 State ---
const showConfirmModal = ref(false);
const confirmModalTitle = ref("");
const confirmModalMessage = ref("");
const confirmAction = ref(null);

// --- 登录弹窗 State ---
const showLoginModal = ref(false);

const showInfoModal = ref(false);
const infoModalTitle = ref("");
const infoModalMessage = ref("");

onMounted(() => {
  mediaStore.loadLibraries();
  authStore.initAuth();
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


// --- 登录相关 Actions ---
const handleOpenLoginModal = () => {
  authStore.resetQRState();
  showLoginModal.value = true;
};

const handleCloseLoginModal = () => {
  authStore.resetQRState();
  showLoginModal.value = false;
};

const handleLogin = (type) => {
  authStore.startQRLogin(type);
};

const handleLogout = () => {
  confirmModalTitle.value = "退出登录";
  confirmModalMessage.value = "确定要退出 QQ 音乐账号吗？退出后将无法使用在线音乐功能。";
  confirmAction.value = async () => {
    await authStore.logout();
  };
  showConfirmModal.value = true;
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
              <CustomButton type="icon-only" icon="edit" circle size="medium" @click="openEditLibraryModal(lib)" title="重命名" />
              <CustomButton type="icon-only" icon="refresh" circle size="medium" @click="handleRescanLibrary(lib)" title="重新扫描" />
              <CustomButton type="danger" icon="trash" circle size="medium" @click="handleRemoveLibrary(lib)" title="移除" />
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
      <h3>账号</h3>
      <div v-if="authStore.isLoggedIn" class="settings-item">
        <div class="user-info">
          <FAIcon name="user" size="xl" color="secondary" />
          <div class="user-detail">
            <span class="user-name">QQ 音乐用户</span>
            <span class="user-id">ID: {{ authStore.userInfo.encrypt_uin }}</span>
          </div>
          <span v-if="authStore.isExpired" class="credential-expired">凭证已过期</span>
        </div>
        <div class="user-actions">
          <CustomButton v-if="authStore.isExpired" type="primary" size="medium" @click="handleOpenLoginModal">
            重新登录
          </CustomButton>
          <CustomButton type="danger" size="medium" @click="handleLogout">
            退出登录
          </CustomButton>
        </div>
      </div>
      <div v-else class="settings-item">
        <span>未登录 QQ 音乐</span>
        <CustomButton type="primary" size="medium" @click="handleOpenLoginModal">
          登录
        </CustomButton>
      </div>
      <div class="settings-item-description">
        登录后可使用在线搜索、试听和下载功能。
      </div>
    </div>

    <div class="settings-section">
      <h3>界面</h3>
      <div class="settings-item">
        <span>歌词页面动画效果</span>
        <div class="select-container">
          <CustomSelect
            :model-value="uiStore.lyricsAnimationStyle"
            :options="[
              { value: 'fade', label: '淡入淡出' },
              { value: 'slide', label: '上滑动画' }
            ]"
            @change="setLyricsAnimation"
            @update:model-value="setLyricsAnimation"
          />
        </div>
      </div>
      <div class="settings-item-description">
        选择歌词页面显示和隐藏时的动画效果。
      </div>

      <div class="settings-item">
        <span>窗口关闭行为</span>
        <div class="select-container">
          <CustomSelect
            :model-value="uiStore.closeBehavior"
            :options="[
              { value: 'exit', label: '退出应用' },
              { value: 'minimize', label: '最小化到托盘' }
            ]"
            @change="setCloseBehavior"
            @update:model-value="setCloseBehavior"
          />
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
            <CustomButton type="secondary" @click="showEditLibraryModal = false">取消</CustomButton>
            <CustomButton type="primary" @click="handleUpdateLibrary">保存</CustomButton>
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
            <CustomButton type="secondary" @click="closeConfirmModal">取消</CustomButton>
            <CustomButton type="danger" @click="executeConfirmAction">确认</CustomButton>
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
            <CustomButton type="primary" @click="closeInfoModal">确定</CustomButton>
          </div>
        </div>
      </div>
    </div>

    <!-- 登录弹窗 -->
    <div class="modal-overlay" v-if="showLoginModal">
      <div class="modal">
        <div class="modal-content login-modal">
          <h3>QQ 音乐登录</h3>

          <!-- 选择登录方式 -->
          <div v-if="!authStore.qrCodeBase64 && authStore.qrStatus !== 'loading'" class="login-options">
            <p class="login-hint">请选择登录方式</p>
            <div class="login-buttons">
              <CustomButton type="primary" @click="handleLogin('qq')">
                QQ 登录
              </CustomButton>
              <CustomButton type="secondary" @click="handleLogin('wx')">
                微信登录
              </CustomButton>
            </div>
          </div>

          <!-- 加载中 -->
          <div v-else-if="authStore.qrStatus === 'loading'" class="qr-loading">
            <i class="fa fa-spinner fa-spin"></i>
            <p>正在获取二维码...</p>
          </div>

          <!-- 显示二维码 -->
          <div v-else class="qr-container">
            <img :src="'data:image/png;base64,' + authStore.qrCodeBase64" class="qr-image" />
            <p class="qr-hint">
              <span v-if="authStore.qrStatus === 'waiting'">请使用{{ authStore.loginType === 'qq' ? 'QQ' : '微信' }}扫描二维码</span>
              <span v-else-if="authStore.qrStatus === 'scanned'" class="qr-success">扫描成功，请在手机上确认</span>
              <span v-else-if="authStore.qrStatus === 'confirmed'" class="qr-success">已确认，正在登录...</span>
              <span v-else-if="authStore.qrStatus === 'done'" class="qr-success">登录成功！</span>
              <span v-else-if="authStore.qrStatus === 'expired'" class="qr-fail">
                二维码已过期
                <a class="qr-action" @click="handleLogin(authStore.loginType)">点击刷新</a>
              </span>
              <span v-else-if="authStore.qrStatus === 'error'" class="qr-fail">
                {{ authStore.qrMessage || '登录失败' }}
                <a class="qr-action" @click="handleLogin(authStore.loginType)">重试</a>
              </span>
            </p>
          </div>

          <div class="modal-buttons">
            <CustomButton type="secondary" @click="handleCloseLoginModal">关闭</CustomButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  padding: 24px;
  color: #ffffff;
  height: 100%;
  overflow-y: auto;
}

@media (max-width: 768px) {
  .settings-page { padding: 16px; }
}

.settings-page h2 {
  font-size: 20px;
  margin-bottom: 24px;
  font-weight: 700;
}

@media (max-width: 768px) {
  .settings-page h2 { font-size: 18px; margin-bottom: 16px; }
}

.settings-section {
  margin-bottom: 24px;
}

@media (max-width: 768px) {
  .settings-section { margin-bottom: 16px; }
}

.settings-section h3 {
  font-size: 14px;
  color: #b3b3b3;
  margin-bottom: 16px;
  border-bottom: 1px solid #282828;
  padding-bottom: 8px;
  font-weight: 500;
}

@media (max-width: 768px) {
  .settings-section h3 { font-size: 13px; }
}

.settings-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
}

@media (max-width: 768px) {
  .settings-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
}

.settings-item span {
  font-size: 12px;
  color: #ffffff;
}

@media (max-width: 768px) {
  .settings-item span { font-size: 10px; }
}

.select-container {
  position: relative;
}

.select-container::after {
  content: '▼';
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  font-size: 10px;
  color: #b3b3b3;
}

.select-container select {
  background-color: #282828;
  color: #ffffff;
  border: 1px solid #282828;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  appearance: none;
  padding-right: 30px;
  font-size: 12px;
}

.select-container select:hover {
  background-color: #383838;
  border-color: rgba(255, 255, 255, 0.1);
}

.select-container select:focus {
  outline: none;
  border-color: #4caf50;
}

@media (max-width: 768px) {
  .select-container select { width: 100%; font-size: 10px; }
}

.settings-item-description {
  font-size: 10px;
  color: #b3b3b3;
  margin-top: -8px;
  padding-bottom: 16px;
  line-height: 1.4;
}

@media (max-width: 768px) {
  .settings-item-description {
    margin-top: 0;
    padding-bottom: 12px;
  }
}

.library-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
  margin-top: 16px;
}

@media (max-width: 768px) {
  .library-grid { grid-template-columns: 1fr; gap: 16px; }
}

.library-card {
  background-color: #282828;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border: 1px solid transparent;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  min-height: 160px;
  animation: fadeIn 0.25s cubic-bezier(0.4, 0, 0.2, 1) ease-out;

  &:hover {
    border-color: rgba(255,255,255,0.1);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  @media (max-width: 768px) {
    min-height: 140px;
    padding: (16px * 0.75);
  }
}

.card-content {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.card-icon {
  color: #b3b3b3;
  margin-bottom: (16px * 0.75);

  @media (max-width: 768px) {
    margin-bottom: (16px * 0.5);
  }
}

.card-info {
  flex: 1;

  .library-name {
    font-size: 14px;
    font-weight: 600;
    color: #ffffff;
    display: block;
    margin-bottom: (16px * 0.25);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    @media (max-width: 768px) {
      font-size: 12px;
    }
  }

  .library-path {
    font-size: 10px;
    color: #b3b3b3;
    word-break: break-all;
    margin-bottom: (16px * 0.5);
    white-space: normal;
    line-height: 1.4;
    flex-grow: 1;
  }
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: (16px * 0.75);

  @media (max-width: 768px) {
    margin-top: (16px * 0.5);
  }
}

.card-stats {
  display: flex;
  align-items: center;
  gap: (16px * 0.375);
  font-size: 10px;
  color: #b3b3b3;
}

.library-actions {
  display: flex;
  gap: (16px * 0.5);
  opacity: 0;
  transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);

  @media (max-width: 768px) {
    opacity: 1;
  }
}

.library-card:hover .library-actions {
  opacity: 1;
}

.btn-icon {
  background: #181818;
  border: 1px solid rgba(255,255,255,0.1);
  color: #ffffff;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    background: rgba(255,255,255,0.1);
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }

  &.btn-danger:hover {
    background: #f44336;
    border-color: #f44336;
  }

  @media (max-width: 768px) {
    width: 28px;
    height: 28px;
  }
}

.add-library-card {
  border: 2px dashed rgba(255,255,255,0.1);
  background-color: transparent;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #b3b3b3;
  gap: (16px * 0.75);

  &:hover {
    background-color: #282828;
    border-color: #4caf50;
    color: #ffffff;
    transform: translateY(-2px);
  }
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0,0,0,0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  animation: fadeIn 0.15s cubic-bezier(0.4, 0, 0.2, 1) ease-out;
}

.modal {
  animation: modalSlideIn 0.25s cubic-bezier(0.4, 0, 0.2, 1) ease-out;
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
  background-color: #181818;
  color: #ffffff;
  padding: (16px * 1.875);
  border-radius: (4px * 3);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  width: 90%;
  max-width: 450px;
  text-align: center;
  border: 1px solid #282828;

  @media (max-width: 768px) {
    padding: (16px * 1.25);
    max-width: 320px;
  }

  h3 {
    margin-top: 0;
    font-size: 18px;
    margin-bottom: (16px * 1.25);
    font-weight: 600;

    @media (max-width: 768px) {
      font-size: 14px;
      margin-bottom: 16px;
    }
  }

  p {
    color: #b3b3b3;
    margin-bottom: (16px * 1.25);
    font-size: 12px;
    line-height: 1.5;

    @media (max-width: 768px) {
      font-size: 10px;
      margin-bottom: 16px;
    }
  }
}

.modal-buttons {
  display: flex;
  justify-content: center;
  gap: (16px * 1.25);
  margin-top: (16px * 1.5625);

  @media (max-width: 768px) {
    gap: 16px;
    margin-top: (16px * 1.25);
  }
}

.final-message {
  font-size: 14px;
  margin: (16px * 1.25) 0;
  min-height: 22px;

  @media (max-width: 768px) {
    font-size: 12px;
    margin: 16px 0;
  }
}

.modal-input {
  width: 100%;
  padding: (16px * 0.625);
  margin: 16px 0;
  background-color: #282828;
  border: 1px solid rgba(255,255,255,0.1);
  color: #ffffff;
  border-radius: 4px;
  font-size: 12px;
  transition: border-color 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: #4caf50;
  }

  &::placeholder {
    color: #535353;
  }

  @media (max-width: 768px) {
    font-size: 10px;
    padding: (16px * 0.5);
  }
}

/* High contrast */
@media (prefers-contrast: high) {

  .library-card,
  .modal-content {
    border-width: 2px;
    border-color: #ffffff;
  }

  .modal-input,
  select {
    border-width: 2px;
  }
}

/* Reduced motion */
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

/* Login styles */
.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-info .user-detail {
  display: flex;
  flex-direction: column;
}

.user-info .user-name {
  font-size: 12px;
  color: #ffffff;
  font-weight: 500;
}

.user-info .user-id {
  font-size: 10px;
  color: #b3b3b3;
}

.user-info .credential-expired {
  font-size: 10px;
  color: #f44336;
  margin-left: 8px;
}

.user-actions {
  display: flex;
  gap: 8px;
}

.login-modal {
  max-width: 380px !important;
}

.login-options {
  text-align: center;
  padding: 16px 0;
}

.login-options .login-hint {
  color: #b3b3b3;
  margin-bottom: 20px;
}

.login-options .login-buttons {
  display: flex;
  gap: 16px;
  justify-content: center;
}

.qr-loading {
  text-align: center;
  padding: 32px 0;
}

.qr-loading i {
  font-size: 36px;
  color: #b3b3b3;
}

.qr-loading p {
  margin-top: 16px;
  color: #b3b3b3;
}

.qr-container {
  text-align: center;
  padding: 16px 0;
}

.qr-container .qr-image {
  width: 200px;
  height: 200px;
  border-radius: 4px;
  border: 1px solid #282828;
  background-color: #fff;
}

.qr-container .qr-hint {
  margin-top: 20px;
  font-size: 12px;
  color: #b3b3b3;
}

.qr-success { color: #4caf50; }
.qr-fail { color: #f44336; }
.qr-action { color: #4caf50; cursor: pointer; text-decoration: underline; margin-left: 4px; }
</style>