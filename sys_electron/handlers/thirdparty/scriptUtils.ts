/**
 * UserAPI 脚本存储与管理工具
 * 解析脚本注释头、压缩存储、CRUD
 */
import zlib from 'node:zlib'
import type { ScriptMetadata, ScriptRecord, ScriptInfo } from '../../types/userapi'

// ========== 注释头解析（与 lx-music 兼容）==========

const INFO_NAMES = {
  name: 24,
  description: 36,
  author: 56,
  homepage: 1024,
  version: 36,
} as const

type InfoKey = keyof typeof INFO_NAMES

const INFO_NAME_KEYS = Object.keys(INFO_NAMES) as InfoKey[]

/**
 * 从脚本文件中解析元信息注释头
 * 格式：/* @name xxx @description xxx *\/
 */
export function parseScriptMetadata(script: string): ScriptMetadata {
  const match = /^\/\*[\S|\s]+?\*\//.exec(script)
  if (!match) {
    return {
      name: '',
      description: '',
      author: '',
      homepage: '',
      version: '',
    }
  }

  const header = match[0]
  const lines = header.split(/\r?\n/)
  const rxp = /^\s?\*\s?@(\w+)\s(.+)$/

  const raw: Partial<Record<InfoKey, string>> = {}
  for (const line of lines) {
    const result = rxp.exec(line)
    if (!result) continue
    const key = result[1] as InfoKey
    if (!INFO_NAME_KEYS.includes(key)) continue
    raw[key] = result[2].trim()
  }

  // 截断超长字段
  const meta: Record<string, string> = {}
  for (const key of INFO_NAME_KEYS) {
    const val = raw[key] || ''
    const maxLen = INFO_NAMES[key]
    meta[key] = val.length > maxLen ? val.substring(0, maxLen) + '...' : val
  }

  return meta as unknown as ScriptMetadata
}

// ========== 脚本压缩（与 lx-music 兼容）==========

/** deflate 压缩后 base64 编码，加 'gz_' 前缀 */
export function deflateScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    zlib.deflate(Buffer.from(script, 'utf8'), (err, buf) => {
      if (err) {
        reject(err)
        return
      }
      resolve('gz_' + buf.toString('base64'))
    })
  })
}

/** 解压 'gz_' 前缀的压缩脚本 */
export function inflateScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (script.startsWith('gz_')) {
      zlib.inflate(Buffer.from(script.substring(3), 'base64'), (err, buf) => {
        if (err) {
          reject(err)
          return
        }
        resolve(buf.toString('utf8'))
      })
    } else {
      // 未压缩的脚本直接返回（兼容）
      resolve(script)
    }
  })
}

// ========== 脚本记录生成 ==========

/** 从原始脚本内容生成一条新的脚本记录 */
export async function createScriptRecord(
  scriptRaw: string,
  allowShowUpdateAlert = true,
): Promise<ScriptRecord> {
  const metadata = parseScriptMetadata(scriptRaw)
  const script = await deflateScript(scriptRaw)
  const id = `user_api_${Math.random().toString(36).substring(2, 5)}_${Date.now()}`

  return {
    id,
    ...metadata,
    script,
    allowShowUpdateAlert,
    enabled: true,
    importedAt: Date.now(),
  }
}

/** 从脚本记录中创建可公开的信息（不含源码） */
export function toScriptInfo(record: ScriptRecord): ScriptInfo {
  const { script: _, ...info } = record
  return info
}

/**
 * 检测脚本内容是否与已有记录相同（基于压缩后内容对比）
 * @returns 相同记录的 id，无匹配则返回 undefined
 */
export function findDuplicateScript(
  newScript: string,
  existing: ScriptRecord[],
): string | undefined {
  // 先压缩新脚本再去匹配，避免反复解压已有记录
  for (const record of existing) {
    if (record.script === newScript) return record.id
  }
  return undefined
}
