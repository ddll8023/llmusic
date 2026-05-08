const { dialog, net } = require("electron");
const fs = require("fs");
const { CHANNELS } = require("../../constants/ipcChannels");

function createDownloadHandlers(mainWindow) {
	const handlers = [
		{
			channel: CHANNELS.DOWNLOAD_FILE,
			handler: async (_event, options) => {
				const { url, filename } = options;
				const saveResult = await dialog.showSaveDialog(mainWindow, {
					defaultPath: filename,
				});
				if (saveResult.canceled) {
					return { success: true, canceled: true };
				}
				try {
					const response = await net.fetch(url);
					if (!response.ok) {
						return { success: false, error: "下载失败" };
					}
					const buffer = Buffer.from(await response.arrayBuffer());
					fs.writeFileSync(saveResult.filePath, buffer);
					return { success: true, filePath: saveResult.filePath };
				} catch (err) {
					return { success: false, error: "下载失败" };
				}
			},
		},
	];
	return { handlers, cleanup: () => {} };
}

module.exports = { createDownloadHandlers };
