@echo off
chcp 65001 >nul
setlocal

echo ========================================
echo LLMusic Windows 发布构建
echo ========================================
echo.

echo 执行 Windows 原生构建：前端、后端、Electron、NSIS/ZIP...
call npm run dist:win
if %errorlevel% neq 0 (
    echo.
    echo 错误: Windows 发布构建失败!
    exit /b 1
)

echo.
echo ========================================
echo Windows 发布构建完成!
echo 产物目录: %CD%\release
echo ========================================
endlocal
