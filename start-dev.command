#!/bin/bash

# LLMusic 开发模式启动（Mac 版）

APP_NAME="LLMusic"
BACKEND_PORT=9752
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "========================================"
echo "  ${APP_NAME} 开发模式启动"
echo "========================================"
echo ""

# 清理后端端口残留
echo "清理端口 ${BACKEND_PORT} ..."
PID=$(lsof -ti :"${BACKEND_PORT}" 2>/dev/null || true)
if [ -n "$PID" ]; then
  kill -9 "$PID" 2>/dev/null || true
  echo "  ✅ 已清理进程 PID=$PID"
else
  echo "  ⏭️  无需清理"
fi
echo ""

# 启动开发模式（dev-runner 自动管理后端 + Vite + Electron）
echo "启动服务..."
echo "  • 后端: http://127.0.0.1:${BACKEND_PORT}"
echo "  • 前端: http://127.0.0.1:9753"
echo "  • Ctrl+C 停止全部"
echo ""

cd "${ROOT_DIR}"
npm run dev
