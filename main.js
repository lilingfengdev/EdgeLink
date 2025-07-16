/**
 * EdgeLink Electron 主进程
 * 创建桌面应用程序窗口和后端服务
 */

const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

// 导入路径管理器
const { initializePathManager, getPathManager } = require('./utils/path-manager');

// 导入后端模块
const ProxyManager = require('./proxy-manager');
const DownloadSettingsManager = require('./download-settings-manager');
const logger = require('./utils/logger');

class EdgeLinkApp {
    constructor() {
        this.mainWindow = null;
        this.server = null;
        this.io = null;
        this.pathManager = null;
        this.proxyManager = null;
        this.downloadSettingsManager = new DownloadSettingsManager();
        this.port = 3000;
        this.currentSimpleProxy = null; // 当前运行的简单代理名称

        // 开发模式检测 - 只在明确指定时启用
        this.isDev = process.argv.includes('--dev') ||
                     process.argv.includes('--development') ||
                     (process.env.NODE_ENV === 'development' && process.argv.includes('--enable-devtools'));
    }

    /**
     * 初始化应用程序
     */
    async initialize() {
        // 设置应用程序事件
        app.whenReady().then(async () => {
            // 初始化路径管理器
            try {
                this.pathManager = await initializePathManager();
                logger.info('路径管理器初始化完成');
            } catch (error) {
                logger.error(`路径管理器初始化失败: ${error.message}`);
                throw error;
            }

            // 初始化代理管理器
            this.proxyManager = new ProxyManager();

            this.createWindow();
            this.setupMenu();

            // 启动后端服务器（优先启动，确保界面能正常加载）
            this.startBackendServer();

            // 后台初始化XRay（不阻塞界面加载）
            this.initializeXRayInBackground();
        });

        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                this.cleanup();
                app.quit();
            }
        });

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                this.createWindow();
            }
        });

        // 设置IPC通信
        this.setupIPC();
    }

    /**
     * 后台初始化XRay（不阻塞界面）
     */
    async initializeXRayInBackground() {
        try {
            logger.info('正在后台初始化XRay-core...');

            // 通知前端XRay状态
            this.broadcastXRayStatus('initializing', '正在初始化XRay-core...');

            await this.proxyManager.processManager.initialize();
            logger.success('XRay初始化完成');

            // 通知前端XRay已就绪
            this.broadcastXRayStatus('ready', 'XRay-core已就绪');

        } catch (error) {
            logger.warn(`XRay初始化失败: ${error.message}`);

            // 通知前端XRay需要下载
            this.broadcastXRayStatus('download_required', 'XRay-core需要下载', {
                error: error.message,
                canDownload: true
            });

            // 自动开始下载（静默模式）
            this.downloadXRayInBackground();
        }
    }

    /**
     * 后台下载XRay（不显示模态对话框）
     */
    async downloadXRayInBackground() {
        try {
            logger.info('开始后台下载XRay-core...');

            // 通知前端开始下载
            this.broadcastXRayStatus('downloading', '正在下载XRay-core...', {
                progress: 0
            });

            const XRayDownloader = require('./xray-downloader');
            const downloader = new XRayDownloader();

            await downloader.downloadAndInstall((progress) => {
                // 实时更新下载进度
                this.broadcastXRayStatus('downloading', '正在下载XRay-core...', {
                    progress: progress.progress || 0,
                    details: progress.message || ''
                });
            });

            // 下载完成后重新初始化
            await this.proxyManager.processManager.initialize();
            logger.success('XRay下载并初始化完成');

            // 通知前端XRay已就绪
            this.broadcastXRayStatus('ready', 'XRay-core已就绪');

        } catch (error) {
            logger.error(`XRay后台下载失败: ${error.message}`);

            // 通知前端下载失败
            this.broadcastXRayStatus('download_failed', 'XRay-core下载失败', {
                error: error.message,
                canRetry: true
            });
        }
    }

    /**
     * 广播XRay状态更新
     */
    broadcastXRayStatus(status, message, data = {}) {
        const statusData = {
            status,
            message,
            timestamp: new Date().toISOString(),
            ...data
        };

        // 通过Socket.IO广播
        if (this.io) {
            this.io.emit('xray-status-update', statusData);
        }

        logger.info(`XRay状态: ${status} - ${message}`);
    }

    /**
     * 显示XRay错误（通过UI状态而不是弹窗）
     */
    showXRayError(message) {
        logger.warn(`XRay错误: ${message}`);

        // 通过UI状态显示错误，而不是弹窗
        this.broadcastXRayStatus('download_required', 'XRay-core需要下载', {
            error: message,
            canDownload: true
        });
    }

    /**
     * 带进度的XRay下载（已弃用，改为后台下载）
     * 保留此方法以防其他地方调用，但实际使用后台下载
     */
    async downloadXRayWithProgress() {
        logger.info('downloadXRayWithProgress被调用，重定向到后台下载...');

        // 直接调用后台下载方法
        return this.downloadXRayInBackground();
    }

    /**
     * 创建进度页面HTML（已弃用，保留以防兼容性问题）
     */
    createProgressPage() {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>下载XRay-core</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    padding: 20px;
                    margin: 0;
                    background: #f5f5f5;
                }
                .container {
                    text-align: center;
                }
                .progress-bar {
                    width: 100%;
                    height: 20px;
                    background: #ddd;
                    border-radius: 10px;
                    overflow: hidden;
                    margin: 20px 0;
                }
                .progress-fill {
                    height: 100%;
                    background: #4CAF50;
                    width: 0%;
                    transition: width 0.3s ease;
                }
                .status {
                    margin: 10px 0;
                    color: #666;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h3>正在下载XRay-core</h3>
                <p style="color: #666; font-size: 14px;">下载包含：xray可执行文件、geoip.dat、geosite.dat</p>
                <div class="progress-bar">
                    <div class="progress-fill" id="progressFill"></div>
                </div>
                <div class="status" id="status">准备下载...</div>
                <div id="details"></div>
            </div>

            <script>
                const { ipcRenderer } = require('electron');

                ipcRenderer.on('download-progress', (event, progress) => {
                    const progressFill = document.getElementById('progressFill');
                    const status = document.getElementById('status');
                    const details = document.getElementById('details');

                    if (progress.type === 'fetch_info') {
                        progressFill.style.width = '10%';
                        status.textContent = '获取版本信息...';
                        details.textContent = '';
                    } else if (progress.type === 'download') {
                        progressFill.style.width = progress.progress + '%';
                        status.textContent = '正在下载XRay核心文件...';
                        if (progress.total) {
                            const mb = (progress.downloaded / 1024 / 1024).toFixed(1);
                            const totalMb = (progress.total / 1024 / 1024).toFixed(1);
                            details.textContent = \`\${mb} MB / \${totalMb} MB\`;
                        }
                    } else if (progress.type === 'extract') {
                        progressFill.style.width = '90%';
                        status.textContent = '正在解压文件...';
                        details.textContent = '解压xray、geoip.dat、geosite.dat';
                    } else if (progress.type === 'complete') {
                        progressFill.style.width = '100%';
                        status.textContent = '安装完成！';
                        details.textContent = 'XRay-core已成功安装';
                    }
                });
            </script>
        </body>
        </html>
        `;
    }

    /**
     * 创建主窗口
     */
    createWindow() {
        this.mainWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            minWidth: 800,
            minHeight: 600,
            // icon: path.join(__dirname, 'assets', 'icon.png'), // 暂时移除图标引用
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                enableRemoteModule: false,
                preload: path.join(__dirname, 'preload.js')
            },
            frame: false,
            titleBarStyle: 'hidden',
            show: false
        });

        // 窗口准备好后显示
        this.mainWindow.once('ready-to-show', () => {
            this.mainWindow.show();
            
            if (this.isDev) {
                this.mainWindow.webContents.openDevTools();
            }
        });

        // 加载应用程序
        this.loadApp();

        // 处理窗口关闭
        this.mainWindow.on('closed', () => {
            this.mainWindow = null;
        });

        // 处理外部链接
        this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
            shell.openExternal(url);
            return { action: 'deny' };
        });
    }

    /**
     * 加载应用程序界面
     */
    async loadApp() {
        try {
            // 等待后端服务启动
            await this.waitForServer();

            // 加载本地服务器
            await this.mainWindow.loadURL(`http://localhost:${this.port}`);
            logger.success('应用界面加载成功');

        } catch (error) {
            logger.error(`加载应用程序失败: ${error.message}`);

            // 尝试直接加载，可能服务器已经启动但连接检查失败
            try {
                logger.info('尝试直接加载应用界面...');
                await this.mainWindow.loadURL(`http://localhost:${this.port}`);
                logger.success('直接加载成功');
            } catch (directLoadError) {
                logger.error(`直接加载也失败: ${directLoadError.message}`);

                // 最后才显示错误页面
                const errorHtml = this.createErrorPage(
                    `应用启动遇到问题，但这通常是临时的。\n\n` +
                    `原始错误: ${error.message}\n` +
                    `直接加载错误: ${directLoadError.message}\n\n` +
                    `请尝试重新启动应用程序。`
                );
                await this.mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`);
            }
        }
    }

    /**
     * 等待服务器启动（优化版本，更宽容的超时处理）
     */
    waitForServer() {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 100; // 10秒，每100ms检查一次

            const checkServer = () => {
                attempts++;

                const http = require('http');
                const req = http.get(`http://localhost:${this.port}`, (res) => {
                    logger.success('后端服务器连接成功');
                    resolve();
                });

                req.on('error', () => {
                    if (attempts < maxAttempts) {
                        setTimeout(checkServer, 100);
                    } else {
                        // 超时后不直接拒绝，而是尝试直接加载
                        logger.warn('服务器连接超时，尝试直接加载应用');
                        resolve(); // 改为resolve而不是reject
                    }
                });

                // 设置请求超时
                req.setTimeout(1000, () => {
                    req.destroy();
                });
            };

            // 延迟500ms开始检查，给服务器启动时间
            setTimeout(checkServer, 500);
        });
    }

    /**
     * 启动后端服务器
     */
    async startBackendServer() {
        try {
            const expressApp = express();
            this.server = http.createServer(expressApp);
            this.io = socketIo(this.server, {
                cors: {
                    origin: "*",
                    methods: ["GET", "POST"]
                }
            });

            // 中间件
            expressApp.use(cors());
            expressApp.use(express.json());
            expressApp.use(express.static(path.join(__dirname, 'public')));

            // API路由
            this.setupAPIRoutes(expressApp);

            // Socket.IO事件
            this.setupSocketEvents();

            // 启动服务器
            this.server.listen(this.port, 'localhost', () => {
                logger.info(`后端服务器已启动: http://localhost:${this.port}`);
            });

        } catch (error) {
            logger.error(`启动后端服务器失败: ${error.message}`);
        }
    }

    /**
     * 设置API路由
     */
    setupAPIRoutes(app) {
        // 获取代理列表
        app.get('/api/proxies', (req, res) => {
            try {
                const proxies = this.proxyManager.getProxyList();
                res.json({ success: true, data: proxies });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // 添加代理
        app.post('/api/proxies', async (req, res) => {
            try {
                const { name, config } = req.body;
                await this.proxyManager.addProxy(name, config);
                res.json({ success: true, message: '代理添加成功' });
                this.broadcastUpdate();
            } catch (error) {
                res.status(400).json({ success: false, error: error.message });
            }
        });

        // 更新代理
        app.put('/api/proxies/:name', async (req, res) => {
            try {
                const { name } = req.params;
                const { config } = req.body;
                await this.proxyManager.updateProxy(name, config);
                res.json({ success: true, message: '代理更新成功' });
                this.broadcastUpdate();
            } catch (error) {
                res.status(400).json({ success: false, error: error.message });
            }
        });

        // 删除代理
        app.delete('/api/proxies/:name', async (req, res) => {
            try {
                const { name } = req.params;
                await this.proxyManager.deleteProxy(name);
                res.json({ success: true, message: '代理删除成功' });
                this.broadcastUpdate();
            } catch (error) {
                res.status(400).json({ success: false, error: error.message });
            }
        });

        // 启动代理
        app.post('/api/proxies/:name/start', async (req, res) => {
            try {
                const { name } = req.params;
                await this.proxyManager.startProxy(name);
                res.json({ success: true, message: '代理启动成功' });
                this.broadcastUpdate();
            } catch (error) {
                res.status(400).json({ success: false, error: error.message });
            }
        });

        // 停止代理
        app.post('/api/proxies/:name/stop', async (req, res) => {
            try {
                const { name } = req.params;
                await this.proxyManager.stopProxy(name);
                res.json({ success: true, message: '代理停止成功' });
                this.broadcastUpdate();
            } catch (error) {
                res.status(400).json({ success: false, error: error.message });
            }
        });

        // 获取代理详情
        app.get('/api/proxies/:name', (req, res) => {
            try {
                const { name } = req.params;
                const details = this.proxyManager.getProxyDetails(name);
                if (!details) {
                    return res.status(404).json({ success: false, error: '代理不存在' });
                }
                res.json({ success: true, data: details });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // 获取统计信息
        app.get('/api/stats', (req, res) => {
            try {
                const stats = this.proxyManager.getStatistics();
                res.json({ success: true, data: stats });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // 简单模式 - 启动代理
        app.post('/api/simple-proxy/start', async (req, res) => {
            try {
                const { uuid, remoteAddress, remotePort, serverName, proxyName } = req.body;

                // 验证必需字段
                if (!uuid || !remoteAddress || !remotePort || !serverName || !proxyName) {
                    throw new Error('请填写所有必需字段');
                }

                // 生成本地端口
                const localPort = 25565; // 默认Minecraft端口

                // 创建代理配置
                const config = {
                    address: remoteAddress,
                    port: remotePort,
                    localPort: localPort,
                    protocol: 'vless',
                    userId: uuid,
                    network: 'tcp', // 默认使用TCP
                    security: 'none',
                    serverName: serverName // 添加服务器名称
                };

                // 使用用户输入的代理名称
                const finalProxyName = proxyName;

                // 检查代理名称是否已存在
                if (this.proxyManager.proxies.has(finalProxyName)) {
                    throw new Error(`代理名称 "${finalProxyName}" 已存在，请使用其他名称`);
                }

                // 添加并启动代理
                await this.proxyManager.addProxy(finalProxyName, config);
                await this.proxyManager.startProxy(finalProxyName);

                // 保存当前启动的简单代理名称
                this.currentSimpleProxy = finalProxyName;

                res.json({
                    success: true,
                    data: {
                        localPort: localPort,
                        remoteAddress: remoteAddress,
                        remotePort: remotePort,
                        serverName: serverName,
                        proxyName: finalProxyName
                    },
                    message: `代理 "${finalProxyName}" 启动成功并已保存到代理列表`
                });

                this.broadcastUpdate();
            } catch (error) {
                res.status(400).json({ success: false, error: error.message });
            }
        });

        // 简单模式 - 停止代理
        app.post('/api/simple-proxy/stop', async (req, res) => {
            try {
                if (this.currentSimpleProxy) {
                    await this.proxyManager.stopProxy(this.currentSimpleProxy);
                    res.json({
                        success: true,
                        message: `代理 "${this.currentSimpleProxy}" 已停止，但仍保存在代理列表中`
                    });
                    this.currentSimpleProxy = null;
                } else {
                    res.json({ success: true, message: '没有运行中的简单代理' });
                }
                this.broadcastUpdate();
            } catch (error) {
                res.status(400).json({ success: false, error: error.message });
            }
        });

        // 日志相关API
        // 获取XRay日志
        app.get('/api/logs/xray', (req, res) => {
            try {
                const {
                    proxy = null,
                    level = null,
                    limit = 100,
                    offset = 0
                } = req.query;

                const logManager = this.proxyManager.processManager.getLogManager();
                const result = logManager.getAllLogs({
                    proxyName: proxy,
                    level,
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                });

                res.json({ success: true, data: result });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // 获取特定代理的日志
        app.get('/api/logs/xray/:proxyName', (req, res) => {
            try {
                const { proxyName } = req.params;
                const {
                    level = null,
                    limit = 100,
                    offset = 0
                } = req.query;

                const logManager = this.proxyManager.processManager.getLogManager();
                const result = logManager.getProxyLogs(proxyName, {
                    level,
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                });

                res.json({ success: true, data: result });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // 获取日志统计信息
        app.get('/api/logs/stats', (req, res) => {
            try {
                const logManager = this.proxyManager.processManager.getLogManager();
                const stats = logManager.getStatistics();
                res.json({ success: true, data: stats });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // 清空日志
        app.post('/api/logs/clear', (req, res) => {
            try {
                const { proxy = null } = req.body;
                const logManager = this.proxyManager.processManager.getLogManager();

                if (proxy) {
                    logManager.clearProxyLogs(proxy);
                } else {
                    logManager.clearAllLogs();
                }

                res.json({ success: true, message: '日志已清空' });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // 下载镜像设置API
        // 获取当前下载镜像
        app.get('/api/download-mirror', async (req, res) => {
            try {
                const mirror = await this.downloadSettingsManager.getCurrentDownloadMirror();
                res.json(mirror);
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // 更新下载镜像
        app.post('/api/download-mirror', async (req, res) => {
            try {
                const { type } = req.body;
                await this.downloadSettingsManager.updateDownloadMirror(type);
                res.json({ success: true, message: '下载镜像设置已保存' });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
    }

    /**
     * 设置Socket.IO事件
     */
    setupSocketEvents() {
        this.io.on('connection', (socket) => {
            logger.info('客户端已连接');

            socket.on('disconnect', () => {
                logger.info('客户端已断开连接');
            });

            // 发送初始数据
            socket.emit('proxies-update', this.proxyManager.getProxyList());
            socket.emit('stats-update', this.proxyManager.getStatistics());
        });

        // 设置日志推送
        this.setupLogPush();
    }

    /**
     * 设置日志推送
     */
    setupLogPush() {
        const logManager = this.proxyManager.processManager.getLogManager();

        // 监听新日志事件
        logManager.on('newLog', (logEntry) => {
            if (this.io) {
                this.io.emit('xray-log', logEntry);
            }
        });

        // 监听日志清空事件
        logManager.on('logsCleared', (data) => {
            if (this.io) {
                this.io.emit('logs-cleared', data);
            }
        });
    }

    /**
     * 广播更新
     */
    broadcastUpdate() {
        if (this.io) {
            this.io.emit('proxies-update', this.proxyManager.getProxyList());
            this.io.emit('stats-update', this.proxyManager.getStatistics());
        }
    }

    /**
     * 设置应用程序菜单
     */
    setupMenu() {
        const template = [
            {
                label: '文件',
                submenu: [
                    {
                        label: '导入配置',
                        click: () => this.importConfig()
                    },
                    {
                        label: '导出配置',
                        click: () => this.exportConfig()
                    },
                    { type: 'separator' },
                    {
                        label: '退出',
                        accelerator: 'CmdOrCtrl+Q',
                        click: () => {
                            this.cleanup();
                            app.quit();
                        }
                    }
                ]
            },
            {
                label: '编辑',
                submenu: [
                    { role: 'undo', label: '撤销' },
                    { role: 'redo', label: '重做' },
                    { type: 'separator' },
                    { role: 'cut', label: '剪切' },
                    { role: 'copy', label: '复制' },
                    { role: 'paste', label: '粘贴' }
                ]
            },
            {
                label: '视图',
                submenu: [
                    { role: 'reload', label: '重新加载' },
                    { role: 'forceReload', label: '强制重新加载' },
                    { role: 'toggleDevTools', label: '开发者工具' },
                    { type: 'separator' },
                    { role: 'resetZoom', label: '重置缩放' },
                    { role: 'zoomIn', label: '放大' },
                    { role: 'zoomOut', label: '缩小' },
                    { type: 'separator' },
                    { role: 'togglefullscreen', label: '全屏' }
                ]
            },
            {
                label: '帮助',
                submenu: [
                    {
                        label: '关于 EdgeLink',
                        click: () => this.showAbout()
                    }
                ]
            }
        ];

        const menu = Menu.buildFromTemplate(template);
        Menu.setApplicationMenu(menu);
    }

    /**
     * 设置IPC通信
     */
    setupIPC() {
        // 处理应用程序退出
        ipcMain.handle('app-quit', () => {
            this.cleanup();
            app.quit();
        });

        // 处理窗口最小化
        ipcMain.handle('window-minimize', () => {
            if (this.mainWindow) {
                this.mainWindow.minimize();
            }
        });

        // 处理窗口最大化
        ipcMain.handle('window-maximize', () => {
            if (this.mainWindow) {
                if (this.mainWindow.isMaximized()) {
                    this.mainWindow.unmaximize();
                } else {
                    this.mainWindow.maximize();
                }
            }
        });

        // 处理XRay下载请求（改为后台下载，不显示弹窗）
        ipcMain.on('xray-download-required', async (event, { resolve, reject }) => {
            try {
                // 直接开始后台下载，不询问用户
                logger.info('收到XRay下载请求，开始后台下载...');
                this.downloadXRayInBackground();
                resolve({ success: true, message: '开始后台下载XRay-core' });
            } catch (error) {
                reject(error);
            }
        });

        // 处理XRay状态检查
        ipcMain.handle('xray-status', async () => {
            try {
                return this.proxyManager.processManager.getXRayStatus();
            } catch (error) {
                return { error: error.message };
            }
        });

        // 处理XRay更新检查
        ipcMain.handle('xray-check-update', async () => {
            try {
                return await this.proxyManager.processManager.checkXRayUpdates();
            } catch (error) {
                return { error: error.message };
            }
        });

        // 处理XRay更新（改为后台下载）
        ipcMain.handle('xray-update', async () => {
            try {
                this.downloadXRayInBackground();
                return { success: true, message: '开始后台更新XRay-core' };
            } catch (error) {
                throw error;
            }
        });

        // 处理XRay重试下载
        ipcMain.handle('xray-retry-download', async () => {
            try {
                this.downloadXRayInBackground();
                return { success: true, message: '开始重试下载XRay-core' };
            } catch (error) {
                throw error;
            }
        });
    }

    /**
     * 导入配置
     */
    async importConfig() {
        try {
            const result = await dialog.showOpenDialog(this.mainWindow, {
                title: '导入XRay配置文件',
                filters: [
                    { name: 'JSON文件', extensions: ['json'] },
                    { name: '所有文件', extensions: ['*'] }
                ],
                properties: ['openFile']
            });

            if (!result.canceled && result.filePaths.length > 0) {
                const ConfigMigrator = require('./migrate-config');
                const migrator = new ConfigMigrator();
                await migrator.migrateFromConfigJson(result.filePaths[0]);
                
                this.broadcastUpdate();
                
                dialog.showMessageBox(this.mainWindow, {
                    type: 'info',
                    title: '导入成功',
                    message: '配置文件导入成功！'
                });
            }
        } catch (error) {
            dialog.showErrorBox('导入失败', error.message);
        }
    }

    /**
     * 导出配置
     */
    async exportConfig() {
        try {
            const result = await dialog.showSaveDialog(this.mainWindow, {
                title: '导出代理配置',
                defaultPath: 'edgelink-config.json',
                filters: [
                    { name: 'JSON文件', extensions: ['json'] }
                ]
            });

            if (!result.canceled) {
                const proxies = this.proxyManager.getProxyList();
                await fs.writeJson(result.filePath, proxies, { spaces: 2 });
                
                dialog.showMessageBox(this.mainWindow, {
                    type: 'info',
                    title: '导出成功',
                    message: '配置文件导出成功！'
                });
            }
        } catch (error) {
            dialog.showErrorBox('导出失败', error.message);
        }
    }

    /**
     * 显示关于对话框
     */
    showAbout() {
        dialog.showMessageBox(this.mainWindow, {
            type: 'info',
            title: '关于 EdgeLink',
            message: 'EdgeLink',
            detail: 'XRay-core 配置管理和启动器\n版本: 1.0.0\n\n基于 Electron 构建的桌面应用程序'
        });
    }

    /**
     * 创建错误页面
     */
    createErrorPage(error) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>EdgeLink - 错误</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                .error { color: #e74c3c; }
                .retry { margin-top: 20px; }
                button { padding: 10px 20px; font-size: 16px; }
            </style>
        </head>
        <body>
            <h1>EdgeLink</h1>
            <div class="error">
                <h2>应用程序启动失败</h2>
                <p>${error}</p>
            </div>
            <div class="retry">
                <button onclick="location.reload()">重试</button>
            </div>
        </body>
        </html>
        `;
    }

    /**
     * 清理资源
     */
    async cleanup() {
        try {
            // 停止所有代理
            await this.proxyManager.stopAllProxies();

            // 关闭服务器
            if (this.server) {
                this.server.close();
            }

            logger.info('应用程序清理完成');
        } catch (error) {
            logger.error(`清理失败: ${error.message}`);
        }
    }
}

// 创建并启动应用程序
const edgeLinkApp = new EdgeLinkApp();
edgeLinkApp.initialize();
