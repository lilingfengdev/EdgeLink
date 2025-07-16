# EdgeLink - Minecraft专用XRay代理管理器

EdgeLink 是一个专为Minecraft游戏优化的轻量级 XRay-core 代理管理器，提供现代化的中文界面来管理和配置 XRay 代理。

## 🚀 快速开始

### 开发环境
```bash
npm install
npm run dev
```

### 生产构建
```bash
# 构建安装包版本
npm run build:nsis

# 构建单文件版（便携版）
npm run build:portable

# 构建所有版本
npm run build:production

# 清理所有构建文件和缓存
npm run clean:all
```

## 📦 构建产物

- **安装包版本**: `EdgeLink-1.0.0-win-x64-Setup.exe` - 标准安装程序
- **单文件版**: `EdgeLink-1.0.0-win-x64-Portable.exe` - 免安装便携版

## 主要特性

### 🚀 运行时下载系统
- **自动下载**: 首次运行时自动检测并下载适合当前平台的 XRay 二进制文件
- **平台检测**: 自动识别操作系统（Windows、Linux、macOS）和架构（x86、x64、ARM）
- **版本管理**: 支持检查更新和自动升级到最新版本
- **智能缓存**: 本地缓存下载文件，避免重复下载
- **错误恢复**: 内置重试机制和错误处理，确保下载稳定性

### 📦 轻量级设计
- **无预装二进制**: 不再预装 XRay 二进制文件，大幅减少安装包大小
- **按需下载**: 仅下载当前平台所需的二进制文件
- **缓存管理**: 智能管理下载缓存，可手动清理旧版本

### 🎯 易用性
- **中文界面**: 完全中文化的用户界面
- **命令行模式**: 支持命令行交互式管理
- **图形界面**: 基于 Electron 的现代化图形界面
- **配置管理**: 简化的代理配置和管理流程

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动应用

#### 命令行模式
```bash
npm start
# 或
node app.js
```

#### 图形界面模式
```bash
npm run gui
# 或
node main.js
```

### 首次运行

1. **自动检测**: 应用启动时会自动检测是否已安装 XRay-core
2. **自动下载**: 如果未找到，会提示是否自动下载
3. **平台适配**: 自动选择适合当前系统的版本进行下载
4. **验证安装**: 下载完成后自动验证安装是否成功

## XRay 管理

### 自动下载
- 首次启动时自动检测并提示下载
- 支持断点续传和重试机制
- 下载进度实时显示

### 版本管理
- 自动检查最新版本
- 支持手动更新到最新版本
- 保留版本历史信息

### 缓存管理
- 智能缓存下载的文件
- 支持手动清理缓存
- 自动清理过期版本

## 支持的平台

| 操作系统 | 架构 | 支持状态 |
|---------|------|---------|
| Windows | x64 | ✅ |
| Windows | x86 | ✅ |
| Linux | x64 | ✅ |
| Linux | x86 | ✅ |
| Linux | ARM64 | ✅ |
| Linux | ARM32 | ✅ |
| macOS | x64 | ✅ |
| macOS | ARM64 (M1/M2) | ✅ |

## 构建和打包

### 开发构建
```bash
npm run build
```

### 平台特定构建
```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux

# 所有平台
npm run build:all
```

### 构建特性
- **排除二进制**: 构建过程自动排除所有 XRay 二进制文件
- **轻量化**: 最终安装包仅包含应用代码，不包含平台特定文件
- **缓存清理**: 构建前自动清理缓存和临时文件

## 配置文件

### 代理配置
支持多种协议的代理配置：
- VLESS
- VMess
- Trojan

### 传输协议
- TCP
- WebSocket
- HTTP/2
- gRPC
- xHTTP

### 安全选项
- TLS
- Reality
- 自定义证书

## 故障排除

### XRay 下载失败
1. 检查网络连接
2. 尝试手动重新下载：在 XRay 管理菜单中选择"重新初始化"
3. 清理缓存后重试

### 代理启动失败
1. 检查 XRay 是否正确安装
2. 验证配置文件格式
3. 查看日志输出获取详细错误信息

### 权限问题
- Linux/macOS: 确保 XRay 二进制文件具有执行权限
- Windows: 以管理员身份运行可能需要的操作

## 开发说明

### 项目结构
```
EdgeLink/
├── app.js              # 命令行主程序
├── main.js             # Electron 主进程
├── xray-downloader.js  # XRay 下载管理器
├── process-manager.js  # 进程管理器
├── proxy-manager.js    # 代理管理器
├── config-manager.js   # 配置管理器
├── build.js           # 构建脚本
├── public/            # 前端资源
└── utils/             # 工具函数
```

