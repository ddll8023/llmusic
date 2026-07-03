/**
 * 第三方下载 API — 前端直连第三方服务器
 * 用于获取第三方下载源的音频播放链接
 */

/** 调用单个第三方下载源，返回音频 URL */
export async function fetchThirdpartyUrl(
  urlTemplate: string,
  songMid: string,
  method: 'GET' | 'POST' = 'GET',
): Promise<string | null> {
  const url = urlTemplate.replace('{songMid}', songMid).replace('{songId}', songMid)
  try {
    const resp = await fetch(url, { method })
    if (!resp.ok) return null
    const data = await resp.json()
    const dlUrl = (data.data as any)?.url || (data as any).url || ''
    return dlUrl ? (dlUrl.startsWith('http:') ? dlUrl.replace('http:', 'https:') : dlUrl) : null
  } catch {
    return null
  }
}
