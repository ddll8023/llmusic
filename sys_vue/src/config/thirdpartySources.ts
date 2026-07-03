/** 第三方下载源配置 */

export interface ThirdpartySource {
  id: string
  platform: string
  name: string
  url: string
  method: 'GET' | 'POST'
  enabled: boolean
}

export const defaultThirdpartySources: ThirdpartySource[] = [
  {
    id: 'vkeys',
    platform: 'qq',
    name: 'vkeys.cn',
    url: 'https://api.vkeys.cn/music/tencent/song/link?mid={songMid}&quality=10',
    method: 'GET',
    enabled: true,
  },
  {
    id: 'xcvts',
    platform: 'qq',
    name: 'xcvts.cn',
    url: 'https://api.xcvts.cn/api/music/qq?mid={songMid}&type=SQ无损',
    method: 'GET',
    enabled: false,
  },
  {
    id: '317ak',
    platform: 'qq',
    name: '317ak.cn',
    url: 'https://api.317ak.cn/api/yinyue/qqyinyue?i={songId}&br=无损&type=json&lrc=0',
    method: 'GET',
    enabled: false,
  },
  {
    id: 'cyapi',
    platform: 'qq',
    name: 'cyapi.top',
    url: 'https://cyapi.top/API/qq_music.php?mid={songMid}&quality=lossless',
    method: 'GET',
    enabled: false,
  },
]

export const STORAGE_KEY = 'llmusic_thirdparty_sources'
