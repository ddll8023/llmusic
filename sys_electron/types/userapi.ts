/**
 * UserAPI / 第三方源 类型定义
 * 复刻 lx-music 的 globalThis.lx 协议 + 内置源接口
 */

// ========== 平台与源定义 ==========

/** 支持的源平台 ID */
export type SourcePlatform = 'kw' | 'kg' | 'tx' | 'wy' | 'mg' | 'local'

/** 所有支持的源列表 */
export const ALL_SOURCE_PLATFORMS: SourcePlatform[] = ['kw', 'kg', 'tx', 'wy', 'mg', 'local']

/** 标准音质等级（与 lx-music 一致） */
export type QualityLevel = '128k' | '320k' | 'flac' | 'flac24bit'

/** 各平台默认支持的音质 */
export const SUPPORTED_QUALITIES: Record<SourcePlatform, QualityLevel[]> = {
  kw: ['128k', '320k', 'flac', 'flac24bit'],
  kg: ['128k', '320k', 'flac', 'flac24bit'],
  tx: ['128k', '320k', 'flac', 'flac24bit'],
  wy: ['128k', '320k', 'flac', 'flac24bit'],
  mg: ['128k', '320k', 'flac', 'flac24bit'],
  local: [],
}

/** 各平台默认支持的操作（lx-music 标准：userApi 只负责 musicUrl/lyric/pic，search 由内置 SDK 处理） */
export const SUPPORTED_ACTIONS: Record<SourcePlatform, UserApiAction[]> = {
  kw: ['musicUrl'],
  kg: ['musicUrl'],
  tx: ['musicUrl'],
  wy: ['musicUrl'],
  mg: ['musicUrl'],
  local: ['musicUrl', 'lyric', 'pic'],
}

export const SOURCE_PLATFORM_NAMES: Record<SourcePlatform, string> = {
  kw: '酷我音乐',
  kg: '酷狗音乐',
  tx: 'QQ音乐',
  wy: '网易云音乐',
  mg: '咪咕音乐',
  local: '本地音乐',
}

// ========== UserAPI 协议类型 ==========

/** UserAPI 脚本支持的操作 */
export type UserApiAction = 'musicUrl' | 'lyric' | 'pic'

/** 脚本注册时声明的源信息 */
export interface ScriptSourceDeclaration {
  type: 'music'
  actions: UserApiAction[]
  qualitys: QualityLevel[]
}

/** 脚本通过 lx.send('inited') 发送的注册数据 */
export interface ScriptInitedData {
  openDevTools?: boolean
  message?: string
  sources: Partial<Record<SourcePlatform, ScriptSourceDeclaration>>
}

/** 应用校验和过滤后的源信息 */
export interface ScriptSourceInfo {
  sources: Partial<Record<SourcePlatform, ScriptSourceDeclaration>>
}

/** 脚本元信息（从注释头 @name @description 等解析） */
export interface ScriptMetadata {
  name: string
  description: string
  author: string
  homepage: string
  version: string
}

/** 存储的完整脚本记录 */
export interface ScriptRecord extends ScriptMetadata {
  id: string
  /** zlib deflate + base64 编码后的脚本内容 */
  script: string
  allowShowUpdateAlert: boolean
  enabled: boolean
  importedAt: number
}

/** 应用使用时的不含源码的脚本信息 */
export interface ScriptInfo extends ScriptMetadata {
  id: string
  allowShowUpdateAlert: boolean
  enabled: boolean
  importedAt: number
}

/** 脚本状态 */
export interface ScriptStatus {
  status: boolean
  message?: string
  apiInfo?: ScriptInfo
  sources?: Partial<Record<SourcePlatform, ScriptSourceDeclaration>>
}

// ========== 请求/响应协议 ==========

/** UserAPI 请求参数 */
export interface UserApiRequestParams {
  requestKey: string
  data: {
    source: SourcePlatform
    action: UserApiAction
    info: Record<string, unknown>
  }
}

/** UserAPI musicUrl 请求详情 */
export interface MusicUrlInfo {
  songMid?: string
  hash?: string
  albumId?: string
  id?: string | number
  copyrightId?: string
  type: QualityLevel
}

/** UserAPI 歌词请求详情 */
export interface LyricInfo {
  songMid?: string
  hash?: string
  id?: string | number
}

/** UserAPI 封面请求详情 */
export interface PicInfo {
  songMid?: string
  hash?: string
  id?: string | number
  albumMid?: string
}

/** UserAPI 响应结果 */
export interface UserApiResponse {
  requestKey: string
  result?: {
    source: SourcePlatform
    action: UserApiAction
    data: MusicUrlResult | LyricResult | string
  }
}

export interface MusicUrlResult {
  type: QualityLevel
  url: string
}

export interface LyricResult {
  lyric: string
  tlyric?: string | null
  rlyric?: string | null
  lxlyric?: string | null
}

// ========== 标准化歌曲接口 ==========

/** 跨层传递的标准化歌曲信息 */
export interface NormalizedSongInfo {
  source: SourcePlatform
  id: string
  songName: string
  artist: string
  albumName: string
  albumCoverUrl?: string
  duration: number
  quality: QualityLevel
  /** 各平台原始 ID 字段 */
  platformIds: {
    kw?: { rid: string }
    kg?: { hash: string; albumId: string }
    tx?: { songMid: string }
    wy?: { id: string }
    mg?: { id: string; copyrightId: string }
  }
}

/** 搜索结果 */
export interface SearchResult {
  total: number
  songs: NormalizedSongInfo[]
}

// ========== 内置源接口 ==========

/** 内置源 SDK 接口 */
export interface BuiltinSource {
  id: SourcePlatform
  name: string

  /** 搜索 */
  search(keyword: string, page: number, pageSize: number): Promise<SearchResult>
  /** 获取播放 URL，成功返回字符串 URL，失败返回 null */
  getMusicUrl(song: NormalizedSongInfo, quality: QualityLevel): Promise<string | null>
  /** 获取歌词 */
  getLyric(song: NormalizedSongInfo): Promise<LyricResult | null>
  /** 获取封面 URL */
  getPic(song: NormalizedSongInfo): Promise<string | null>
}

// ========== 隐藏窗口通信事件名 ==========

export const USER_API_EVENTS = {
  INIT_ENV: 'userApi_initEnv',
  INIT: 'userApi_init',
  REQUEST: 'userApi_request',
  RESPONSE: 'userApi_response',
  OPEN_DEVTOOLS: 'userApi_openDevTools',
  SHOW_UPDATE_ALERT: 'userApi_showUpdateAlert',
  GET_PROXY: 'userApi_getProxy',
  PROXY_UPDATE: 'userApi_proxyUpdate',
} as const

// ========== 代理配置 ==========

export interface ProxyConfig {
  host: string
  port: string
}
