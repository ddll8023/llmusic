@echo off
chcp 65001 >nul
title LLMusic Backend (Standalone)
echo [Backend] 启动 FastAPI 服务 http://127.0.0.1:9752 ...
echo [Backend] 注意: Electron 开发模式下会自动启动后端，此脚本仅供独立调试。
uv run --directory "%~dp0backend" uvicorn app.main:app --host 127.0.0.1 --port 9752 --reload
pause
