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

async function fetchJSON(url: string, signal?: AbortSignal, timeoutMs = 8000, extraHeaders?: Record<string, string>): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = net.request({
      method: 'GET',
      url,
      headers: { 'User-Agent': UA, ...extraHeaders },
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

/**
 * 获取原始文本（不 JSON.parse），用于响应非标准 JSON 的平台
 */
async function fetchText(url: string, signal?: AbortSignal, timeoutMs = 8000, extraHeaders?: Record<string, string>): Promise<string | null> {
  return new Promise((resolve) => {
    const req = net.request({
      method: 'GET',
      url,
      headers: { 'User-Agent': UA, ...extraHeaders },
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
      res.on('end', () => resolve(body))
    })
    req.on('error', () => {
      clearTimeout(timeout)
      resolve(null)
    })
    req.end()
  })
}

/** 修复酷我音乐返回的非标准 JSON（单引号 key/value → 标准 JSON） */
function fixKuwoJSON(raw: string): string {
  return raw
    .replace(/([{,]\s*)'([^']+)'\s*:/g, '$1"$2":')
    // `([^']*)` 用 * 而不是 +，以处理空字符串值 `''` → `""`
    .replace(/:\s*'([^']*)'/g, ':"$1"')
}

// ========== QQ 音乐 (tx) ==========

async function searchTX(keyword: string, page: number, pageSize: number): Promise<SearchResult> {
  try {
    // QQ 音乐搜索 API — search_for_qq_cp 替代已废弃的 client_search_cp
    const data = await fetchJSON(
      `https://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp?w=${encodeURIComponent(keyword)}&p=${page}&n=${pageSize}&format=json`,
      undefined, 8000,
      { 'Referer': 'https://y.qq.com' },
    )
    const songs = data?.data?.song?.list || []
    const items: NormalizedSongInfo[] = songs.map((s: any) => ({
      source: 'tx' as SourcePlatform,
      id: s.songmid || '',
      songName: s.songname || '',
      artist: (s.singer || []).map((sg: any) => sg.name).join(' / ') || '',
      albumName: s.albumname || '',
      albumCoverUrl: s.albummid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${s.albummid}.jpg` : '',
      duration: s.interval || 0,
      quality: '320k' as QualityLevel,
      platformIds: { tx: { songMid: s.songmid || '' } },
    }))
    return { total: data?.data?.song?.totalnum || items.length, songs: items }
  } catch {
    return { total: 0, songs: [] }
  }
}

// ========== 酷我音乐 (kw) ==========

async function searchKW(keyword: string, page: number, pageSize: number): Promise<SearchResult> {
  try {
    // 获取原始文本（酷我返回非标准 JSON：单引号 key，需先修复）
    const raw = await fetchText(
      `http://search.kuwo.cn/r.s?all=${encodeURIComponent(keyword)}&ft=music&itemset=web_2013&client=kt&pn=${page - 1}&rn=${pageSize}&rformat=json&encoding=utf8`,
    )
    if (!raw) return { total: 0, songs: [] }

    // 修复单引号 → 标准 JSON 后解析
    const data = JSON.parse(fixKuwoJSON(raw))
    const songs = data?.abslist || []
    const items: NormalizedSongInfo[] = songs.map((s: any) => {
      // 封面：酷我搜索 API 不返回专辑封面图，用歌手头像作为兜底
      // image.kuwo.cn 比 img.kuwo.cn 更稳定
      let coverUrl = s.MUSICPIC || s.IMAGE || s.albumpic || s.WEB_ALBUM_PIC || ''
      if (!coverUrl && s.web_artistpic_short) {
        coverUrl = `https://image.kuwo.cn/star/starheads/${s.web_artistpic_short}`
      }
      return {
        source: 'kw' as SourcePlatform,
        id: String(s.MUSICRID || '').replace('MUSIC_', ''),
        songName: s.NAME || s.SONGNAME || s.name || '',
        artist: s.ARTIST || s.artist || '',
        albumName: s.ALBUM || s.album || '',
        albumCoverUrl: coverUrl,
        duration: Number(s.DURATION) || 0,
        quality: '320k' as QualityLevel,
        platformIds: { kw: { rid: String(s.MUSICRID || '').replace('MUSIC_', '') } },
      }
    })
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
    const items: NormalizedSongInfo[] = songs.map((s: any) => {
      // 优先使用 API 返回的 Image 字段（模板 URL：imge.kugou.com/stdmusic/{size}/...）
      // 比旧版 img.kugou.com/v2/album/{AlbumID} 格式更稳定
      let coverUrl = ''
      if (s.Image) {
        coverUrl = s.Image.replace('{size}', '240')
        if (coverUrl.startsWith('http:')) coverUrl = 'https:' + coverUrl.slice(5)
      }
      if (!coverUrl && s.AlbumID) {
        coverUrl = `https://img.kugou.com/v2/album/${s.AlbumID}_240.jpg`
      }
      return {
        source: 'kg' as SourcePlatform,
        id: s.FileHash || '',
        songName: s.SongName || '',
        artist: s.SingerName || '',
        albumName: s.AlbumName || '',
        albumCoverUrl: coverUrl,
        duration: s.Duration || 0,
        quality: '320k' as QualityLevel,
        platformIds: { kg: { hash: s.FileHash || '', albumId: String(s.AlbumID || '') } },
      }
    })
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
      // picUrl 可能不存在，后续通过 song detail 批量补充
      albumCoverUrl: (s.album?.picUrl || '').replace(/^http:/, 'https:'),
      duration: s.duration ? Math.floor(s.duration / 1000) : 0,
      quality: '320k' as QualityLevel,
      platformIds: { wy: { id: String(s.id || '') } },
    }))

    // 批量通过 song detail API 获取封面（搜索 API 不返回 picUrl）
    if (items.length > 0) {
      const ids = items.map(item => item.platformIds?.wy?.id).filter(Boolean)
      const detailData = await fetchJSON(
        `https://music.163.com/api/song/detail?ids=${encodeURIComponent('[' + ids.join(',') + ']')}`,
        undefined, 5000,
        { 'Referer': 'https://music.163.com' },
      )
      if (detailData?.songs?.length) {
        const coverMap = new Map<string, string>()
        for (const s of detailData.songs) {
          if (s.id && s.album?.picUrl) {
            coverMap.set(String(s.id), s.album.picUrl.replace(/^http:/, 'https:'))
          }
        }
        for (const item of items) {
          const id = item.platformIds?.wy?.id
          if (id && coverMap.has(id)) {
            item.albumCoverUrl = coverMap.get(id)!
          }
        }
      }
    }

    return { total: data?.result?.songCount || items.length, songs: items }
  } catch {
    return { total: 0, songs: [] }
  }
}

