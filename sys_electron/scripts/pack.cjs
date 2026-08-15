const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const packageDir = path.resolve(__dirname, "..")
const releaseDir = path.resolve(packageDir, "..", "release")
fs.rmSync(releaseDir, { recursive: true, force: true })

const electronBuilder = path.join(
	packageDir,
	"node_modules",
	".bin",
	process.platform === "win32" ? "electron-builder.cmd" : "electron-builder",
)
const env = { ...process.env }

// sys_electron/.npmrc 的 electron_mirror 只适用于 Electron 下载；
// electron-builder 还会下载 dmg-builder 等通用工具，不能复用该镜像地址。
for (const key of [
	"npm_config_electron_mirror",
	"NPM_CONFIG_ELECTRON_MIRROR",
	"npm_package_config_electron_mirror",
	"npm_package_config_electronMirror",
	"ELECTRON_MIRROR",
]) {
	delete env[key]
}

const result = spawnSync(
	electronBuilder,
	["--publish", "never", ...process.argv.slice(2)],
	{
		cwd: packageDir,
		env,
		stdio: "inherit",
		shell: process.platform === "win32",
	},
)

if (result.error) {
	console.error(result.error)
	process.exit(1)
}

process.exit(result.status ?? 1)
