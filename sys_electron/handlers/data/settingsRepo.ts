// 设置数据仓库：key-value 存储，value 以 JSON 序列化
import { stmt } from "./db"

/**
 * 读取单个设置项（不存在时返回 undefined）
 */
async function getSetting<T = unknown>(key: string): Promise<T | undefined> {
	const row = stmt("SELECT value FROM settings WHERE key = ?").get(key) as { value: string | null } | undefined
	if (!row || row.value === null) {
		return undefined
	}
	return JSON.parse(row.value) as T
}

/**
 * 写入单个设置项（upsert）
 */
async function setSetting(key: string, value: unknown): Promise<void> {
	stmt("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
		key,
		JSON.stringify(value ?? null)
	)
}

export { getSetting, setSetting }
