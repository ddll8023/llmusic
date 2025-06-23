<script setup>
import { useUiStore } from '../store/ui';
import { useMediaStore } from '../store/media';
import { usePlayerStore, PlayMode } from '../store/player';
import { ref, computed, onUnmounted, watch, onMounted } from 'vue';
import Icon from './Icon.vue';

const uiStore = useUiStore();
const mediaStore = useMediaStore();
const playerStore = usePlayerStore();

// 是否显示扫描进度弹窗
const showProgress = ref(false);
// 是否清空现有歌曲库
const clearExisting = ref(false);
// 扫描动画计数器
const scanAnimationCounter = ref(0);
// 是否显示通用信息弹窗
const showInfoModal = ref(false);
const infoModalMessage = ref("");
const infoModalTitle = ref("");

// --- 搜索功能 ---
const localSearchTerm = ref('');

// 防抖函数
const debounce = (func, delay) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
};

// 创建防抖版的 setSearchTerm action 调用
const debouncedSetSearchTerm = debounce((term) => {
  mediaStore.setSearchTerm(term);
}, 300);

// 更新搜索词的函数
const updateSearchTerm = (event) => {
  localSearchTerm.value = event.target.value;
};

// 监听本地搜索词的变化，并调用防抖函数
watch(localSearchTerm, (newTerm) => {
  debouncedSetSearchTerm(newTerm);
});
// --- 搜索功能结束 ---

// 组件挂载时清除任何可能存在的焦点，防止汉堡按钮自动高亮
onMounted(() => {
  // 使用setTimeout确保DOM完全加载后再清除焦点
  setTimeout(() => {
    if (document.activeElement) {
      document.activeElement.blur();
    }
  }, 100);
});

const playModeText = computed(() => "本地");

const playAllSongs = () => {
  if (mediaStore.songs.length > 0) {
    const songIds = mediaStore.songs.map(s => s.id);
    let songToPlayId = songIds[0];

    if (playerStore.playMode === PlayMode.RANDOM) {
      const randomIndex = Math.floor(Math.random() * songIds.length);
      songToPlayId = songIds[randomIndex];
    }

    playerStore.playSongFromList({
      listId: 'all-songs',
      songIds: songIds,
      songToPlayId: songToPlayId,
    });
  }
};

// 开始扫描音乐
const startScan = async () => {
  if (mediaStore.scanning) {
    // 可以在这里提示用户扫描正在进行
    return;
  }
  if (!mediaStore.activeLibraryId) {
    alert("请先在左侧选择一个音乐库进行扫描。");
    return;
  }
  await mediaStore.scanMusic(mediaStore.activeLibraryId, true);
};

// 取消扫描
const cancelScan = async () => {
  await mediaStore.cancelScan();

  // 无论取消结果如何，确保关闭扫描进度弹窗
  setTimeout(() => {
    showProgress.value = false;
    // 如果扫描状态还是true，手动设置为false
    if (mediaStore.scanning) {
      mediaStore.scanning = false;
      mediaStore.scanProgress.phase = "canceled";
      mediaStore.scanProgress.message = "扫描已取消";
    }
  }, 1000);
};

// 扫描动画
let scanAnimationInterval = null;
const startScanAnimation = () => {
  // 清除可能存在的旧定时器
  if (scanAnimationInterval) {
    clearInterval(scanAnimationInterval);
  }

  scanAnimationCounter.value = 0;
  scanAnimationInterval = setInterval(() => {
    scanAnimationCounter.value = (scanAnimationCounter.value + 1) % 4;
  }, 500); // 每500毫秒更新一次动画状态
};

// 停止扫描动画
const stopScanAnimation = () => {
  if (scanAnimationInterval) {
    clearInterval(scanAnimationInterval);
    scanAnimationInterval = null;
  }
};

// 计算动画点数
const animationDots = computed(() => {
  return '.'.repeat(scanAnimationCounter.value + 1);
});

// 在组件卸载时清除动画
onUnmounted(() => {
  stopScanAnimation();
});

// 监听扫描状态变化
watch(() => mediaStore.scanning, (newValue) => {
  if (!newValue) {
    stopScanAnimation();
  } else if (newValue && !scanAnimationInterval) {
    startScanAnimation();
  }
});

// 监听扫描阶段变化，当变为canceled时自动关闭弹窗
watch(() => mediaStore.scanProgress.phase, (newPhase) => {
  if (newPhase === 'canceled') {
    setTimeout(() => {
      showProgress.value = false;
    }, 1000);
  }
});

// 格式化文件路径显示
const formatPath = (path) => {
  if (!path) return '';
  const parts = path.split(/[/\\]/);
  if (parts.length <= 3) return path;

  return `.../${parts.slice(-3).join('/')}`;
};

// 计算属性
const progressBarWidth = computed(() => {
  if (!mediaStore.scanning || mediaStore.scanProgress.total === 0) {
    return '0%';
  }
  const percentage = (mediaStore.scanProgress.processed / mediaStore.scanProgress.total) * 100;
  return `${percentage}%`;
});

</script>

<template>
  <div class="header-container">
    <div class="title-and-search">
      <h2 class="header-title">本地音乐</h2>
      <div class="search-container">
        <Icon name="search" class="search-icon" />
        <input type="text" :value="mediaStore.searchTerm" @input="updateSearchTerm" class="search-box"
          placeholder="筛选歌曲、专辑或艺术家" />
      </div>
    </div>
    <button class="scan-button" @click="startScan" :disabled="mediaStore.scanning || !mediaStore.activeLibraryId">
      <Icon name="scan" />
      <span v-if="!mediaStore.scanning">重新扫描当前库</span>
      <span v-else>扫描中...</span>
    </button>
  </div>
</template>

<style scoped>
.header-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background-color: #1a1a1a;
  border-bottom: 1px solid #282828;
}

.title-and-search {
  display: flex;
  align-items: center;
  gap: 24px;
}

.header-title {
  font-size: 24px;
  font-weight: bold;
  color: #fff;
  margin: 0;
}

.search-container {
  position: relative;
}

.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: #b3b3b3;
}

.search-box {
  background-color: #333;
  border: 1px solid #535353;
  border-radius: 20px;
  color: #fff;
  padding: 8px 12px 8px 36px;
  width: 300px;
  transition: border-color 0.2s;
}

.search-box::placeholder {
  color: #b3b3b3;
}

.search-box:focus {
  border-color: #1db954;
  outline: none;
}

.scan-button {
  padding: 10px 20px;
  background-color: #1db954;
  color: #fff;
  border: none;
  border-radius: 20px;
  cursor: pointer;
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background-color 0.2s;
}

.scan-button:hover:not(:disabled) {
  background-color: #1ed760;
}

.scan-button:disabled {
  background-color: #535353;
  cursor: not-allowed;
}
</style>