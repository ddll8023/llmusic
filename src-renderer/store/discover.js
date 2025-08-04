import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { mockDiscoverData, mockSearch } from '../utils/mockDiscoverData.js';
import { analyzeMusicLink, isValidUrl, isMusicLink } from '../utils/linkAnalyzer.js';

export const useDiscoverStore = defineStore('discover', () => {
  // 状态
  const loading = ref(false);
  const searchTerm = ref('');
  const searchResults = ref({
    songs: [],
    artists: [],
    playlists: []
  });
  const searchHistory = ref([]);
  const currentTab = ref('recommend'); // recommend, search, link-analysis
  const linkAnalysisResult = ref(null);
  const linkAnalysisLoading = ref(false);
  const linkInput = ref('');

  // 推荐数据
  const recommendedSongs = ref(mockDiscoverData.recommendedSongs);
  const hotPlaylists = ref(mockDiscoverData.hotPlaylists);
  const hotArtists = ref(mockDiscoverData.hotArtists);
  const categories = ref(mockDiscoverData.categories);

  // 计算属性
  const hasSearchResults = computed(() => {
    return searchResults.value.songs.length > 0 ||
           searchResults.value.artists.length > 0 ||
           searchResults.value.playlists.length > 0;
  });

  const isSearching = computed(() => {
    return searchTerm.value.length > 0;
  });

  const canAnalyzeLink = computed(() => {
    return linkInput.value.length > 0 && 
           isValidUrl(linkInput.value) && 
           isMusicLink(linkInput.value);
  });

  // 搜索功能
  const search = async (keyword, type = 'all') => {
    if (!keyword.trim()) {
      clearSearch();
      return;
    }

    loading.value = true;
    searchTerm.value = keyword;

    try {
      // 模拟搜索延迟
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const results = mockSearch(keyword, type);
      searchResults.value = results;

      // 添加到搜索历史
      addToSearchHistory(keyword);
    } catch (error) {
      console.error('搜索失败:', error);
    } finally {
      loading.value = false;
    }
  };

  // 清空搜索
  const clearSearch = () => {
    searchTerm.value = '';
    searchResults.value = {
      songs: [],
      artists: [],
      playlists: []
    };
  };

  // 添加到搜索历史
  const addToSearchHistory = (keyword) => {
    const trimmedKeyword = keyword.trim();
    if (!trimmedKeyword) return;

    // 移除重复项
    const index = searchHistory.value.indexOf(trimmedKeyword);
    if (index > -1) {
      searchHistory.value.splice(index, 1);
    }

    // 添加到开头
    searchHistory.value.unshift(trimmedKeyword);

    // 限制历史记录数量
    if (searchHistory.value.length > 10) {
      searchHistory.value = searchHistory.value.slice(0, 10);
    }

    // 保存到本地存储
    try {
      localStorage.setItem('discover_search_history', JSON.stringify(searchHistory.value));
    } catch (error) {
      console.error('保存搜索历史失败:', error);
    }
  };

  // 清空搜索历史
  const clearSearchHistory = () => {
    searchHistory.value = [];
    try {
      localStorage.removeItem('discover_search_history');
    } catch (error) {
      console.error('清空搜索历史失败:', error);
    }
  };

  // 从搜索历史中删除项目
  const removeFromSearchHistory = (keyword) => {
    const index = searchHistory.value.indexOf(keyword);
    if (index > -1) {
      searchHistory.value.splice(index, 1);
      try {
        localStorage.setItem('discover_search_history', JSON.stringify(searchHistory.value));
      } catch (error) {
        console.error('更新搜索历史失败:', error);
      }
    }
  };

  // 链接分析功能
  const analyzeLink = async (url) => {
    if (!url || !isValidUrl(url) || !isMusicLink(url)) {
      return;
    }

    linkAnalysisLoading.value = true;
    linkAnalysisResult.value = null;

    try {
      const result = await analyzeMusicLink(url);
      linkAnalysisResult.value = result;
    } catch (error) {
      console.error('链接分析失败:', error);
      linkAnalysisResult.value = {
        isValid: false,
        error: '链接分析失败: ' + error.message,
        steps: [
          {
            step: '链接分析',
            status: 'error',
            details: error.message,
            timestamp: new Date().toLocaleTimeString()
          }
        ]
      };
    } finally {
      linkAnalysisLoading.value = false;
    }
  };

  // 清空链接分析结果
  const clearLinkAnalysis = () => {
    linkAnalysisResult.value = null;
    linkInput.value = '';
  };

  // 切换标签页
  const setCurrentTab = (tab) => {
    currentTab.value = tab;
    
    // 切换标签时清空相关状态
    if (tab !== 'search') {
      clearSearch();
    }
    if (tab !== 'link-analysis') {
      clearLinkAnalysis();
    }
  };

  // 获取推荐歌曲（按分类）
  const getRecommendedSongsByCategory = (categoryId) => {
    // 这里可以根据分类过滤歌曲，目前返回所有推荐歌曲
    return recommendedSongs.value;
  };

  // 刷新推荐内容
  const refreshRecommendations = async () => {
    loading.value = true;
    try {
      // 模拟刷新延迟
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 这里可以重新获取推荐数据
      // 目前使用静态数据，可以打乱顺序模拟刷新
      recommendedSongs.value = [...mockDiscoverData.recommendedSongs].sort(() => Math.random() - 0.5);
      hotPlaylists.value = [...mockDiscoverData.hotPlaylists].sort(() => Math.random() - 0.5);
    } catch (error) {
      console.error('刷新推荐内容失败:', error);
    } finally {
      loading.value = false;
    }
  };

  // 初始化
  const init = () => {
    // 从本地存储加载搜索历史
    try {
      const savedHistory = localStorage.getItem('discover_search_history');
      if (savedHistory) {
        searchHistory.value = JSON.parse(savedHistory);
      }
    } catch (error) {
      console.error('加载搜索历史失败:', error);
    }
  };

  // 返回状态和方法
  return {
    // 状态
    loading,
    searchTerm,
    searchResults,
    searchHistory,
    currentTab,
    linkAnalysisResult,
    linkAnalysisLoading,
    linkInput,
    recommendedSongs,
    hotPlaylists,
    hotArtists,
    categories,

    // 计算属性
    hasSearchResults,
    isSearching,
    canAnalyzeLink,

    // 方法
    search,
    clearSearch,
    addToSearchHistory,
    clearSearchHistory,
    removeFromSearchHistory,
    analyzeLink,
    clearLinkAnalysis,
    setCurrentTab,
    getRecommendedSongsByCategory,
    refreshRecommendations,
    init
  };
});
