const path = require("path");
const fs = require("fs").promises;
const {
	getLibraries,
	addLibrary,
	updateLibrary,
	removeLibrary,
} = require("./Database");
const { CHANNELS } = require("../../constants/ipcChannels");
const { isScanRunning } = require("../scan/scanHandlers");

function createLibraryHandlers() {
	const handlers = [
		{
			channel: CHANNELS.GET_LIBRARIES,
			handler: async () => {
				try {
					const libraries = await getLibraries();
					return { success: true, libraries };
				} catch (err) {
					return { success: false, error: err.message };
				}
			},
		},
		{
			channel: CHANNELS.ADD_LIBRARY,
			handler: async (event, { name, dirPath }) => {
				// 与旧实现不同，前端需先选目录并提交
				if (!dirPath) return { success: false, error: "未提供路径" };
				try {
					await fs.access(dirPath);
					const lib = await addLibrary({
						name: name || path.basename(dirPath),
						path: dirPath,
					});
					return { success: true, library: lib };
				} catch (err) {
					return { success: false, error: err.message };
				}
			},
		},
		{
			channel: CHANNELS.REMOVE_LIBRARY,
			handler: async (e, libraryId) => {
				if (isScanRunning())
					return { success: false, error: "扫描进行中，无法删除" };
				try {
					const ok = await removeLibrary(libraryId);
					return { success: ok };
				} catch (err) {
					return { success: false, error: err.message };
				}
			},
		},
		{
			channel: CHANNELS.UPDATE_LIBRARY,
			handler: async (e, { libraryId, updates }) => {
				try {
					const lib = await updateLibrary(libraryId, updates);
					return lib
						? { success: true, library: lib }
						: { success: false, error: "未找到音乐库" };
				} catch (err) {
					return { success: false, error: err.message };
				}
			},
		},
	];

	return { handlers, cleanup: () => {} };
}

module.exports = { createLibraryHandlers };
