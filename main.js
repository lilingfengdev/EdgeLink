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

// 导入后端模块
const ProxyManager = require('./proxy-manager');
const logger = require('./utils/logger');

class EdgeLinkApp {
    constructor() {
        this.mainWindow = null;
        this.server = null;
        this.io = null;
        this.proxyManager = new ProxyManager();
        this.port = 3000;
        
        // 开发模式检测
        this.isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';
    }

    /**
     * 初始化应用程序
     */
    async initialize() {
        // 设置应用程序事件
        app.whenReady().then(() => {
            this.createWindow();
            this.setupMenu();
            this.startBackendServer();
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
     * 创建主窗口
     */
    createWindow() {
        this.mainWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            minWidth: 800,
            minHeight: 600,
            icon: path.join(__dirname, 'assets', 'icon.png'),
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                enableRemoteModule: false,
                preload: path.join(__dirname, 'preload.js')
            },
            titleBarStyle: 'default',
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
            
        } catch (error) {
            logger.error(`加载应用程序失败: ${error.message}`);
            
            // 加载错误页面
            const errorHtml = this.createErrorPage(error.message);
            await this.mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`);
        }
    }

    /**
     * 等待服务器启动
     */
    waitForServer() {
        return new Promise((resolve, reject) => {
            const checkServer = () => {
                const http = require('http');
                const req = http.get(`http://localhost:${this.port}`, (res) => {
                    resolve();
                });
                
                req.on('error', () => {
                    setTimeout(checkServer, 100);
                });
            };
            
            setTimeout(checkServer, 500);
            setTimeout(() => reject(new Error('服务器启动超时')), 10000);
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
