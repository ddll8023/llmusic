/**
 * macOS 免签名自动更新：GitHub Release 检查、ZIP 下载与校验、独立 helper 替换安装。
 *
 * 设计背景：macOS 上 electron-updater 依赖 Squirrel.Mac，会对 .app 做代码签名校验；
 * 本项目发布未签名产物，因此 macOS 走自定义链路，Windows 仍使用 electron-updater。
 *
 * 链路：
 *   check   → GitHub Releases API 取最新版本与资产，latest-mac.yml 取 sha512
 *   download→ HTTPS 流式下载到 userData/updates/<version>.zip，边下边算 sha512
 *   install → 以 ELECTRON_RUN_AS_NODE=1 启动 update-helper（独立进程），
 *             等待主进程退出 → 解压 → 原子替换（必要时弹管理员授权）→ 重启
 */
import { app } from "electron"
import fs from "fs"
import path from "path"
import https from "https"
import crypto from "crypto"
import { spawn } from "child_process"

export interface MacUpdateInfo {
	version: string
	releaseNotes?: string
	url: string
	sha512?: string
	size?: number
	/** 下载完成后的本地 ZIP 路径 */
	zipPath?: string
}

export interface MacInstallResult {
	ok: boolean
	version?: string
	message?: string
}

const GITHUB_API_BASE = "https://api.github.com"
const OWNER = "ddll8023"
const REPO = "llmusic"
const APP_BUNDLE_ID = "com.llmusic.desktop"

function updatesDir(): string {
	return path.join(app.getPath("userData"), "updates")
}

function backupsDir(): string {
	return path.join(app.getPath("userData"), "update-backups")
}

function resultFile(): string {
	return path.join(app.getPath("userData"), "update-result.json")
}

function semverLte(a: string, b: string): boolean {
	const pa = a.split(".").map((n) => parseInt(n, 10) || 0)
	const pb = b.split(".").map((n) => parseInt(n, 10) || 0)
	const len = Math.max(pa.length, pb.length)
	for (let i = 0; i < len; i++) {
		const x = pa[i] ?? 0
		const y = pb[i] ?? 0
		if (x !== y) return x < y
	}
	return true
}

interface HttpResult {
	status: number
	headers: Record<string, string | string[] | undefined>
	body: string
}

function httpsGet(url: string, redirects = 5): Promise<HttpResult> {
	return new Promise((resolve, reject) => {
		const req = https.get(
			url,
			{
				headers: {
					"User-Agent": "LLMusic-Updater",
					Accept: "application/vnd.github+json",
				},
			},
			(res) => {
				if (
					[301, 302, 303, 307, 308].includes(res.statusCode ?? 0) &&
					res.headers.location &&
					redirects > 0
				) {
					res.resume()
					httpsGet(new URL(res.headers.location, url).toString(), redirects - 1).then(resolve, reject)
					return
				}
				if (res.statusCode !== 200) {
					res.resume()
					reject(new Error(`HTTP ${res.statusCode}: ${url}`))
					return
				}
				const chunks: Buffer[] = []
				res.on("data", (chunk: Buffer) => chunks.push(chunk))
				res.on("end", () => {
					resolve({
						status: res.statusCode ?? 200,
						headers: res.headers,
						body: Buffer.concat(chunks).toString("utf8"),
					})
				})
			},
		)
		req.on("error", reject)
		req.setTimeout(30000, () => req.destroy(new Error("请求超时")))
	})
}

/**
 * 解析 electron-builder 生成的 latest-mac.yml（仅取本项目需要的字段）。
 * 该文件由 CI 的 prepare-release-metadata.cjs 生成，结构稳定：
 *   version: 1.0.3
 *   files:
 *     - url: LLMusic-1.0.3-mac-arm64.zip
 *       sha512: xxx
 *       size: 123
 */
function parseManifest(text: string): { version?: string; files: Array<{ url?: string; sha512?: string; size?: number }> } {
	const version = /^version:\s*(.+)$/m.exec(text)?.[1]?.trim()
	const files: Array<{ url?: string; sha512?: string; size?: number }> = []
	let current: { url?: string; sha512?: string; size?: number } | null = null
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim()
		const urlMatch = /^-\s+url:\s*(.+)$/.exec(line)
		if (urlMatch) {
			current = { url: urlMatch[1].trim() }
			files.push(current)
			continue
		}
		if (!current) continue
		const shaMatch = /^sha512:\s*(\S+)\s*$/.exec(line)
		if (shaMatch) {
			current.sha512 = shaMatch[1]
			continue
		}
		const sizeMatch = /^size:\s*(\d+)\s*$/.exec(line)
		if (sizeMatch) {
			current.size = Number(sizeMatch[1])
		}
	}
	return { version, files }
}

