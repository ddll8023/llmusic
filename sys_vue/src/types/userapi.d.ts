/**
 * UserAPI 渲染进程类型定义
 * 扩展 ElectronAPI 接口，新增 thirdparty 命名空间
 */
import type {
  ThirdpartySourceInfo,
  NormalizedSongInfo,
  ThirdpartySearchResult,
  ThirdpartyStatus,
} from './api'

declare global {
  interface ElectronAPI {
    thirdparty: {
      listSources(): Promise<ThirdpartySourceInfo[]>
      setSource(id: string): Promise<void>
      search(params: {
        source: string
        keyword: string
        page: number
        pageSize: number
      }): Promise<ThirdpartySearchResult>
      getMusicUrl(params: {
        source: string
        song: NormalizedSongInfo
        quality: string
      }): Promise<string | null>
      importScript(): Promise<any | null>
      removeScript(id: string): Promise<void>
      toggleScript(id: string, enabled: boolean): Promise<void>
      getStatus(): Promise<ThirdpartyStatus>
      openDevTools(): Promise<void>
      closeDevTools(): Promise<void>
    }
  }
}

export {}
