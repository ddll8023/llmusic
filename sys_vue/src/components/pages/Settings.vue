<script setup>
import { useMediaStore } from '../../store/media';
import { usePlayerStore } from '../../store/player';
import { useUiStore } from '../../store/ui';
import { useAuthStore } from '../../store/auth';
import { ref, onMounted } from 'vue';
import FAIcon from '../common/FAIcon.vue';
import CustomButton from '../custom/CustomButton.vue';
import CustomInput from '../custom/CustomInput.vue';
import CustomModal from '../custom/CustomModal.vue';
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
  <div class="p-6 text-content-base h-full overflow-y-auto max-md:p-4">
    <h2 class="text-xl mb-6 font-bold max-md:text-lg max-md:mb-4">设置</h2>

    <div class="mb-6 max-md:mb-4">
      <h3 class="text-sm text-content-secondary mb-4 border-b border-line-base pb-2 font-medium max-md:text-[13px]">音乐库管理</h3>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5 mt-4 max-md:grid-cols-1 max-md:gap-4">
        <!-- 循环显示已有的音乐库 -->
        <div v-for="lib in mediaStore.libraries" :key="lib.id" class="group bg-surface-overlay rounded-lg p-4 flex flex-col justify-between border border-transparent transition-all duration-200 min-h-[160px] fade-in max-md:min-h-[140px] max-md:p-3 hover:border-overlay-light hover:-translate-y-0.5 hover:shadow-lg">
          <div class="flex flex-col flex-1">
            <div class="text-content-secondary mb-3 max-md:mb-2">
              <FAIcon name="folder" size="xl" color="secondary" />
            </div>
            <div class="flex-1">
              <span class="text-sm font-semibold text-content-base block mb-1 whitespace-nowrap overflow-hidden text-ellipsis max-md:text-xs">{{ lib.name }}</span>
              <span class="text-[10px] text-content-secondary break-all mb-2 whitespace-normal leading-normal flex-grow">{{ lib.path }}</span>
            </div>
          </div>
          <div class="flex justify-between items-center mt-3 max-md:mt-2">
            <div class="flex items-center gap-1.5 text-[10px] text-content-secondary">
              <FAIcon name="music" size="small" color="secondary" />
              <span>{{ lib.songCount }} 首歌曲</span>
            </div>
            <div class="flex gap-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 max-md:opacity-100">
              <CustomButton type="icon-only" icon="edit" circle size="medium" @click="openEditLibraryModal(lib)" title="重命名" />
              <CustomButton type="icon-only" icon="refresh" circle size="medium" @click="handleRescanLibrary(lib)" title="重新扫描" />
              <CustomButton type="danger" icon="trash" circle size="medium" @click="handleRemoveLibrary(lib)" title="移除" />
            </div>
          </div>
        </div>

        <!-- 添加新库的卡片 -->
        <div class="rounded-lg p-4 flex flex-col justify-between transition-all duration-200 min-h-[160px] fade-in max-md:min-h-[140px] max-md:p-3 border-2 border-dashed border-overlay-light bg-transparent items-center justify-center cursor-pointer text-content-secondary gap-3 hover:bg-surface-overlay hover:border-accent-green hover:text-content-base hover:-translate-y-0.5" @click="handleAddLibrary">
          <FAIcon name="plus" size="xl" color="secondary" />
          <span>添加新库</span>
        </div>
      </div>
    </div>

    <div class="mb-6 max-md:mb-4">
      <h3 class="text-sm text-content-secondary mb-4 border-b border-line-base pb-2 font-medium max-md:text-[13px]">账号</h3>
      <div v-if="authStore.isLoggedIn" class="flex justify-between items-center py-3 max-md:flex-col max-md:items-start max-md:gap-2">
        <div class="flex items-center gap-3">
          <FAIcon name="user" size="xl" color="secondary" />
          <div class="flex flex-col">
            <span class="text-xs text-content-base font-medium">QQ 音乐用户</span>
            <span class="text-[10px] text-content-secondary">ID: {{ authStore.userInfo.encrypt_uin }}</span>
          </div>
          <span v-if="authStore.isExpired" class="text-[10px] text-accent-danger ml-2">凭证已过期</span>
        </div>
        <div class="flex gap-2">
          <CustomButton v-if="authStore.isExpired" type="primary" size="medium" @click="handleOpenLoginModal">
            重新登录
          </CustomButton>
          <CustomButton type="danger" size="medium" @click="handleLogout">
            退出登录
          </CustomButton>
        </div>
      </div>
      <div v-else class="flex justify-between items-center py-3 max-md:flex-col max-md:items-start max-md:gap-2">
        <span class="text-xs text-content-base max-md:text-[10px]">未登录 QQ 音乐</span>
        <CustomButton type="primary" size="medium" @click="handleOpenLoginModal">
          登录
        </CustomButton>
      </div>
      <div class="text-[10px] text-content-secondary -mt-2 pb-4 leading-normal max-md:mt-0 max-md:pb-3">
        登录后可使用在线搜索、试听和下载功能。
      </div>
    </div>

    <div class="mb-6 max-md:mb-4">
      <h3 class="text-sm text-content-secondary mb-4 border-b border-line-base pb-2 font-medium max-md:text-[13px]">界面</h3>
      <div class="flex justify-between items-center py-3 max-md:flex-col max-md:items-start max-md:gap-2">
        <span class="text-xs text-content-base max-md:text-[10px]">歌词页面动画效果</span>
        <div>
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
      <div class="text-[10px] text-content-secondary -mt-2 pb-4 leading-normal max-md:mt-0 max-md:pb-3">
        选择歌词页面显示和隐藏时的动画效果。
      </div>

      <div class="flex justify-between items-center py-3 max-md:flex-col max-md:items-start max-md:gap-2">
        <span class="text-xs text-content-base max-md:text-[10px]">窗口关闭行为</span>
        <div>
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
      <div class="text-[10px] text-content-secondary -mt-2 pb-4 leading-normal max-md:mt-0 max-md:pb-3">
        选择点击窗口关闭按钮时的行为：完全退出应用或最小化到系统托盘。最小化后可通过点击托盘图标恢复窗口。
      </div>
    </div>

    <CustomModal :show="showEditLibraryModal" title="重命名音乐库" :confirm-text="'保存'" confirm-type="primary" @close="showEditLibraryModal = false" @confirm="handleUpdateLibrary" @cancel="showEditLibraryModal = false">
      <p class="text-content-secondary mb-5 text-xs leading-relaxed">为您的音乐库"{{ editingLibrary.name }}"输入一个新名称。</p>
      <CustomInput type="text" v-model="newLibraryName" placeholder="新音乐库名称" size="large" />
    </CustomModal>

    <CustomModal :show="showConfirmModal" :title="confirmModalTitle" confirm-text="确认" confirm-type="danger" @close="closeConfirmModal" @confirm="executeConfirmAction" @cancel="closeConfirmModal">
      <p class="text-content-secondary text-xs leading-relaxed">{{ confirmModalMessage }}</p>
    </CustomModal>

    <CustomModal :show="showInfoModal" :title="infoModalTitle" confirm-text="确定" @close="closeInfoModal" @confirm="closeInfoModal" cancel-text="">
      <p class="text-sm text-content-secondary leading-relaxed">{{ infoModalMessage }}</p>
    </CustomModal>

    <CustomModal :show="showLoginModal" title="QQ 音乐登录" :show-footer="false" @close="handleCloseLoginModal">
      <div v-if="!authStore.qrCodeBase64 && authStore.qrStatus !== 'loading'" class="text-center py-4">
        <p class="text-content-secondary mb-5 text-xs leading-relaxed">请选择登录方式</p>
        <div class="flex gap-4 justify-center">
          <CustomButton type="primary" @click="handleLogin('qq')">QQ 登录</CustomButton>
          <CustomButton type="secondary" @click="handleLogin('wx')">微信登录</CustomButton>
        </div>
      </div>
      <div v-else-if="authStore.qrStatus === 'loading'" class="text-center py-8">
        <FAIcon name="spinner" size="xl" color="secondary" class="animate-spin" />
        <p class="mt-4 text-content-secondary text-xs leading-relaxed">正在获取二维码...</p>
      </div>
      <div v-else class="text-center py-4">
        <img :src="'data:image/png;base64,' + authStore.qrCodeBase64" class="w-[200px] h-[200px] rounded border border-line-base bg-white inline-block" />
        <p class="mt-5 text-xs text-content-secondary">
          <span v-if="authStore.qrStatus === 'waiting'">请使用{{ authStore.loginType === 'qq' ? 'QQ' : '微信' }}扫描二维码</span>
          <span v-else-if="authStore.qrStatus === 'scanned'" class="text-accent-green">扫描成功，请在手机上确认</span>
          <span v-else-if="authStore.qrStatus === 'confirmed'" class="text-accent-green">已确认，正在登录...</span>
          <span v-else-if="authStore.qrStatus === 'done'" class="text-accent-green">登录成功！</span>
          <span v-else-if="authStore.qrStatus === 'expired'" class="text-accent-danger">
            二维码已过期
            <CustomButton type="secondary" size="small" customClass="underline text-accent-green!" @click="handleLogin(authStore.loginType)">点击刷新</CustomButton>
          </span>
          <span v-else-if="authStore.qrStatus === 'error'" class="text-accent-danger">
            {{ authStore.qrMessage || '登录失败' }}
            <CustomButton type="secondary" size="small" customClass="underline text-accent-green!" @click="handleLogin(authStore.loginType)">重试</CustomButton>
          </span>
        </p>
      </div>
      <template #footer>
        <CustomButton type="secondary" @click="handleCloseLoginModal">关闭</CustomButton>
      </template>
    </CustomModal>
  </div>
</template>
