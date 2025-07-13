#!/bin/bash

# EdgeLink - XRay代理管理器启动脚本

echo ""
echo "╔══════════════════════════════════════╗"
echo "║            EdgeLink 代理管理器        ║"
echo "║        XRay-core 配置管理和启动器      ║"
echo "╚══════════════════════════════════════╝"
echo ""

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "[错误] 未找到 Node.js，请先安装 Node.js"
    echo "安装方法: https://nodejs.org/"
    exit 1
fi

# 检查依赖是否安装
if [ ! -d "node_modules" ]; then
    echo "[信息] 正在安装依赖包..."
    npm install
    if [ $? -ne 0 ]; then
        echo "[错误] 依赖安装失败"
        exit 1
    fi
fi

# 启动应用程序
echo "[信息] 正在启动 EdgeLink..."
echo ""
node app.js