### 核心组件

#### XRayDownloader
- 负责 XRay 二进制文件的下载和管理
- 支持平台检测、版本管理、缓存控制
- 提供进度回调和错误处理

#### ProcessManager
- 管理 XRay 进程的启动和停止
- 集成下载器，确保 XRay 可用性
- 提供进程状态监控

#### ProxyManager
- 管理代理配置和生命周期
- 协调进程管理器和配置管理器
- 提供统一的代理操作接口

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request 来改进项目。

## 更新日志

### v1.0.0
- ✨ 实现运行时 XRay 下载系统
- ✨ 添加平台自动检测
- ✨ 支持版本管理和自动更新
- ✨ 实现智能缓存机制
- ✨ 优化构建流程，排除预装二进制
- 🐛 修复多平台兼容性问题
- 📦 大幅减少安装包大小

<div align="center">
  <img src="icon.png" alt="EdgeLink Logo" width="128" height="128">
  <h3>专为 Minecraft 设计的代理服务器</h3>
  <p>基于 XRay-core 的高性能代理管理工具</p>
</div>

## ✨ 特性

- 🎮 **专为 Minecraft 优化** - 支持 Java 版和基岩版
- 🖥️ **现代化桌面应用** - 基于 Electron 的美观界面
- 🚀 **简单易用** - 一键配置，快速启动
- 🔧 **智能管理** - 自动下载 XRay-core，智能配置优化
- 🌐 **多协议支持** - VLESS、VMess、Trojan 等主流协议
- 📊 **实时监控** - 连接状态、流量统计一目了然

## 🚀 快速开始

### 下载安装

从 [Releases](https://github.com/lilingfengdev/EdgeLink/releases) 页面下载适合您系统的版本：

- **Windows**: `EdgeLink-Windows-x64.exe`
- **macOS**: `EdgeLink-macOS.dmg`
- **Linux**: `EdgeLink-Linux-x64.AppImage` 或 `EdgeLink-Linux-x64.deb`

### 基本使用

1. **启动应用** - 双击运行下载的程序
2. **添加代理** - 点击"添加代理"按钮
3. **填写配置** - 输入服务器地址和端口信息
4. **启动代理** - 点击"启动"按钮开始代理服务
5. **配置游戏** - 在 Minecraft 中设置代理为 `127.0.0.1:本地端口`

## 🛠️ 开发构建

### 环境要求

- Node.js 18+
- npm 或 yarn

### 安装依赖

```bash
npm install
```

### 开发运行

```bash
# 启动桌面应用
npm run electron

# 开发模式
npm run dev
```

### 构建打包

```bash
# 构建当前平台
npm run build

# 构建特定平台
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

## 📋 支持的协议

| 协议 | 传输方式 | 安全性 |
|------|----------|--------|
| VLESS | TCP, WebSocket, HTTP/2, gRPC, xHTTP | TLS, Reality |
| VMess | TCP, WebSocket, HTTP/2, gRPC | TLS |
| Trojan | TCP, WebSocket | TLS |

## 🎯 使用场景

- **Minecraft 联机** - 与海外朋友一起游戏
- **服务器访问** - 连接国外 Minecraft 服务器
- **网络优化** - 减少延迟，提升游戏体验
- **隐私保护** - 保护游戏数据传输安全

## 📖 配置说明

### 简单模式
- **服务器地址**: 代理服务器的域名或IP
- **本地端口**: 本地监听端口（默认 1080）
- **协议类型**: TCP 或 UDP
- **用户ID**: 服务器提供的用户标识

### 高级模式
- **传输协议**: 选择合适的传输方式
- **安全设置**: TLS/Reality 配置
- **流量伪装**: 混淆和伪装选项
- **路由规则**: 自定义代理规则

## 🔧 故障排除

### 常见问题

**Q: 无法启动代理服务**
A: 检查端口是否被占用，尝试更换本地端口

**Q: 连接超时**
A: 确认服务器地址和配置信息正确

**Q: XRay 下载失败**
A: 检查网络连接，应用会自动重试下载

**Q: 游戏连接不稳定**
A: 尝试切换不同的传输协议

### 日志查看

应用日志保存在：
- **Windows**: `%APPDATA%/EdgeLink/logs/`
- **macOS**: `~/Library/Application Support/EdgeLink/logs/`
- **Linux**: `~/.config/EdgeLink/logs/`

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## ⭐ 支持项目

如果这个项目对您有帮助，请给我们一个 Star ⭐
