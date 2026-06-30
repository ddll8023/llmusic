@echo off
chcp 65001 >nul
title LLMusic Dev

:: 启动前清理占端口 9752 的残留进程
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":9752" ^| findstr "LISTEN"') do (
    if not "%%p"=="" (
        taskkill /F /PID %%p >nul 2>&1
    )
)

call npm run dev
pause
