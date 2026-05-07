// 发现音乐页面的模拟数据生成器

// 基础数据模板
const songTemplates = [
  { title: '夜曲', artist: '周杰伦', album: '十一月的萧邦', duration: 233 },
  { title: '稻香', artist: '周杰伦', album: '魔杰座', duration: 223 },
  { title: '青花瓷', artist: '周杰伦', album: '我很忙', duration: 238 },
  { title: '告白气球', artist: '周杰伦', album: '周杰伦的床边故事', duration: 203 },
  { title: '演员', artist: '薛之谦', album: '绅士', duration: 267 },
  { title: '体面', artist: '于文文', album: '体面', duration: 247 },
  { title: '起风了', artist: '买辣椒也用券', album: '起风了', duration: 318 }
];

const platforms = ['网易云音乐', 'QQ音乐', '酷狗音乐'];
const playlistNames = ['华语流行经典', '2024年度热歌', '深夜电台', '运动健身BGM'];
const artistNames = ['周杰伦', '薛之谦', '邓紫棋', '林俊杰'];

// 生成模拟数据
function generateSongs(count = 8) {
  return Array.from({ length: count }, (_, i) => {
    const template = songTemplates[i % songTemplates.length];
    return {
      id: `discover_${i + 1}`,
      ...template,
      cover: '/img/defualt_img.jpg',
      platform: platforms[i % platforms.length],
      playCount: Math.floor(Math.random() * 5000000) + 1000000,
      isOnline: true
    };
  });
}

function generatePlaylists(count = 4) {
  return Array.from({ length: count }, (_, i) => ({
    id: `playlist_${i + 1}`,
    name: playlistNames[i % playlistNames.length],
    cover: '/img/defualt_img.jpg',
    songCount: Math.floor(Math.random() * 80) + 20,
    playCount: Math.floor(Math.random() * 20000000) + 5000000,
    creator: platforms[i % platforms.length],
    description: `精选${playlistNames[i % playlistNames.length]}歌曲合集`
  }));
}

function generateArtists(count = 4) {
  return Array.from({ length: count }, (_, i) => ({
    id: `artist_${i + 1}`,
    name: artistNames[i % artistNames.length],
    avatar: '/img/defualt_img.jpg',
    songCount: Math.floor(Math.random() * 150) + 50,
    fanCount: Math.floor(Math.random() * 30000000) + 20000000,
    description: '知名音乐人'
  }));
}

export const mockDiscoverData = {
  recommendedSongs: generateSongs(),
  hotPlaylists: generatePlaylists(),
  categories: [
    { id: 'pop', name: '流行', icon: 'music' },
    { id: 'rock', name: '摇滚', icon: 'music' },
    { id: 'folk', name: '民谣', icon: 'music' },
    { id: 'electronic', name: '电子', icon: 'music' },
    { id: 'classical', name: '古典', icon: 'music' },
    { id: 'jazz', name: '爵士', icon: 'music' }
  ],
  hotArtists: generateArtists()
};

// 搜索模拟函数
export function mockSearch(keyword, type = 'all') {
  const results = {
    songs: [],
    artists: [],
    playlists: []
  };

  if (!keyword) return results;

  const searchTerm = keyword.toLowerCase();

  // 搜索歌曲
  if (type === 'all' || type === 'songs') {
    results.songs = mockDiscoverData.recommendedSongs.filter(song => 
      song.title.toLowerCase().includes(searchTerm) ||
      song.artist.toLowerCase().includes(searchTerm) ||
      song.album.toLowerCase().includes(searchTerm)
    );
  }

  // 搜索艺术家
  if (type === 'all' || type === 'artists') {
    results.artists = mockDiscoverData.hotArtists.filter(artist =>
      artist.name.toLowerCase().includes(searchTerm)
    );
  }

  // 搜索歌单
  if (type === 'all' || type === 'playlists') {
    results.playlists = mockDiscoverData.hotPlaylists.filter(playlist =>
      playlist.name.toLowerCase().includes(searchTerm) ||
      playlist.description.toLowerCase().includes(searchTerm)
    );
  }

  return results;
}

// 格式化播放次数
export function formatPlayCount(count) {
  if (count >= 100000000) {
    return Math.floor(count / 100000000) + '亿';
  } else if (count >= 10000) {
    return Math.floor(count / 10000) + '万';
  }
  return count.toString();
}

