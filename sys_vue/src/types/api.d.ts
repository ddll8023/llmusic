// ========================================
// API 响应类型
// ========================================

/** 后端统一响应结构 */
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

/** 分页信息 */
export interface PaginationInfo {
  page: number
  page_size: number
  total: number
  total_pages: number
}

/** 分页响应结构 */
export interface PaginatedResponse<T> {
  lists: T[]
  pagination: PaginationInfo
}

// ========================================
// 歌曲类型
// ========================================

/** 本地歌曲 */
export interface Song {
  id: string
  filePath: string
  title: string
  artist: string
  album: string
  duration: number
  playCount?: number
  hasCover?: boolean
  fileExists?: boolean
  cover?: string
}

/** 在线歌曲（QQ 音乐搜索返回） */
export interface OnlineSong {
  songMid: string
  songId?: string
  songName: string
  singer: string
  album?: {
    albumMid?: string
    albumCoverUrl?: string
  }
  songUrl?: {
    url: string
    urlType: string
  }
  /** 从 onlineSong 转为播放器可用格式 */
  playOnline?: {
    songName: string
    singer: string
    coverUrl: string
    url: string
    urlType: string
  }
}

// ========================================
// 播放器类型
// ========================================

export type PlayMode = 'sequence' | 'random' | 'repeat_one'

export interface LyricLine {
  time: number
  text: string
}

export interface LyricMetadata {
  title?: string
  artist?: string
  [key: string]: string | undefined
}

export type LyricsFormat = 'lrc' | 'text' | null
export type LyricsSource = 'embedded' | 'external_file' | null

// ========================================
// 歌单 & 音乐库
// ========================================

export interface Playlist {
  id: string
  name: string
  description?: string
  songs: string[]
  createdAt?: string
  updatedAt?: string
}

export interface Library {
  songCount?: number
  id: string
  name: string
  path: string
}

// ========================================
// 扫描
// ========================================

export type ScanPhase = 'idle' | 'scanning' | 'parsing' | 'done' | 'error'

export interface ScanProgress {
  phase: ScanPhase
  processed: number
  total: number
  message: string
}

// ========================================
// QQ 音乐登录
// ========================================

export interface UserInfo {
  music_id: number
  encrypt_uin: string
  login_type: number
}

export type QRStatus = '' | 'loading' | 'waiting' | 'scanned' | 'done' | 'expired' | 'error'
