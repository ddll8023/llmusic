@echo off
echo ========================================
echo LLMusic 应用打包脚本
echo ========================================
echo.

echo 步骤 1: 清理旧的构建文件...
if exist dist (
    echo 正在删除 dist 文件夹...
    rmdir /s /q dist
    if %errorlevel% neq 0 (
        echo 错误: 无法删除 dist 文件夹，可能被其他程序占用。
        echo 请确保已关闭所有正在运行的 LLMusic 实例，然后重试。
        echo.
        pause
        exit /b 1
    )
) else (
    echo dist 文件夹不存在，跳过清理...
)
echo 清理完成!
echo.

echo 步骤 2: 构建前端代码...
call npm run build
if %errorlevel% neq 0 (
    echo 错误: 前端构建失败!
    echo 请检查错误信息并修复问题后重试。
    echo.
    pause
    exit /b 1
)
echo 前端构建成功!
echo.

echo 步骤 3: 打包 Electron 应用...
call npm run pack
if %errorlevel% neq 0 (
    echo 错误: 应用打包失败!
    echo 请检查错误信息并修复问题后重试。
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo 打包完成!
echo.
echo 安装文件位于: %CD%\dist\
echo ========================================
echo.
pause 