import { app } from "electron"
import { getStableAppDataPath } from "./appDataPath"

/**
 * 将 Electron 的 userData 固定到跨开发/打包模式一致的目录。
 * 必须在初始化数据库和启动后端之前调用。
 */
function configureAppDataPath(): string {
	const stablePath = getStableAppDataPath()
	if (app.getPath("userData") !== stablePath) {
		app.setPath("userData", stablePath)
	}
	return stablePath
}

export { configureAppDataPath }
