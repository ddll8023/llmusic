// 错误码定义

export interface AudioErrors {
	PROCESSING_ERROR: string
	ALREADY_PROCESSING: string
	TIMEOUT: string
	INVALID_FORMAT: string
	FILE_NOT_FOUND: string
	NO_AUDIO_STREAM: string
	PERMISSION_DENIED: string
	MEMORY_ERROR: string
	UNKNOWN_ERROR: string
}

export interface DatabaseErrors {
	CONNECTION_ERROR: string
	QUERY_ERROR: string
	MIGRATION_ERROR: string
	VALIDATION_ERROR: string
	CONSTRAINT_ERROR: string
	NOT_FOUND: string
	DUPLICATE_ERROR: string
}

export interface FileErrors {
	FILE_NOT_FOUND: string
	PERMISSION_DENIED: string
	DISK_FULL: string
	PATH_TOO_LONG: string
	INVALID_PATH: string
	READ_ERROR: string
	WRITE_ERROR: string
}

export interface ScanErrors {
	SCAN_IN_PROGRESS: string
	SCAN_CANCELLED: string
	WORKER_TIMEOUT: string
	INVALID_DIRECTORY: string
	NO_AUDIO_FILES: string
	METADATA_ERROR: string
}

export interface IpcErrors {
	CHANNEL_NOT_FOUND: string
	INVALID_PARAMETERS: string
	HANDLER_ERROR: string
	TIMEOUT: string
	SERIALIZATION_ERROR: string
}

export interface UserErrors {
	INVALID_INPUT: string
	OPERATION_CANCELLED: string
	OPERATION_NOT_ALLOWED: string
	RESOURCE_BUSY: string
	QUOTA_EXCEEDED: string
}

// 音频处理错误
export const AUDIO_ERRORS: AudioErrors = {
	PROCESSING_ERROR: "processing_error",
	ALREADY_PROCESSING: "already_processing",
	TIMEOUT: "timeout",
	INVALID_FORMAT: "invalid_format",
	FILE_NOT_FOUND: "file_not_found",
	NO_AUDIO_STREAM: "no_audio_stream",
	PERMISSION_DENIED: "permission_denied",
	MEMORY_ERROR: "memory_error",
	UNKNOWN_ERROR: "unknown_error",
}

// 数据库错误
export const DATABASE_ERRORS: DatabaseErrors = {
	CONNECTION_ERROR: "connection_error",
	QUERY_ERROR: "query_error",
	MIGRATION_ERROR: "migration_error",
	VALIDATION_ERROR: "validation_error",
	CONSTRAINT_ERROR: "constraint_error",
	NOT_FOUND: "not_found",
	DUPLICATE_ERROR: "duplicate_error",
}

// 文件系统错误
export const FILE_ERRORS: FileErrors = {
	FILE_NOT_FOUND: "file_not_found",
	PERMISSION_DENIED: "permission_denied",
	DISK_FULL: "disk_full",
	PATH_TOO_LONG: "path_too_long",
	INVALID_PATH: "invalid_path",
	READ_ERROR: "read_error",
	WRITE_ERROR: "write_error",
}

// 扫描错误
export const SCAN_ERRORS: ScanErrors = {
	SCAN_IN_PROGRESS: "scan_in_progress",
	SCAN_CANCELLED: "scan_cancelled",
	WORKER_TIMEOUT: "worker_timeout",
	INVALID_DIRECTORY: "invalid_directory",
	NO_AUDIO_FILES: "no_audio_files",
	METADATA_ERROR: "metadata_error",
}

// IPC通信错误
export const IPC_ERRORS: IpcErrors = {
	CHANNEL_NOT_FOUND: "channel_not_found",
	INVALID_PARAMETERS: "invalid_parameters",
	HANDLER_ERROR: "handler_error",
	TIMEOUT: "timeout",
	SERIALIZATION_ERROR: "serialization_error",
}

// 用户相关错误
export const USER_ERRORS: UserErrors = {
	INVALID_INPUT: "invalid_input",
	OPERATION_CANCELLED: "operation_cancelled",
	OPERATION_NOT_ALLOWED: "operation_not_allowed",
	RESOURCE_BUSY: "resource_busy",
	QUOTA_EXCEEDED: "quota_exceeded",
}

interface ErrorDetails {
	code: string
	message: string
	details: Record<string, unknown>
	timestamp: string
}

/**
 * 创建标准化的错误对象
 * @param code 错误码
 * @param message 错误消息
 * @param details 错误详情
 */
export function createError(code: string, message: string, details: Record<string, unknown> = {}): Error & ErrorDetails {
	const error = new Error(message) as Error & ErrorDetails
	error.code = code
	error.details = details
	error.timestamp = new Date().toISOString()
	return error
}
