@echo off
chcp 65001 > nul
echo 正在启动 LLMusic 后端服务...
echo.

cd /d %~dp0
uv run --directory backend python -m app.main
