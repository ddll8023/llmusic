<script setup>
import { useMediaStore } from '../../store/media';
import { usePlayerStore, PlayMode } from '../../store/player';
import { ref, onMounted, watch, computed } from 'vue';
import ContentHeader from '../common/ContentHeader.vue';

const mediaStore = useMediaStore();
const playerStore = usePlayerStore();

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

// 头部操作按钮配置
const headerActions = computed(() => [
  {
    key: 'play-all',
    label: '播放全部',
    icon: 'play',
    type: 'primary',
    disabled: !mediaStore.songs.length
  }
]);

// 处理头部操作按钮点击
const handleHeaderAction = (actionKey) => {
  if (actionKey === 'play-all') {
    playAllSongs();
  }
};

// 处理搜索输入
const handleSearchInput = (value) => {
  // 搜索逻辑已经在防抖函数中处理，这里只需要确保本地搜索词同步
  localSearchTerm.value = value;
};

// 播放全部歌曲
const playAllSongs = () => {
  if (!mediaStore.songs.length) {
    alert("当前音乐库中没有歌曲。");
    return;
  }

  // activeLibraryId 为 null 代表"所有音乐"，这是有效的选择

  // 根据当前播放模式确定起始歌曲
  let songToPlayId;

  if (playerStore.playMode === PlayMode.RANDOM) {
    // 随机播放模式：随机选择一首歌曲
    const randomIndex = Math.floor(Math.random() * mediaStore.songs.length);
    songToPlayId = mediaStore.songs[randomIndex].id;
  } else {
    // 顺序播放和单曲循环模式：从第一首开始
    songToPlayId = mediaStore.songs[0].id;
  }

  // 播放全部歌曲
  playerStore.playSongFromList({
    listId: mediaStore.activeLibraryId ? `library-${mediaStore.activeLibraryId}` : 'library-all',
    songIds: mediaStore.songs.map(song => song.id),
    songToPlayId: songToPlayId
  });
};


</script>

<template>
  <ContentHeader title="本地音乐" :show-search="true" :search-value="mediaStore.searchTerm" search-placeholder="筛选歌曲、专辑或艺术家"
    :actions="headerActions" @search-input="handleSearchInput" @action-click="handleHeaderAction" />
</template>
