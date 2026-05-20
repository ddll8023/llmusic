/**
 * 开发模式启动脚本
 * 在同一个终端内依次启动：后端 FastAPI → Vite 开发服务器 → Electron
 */
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

const ROOT_DIR = path.resolve(__dirname, "..");
const BACKEND_DIR = path.join(ROOT_DIR, "backend");
const FRONTEND_DIR = path.join(ROOT_DIR, "sys_vue");
const BACKEND_PORT = 9752;
const FRONTEND_PORT = 9753;

/**
 * 等待 HTTP 服务就绪
 */
function waitForReady(url, label, maxWait = 30000) {
	return new Promise((resolve, reject) => {
		const start = Date.now();
		const check = () => {
			const req = http.get(url, { timeout: 2000 }, (res) => {
				resolve();
			});
			req.on("error", () => {
				if (Date.now() - start > maxWait) {
					reject(new Error(`${label} 启动超时`));
					return;
				}
				setTimeout(check, 500);
			});
			req.on("timeout", () => {
				req.destroy();
				if (Date.now() - start > maxWait) {
					reject(new Error(`${label} 启动超时`));
					return;
				}
				setTimeout(check, 500);
			});
		};
		check();
	});
}

/**
 * 启动子进程并转发日志
 */
function startProcess(name, command, args, options) {
	const proc = spawn(command, args, {
		shell: true,
		stdio: ["pipe", "pipe", "pipe"],
		...options,
	});
	proc.stdout.on("data", (d) => process.stdout.write(`[${name}] ${d}`));
	proc.stderr.on("data", (d) => process.stderr.write(`[${name}] ${d}`));
	proc.on("error", (err) => console.error(`[${name}] 启动失败:`, err.message));
	return proc;
}

async function main() {
	let backendProc = null;
	let viteProc = null;
	let electronProc = null;

	const cleanup = () => {
		if (electronProc) electronProc.kill();
		if (viteProc) viteProc.kill();
		if (backendProc) backendProc.kill();
	};

	process.on("SIGINT", () => {
		cleanup();
		process.exit(0);
	});

	// 1. 启动后端
	console.log("[dev-runner] 启动后端 FastAPI ...");
	backendProc = startProcess(
		"backend",
		"uv",
		[
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
		],
		{ cwd: BACKEND_DIR }
	);

	try {
		await waitForReady(
			`http://127.0.0.1:${BACKEND_PORT}/health`,
			"Backend"
		);
		console.log("[dev-runner] 后端已就绪");
	} catch (err) {
		console.error("[dev-runner]", err.message);
		cleanup();
		process.exit(1);
	}

	// 2. 启动 Vite
	console.log("[dev-runner] 启动 Vite 开发服务器 ...");
	viteProc = startProcess("vite", "npm", ["run", "dev"], {
		cwd: FRONTEND_DIR,
	});

	try {
		await waitForReady(`http://127.0.0.1:${FRONTEND_PORT}`, "Vite");
		console.log("[dev-runner] Vite 已就绪");
	} catch (err) {
		console.error("[dev-runner]", err.message);
		cleanup();
		process.exit(1);
	}

	// 3. 启动 Electron（告诉 main.js 后端已由 dev-runner 管理，不要重复启动）
	console.log("[dev-runner] 启动 Electron ...");
	const electronBin = require("electron");
	electronProc = spawn(electronBin, ["."], {
		cwd: __dirname,
		stdio: "inherit",
		env: {
			...process.env,
			LLMUSIC_BACKEND_MANAGED: "1",
		},
	});

	electronProc.on("close", (code) => {
		console.log("[dev-runner] Electron 退出, code:", code);
		cleanup();
		process.exit(code || 0);
	});
}

main().catch((err) => {
	console.error("[dev-runner] 启动失败:", err);
	process.exit(1);
});
