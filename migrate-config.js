/**
 * 配置迁移工具
 * 将现有的 config.json 转换为 EdgeLink 代理配置
 */

const fs = require('fs-extra');
const path = require('path');
const logger = require('./utils/logger');
const ProxyManager = require('./proxy-manager');

class ConfigMigrator {
    constructor() {
        this.proxyManager = new ProxyManager();
    }

    /**
     * 从现有 config.json 迁移配置
     */
    async migrateFromConfigJson(configPath = './config.json') {
        try {
            if (!await fs.pathExists(configPath)) {
                throw new Error(`配置文件不存在: ${configPath}`);
            }

            const config = await fs.readJson(configPath);
            logger.info('正在分析现有配置文件...');

            const proxies = this.extractProxiesFromConfig(config);
            
            if (proxies.length === 0) {
                logger.warn('未在配置文件中找到可迁移的代理配置');
                return;
            }

            logger.info(`找到 ${proxies.length} 个代理配置，开始迁移...`);

            for (const proxy of proxies) {
                try {
                    await this.proxyManager.addProxy(proxy.name, proxy.config);
                    logger.success(`代理 "${proxy.name}" 迁移成功`);
                } catch (error) {
                    logger.error(`代理 "${proxy.name}" 迁移失败: ${error.message}`);
                }
            }

            logger.success('配置迁移完成！');

        } catch (error) {
            logger.error(`配置迁移失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 从 XRay 配置中提取代理信息
     */
    extractProxiesFromConfig(config) {
        const proxies = [];

        if (!config.outbounds || !Array.isArray(config.outbounds)) {
            return proxies;
        }

        config.outbounds.forEach((outbound, index) => {
            try {
                const proxy = this.parseOutbound(outbound, config.inbounds, index);
                if (proxy) {
                    proxies.push(proxy);
                }
            } catch (error) {
                logger.warn(`解析出站配置 ${index} 失败: ${error.message}`);
            }
        });

        return proxies;
    }

    /**
     * 解析出站配置
     */
    parseOutbound(outbound, inbounds, index) {
        const protocol = outbound.protocol;
        
        if (!['vless', 'vmess', 'trojan'].includes(protocol)) {
            return null; // 跳过不支持的协议
        }

        const proxyConfig = {
            protocol: protocol
        };

        // 解析基本配置
        if (protocol === 'vless' || protocol === 'vmess') {
            const vnext = outbound.settings?.vnext?.[0];
            if (!vnext) return null;

            proxyConfig.address = vnext.address;
            proxyConfig.port = vnext.port;
            
            const user = vnext.users?.[0];
            if (user) {
                proxyConfig.userId = user.id;
                if (protocol === 'vmess' && user.security) {
                    proxyConfig.security = user.security;
                }
            }
        } else if (protocol === 'trojan') {
            const server = outbound.settings?.servers?.[0];
            if (!server) return null;

            proxyConfig.address = server.address;
            proxyConfig.port = server.port;
            proxyConfig.password = server.password;
        }

        // 解析流设置
        if (outbound.streamSettings) {
            proxyConfig.streamSettings = this.parseStreamSettings(outbound.streamSettings);
        }

        // 查找对应的入站配置
        const inbound = this.findMatchingInbound(inbounds, outbound);
        if (inbound) {
            proxyConfig.localPort = inbound.port;
            proxyConfig.inboundProtocol = inbound.protocol;
        } else {
            proxyConfig.localPort = 1080; // 默认端口
            proxyConfig.inboundProtocol = 'socks';
        }

        // 生成代理名称
        const name = this.generateProxyName(proxyConfig, index);

        return {
            name: name,
            config: proxyConfig
        };
    }

    /**
     * 解析流设置
     */
    parseStreamSettings(streamSettings) {
        const settings = {
            network: streamSettings.network || 'tcp',
            security: streamSettings.security || 'none'
        };

        // TLS 设置
        if (streamSettings.tlsSettings) {
            settings.serverName = streamSettings.tlsSettings.serverName;
            settings.allowInsecure = streamSettings.tlsSettings.allowInsecure;
            settings.fingerprint = streamSettings.tlsSettings.fingerprint;
            settings.alpn = streamSettings.tlsSettings.alpn;
        }

        // WebSocket 设置
        if (streamSettings.wsSettings) {
            settings.path = streamSettings.wsSettings.path;
            settings.headers = streamSettings.wsSettings.headers;
        }

        // HTTP/2 设置
        if (streamSettings.httpSettings) {
            settings.path = streamSettings.httpSettings.path;
            settings.host = streamSettings.httpSettings.host?.[0];
        }

        // gRPC 设置
        if (streamSettings.grpcSettings) {
            settings.serviceName = streamSettings.grpcSettings.serviceName;
        }

        // xHTTP 设置
        if (streamSettings.xhttpSettings) {
            settings.host = streamSettings.xhttpSettings.host;
            settings.mode = streamSettings.xhttpSettings.mode;
            settings.path = streamSettings.xhttpSettings.path;
            settings.extra = streamSettings.xhttpSettings.extra;
        }

        return settings;
    }

    /**
     * 查找匹配的入站配置
     */
    findMatchingInbound(inbounds, outbound) {
        if (!inbounds || !Array.isArray(inbounds)) {
            return null;
        }

        // 简单匹配：返回第一个非直连的入站配置
        return inbounds.find(inbound => 
            inbound.protocol && 
            ['socks', 'http', 'dokodemo-door'].includes(inbound.protocol)
        );
    }

    /**
     * 生成代理名称
     */
    generateProxyName(config, index) {
        const protocol = config.protocol.toUpperCase();
        const address = config.address;
        const port = config.port;
        
        // 尝试从地址中提取有意义的名称
        let baseName = address;
        if (address.includes('.')) {
            const parts = address.split('.');
            baseName = parts[0];
        }

        return `${protocol}-${baseName}-${port}`;
    }

    /**
     * 备份现有配置
     */
    async backupConfig(configPath) {
        const backupPath = `${configPath}.backup.${Date.now()}`;
        await fs.copy(configPath, backupPath);
        logger.info(`原配置已备份到: ${backupPath}`);
        return backupPath;
    }
}

// 命令行使用
if (require.main === module) {
    const migrator = new ConfigMigrator();
    
    const configPath = process.argv[2] || './config.json';
    
    migrator.migrateFromConfigJson(configPath)
        .then(() => {
            console.log('\n迁移完成！现在可以运行 "node app.js" 启动 EdgeLink');
        })
        .catch((error) => {
            console.error('迁移失败:', error.message);
            process.exit(1);
        });
}

module.exports = ConfigMigrator;
