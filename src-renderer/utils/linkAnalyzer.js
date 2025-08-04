// 音乐平台链接分析工具

// 支持的音乐平台配置
const PLATFORMS = {
  NETEASE: {
    name: '网易云音乐',
    domain: 'music.163.com',
    color: '#C20C0C',
    icon: 'netease'
  },
  QQ: {
    name: 'QQ音乐',
    domain: 'y.qq.com',
    color: '#31C27C',
    icon: 'qq-music'
  },
  KUGOU: {
    name: '酷狗音乐',
    domain: 'kugou.com',
    color: '#2CA2F7',
    icon: 'kugou'
  },
  KUWO: {
    name: '酷我音乐',
    domain: 'kuwo.cn',
    color: '#F39800',
    icon: 'kuwo'
  }
};

// 链接类型
const LINK_TYPES = {
  SONG: 'song',
  PLAYLIST: 'playlist',
  ALBUM: 'album',
  ARTIST: 'artist'
};

// 链接分析结果类
class LinkAnalysisResult {
  constructor() {
    this.isValid = false;
    this.platform = null;
    this.type = null;
    this.id = null;
    this.url = null;
    this.steps = [];
    this.mockData = null;
    this.error = null;
  }

  addStep(step, status = 'success', details = '') {
    this.steps.push({
      step,
      status, // 'success', 'warning', 'error'
      details,
      timestamp: new Date().toLocaleTimeString()
    });
  }
}

// 检测平台类型
function detectPlatform(url) {
  const urlLower = url.toLowerCase();
  
  if (urlLower.includes('music.163.com')) {
    return PLATFORMS.NETEASE;
  } else if (urlLower.includes('y.qq.com')) {
    return PLATFORMS.QQ;
  } else if (urlLower.includes('kugou.com')) {
    return PLATFORMS.KUGOU;
  } else if (urlLower.includes('kuwo.cn')) {
    return PLATFORMS.KUWO;
  }
  
  return null;
}

// 解析网易云音乐链接
function parseNeteaseLink(url) {
  const result = new LinkAnalysisResult();
  result.url = url;
  result.platform = PLATFORMS.NETEASE;
  
  result.addStep('检测到网易云音乐链接', 'success');
  
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const searchParams = urlObj.searchParams;
    
    // 解析链接类型和ID
    if (pathname.includes('/song')) {
      result.type = LINK_TYPES.SONG;
      result.id = searchParams.get('id');
      result.addStep('识别为歌曲链接', 'success', `歌曲ID: ${result.id}`);
    } else if (pathname.includes('/playlist')) {
      result.type = LINK_TYPES.PLAYLIST;
      result.id = searchParams.get('id');
      result.addStep('识别为歌单链接', 'success', `歌单ID: ${result.id}`);
    } else if (pathname.includes('/album')) {
      result.type = LINK_TYPES.ALBUM;
      result.id = searchParams.get('id');
      result.addStep('识别为专辑链接', 'success', `专辑ID: ${result.id}`);
    } else if (pathname.includes('/artist')) {
      result.type = LINK_TYPES.ARTIST;
      result.id = searchParams.get('id');
      result.addStep('识别为艺术家链接', 'success', `艺术家ID: ${result.id}`);
    } else {
      result.addStep('无法识别链接类型', 'error');
      return result;
    }
    
    if (result.id) {
      result.isValid = true;
      result.addStep('链接解析成功', 'success');
    } else {
      result.addStep('未找到有效ID', 'error');
    }
    
  } catch (error) {
    result.addStep('链接解析失败', 'error', error.message);
    result.error = error.message;
  }
  
  return result;
}

// 解析QQ音乐链接
function parseQQMusicLink(url) {
  const result = new LinkAnalysisResult();
  result.url = url;
  result.platform = PLATFORMS.QQ;
  
  result.addStep('检测到QQ音乐链接', 'success');
  
  try {
    // QQ音乐链接格式较复杂，这里简化处理
    if (url.includes('/song/')) {
      result.type = LINK_TYPES.SONG;
      const match = url.match(/\/song\/([^.]+)/);
      result.id = match ? match[1] : null;
      result.addStep('识别为歌曲链接', 'success', `歌曲ID: ${result.id}`);
    } else if (url.includes('/playsquare/')) {
      result.type = LINK_TYPES.PLAYLIST;
      const match = url.match(/\/playsquare\/([^.]+)/);
      result.id = match ? match[1] : null;
      result.addStep('识别为歌单链接', 'success', `歌单ID: ${result.id}`);
    } else {
      result.addStep('无法识别链接类型', 'warning', '可能是新的链接格式');
    }
    
    if (result.id) {
      result.isValid = true;
      result.addStep('链接解析成功', 'success');
    } else {
      result.addStep('未找到有效ID', 'error');
    }
    
  } catch (error) {
    result.addStep('链接解析失败', 'error', error.message);
    result.error = error.message;
  }
  
  return result;
}

