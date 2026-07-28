/**
 * 后端服务地址单一来源（改端口只需改这里；前端侧对应 vite.config 的 __BACKEND_BASE_URL__）
 */
export const BACKEND_HOST = "127.0.0.1"
export const BACKEND_PORT = 9752
export const BACKEND_BASE_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`
