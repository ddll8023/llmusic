import os from "os"
import path from "path"

const APP_DATA_DIR_NAME = "LLMusic"

/**
 * 返回跨开发/打包模式稳定一致的用户数据目录。
 * 不依赖 Electron，供 dev-runner 和主进程共同使用。
 */
function getStableAppDataPath(
	platform: NodeJS.Platform = process.platform,
	env: NodeJS.ProcessEnv = process.env,
	homeDir: string = os.homedir()
): string {
	if (platform === "darwin") {
		return path.join(homeDir, "Library", "Application Support", APP_DATA_DIR_NAME)
	}

	if (platform === "win32") {
		return path.join(env.APPDATA || path.join(homeDir, "AppData", "Roaming"), APP_DATA_DIR_NAME)
	}

	return path.join(env.XDG_CONFIG_HOME || path.join(homeDir, ".config"), APP_DATA_DIR_NAME)
}

export { APP_DATA_DIR_NAME, getStableAppDataPath }
