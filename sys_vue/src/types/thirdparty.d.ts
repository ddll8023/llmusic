/** 第三方下载源类型 */
export interface ThirdpartySourceItem {
  id: string
  platform: string
  name: string
  url: string
  method: 'GET' | 'POST'
  enabled: boolean
}
