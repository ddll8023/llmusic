/**
 * 独立更新助手（macOS 免签名自动更新）。
 *
 * 由主进程以 `ELECTRON_RUN_AS_NODE=1 <Electron 可执行文件> <本文件> <payload JSON>` 启动，
 * 运行在普通 Node.js 环境（不加载 Electron/Chromium），随主进程退出而独立存活。
 *
 * 流程：
 *   1. 等待主进程（pid）退出
 *   2. 校验 ZIP 条目无路径逃逸
 *   3. ditto 解压到暂存目录
 *   4. 校验 Info.plist 的 BundleId 与版本
 *   5. 替换 .app（同卷 rename；/Applications 无写权限时弹管理员授权）
 *   6. 失败回滚，成功后重启应用并清理旧备份
 *   7. 结果写入 resultFile 供下次启动读取
 */
import fs from "fs"
import path from "path"
import os from "os"
import { execFile, spawn } from "child_process"

interface UpdatePayload {
	appPath: string
	zipPath: string
	newVersion: string
	resultFile: string
	backupsDir: string
	pid: number
}

interface InstallResult {
	ok: boolean
	version?: string
	message?: string
}

const APP_BUNDLE_ID = "com.llmusic.desktop"

function fail(message: string): never {
	writeResult({ ok: false, message })
	console.error(`[UpdateHelper] 失败: ${message}`)
	process.exit(1)
}

function writeResult(result: InstallResult): void {
	try {
		fs.writeFileSync(payload.resultFile, JSON.stringify(result), "utf8")
	} catch {
		// 结果文件写失败不阻断流程
	}
}

function run(command: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(command, args, { timeout: 5 * 60 * 1000 }, (error, stdout, stderr) => {
			if (error) {
				reject(new Error(`${command} ${args.join(" ")} 失败: ${stderr || error.message}`))
				return
			}
			resolve(String(stdout))
		})
	})
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0)
		return true
	} catch {
		return false
	}
}

async function waitForExit(pid: number, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		if (!isProcessAlive(pid)) return
		await new Promise((resolve) => setTimeout(resolve, 500))
	}
	fail(`主进程 ${pid} 在超时时间内未退出`)
}

async function listZipEntries(zipPath: string): Promise<string[]> {
	const out = await run("unzip", ["-Z1", zipPath])
	return out.split("\n").filter((line) => line.length > 0)
}

function hasPathEscape(entries: string[]): boolean {
	return entries.some((entry) => {
		if (entry.startsWith("/")) return true
		const parts = entry.split("/")
		return parts.includes("..")
	})
}

async function plistValue(appPath: string, key: string): Promise<string> {
	try {
		const out = await run("/usr/bin/plutil", [
			"-extract",
			key,
			"raw",
			"-o",
			"-",
			path.join(appPath, "Contents", "Info.plist"),
		])
		return out.trim()
	} catch {
		return ""
	}
}

/** 同卷内移动（跨卷时用 ditto 拷贝 + 删除源） */
function movePath(src: string, dest: string): void {
	try {
		fs.renameSync(src, dest)
	} catch (error) {
		const err = error as NodeJS.ErrnoException
		if (err.code !== "EXDEV") throw error
		fs.mkdirSync(path.dirname(dest), { recursive: true })
		run("ditto", [src, dest]).catch(() => undefined)
		fs.rmSync(src, { recursive: true, force: true })
	}
}

function isWritable(dir: string): boolean {
	try {
		fs.accessSync(dir, fs.constants.W_OK)
		return true
	} catch {
		return false
	}
}

