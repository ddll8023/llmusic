// 应用配置常量

export interface AudioConfig {
	DEFAULT_OPTIONS: {
		audioCodec: string
		audioChannels: number
		audioFrequency: number
		format: string
		timeout: number
		logLevel: string
	}
	PROCESSING_STATES: {
		IDLE: string
		PROCESSING: string
		COMPLETED: string
		ERROR: string
	}
}

export interface CacheConfig {
	COVER_CACHE_SIZE: number
	LRU_DEFAULT_SIZE: number
}

export interface ScanConfig {
	PROGRESS_THROTTLE_MS: number
	SUPPORTED_EXTENSIONS: string[]
	WORKER_TIMEOUT: number
}

export interface DbConfig {
	DB_FILENAME: string
	BACKUP_ENABLED: boolean
	AUTO_VALIDATE_INTERVAL: number
}

export const AUDIO_CONFIG: AudioConfig = {
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
}

export const CACHE_CONFIG: CacheConfig = {
	COVER_CACHE_SIZE: 100,
	LRU_DEFAULT_SIZE: 100,
}

export const SCAN_CONFIG: ScanConfig = {
	PROGRESS_THROTTLE_MS: 100,
	SUPPORTED_EXTENSIONS: [".mp3", ".flac", ".wav", ".m4a", ".aac", ".ogg"],
	WORKER_TIMEOUT: 30000,
}

export const DB_CONFIG: DbConfig = {
	DB_FILENAME: "db.json",
	BACKUP_ENABLED: true,
	AUTO_VALIDATE_INTERVAL: 300000,
}