/** 检查 GitHub 最新 Release，返回可用的更新信息；无更新时返回 null */
export async function macCheckForUpdates(): Promise<MacUpdateInfo | null> {
	const current = app.getVersion()
	const result = await httpsGet(`${GITHUB_API_BASE}/repos/${OWNER}/${REPO}/releases/latest`)
	const release = JSON.parse(result.body) as {
		tag_name?: string
		body?: string
		assets?: Array<{ name?: string; size?: number; browser_download_url?: string }>
	}
	const version = String(release.tag_name ?? "").replace(/^v/, "")
	if (!version || semverLte(version, current)) {
		return null
	}

	const arch = process.arch === "arm64" ? "arm64" : "x64"
	const zipName = `LLMusic-${version}-mac-${arch}.zip`
	const zipAsset = (release.assets ?? []).find((asset) => asset.name === zipName)
	if (!zipAsset?.browser_download_url) {
		throw new Error(`未找到更新包 ${zipName}`)
	}

	// 尽力从 latest-mac.yml 取 sha512/size；取不到时仅依赖 HTTPS 传输，不阻塞更新
	let sha512: string | undefined
	let size = zipAsset.size
	const manifestAsset = (release.assets ?? []).find((asset) => asset.name === "latest-mac.yml")
	if (manifestAsset?.browser_download_url) {
		try {
			const manifest = await httpsGet(manifestAsset.browser_download_url)
			const file = parseManifest(manifest.body).files.find((item) => item.url === zipName)
			if (file?.sha512) sha512 = file.sha512
			if (file?.size) size = file.size
		} catch (error) {
			console.warn("[Updater] 读取更新清单失败，跳过校验和校验:", error)
		}
	}

	return {
		version,
		releaseNotes: release.body || undefined,
		url: zipAsset.browser_download_url,
		sha512,
		size,
	}
}

/** 下载 ZIP 到 userData/updates/<version>.zip，校验 sha512 与大小 */
export async function macDownloadUpdate(
	info: MacUpdateInfo,
	onProgress?: (percent: number) => void,
): Promise<void> {
	fs.mkdirSync(updatesDir(), { recursive: true })
	const dest = path.join(updatesDir(), `${info.version}.zip`)
	await downloadFile(info.url, dest, info.sha512, info.size, onProgress)
	info.zipPath = dest
}

function downloadFile(
	url: string,
	dest: string,
	expectedSha512?: string,
	expectedSize?: number,
	onProgress?: (percent: number) => void,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const follow = (target: string, redirects: number): void => {
			const req = https.get(
				target,
				{ headers: { "User-Agent": "LLMusic-Updater" } },
				(res) => {
					if (
						[301, 302, 303, 307, 308].includes(res.statusCode ?? 0) &&
						res.headers.location &&
						redirects > 0
					) {
						res.resume()
						follow(new URL(res.headers.location, target).toString(), redirects - 1)
						return
					}
					if (res.statusCode !== 200) {
						res.resume()
						reject(new Error(`下载失败: HTTP ${res.statusCode}`))
						return
					}
					const total = expectedSize || Number(res.headers["content-length"]) || 0
					let received = 0
					const hash = crypto.createHash("sha512")
					const out = fs.createWriteStream(dest)
					res.on("data", (chunk: Buffer) => {
						received += chunk.length
						hash.update(chunk)
						if (total > 0) {
							onProgress?.(Math.min(100, Math.round((received / total) * 100)))
						}
					})
					res.on("error", reject)
					out.on("error", reject)
					out.on("finish", () => {
						const digest = hash.digest("base64")
						if (expectedSha512 && digest !== expectedSha512) {
							fs.rmSync(dest, { force: true })
							reject(new Error("更新包 SHA-512 校验不匹配"))
							return
						}
						resolve()
					})
					res.pipe(out)
				},
			)
			req.on("error", reject)
			req.setTimeout(600000, () => req.destroy(new Error("下载超时")))
		}
		follow(url, 5)
	})
}

/**
 * 启动独立更新助手并立即退出主应用。
 * helper 以 ELECTRON_RUN_AS_NODE=1 运行（Electron 二进制充当 Node.js），
 * 不依赖 Squirrel.Mac，因此不触发 macOS 代码签名校验。
 */
export function macInstallUpdate(info: MacUpdateInfo): void {
	if (!info.zipPath) {
		throw new Error("更新包尚未下载完成")
	}
	if (!fs.existsSync(info.zipPath)) {
		throw new Error(`更新包不存在: ${info.zipPath}`)
	}
	const appPath = path.resolve(process.execPath, "..", "..")
	const helperPath = path.join(process.resourcesPath, "update-helper", "main.js")
	if (!fs.existsSync(helperPath)) {
		throw new Error(`更新助手缺失: ${helperPath}`)
	}
	fs.mkdirSync(backupsDir(), { recursive: true })

	const payload = {
		appPath,
		zipPath: info.zipPath,
		newVersion: info.version,
		resultFile: resultFile(),
		backupsDir: backupsDir(),
		pid: process.pid,
	}

	const child = spawn(process.execPath, [helperPath, JSON.stringify(payload)], {
		env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
		detached: true,
		stdio: "ignore",
	})
	child.unref()
}

/** 读取上次安装结果（helper 写入），读取后删除；无结果返回 null */
export function macReadInstallResult(): MacInstallResult | null {
	const file = resultFile()
	if (!fs.existsSync(file)) return null
	try {
		const raw = fs.readFileSync(file, "utf8")
		const parsed = JSON.parse(raw) as MacInstallResult
		return typeof parsed?.ok === "boolean" ? parsed : null
	} catch (error) {
		console.warn("[Updater] 读取安装结果失败:", error)
		return null
	} finally {
		fs.rmSync(file, { force: true })
	}
}

/** 启动时清理历史更新产物（保留 7 天内的），避免 userData 无限膨胀 */
export function macCleanup(): void {
	const now = Date.now()
	const maxAgeMs = 7 * 24 * 60 * 60 * 1000
	for (const dir of [updatesDir(), backupsDir()]) {
		if (!fs.existsSync(dir)) continue
		for (const name of fs.readdirSync(dir)) {
			const full = path.join(dir, name)
			try {
				const stat = fs.statSync(full)
				if (now - stat.mtimeMs > maxAgeMs) {
					fs.rmSync(full, { recursive: true, force: true })
				}
			} catch {
				// 单个文件清理失败不影响其余清理
			}
		}
	}
}
