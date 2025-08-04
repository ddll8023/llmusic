const { ipcMain } = require("electron");
const throttle = require("../async/throttle");

/**
 * 记录已注册的通道与包装函数，便于卸载
 * Map<channel, wrappedFn>
 */
const _registry = new Map();

/**
 * 注册 ipcMain.handle，并对错误统一封装 { success: false, error }
 * @param {string} channel IPC 通道名
 * @param {(event:Electron.IpcMainInvokeEvent, ...args:any[])=>any} handler 业务处理函数
 * @param {{ throttleMs?: number }} [options]
 */
function registerIPC(channel, handler, options = {}) {
	if (_registry.has(channel)) {
		console.warn(`[ipcWrapper] channel "${channel}" 已存在，将被覆盖`);
		ipcMain.removeHandler(channel);
	}

	let wrapped = async function (event, ...args) {
		try {
			const res = await handler(event, ...args);
			// 若 handler 未显式返回 success 字段，则自动包裹成功
			if (res && typeof res === "object" && "success" in res) {
				return res;
			}
			return { success: true, data: res };
		} catch (err) {
			console.error(`[ipcWrapper] channel ${channel} 处理异常:`, err);
			return { success: false, error: err?.message || String(err) };
		}
	};

	if (options.throttleMs && typeof options.throttleMs === "number") {
		wrapped = throttle(wrapped, options.throttleMs);
	}

	ipcMain.handle(channel, wrapped);
	_registry.set(channel, wrapped);
}

/** 卸载指定通道 */
function unregisterIPC(channel) {
	if (_registry.has(channel)) {
		ipcMain.removeHandler(channel);
		_registry.delete(channel);
	}
}

/** 卸载全部 */
function unregisterAll() {
	for (const channel of _registry.keys()) {
		ipcMain.removeHandler(channel);
	}
	_registry.clear();
}

module.exports = {
	registerIPC,
	unregisterIPC,
	unregisterAll,
};
