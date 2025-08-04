// 发现音乐页面的模拟数据

export const mockDiscoverData = {
  // 推荐歌曲
  recommendedSongs: [
    {
      id: 'discover_1',
      title: '夜曲',
      artist: '周杰伦',
      album: '十一月的萧邦',
      duration: 233,
      cover: '/img/defualt_img.jpg',
      platform: '网易云音乐',
      playCount: 1234567,
      isOnline: true
    },
    {
      id: 'discover_2', 
      title: '稻香',
      artist: '周杰伦',
      album: '魔杰座',
      duration: 223,
      cover: '/img/defualt_img.jpg',
      platform: 'QQ音乐',
      playCount: 987654,
      isOnline: true
    },
    {
      id: 'discover_3',
      title: '青花瓷',
      artist: '周杰伦', 
      album: '我很忙',
      duration: 238,
      cover: '/img/defualt_img.jpg',
      platform: '酷狗音乐',
      playCount: 2345678,
      isOnline: true
    },
    {
      id: 'discover_4',
      title: '告白气球',
      artist: '周杰伦',
      album: '周杰伦的床边故事',
      duration: 203,
      cover: '/img/defualt_img.jpg',
      platform: '网易云音乐',
      playCount: 3456789,
      isOnline: true
    },
    {
      id: 'discover_5',
      title: '七里香',
      artist: '周杰伦',
      album: '七里香',
      duration: 245,
      cover: '/img/defualt_img.jpg',
      platform: 'QQ音乐',
      playCount: 1876543,
      isOnline: true
    },
    {
      id: 'discover_6',
      title: '演员',
      artist: '薛之谦',
      album: '绅士',
      duration: 267,
      cover: '/img/defualt_img.jpg',
      platform: '网易云音乐',
      playCount: 4567890,
      isOnline: true
    },
    {
      id: 'discover_7',
      title: '体面',
      artist: '于文文',
      album: '体面',
      duration: 247,
      cover: '/img/defualt_img.jpg',
      platform: '酷狗音乐',
      playCount: 2987654,
      isOnline: true
    },
    {
      id: 'discover_8',
      title: '起风了',
      artist: '买辣椒也用券',
      album: '起风了',
      duration: 318,
      cover: '/img/defualt_img.jpg',
      platform: '网易云音乐',
      playCount: 5678901,
      isOnline: true
    }
  ],

  // 热门歌单
  hotPlaylists: [
    {
      id: 'playlist_1',
      name: '华语流行经典',
      cover: '/img/defualt_img.jpg',
      songCount: 50,
      playCount: 12345678,
      creator: '网易云音乐',
      description: '收录华语乐坛最经典的流行歌曲'
    },
    {
      id: 'playlist_2',
      name: '2024年度热歌',
      cover: '/img/defualt_img.jpg',
      songCount: 100,
      playCount: 23456789,
      creator: 'QQ音乐',
      description: '2024年最受欢迎的热门歌曲合集'
    },
    {
      id: 'playlist_3',
      name: '深夜电台',
      cover: '/img/defualt_img.jpg',
      songCount: 30,
      playCount: 8765432,
      creator: '酷狗音乐',
      description: '适合深夜聆听的温柔歌曲'
    },
    {
      id: 'playlist_4',
      name: '运动健身BGM',
      cover: '/img/defualt_img.jpg',
      songCount: 80,
      playCount: 15432109,
      creator: '网易云音乐',
      description: '让你充满动力的运动音乐'
    }
  ],

  // 音乐分类
  categories: [
    { id: 'pop', name: '流行', icon: 'music' },
    { id: 'rock', name: '摇滚', icon: 'music' },
    { id: 'folk', name: '民谣', icon: 'music' },
    { id: 'electronic', name: '电子', icon: 'music' },
    { id: 'classical', name: '古典', icon: 'music' },
    { id: 'jazz', name: '爵士', icon: 'music' },
    { id: 'country', name: '乡村', icon: 'music' },
    { id: 'hiphop', name: '说唱', icon: 'music' }
  ],

  // 热门艺术家
  hotArtists: [
    {
      id: 'artist_1',
      name: '周杰伦',
      avatar: '/img/defualt_img.jpg',
      songCount: 200,
      fanCount: 50000000,
      description: '华语流行音乐天王'
    },
    {
      id: 'artist_2',
      name: '薛之谦',
      avatar: '/img/defualt_img.jpg',
      songCount: 120,
      fanCount: 30000000,
      description: '实力派创作歌手'
    },
    {
      id: 'artist_3',
      name: '邓紫棋',
      avatar: '/img/defualt_img.jpg',
      songCount: 80,
      fanCount: 25000000,
      description: '铁肺歌后'
    },
    {
      id: 'artist_4',
      name: '林俊杰',
      avatar: '/img/defualt_img.jpg',
      songCount: 150,
      fanCount: 35000000,
      description: '全能音乐人'
    }
  ]
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

// 格式化时长
export function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}
