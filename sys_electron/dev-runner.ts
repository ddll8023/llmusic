/**
 * LLMusic - 开发模式启动脚本
 * 依次启动：后端 FastAPI → Vite 开发服务器 → Electron
 */

import { spawn, type ChildProcess } from "child_process"
import path from "path"
import http from "http"
import electron from "electron"

const ROOT_DIR = path.resolve(__dirname, "..", "..")
const BACKEND_DIR = path.join(ROOT_DIR, "backend")
const FRONTEND_DIR = path.join(ROOT_DIR, "sys_vue")
const BACKEND_PORT = 9752
const FRONTEND_PORT = 9753

/**
 * 等待 HTTP 服务就绪
 */
function waitForReady(url: string, label: string, maxWait = 30000): Promise<void> {
	return new Promise((resolve, reject) => {
		const start = Date.now()
		const check = (): void => {
			const req = http.get(url, { timeout: 2000 }, () => {
				resolve()
			})
			req.on("error", () => {
				if (Date.now() - start > maxWait) {
					reject(new Error(`${label} 启动超时`))
					return
				}
				setTimeout(check, 500)
			})
			req.on("timeout", () => {
				req.destroy()
				if (Date.now() - start > maxWait) {
					reject(new Error(`${label} 启动超时`))
					return
				}
				setTimeout(check, 500)
			})
		}
		check()
	})
}

/**
 * 启动子进程并转发日志
 */
function startProcess(name: string, command: string, args: string[], options: Record<string, unknown> = {}): ChildProcess {
	// Windows 下 need shell: true 来跑 npm/uv 脚本
	const shell: string | boolean = process.platform === "win32"
		? "C:\\Windows\\System32\\cmd.exe"
		: true
	const proc = spawn(command, args, {
		shell,
		stdio: ["pipe", "pipe", "pipe"],
		...options,
	})
	proc.stdout?.on("data", (d: Buffer) => process.stdout.write(`[${name}] ${d}`))
	proc.stderr?.on("data", (d: Buffer) => process.stderr.write(`[${name}] ${d}`))
	proc.on("error", (err: Error) => console.error(`[${name}] 启动失败:`, err.message))
	return proc
}

async function main(): Promise<void> {
	let backendProc: ChildProcess | null = null
	let viteProc: ChildProcess | null = null
	let electronProc: ChildProcess | null = null

	const cleanup = (): void => {
		if (electronProc) electronProc.kill()
		if (viteProc) viteProc.kill()
		if (backendProc) backendProc.kill()
	}

	process.on("SIGINT", () => {
		cleanup()
		process.exit(0)
	})

	// 1. 启动后端
	console.log("[dev-runner] 启动后端 FastAPI ...")
	backendProc = startProcess("backend", "uv", [
		"run",
		"--directory",
		BACKEND_DIR,
		"uvicorn",
		"app.main:app",
		"--host",
		"127.0.0.1",
		"--port",
		String(BACKEND_PORT),
		"--reload",
	], { cwd: BACKEND_DIR })

	try {
		await waitForReady(`http://127.0.0.1:${BACKEND_PORT}/health`, "Backend")
		console.log("[dev-runner] 后端已就绪")
	} catch (err) {
		const error = err as Error
		console.error("[dev-runner]", error.message)
		cleanup()
		process.exit(1)
	}

	// 2. 启动 Vite
	console.log("[dev-runner] 启动 Vite 开发服务器 ...")
	viteProc = startProcess("vite", "npm", ["run", "dev"], { cwd: FRONTEND_DIR })

	try {
		await waitForReady(`http://127.0.0.1:${FRONTEND_PORT}`, "Vite")
		console.log("[dev-runner] Vite 已就绪")
	} catch (err) {
		const error = err as Error
		console.error("[dev-runner]", error.message)
		cleanup()
		process.exit(1)
	}

	// 3. 启动 Electron（指向编译后的 dist-ts，从外层目录运行以便读取 package.json）
	console.log("[dev-runner] 启动 Electron ...")
	const electronEntryDir = path.join(__dirname, "..")
	electronProc = spawn(electron as unknown as string, ["."], {
		cwd: electronEntryDir,
		stdio: "inherit",
		env: {
			...process.env,
			LLMUSIC_BACKEND_MANAGED: "1",
		},
	})

	electronProc.on("close", (code: number | null) => {
		console.log("[dev-runner] Electron 退出, code:", code)
		cleanup()
		process.exit(code || 0)
	})
}

main().catch((err: Error) => {
	console.error("[dev-runner] 启动失败:", err)
	process.exit(1)
})
