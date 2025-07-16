/**
 * EdgeLink Web服务器 - 独立启动脚本
 * 用于测试网页界面的配置生成功能
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

// 导入后端模块
const ProxyManager = require('./proxy-manager');
const logger = require('./utils/logger');

class EdgeLinkWebServer {
    constructor() {
        this.server = null;
        this.io = null;
        this.proxyManager = new ProxyManager();
        this.port = 3000;
    }

    /**
     * 启动Web服务器
     */
    async start() {
        try {
            console.log('🚀 启动EdgeLink Web服务器...');
            
            // 初始化XRay
            try {
                await this.proxyManager.processManager.initialize();
                console.log('✅ XRay初始化成功');
            } catch (error) {
                console.log('⚠️ XRay初始化失败，但Web服务器将继续启动');
                console.log(`   错误: ${error.message}`);
            }

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
                console.log(`🌐 Web服务器已启动: http://localhost:${this.port}`);
                console.log('📱 请在浏览器中打开上述地址来测试网页界面');
                console.log('🔧 测试配置生成功能...');
            });

        } catch (error) {
            console.error(`❌ 启动Web服务器失败: ${error.message}`);
            process.exit(1);
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

        // 简单代理启动
        app.post('/api/simple-proxy/start', async (req, res) => {
            try {
                const { uuid, remoteAddress, remotePort, serverName, proxyName } = req.body;

                console.log('🚀 启动简单代理:', JSON.stringify(req.body, null, 2));

                // 构建代理配置
                const proxyConfig = {
                    name: proxyName,
                    protocol: 'vless',
                    address: remoteAddress,
                    port: remotePort,
                    userId: uuid,
                    localPort: 1080, // 默认本地端口
                    streamSettings: {
                        network: 'xhttp',
                        security: 'tls',
                        serverName: serverName,
                        path: '/mcproxy',
                        mode: 'auto'
                    }
                };

                // 使用配置管理器生成配置
                const ConfigManager = require('./config-manager');
                const configManager = new ConfigManager();
                const generatedConfig = configManager.generateConfig(proxyConfig);

                console.log('✅ 生成的配置:', JSON.stringify(generatedConfig, null, 2));

                // 添加代理到管理器
                await this.proxyManager.addProxy(proxyName, proxyConfig);

                // 启动代理
                await this.proxyManager.startProxy(proxyName);

                res.json({
                    success: true,
                    data: {
                        name: proxyName,
                        localPort: 1080,
                        config: generatedConfig
                    },
                    message: '简单代理启动成功'
                });

                this.broadcastUpdate();

            } catch (error) {
                console.error('❌ 简单代理启动失败:', error.message);
                res.status(400).json({ success: false, error: error.message });
            }
        });

        // 简单代理停止
        app.post('/api/simple-proxy/stop', async (req, res) => {
            try {
                // 停止当前运行的简单代理
                const proxies = this.proxyManager.getProxyList();
                const runningProxy = proxies.find(p => p.status === 'running');

                if (runningProxy) {
                    await this.proxyManager.stopProxy(runningProxy.name);
                    console.log('🛑 简单代理已停止:', runningProxy.name);
                }

                res.json({
                    success: true,
                    message: '简单代理已停止'
                });

                this.broadcastUpdate();

            } catch (error) {
                console.error('❌ 简单代理停止失败:', error.message);
                res.status(400).json({ success: false, error: error.message });
            }
        });

        // 测试配置生成
        app.post('/api/test-config', (req, res) => {
            try {
                const config = req.body;
                console.log('🧪 测试配置生成:', JSON.stringify(config, null, 2));

                // 使用配置管理器生成配置
                const ConfigManager = require('./config-manager');
                const configManager = new ConfigManager();
                const generatedConfig = configManager.generateConfig(config);

                console.log('✅ 生成的配置:', JSON.stringify(generatedConfig, null, 2));

                res.json({
                    success: true,
                    data: generatedConfig,
                    message: '配置生成成功'
                });
            } catch (error) {
                console.error('❌ 配置生成失败:', error.message);
                res.status(400).json({ success: false, error: error.message });
            }
        });
    }

    /**
     * 设置Socket.IO事件
     */
    setupSocketEvents() {
        this.io.on('connection', (socket) => {
            console.log('👤 客户端已连接');

            socket.on('disconnect', () => {
                console.log('👋 客户端已断开连接');
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
     * 停止服务器
     */
    stop() {
        if (this.server) {
            this.server.close();
            console.log('🛑 Web服务器已停止');
        }
    }
}

// 启动Web服务器
if (require.main === module) {
    const webServer = new EdgeLinkWebServer();
    
    // 处理程序退出
    process.on('SIGINT', () => {
        console.log('\n🛑 收到退出信号，正在停止服务器...');
        webServer.stop();
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        console.log('\n🛑 收到终止信号，正在停止服务器...');
        webServer.stop();
        process.exit(0);
    });

    // 启动服务器
    webServer.start().catch((error) => {
        console.error(`❌ 启动失败: ${error.message}`);
        process.exit(1);
    });
}

module.exports = EdgeLinkWebServer;
