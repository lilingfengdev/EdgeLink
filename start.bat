@echo off
chcp 65001 >nul
title EdgeLink - XRay代理管理器

echo.
echo ╔══════════════════════════════════════╗
echo ║            EdgeLink 代理管理器        ║
echo ║        XRay-core 配置管理和启动器      ║
echo ╚══════════════════════════════════════╝
echo.

REM 检查 Node.js 是否安装
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

REM 检查依赖是否安装
if not exist "node_modules" (
    echo [信息] 正在安装依赖包...
    npm install
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
)

REM 启动应用程序
echo [信息] 正在启动 EdgeLink...
echo.
node app.js

pause
