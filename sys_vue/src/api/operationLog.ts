/**
 * 操作日志 API（开发者日志页面）
 */
import axios from 'axios'
import type { AxiosInstance } from 'axios'
import type { ApiResponse, PaginatedResponse } from '@/types'
import { ApiError } from './qqmusic'

const operationLogClient: AxiosInstance = axios.create({
  baseURL: `${__BACKEND_BASE_URL__}/api/v1/operation-log`,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

operationLogClient.interceptors.response.use(
  (response) => {
    const res = response.data as ApiResponse
    if (res.code === 0) return res as never
    return Promise.reject(new ApiError(res.code, res.message || '请求失败'))
  },
  (error) => Promise.reject(error)
)

export interface OperationLogItem {
  time: string
  level: 'INFO' | 'WARNING' | 'ERROR'
  type: string
  action: string
  message: string
  status: number | null
  duration_ms: number | null
  error_code: number | null
  detail: Record<string, unknown>
}

export interface OperationLogQuery {
  page: number
  page_size: number
  level?: 'INFO' | 'WARNING' | 'ERROR'
  log_type?: 'request' | 'auth'
  keyword?: string
}

export interface OperationLogCleanupResult {
  retention_days: number
  cutoff_time: string
  deleted_count: number
  retained_count: number
  invalid_count: number
}

function post<T>(url: string, body?: unknown): Promise<ApiResponse<T>> {
  return operationLogClient.post(url, body) as unknown as Promise<ApiResponse<T>>
}

export function getOperationLogs(params: OperationLogQuery) {
  return post<PaginatedResponse<OperationLogItem>>('/list', params)
}

export function cleanupOperationLogs(retentionDays: 7 | 30) {
  return post<OperationLogCleanupResult>('/cleanup', { retention_days: retentionDays })
}