// 解析酷狗音乐链接
function parseKugouLink(url) {
  const result = new LinkAnalysisResult();
  result.url = url;
  result.platform = PLATFORMS.KUGOU;
  
  result.addStep('检测到酷狗音乐链接', 'success');
  
  try {
    if (url.includes('/song/')) {
      result.type = LINK_TYPES.SONG;
      const match = url.match(/#hash=([^&]+)/);
      result.id = match ? match[1] : null;
      result.addStep('识别为歌曲链接', 'success', `歌曲Hash: ${result.id}`);
    } else {
      result.addStep('无法识别链接类型', 'warning', '可能是新的链接格式');
    }
    
    if (result.id) {
      result.isValid = true;
      result.addStep('链接解析成功', 'success');
    } else {
      result.addStep('未找到有效ID', 'error');
    }
    
  } catch (error) {
    result.addStep('链接解析失败', 'error', error.message);
    result.error = error.message;
  }
  
  return result;
}

// 生成模拟数据
function generateMockData(result) {
  if (!result.isValid) return null;
  
  const mockData = {
    platform: result.platform.name,
    type: result.type,
    id: result.id
  };
  
  // 根据类型生成不同的模拟数据
  switch (result.type) {
    case LINK_TYPES.SONG:
      mockData.title = '示例歌曲';
      mockData.artist = '示例艺术家';
      mockData.album = '示例专辑';
      mockData.duration = 240;
      mockData.cover = '/img/defualt_img.jpg';
      mockData.playCount = Math.floor(Math.random() * 10000000);
      break;
      
    case LINK_TYPES.PLAYLIST:
      mockData.name = '示例歌单';
      mockData.creator = '示例用户';
      mockData.songCount = Math.floor(Math.random() * 100) + 10;
      mockData.cover = '/img/defualt_img.jpg';
      mockData.playCount = Math.floor(Math.random() * 50000000);
      mockData.description = '这是一个示例歌单的描述';
      break;
      
    case LINK_TYPES.ALBUM:
      mockData.name = '示例专辑';
      mockData.artist = '示例艺术家';
      mockData.songCount = Math.floor(Math.random() * 20) + 5;
      mockData.cover = '/img/defualt_img.jpg';
      mockData.releaseDate = '2024-01-01';
      break;
      
    case LINK_TYPES.ARTIST:
      mockData.name = '示例艺术家';
      mockData.avatar = '/img/defualt_img.jpg';
      mockData.songCount = Math.floor(Math.random() * 200) + 50;
      mockData.fanCount = Math.floor(Math.random() * 10000000);
      mockData.description = '这是一个示例艺术家的简介';
      break;
  }
  
  return mockData;
}

// 主要的链接分析函数
export async function analyzeMusicLink(url) {
  return new Promise((resolve) => {
    // 模拟异步处理
    setTimeout(() => {
      let result;
      
      // 检测平台
      const platform = detectPlatform(url);
      
      if (!platform) {
        result = new LinkAnalysisResult();
        result.url = url;
        result.addStep('检测链接平台', 'error', '不支持的音乐平台');
        result.error = '不支持的音乐平台';
        resolve(result);
        return;
      }
      
      // 根据平台解析链接
      switch (platform) {
        case PLATFORMS.NETEASE:
          result = parseNeteaseLink(url);
          break;
        case PLATFORMS.QQ:
          result = parseQQMusicLink(url);
          break;
        case PLATFORMS.KUGOU:
          result = parseKugouLink(url);
          break;
        default:
          result = new LinkAnalysisResult();
          result.url = url;
          result.addStep('解析链接', 'error', '暂不支持该平台');
          break;
      }
      
      // 生成模拟数据
      if (result.isValid) {
        result.addStep('生成模拟数据', 'success');
        result.mockData = generateMockData(result);
      }
      
      resolve(result);
    }, 1500); // 模拟网络延迟
  });
}

// 验证URL格式
export function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

// 检测是否为音乐链接
export function isMusicLink(url) {
  const platform = detectPlatform(url);
  return platform !== null;
}

// 导出常量
export { PLATFORMS, LINK_TYPES };
