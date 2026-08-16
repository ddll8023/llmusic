import { CHANNELS } from "../../constants/ipcChannels"
import {
	checkForUpdates,
	downloadUpdate,
	getUpdateStatus,
	installUpdate,
	type AppUpdateStatus,
} from "../../services/appUpdater"
import type { IpcHandlerModule } from "../../types"

function withSuccess(status: AppUpdateStatus): { success: true } & AppUpdateStatus {
	return { success: true, ...status }
}

function createUpdateHandlers(): IpcHandlerModule {
	return {
		handlers: [
			{
				channel: CHANNELS.UPDATE_GET_STATUS,
				handler: () => withSuccess(getUpdateStatus()),
			},
			{
				channel: CHANNELS.UPDATE_CHECK,
				handler: async () => withSuccess(await checkForUpdates()),
			},
			{
				channel: CHANNELS.UPDATE_DOWNLOAD,
				handler: async () => withSuccess(await downloadUpdate()),
			},
			{
				channel: CHANNELS.UPDATE_INSTALL,
				handler: () => withSuccess(installUpdate()),
			},
		],
		cleanup: () => undefined,
	}
}

export { createUpdateHandlers }
