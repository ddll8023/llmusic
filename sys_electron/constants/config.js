// 应用配置常量

// 音频处理配置
const AUDIO_CONFIG = {
	// 默认处理选项
	DEFAULT_OPTIONS: {
		audioCodec: "pcm_s16le",
		audioChannels: 2,
		audioFrequency: 44100,
		format: "wav",
		timeout: 60000,
		logLevel: "info",
	},

	// 处理状态
	PROCESSING_STATES: {
		IDLE: "idle",
		PROCESSING: "processing",
		COMPLETED: "completed",
		ERROR: "error",
	},
};

// 缓存配置
const CACHE_CONFIG = {
	COVER_CACHE_SIZE: 100,
	LRU_DEFAULT_SIZE: 100,
};

// 扫描配置
const SCAN_CONFIG = {
	PROGRESS_THROTTLE_MS: 100,
	SUPPORTED_EXTENSIONS: [".mp3", ".flac", ".wav", ".m4a", ".aac", ".ogg"],
	WORKER_TIMEOUT: 30000,
};

// 数据库配置
const DB_CONFIG = {
	DB_FILENAME: "db.json",
	BACKUP_ENABLED: true,
	AUTO_VALIDATE_INTERVAL: 300000, // 5分钟
};

module.exports = {
	AUDIO_CONFIG,
	CACHE_CONFIG,
	SCAN_CONFIG,
	DB_CONFIG,
};
