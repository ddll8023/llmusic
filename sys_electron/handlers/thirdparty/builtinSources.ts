/**
 * 内置源搜索 SDK
 * kw/kg/tx/wy/mg 5 个平台的搜索 + 获取URL + 歌词 + 封面
 *
 * 各平台使用公开 API，无需登录凭证
 * 搜索返回标准化 NormalizedSongInfo
 * musicUrl/lyric/pic 暂为 stub，后续可根据各平台公开接口实现
 */
import { net } from 'electron'
import type { SourcePlatform, QualityLevel, SearchResult, NormalizedSongInfo, BuiltinSource, LyricResult } from '../../types/userapi'

// ========== 通用 HTTP 辅助 ==========

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function fetchJSON(url: string, signal?: AbortSignal, timeoutMs = 8000): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = net.request({
      method: 'GET',
      url,
      headers: { 'User-Agent': UA },
    })
    const timeout = setTimeout(() => {
      req.abort()
      resolve(null)
    }, timeoutMs)
    if (signal) {
      signal.addEventListener('abort', () => req.abort())
    }
    let body = ''
    req.on('response', (res) => {
      clearTimeout(timeout)
      res.on('data', (chunk: Buffer) => { body += chunk.toString() })
      res.on('end', () => {
        try { resolve(JSON.parse(body)) }
        catch { resolve(null) }
      })
    })
    req.on('error', () => {
      clearTimeout(timeout)
      resolve(null)
    })
    req.end()
  })
}

// ========== QQ 音乐 (tx) ==========