// ========== 咪咕音乐 (mg) ==========

async function searchMG(keyword: string, page: number, pageSize: number): Promise<SearchResult> {
  try {
    // 咪咕 v2 搜索 API（旧接口 scr_search_tag 已废弃，返回 301）
    const searchSwitch = encodeURIComponent(JSON.stringify({ song: 1, album: 0, singer: 0, tagSong: 0, mvSong: 0, songlist: 0, bestShow: 1 }))
    const data = await fetchJSON(
      `https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/search_all.do?text=${encodeURIComponent(keyword)}&pageNum=${page}&pageSize=${pageSize}&searchSwitch=${searchSwitch}`,
      undefined, 8000,
      { 'Referer': 'https://music.migu.cn' },
    )
    const songs = data?.songResultData?.result || []
    const items: NormalizedSongInfo[] = songs.map((s: any) => {
      // 封面取第二张(imgSizeType=02)或第一张
      const cover = s.imgItems?.find((img: any) => img.imgSizeType === '02')?.img
        || s.imgItems?.[0]?.img
        || ''
      return {
        source: 'mg' as SourcePlatform,
        id: s.copyrightId || String(s.id || ''),
        songName: s.name || '',
        artist: (s.singers || []).map((sg: any) => sg.name).join(' / ') || '',
        albumName: s.albums?.[0]?.name || '',
        albumCoverUrl: cover.startsWith('//') ? `https:${cover}` : cover,
        duration: 0, // 咪咕 v2 接口不返回时长字段
        quality: '320k' as QualityLevel,
        platformIds: { mg: { id: s.id || '', copyrightId: s.copyrightId || '' } },
      }
    })
    return { total: Number(data?.songResultData?.totalCount || items.length), songs: items }
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
