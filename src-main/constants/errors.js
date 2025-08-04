// 错误码定义

// 音频处理错误
const AUDIO_ERRORS = {
	PROCESSING_ERROR: "processing_error",
	ALREADY_PROCESSING: "already_processing",
	TIMEOUT: "timeout",
	INVALID_FORMAT: "invalid_format",
	FILE_NOT_FOUND: "file_not_found",
	NO_AUDIO_STREAM: "no_audio_stream",
	PERMISSION_DENIED: "permission_denied",
	MEMORY_ERROR: "memory_error",
	UNKNOWN_ERROR: "unknown_error",
};

// 数据库错误
const DATABASE_ERRORS = {
	CONNECTION_ERROR: "connection_error",
	QUERY_ERROR: "query_error",
	MIGRATION_ERROR: "migration_error",
	VALIDATION_ERROR: "validation_error",
	CONSTRAINT_ERROR: "constraint_error",
	NOT_FOUND: "not_found",
	DUPLICATE_ERROR: "duplicate_error",
};

// 文件系统错误
const FILE_ERRORS = {
	FILE_NOT_FOUND: "file_not_found",
	PERMISSION_DENIED: "permission_denied",
	DISK_FULL: "disk_full",
	PATH_TOO_LONG: "path_too_long",
	INVALID_PATH: "invalid_path",
	READ_ERROR: "read_error",
	WRITE_ERROR: "write_error",
};

// 扫描错误
const SCAN_ERRORS = {
	SCAN_IN_PROGRESS: "scan_in_progress",
	SCAN_CANCELLED: "scan_cancelled",
	WORKER_TIMEOUT: "worker_timeout",
	INVALID_DIRECTORY: "invalid_directory",
	NO_AUDIO_FILES: "no_audio_files",
	METADATA_ERROR: "metadata_error",
};

// IPC通信错误
const IPC_ERRORS = {
	CHANNEL_NOT_FOUND: "channel_not_found",
	INVALID_PARAMETERS: "invalid_parameters",
	HANDLER_ERROR: "handler_error",
	TIMEOUT: "timeout",
	SERIALIZATION_ERROR: "serialization_error",
};

// 用户相关错误
const USER_ERRORS = {
	INVALID_INPUT: "invalid_input",
	OPERATION_CANCELLED: "operation_cancelled",
	OPERATION_NOT_ALLOWED: "operation_not_allowed",
	RESOURCE_BUSY: "resource_busy",
	QUOTA_EXCEEDED: "quota_exceeded",
};

/**
 * 创建标准化的错误对象
 * @param {string} code 错误码
 * @param {string} message 错误消息
 * @param {Object} details 错误详情
 * @returns {Error} 标准化的错误对象
 */
function createError(code, message, details = {}) {
	const error = new Error(message);
	error.code = code;
	error.details = details;
	error.timestamp = new Date().toISOString();
	return error;
}

module.exports = {
	AUDIO_ERRORS,
	DATABASE_ERRORS,
	FILE_ERRORS,
	SCAN_ERRORS,
	IPC_ERRORS,
	USER_ERRORS,
	createError,
};
