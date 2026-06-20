@echo off
chcp 65001 >/dev/null
echo ========================================
echo LLMusic 应用打包脚本
echo ========================================
echo.

echo [1/4] 清理旧的前端构建文件...
if exist sys_vue\dist (
    echo 正在删除 sys_vue\dist ...
    rmdir /s /q sys_vue\dist
    if %errorlevel% neq 0 (
        echo 错误: 无法删除 dist 文件夹，可能被其他程序占用。
        pause
        exit /b 1
    )
) else (
    echo sys_vue\dist 不存在，跳过清理...
)
echo 清理完成!
echo.

echo [2/4] 构建前端代码...
call npm --prefix sys_vue run build
if %errorlevel% neq 0 (
    echo 错误: 前端构建失败!
    pause
    exit /b 1
)
echo 前端构建成功!
echo.

echo [3/4] 打包后端 (PyInstaller)...
if exist backend\dist (
    echo 清理旧的后端构建文件...
    rmdir /s /q backend\dist
)
uv run --directory backend pyinstaller --onefile --name backend --distpath dist entry.py
if %errorlevel% neq 0 (
    echo 错误: 后端打包失败!
    pause
    exit /b 1
)
echo 后端打包成功!
echo.

echo [4/4] 打包 Electron 应用...
call npm --prefix sys_electron run pack
if %errorlevel% neq 0 (
    echo 错误: Electron 打包失败!
    pause
    exit /b 1
)

echo.
echo ========================================
echo 打包完成!
echo.
echo 产物目录: %CD%\release
echo ========================================
echo.
pause