/** 以用户身份原子替换；/Applications 等不可写目录走管理员授权 */
async function replaceApp(newAppPath: string, appPath: string, backupPath: string): Promise<void> {
	const appParent = path.dirname(appPath)
	if (isWritable(appParent)) {
		fs.rmSync(backupPath, { recursive: true, force: true })
		movePath(appPath, backupPath)
		movePath(newAppPath, appPath)
		return
	}

	// 管理员授权：生成临时 shell 脚本（路径做单引号转义），由 osascript 以 root 执行
	const scriptPath = path.join(os.tmpdir(), `llmusic-update-${process.pid}.sh`)
	const quote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`
	const script = [
		"#!/bin/sh",
		"set -e",
		`rm -rf ${quote(backupPath)}`,
		`mv ${quote(appPath)} ${quote(backupPath)}`,
		`mv ${quote(newAppPath)} ${quote(appPath)}`,
		`rm -rf ${quote(path.dirname(newAppPath))}`,
	].join("\n")
	fs.writeFileSync(scriptPath, script, { mode: 0o700 })
	try {
		await run("/usr/bin/osascript", [
			"-e",
			`do shell script "sh '${scriptPath}'" with administrator privileges`,
		])
	} finally {
		fs.rmSync(scriptPath, { force: true })
	}
}

function relaunchApp(appPath: string): void {
	const child = spawn("/usr/bin/open", [appPath], { detached: true, stdio: "ignore" })
	child.unref()
}

/** 保留本次备份，清理其余历史备份与暂存目录 */
function cleanupBackups(backupsDir: string, keep: string): void {
	if (!fs.existsSync(backupsDir)) return
	for (const name of fs.readdirSync(backupsDir)) {
		const full = path.join(backupsDir, name)
		if (full === keep) continue
		try {
			fs.rmSync(full, { recursive: true, force: true })
		} catch {
			// 忽略清理失败
		}
	}
}

const rawPayload = process.argv[2]
if (!rawPayload) {
	console.error("[UpdateHelper] 缺少 payload 参数")
	process.exit(1)
}
const payload = JSON.parse(rawPayload) as UpdatePayload

async function main(): Promise<void> {
	if (!payload.appPath || !payload.zipPath || !payload.newVersion || !payload.pid) {
		fail("更新参数不完整")
	}

	console.log(`[UpdateHelper] 等待主进程退出 (pid=${payload.pid})...`)
	await waitForExit(payload.pid, 90000)

	console.log("[UpdateHelper] 校验 ZIP 条目...")
	const entries = await listZipEntries(payload.zipPath)
	if (hasPathEscape(entries)) {
		fail("更新包包含非法路径，已拒绝安装")
	}
	if (!entries.includes("LLMusic.app/")) {
		fail("更新包不是有效的 LLMusic.app 归档")
	}

	const stagingRoot = path.join(payload.backupsDir, "staging")
	fs.rmSync(stagingRoot, { recursive: true, force: true })
	fs.mkdirSync(stagingRoot, { recursive: true })

	console.log("[UpdateHelper] 解压更新包...")
	await run("ditto", ["-x", "-k", payload.zipPath, stagingRoot])

	const newAppPath = path.join(stagingRoot, "LLMusic.app")
	if (!fs.existsSync(path.join(newAppPath, "Contents", "Info.plist"))) {
		fail("更新包缺少 Info.plist")
	}
	const bundleId = await plistValue(newAppPath, "CFBundleIdentifier")
	const bundleVersion = await plistValue(newAppPath, "CFBundleShortVersionString")
	if (bundleId !== APP_BUNDLE_ID) {
		fail(`更新包 BundleId 不匹配: ${bundleId}`)
	}
	if (bundleVersion && bundleVersion !== payload.newVersion) {
		fail(`更新包版本不匹配: ${bundleVersion} != ${payload.newVersion}`)
	}

	const backupPath = path.join(payload.backupsDir, `LLMusic-${payload.newVersion}.app.bak`)
	console.log("[UpdateHelper] 替换应用...")
	try {
		await replaceApp(newAppPath, payload.appPath, backupPath)
	} catch (error) {
		// 回滚：仅当原应用已移走且备份存在时恢复
		if (fs.existsSync(backupPath) && !fs.existsSync(payload.appPath)) {
			try {
				movePath(backupPath, payload.appPath)
			} catch {
				// 回滚失败时保留备份目录，由用户手动恢复
			}
		}
		fail(`替换应用失败: ${(error as Error).message}`)
	}

	cleanupBackups(payload.backupsDir, backupPath)
	console.log("[UpdateHelper] 启动新版本...")
	relaunchApp(payload.appPath)
	writeResult({ ok: true, version: payload.newVersion })
	process.exit(0)
}

main().catch((error) => fail((error as Error).message))
