@echo off
chcp 65001 >nul 2>&1
title EdgeLink - 应用程序打包工具

color 0A
echo.
echo                    ╔══════════════════════════════════════════════╗
echo                    ║          🏗️  EdgeLink 应用程序打包工具        ║
echo                    ║            将应用程序打包为 EXE 文件           ║
echo                    ╚══════════════════════════════════════════════╝
echo.

REM 检查当前目录
if not exist "package.json" (
    echo                    ❌ 错误：请在 EdgeLink 项目根目录下运行此脚本
    echo                       当前目录: %CD%
    echo.
    pause
    exit /b 1
)

REM 检查 Node.js
echo                    🔍 检查构建环境...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo                    ❌ 未找到 Node.js，请先安装 Node.js
    echo                       📥 下载地址: https://nodejs.org/
    echo.
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%i in ('node --version') do echo                    ✅ Node.js 版本: %%i
)

REM 检查依赖
echo                    📦 检查项目依赖...
if not exist "node_modules" (
    echo                    📥 正在安装依赖包...
    npm install
    if %errorlevel% neq 0 (
        echo                    ❌ 依赖安装失败
        pause
        exit /b 1
    )
    echo                    ✅ 依赖包安装完成
) else (
    echo                    ✅ 依赖包已安装
)

REM 显示打包选项
echo.
echo                    🎯 请选择打包平台:
echo                       1. Windows (推荐)
echo                       2. 所有平台
echo                       3. 仅打包 (不安装程序)
echo                       4. 取消
echo.
set /p choice="                    请输入选项 (1-4): "

if "%choice%"=="1" (
    set platform=win
    set description=Windows 平台
) else if "%choice%"=="2" (
    set platform=all
    set description=所有平台
) else if "%choice%"=="3" (
    set platform=pack
    set description=仅打包
) else if "%choice%"=="4" (
    echo                    ❌ 用户取消打包
    pause
    exit /b 0
) else (
    echo                    ❌ 无效选项，默认选择 Windows 平台
    set platform=win
    set description=Windows 平台
)

echo.
echo                    🏗️  开始打包应用程序 (%description%)...
echo                    ⏳ 这可能需要几分钟时间，请耐心等待...
echo.

REM 执行打包
if "%platform%"=="pack" (
    npm run pack
) else if "%platform%"=="all" (
    node build.js all
) else (
    node build.js %platform%
)

if %errorlevel% neq 0 (
    echo.
    echo                    ❌ 打包失败！
    echo                    💡 建议检查：
    echo                       1. 网络连接是否正常
    echo                       2. 磁盘空间是否充足
    echo                       3. 杀毒软件是否阻止了操作
    echo.
    pause
    exit /b 1
)

echo.
echo                    🎉 打包完成！
echo.
echo                    📁 输出目录: %CD%\dist
echo                    💡 提示：
echo                       - .exe 文件可以直接运行
echo                       - 安装包会自动创建桌面快捷方式
echo                       - 便携版无需安装，解压即用
echo.

REM 询问是否打开输出目录
set /p open="                    是否打开输出目录？(y/n): "
if /i "%open%"=="y" (
    if exist "dist" (
        explorer dist
    ) else (
        echo                    ❌ 输出目录不存在
    )
)

echo.
echo                    🚀 EdgeLink 打包完成！
echo                    📧 如有问题，请查看项目文档或联系开发者
echo.
pause
