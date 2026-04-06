@echo off
chcp 65001 > nul
echo 正在启动本地音乐播放器...
echo.

rem 确保在批处理文件所在的目录中执行
cd /d %~dp0

rem 启动应用
npm run dev

@REM rem 如果出错，显示错误信息
@REM if %ERRORLEVEL% neq 0 (
@REM     echo.
@REM     echo 启动失败，错误代码: %ERRORLEVEL%
@REM     pause
@REM ) 