async function searchTX(keyword: string, page: number, pageSize: number): Promise<SearchResult> {
  try {
    // QQ 音乐搜索 API（公开接口）
    const data = await fetchJSON(
      `https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg?key=${encodeURIComponent(keyword)}&format=json&inCharset=utf-8&outCharset=utf-8`,
    )
    const songs = data?.data?.song?.itemlist || []
    const items: NormalizedSongInfo[] = songs.map((s: any) => ({
      source: 'tx' as SourcePlatform,
      id: s.mid || '',
      songName: s.name || '',
      artist: s.singer?.map((sg: any) => sg.name).join(' / ') || '',
      albumName: s.album?.name || '',
      albumCoverUrl: s.album?.mid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${s.album.mid}.jpg` : '',
      duration: 0,
      quality: '320k' as QualityLevel,
      platformIds: { tx: { songMid: s.mid || '' } },
    }))
    return { total: items.length, songs: items }
  } catch {
    return { total: 0, songs: [] }
  }
}

// ========== 酷我音乐 (kw) ==========

async function searchKW(keyword: string, page: number, pageSize: number): Promise<SearchResult> {
  try {
    const data = await fetchJSON(
      `https://search.kuwo.cn/r.s?all=${encodeURIComponent(keyword)}&ft=music&itemset=web_2013&client=kt&pn=${page - 1}&rn=${pageSize}&rformat=json&encoding=utf8`,
    )
    const songs = data?.abslist || []
    const items: NormalizedSongInfo[] = songs.map((s: any) => ({
      source: 'kw' as SourcePlatform,
      id: String(s.MUSICRID || '').replace('MUSIC_', ''),
      songName: s.NAME || '',
      artist: s.ARTIST || '',
      albumName: s.ALBUM || '',
      albumCoverUrl: '',
      duration: s.DURATION || 0,
      quality: '320k' as QualityLevel,
      platformIds: { kw: { rid: String(s.MUSICRID || '').replace('MUSIC_', '') } },
    }))
    return { total: Number(data?.total || items.length), songs: items }
  } catch {
    return { total: 0, songs: [] }
  }
}

// ========== 酷狗音乐 (kg) ==========

async function searchKG(keyword: string, page: number, pageSize: number): Promise<SearchResult> {
  try {
    const data = await fetchJSON(
      `https://songsearch.kugou.com/song_search_v2?keyword=${encodeURIComponent(keyword)}&page=${page}&pagesize=${pageSize}`,
    )
    const songs = data?.data?.lists || []
    const items: NormalizedSongInfo[] = songs.map((s: any) => ({
      source: 'kg' as SourcePlatform,
      id: s.FileHash || '',
      songName: s.SongName || '',
      artist: s.SingerName || '',
      albumName: s.AlbumName || '',
      albumCoverUrl: s.AlbumID ? `https://img.kugou.com/v2/album/${s.AlbumID}_240.jpg` : '',
      duration: s.Duration || 0,
      quality: '320k' as QualityLevel,
      platformIds: { kg: { hash: s.FileHash || '', albumId: String(s.AlbumID || '') } },
    }))
    return { total: Number(data?.data?.total || items.length), songs: items }
  } catch {
    return { total: 0, songs: [] }
  }
}

// ========== 网易云音乐 (wy) ==========

async function searchWY(keyword: string, page: number, pageSize: number): Promise<SearchResult> {
  try {
    const data = await fetchJSON(
      `https://music.163.com/api/search/get?s=${encodeURIComponent(keyword)}&type=1&offset=${(page - 1) * pageSize}&limit=${pageSize}`,
    )
    const songs = data?.result?.songs || []
    const items: NormalizedSongInfo[] = songs.map((s: any) => ({
      source: 'wy' as SourcePlatform,
      id: String(s.id || ''),
      songName: s.name || '',
      artist: (s.artists || []).map((a: any) => a.name).join(' / ') || '',
      albumName: s.album?.name || '',
      albumCoverUrl: s.album?.picUrl || '',
      duration: s.duration ? Math.floor(s.duration / 1000) : 0,
      quality: '320k' as QualityLevel,
      platformIds: { wy: { id: String(s.id || '') } },
    }))
    return { total: data?.result?.songCount || items.length, songs: items }
  } catch {
    return { total: 0, songs: [] }
  }
}

// ========== 咪咕音乐 (mg) ==========

async function searchMG(keyword: string, page: number, pageSize: number): Promise<SearchResult> {
  try {
    const data = await fetchJSON(
      `https://m.music.migu.cn/migu/remoting/scr_search_tag?keyword=${encodeURIComponent(keyword)}&pgc=${page}&rows=${pageSize}&type=2`,
    )
    const songs = data?.musics || []
    const items: NormalizedSongInfo[] = songs.map((s: any) => ({
      source: 'mg' as SourcePlatform,
      id: s.id || '',
      songName: s.songName || '',
      artist: s.singerName || '',
      albumName: s.albumName || '',
      albumCoverUrl: s.cover ? `https:${s.cover}` : '',
      duration: s.length ? parseInt(s.length) || 0 : 0,
      quality: '320k' as QualityLevel,
      platformIds: { mg: { id: s.id || '', copyrightId: s.copyrightId || '' } },
    }))
    return { total: Number(data?.totalCount || items.length), songs: items }
  } catch {
    return { total: 0, songs: [] }
  }
}

// ========== 获取播放 URL ==========

async function musicUrlTX(song: NormalizedSongInfo, quality: QualityLevel): Promise<string | null> {
  // TODO: 通过公开 API 获取 QQ 音乐播放链接
  // 当前返回 null，需结合具体平台的 URL 获取方式实现
  return null
}

async function musicUrlKW(song: NormalizedSongInfo, quality: QualityLevel): Promise<string | null> {
  return null
}

async function musicUrlKG(song: NormalizedSongInfo, quality: QualityLevel): Promise<string | null> {
  return null
}

async function musicUrlWY(song: NormalizedSongInfo, quality: QualityLevel): Promise<string | null> {
  return null
}

async function musicUrlMG(song: NormalizedSongInfo, quality: QualityLevel): Promise<string | null> {
  return null
}

// ========== 获取歌词 ==========

async function lyricTX(song: NormalizedSongInfo): Promise<LyricResult | null> { return null }
async function lyricKW(song: NormalizedSongInfo): Promise<LyricResult | null> { return null }
async function lyricKG(song: NormalizedSongInfo): Promise<LyricResult | null> { return null }
async function lyricWY(song: NormalizedSongInfo): Promise<LyricResult | null> { return null }
async function lyricMG(song: NormalizedSongInfo): Promise<LyricResult | null> { return null }

// ========== 获取封面 ==========

async function picTX(song: NormalizedSongInfo): Promise<string | null> { return null }
async function picKW(song: NormalizedSongInfo): Promise<string | null> { return null }
async function picKG(song: NormalizedSongInfo): Promise<string | null> { return null }
async function picWY(song: NormalizedSongInfo): Promise<string | null> { return null }
async function picMG(song: NormalizedSongInfo): Promise<string | null> { return null }

// ========== 导出源定义 ==========

export const BUILTIN_SOURCES: BuiltinSource[] = [
  { id: 'tx', name: 'QQ音乐', search: searchTX, getMusicUrl: musicUrlTX, getLyric: lyricTX, getPic: picTX },
  { id: 'kw', name: '酷我音乐', search: searchKW, getMusicUrl: musicUrlKW, getLyric: lyricKW, getPic: picKW },
  { id: 'kg', name: '酷狗音乐', search: searchKG, getMusicUrl: musicUrlKG, getLyric: lyricKG, getPic: picKG },
  { id: 'wy', name: '网易云音乐', search: searchWY, getMusicUrl: musicUrlWY, getLyric: lyricWY, getPic: picWY },
  { id: 'mg', name: '咪咕音乐', search: searchMG, getMusicUrl: musicUrlMG, getLyric: lyricMG, getPic: picMG },
]

export const BUILTIN_SOURCE_IDS: string[] = BUILTIN_SOURCES.map(s => s.id)

export function isBuiltinSource(id: string): boolean {
  return (BUILTIN_SOURCE_IDS as readonly string[]).includes(id)
}
