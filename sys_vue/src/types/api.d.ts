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
  libraryId?: string
  playCount?: number
  hasCover?: boolean
  hasLyrics?: boolean
  fileExists?: boolean
  cover?: string
  modifiedAt?: number
  year?: number
  genre?: string
  trackNumber?: number
  bitrate?: number
  sampleRate?: number
  fileSize?: number
  format?: string
}

/**
 * 歌曲表格的联合展示类型：兼容本地歌曲与在线歌曲两种来源（字段全部可选）。
 * BaseSongTable 的行数据与事件负载均使用此类型。
 */
export type SongItem = Omit<Partial<Song>, 'album' | 'duration'> &
  Omit<Partial<OnlineSong>, 'album' | 'duration'> & {
    album?: string | OnlineSong['album']
    duration?: number | string
  }

/** 在线歌曲（QQ 音乐搜索返回） */
export interface OnlineSong {
  songMid: string
  songId?: string
  songName: string
  singer: string
  duration?: string
  album?: {
    albumName?: string
    albumMid?: string
    albumCoverUrl?: string
  }
  songUrl?: {
    url: string
    urlType: string
  } | null
}

// ========================================
// 播放器类型
// ========================================

export interface LyricLine {
  time: number
  text: string
  timeText?: string
  translation?: string
  roma?: string
  words?: LyricWord[]
}

export interface LyricWord {
  word: string
  time: number
  duration: number
}

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

export type ScanPhase =
  | 'idle'
  | 'starting'
  | 'prepare'
  | 'start'
  | 'scanning'
  | 'parsing'
  | 'saving_to_db'
  | 'complete'
  | 'done'
  | 'error'

/** 扫描失败的文件（路径 + 失败原因） */
export interface ScanFailedFile {
  path: string
  reason: string
}

export interface ScanProgress {
  phase: ScanPhase
  processed: number
  total: number
  message: string
  failedCount?: number
  skippedCount?: number
  failedFiles?: ScanFailedFile[]
}

/** QQ 音乐用户歌单项 */
export interface QMPlaylistItem {
  id: number
  title: string
  coverUrl: string
  songCount: number
  createTime: string
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

/** 歌曲下载元数据包（平台无关） */
export interface SongDownloadBundle {
  songMid: string
  songName: string
  singer: string
  album: {
    albumName: string
    albumMid: string
    albumCoverUrl: string
  }
  trackNumber: number
  genre: string
  year: string
  lyrics: string
  songUrl: {
    url: string
    urlType: string
  }
}

