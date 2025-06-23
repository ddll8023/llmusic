/**
 * 音频播放器兼容层
 *
 * 该模块提供向后兼容的API，内部使用audioProcessor模块实现功能。
 * 实际的音频播放逻辑已移至渲染进程，使用Web Audio API实现。
 * 本模块主要用于保持与旧版代码的兼容性，新代码应直接使用audioProcessor。
 *
 * @deprecated 请直接使用audioProcessor模块
 */

const {
	audioProcessor,
	ProcessingState,
	ErrorType,
} = require("./audioProcessor");
const { EventEmitter } = require("events");

/**
 * 播放状态枚举（兼容旧API）
 * @enum {string}
 */
const PlaybackState = {
	/** 停止状态 */
	STOPPED: "stopped",
	/** 播放状态 */
	PLAYING: "playing",
	/** 暂停状态 */
	PAUSED: "paused",
	/** 加载状态 */
	LOADING: "loading",
	/** 错误状态 */
	ERROR: "error",
};

/**
 * 将处理状态映射为播放状态
 * @param {string} processingState audioProcessor的处理状态
 * @returns {string} 对应的播放状态
 */
const mapProcessingToPlaybackState = (processingState) => {
	switch (processingState) {
		case ProcessingState.IDLE:
		case ProcessingState.CANCELLED:
		case ProcessingState.COMPLETED:
			return PlaybackState.STOPPED;
		case ProcessingState.PROCESSING:
			return PlaybackState.PLAYING;
		case ProcessingState.ERROR:
			return PlaybackState.ERROR;
		default:
			return PlaybackState.STOPPED;
	}
};

/**
 * 音频播放器兼容类
 * 包装audioProcessor提供向后兼容的API
 */
class AudioPlayerCompat extends EventEmitter {
	/**
	 * 创建音频播放器兼容实例
	 */
	constructor() {
		super();

		/**
		 * 当前歌曲信息
		 * @type {Object|null}
		 */
		this.currentSong = null;

		/**
		 * 当前播放位置（秒）
		 * @type {number}
		 */
		this.position = 0;

		/**
		 * 音量值（0-1）
		 * @type {number}
		 */
		this.volume = 1.0;

		/**
		 * 是否静音
		 * @type {boolean}
		 */
		this.muted = false;

		/**
		 * 上次错误信息
		 * @type {Error|null}
		 * @private
		 */
		this._lastError = null;

		// 绑定方法，确保正确的this上下文
		this.play = this.play.bind(this);
		this.pause = this.pause.bind(this);
		this.resume = this.resume.bind(this);
		this.stop = this.stop.bind(this);
		this.seek = this.seek.bind(this);
		this.setVolume = this.setVolume.bind(this);
		this.setMuted = this.setMuted.bind(this);
		this.getStatus = this.getStatus.bind(this);
		this.handleStop = this.handleStop.bind(this);

		// 初始化事件转发
		this._setupEventForwarding();
	}

	/**
	 * 设置事件转发
	 * @private
	 */
	_setupEventForwarding() {
		// 转发audioProcessor事件到兼容层
		audioProcessor.on("processing:start", (data) => {
			this._lastError = null;
			this.emit("start", data);
		});

		audioProcessor.on("processing:complete", (data) => {
			this.emit("end", data);
		});

		audioProcessor.on("processing:progress", (data) => {
			this.emit("progress", data);
		});

		audioProcessor.on("processing:cancelled", () => {
			this.emit("stop");
		});

		audioProcessor.on("error", (error) => {
			this._lastError = error;
			this.emit("error", error);
		});
	}

	/**
	 * 播放音频文件（兼容旧API）
	 * 实际上调用audioProcessor.processAudio
	 *
	 * @param {string} filePath 音频文件路径
	 * @param {Object} options 播放选项
	 * @param {number} [options.position=0] 开始位置（秒）
	 * @param {Object} [options.metadata] 歌曲元数据
	 * @returns {Promise<Buffer>} 处理后的音频数据
	 */
	play(filePath, options = {}) {
		this.position = options.position || 0;

		// 如果提供了元数据，保存为当前歌曲
		if (options.metadata) {
			this.currentSong = options.metadata;
		}

		// 调用audioProcessor处理音频
		return audioProcessor.processAudio(filePath, options).catch((error) => {
			// 保存错误信息
			this._lastError = error;
			throw error;
		});
	}

	/**
	 * 暂停播放（兼容旧API）
	 * 实际上由渲染进程处理
	 *
	 * @returns {Promise<void>}
	 */
	pause() {
		return Promise.resolve();
	}

	/**
	 * 恢复播放（兼容旧API）
	 * 实际上由渲染进程处理
	 *
	 * @returns {Promise<void>}
	 */
	resume() {
		return Promise.resolve();
	}

	/**
	 * 停止播放（兼容旧API）
	 * 实际上调用audioProcessor.cancelProcessing
	 *
	 * @returns {Promise<Object>} 停止结果
	 */
	stop() {
		return audioProcessor.cancelProcessing();
	}

	/**
	 * 跳转到指定时间（兼容旧API）
	 * 需要重新处理音频
	 *
	 * @param {number} newPosition 新位置（秒）
	 * @returns {Promise<Object>} 操作结果
	 */
	seek(newPosition) {
		this.position = newPosition;
		return this.stop();
	}

	/**
	 * 设置音量（兼容旧API）
	 * 实际上由渲染进程处理
	 *
	 * @param {number} newVolume 新音量值（0-1）
	 * @returns {Promise<void>}
	 */
	setVolume(newVolume) {
		this.volume = Math.max(0, Math.min(1, newVolume));
		return Promise.resolve();
	}

	/**
	 * 设置静音状态（兼容旧API）
	 * 实际上由渲染进程处理
	 *
	 * @param {boolean} isMuted 是否静音
	 * @returns {Promise<void>}
	 */
	setMuted(isMuted) {
		this.muted = !!isMuted;
		return Promise.resolve();
	}

	/**
	 * 获取播放状态（兼容旧API）
	 *
	 * @returns {Object} 播放状态对象
	 */
	getStatus() {
		const processorStatus = audioProcessor.getStatus();
		return {
			state: mapProcessingToPlaybackState(processorStatus.state),
			currentSong: this.currentSong,
			position: this.position,
			duration: processorStatus.duration,
			volume: this.volume,
			muted: this.muted,
			error: this._lastError,
		};
	}

	/**
	 * 内部停止处理（兼容旧API）
	 */
	handleStop() {
		this.emit("stop");
	}
}

// 创建单例实例
const audioPlayerInstance = new AudioPlayerCompat();

module.exports = {
	audioPlayer: audioPlayerInstance,
	PlaybackState,

	// 同时导出新API，鼓励直接使用
	audioProcessor,
	ProcessingState,
	ErrorType,
};
