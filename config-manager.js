/**
 * XRay配置管理器
 * 负责生成、保存和管理XRay配置文件
 */

const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('./utils/logger');
const ConfigValidator = require('./utils/validator');

class ConfigManager {
    constructor() {
        this.configsDir = path.join(__dirname, 'configs');
        this.templatesDir = path.join(__dirname, 'templates');
        this.ensureDirectories();
    }

    /**
     * 确保必要的目录存在
     */
    async ensureDirectories() {
        await fs.ensureDir(this.configsDir);
        await fs.ensureDir(this.templatesDir);
    }

    /**
     * 生成UUID
     */
    generateUUID() {
        return uuidv4();
    }

    /**
     * 创建基础配置模板
     */
    createBaseConfig() {
        return {
            log: {
                loglevel: "info"
            },
            inbounds: [],
            outbounds: []
        };
    }

    /**
     * 创建VLESS出站配置
     */
    createVLESSOutbound(config) {
        const outbound = {
            protocol: "vless",
            settings: {
                vnext: [{
                    address: config.address,
                    port: parseInt(config.port),
                    users: [{
                        id: config.userId || this.generateUUID(),
                        encryption: "none"
                    }]
                }]
            }
        };

        // 添加流设置
        if (config.streamSettings) {
            outbound.streamSettings = this.createStreamSettings(config.streamSettings);
        }

        return outbound;
    }

    /**
     * 创建VMess出站配置
     */
    createVMessOutbound(config) {
        const outbound = {
            protocol: "vmess",
            settings: {
                vnext: [{
                    address: config.address,
                    port: parseInt(config.port),
                    users: [{
                        id: config.userId || this.generateUUID(),
                        security: config.security || "auto"
                    }]
                }]
            }
        };

        if (config.streamSettings) {
            outbound.streamSettings = this.createStreamSettings(config.streamSettings);
        }

        return outbound;
    }

    /**
     * 创建Trojan出站配置
     */
    createTrojanOutbound(config) {
        const outbound = {
            protocol: "trojan",
            settings: {
                servers: [{
                    address: config.address,
                    port: parseInt(config.port),
                    password: config.password
                }]
            }
        };

        if (config.streamSettings) {
            outbound.streamSettings = this.createStreamSettings(config.streamSettings);
        }

        return outbound;
    }

    /**
     * 创建流设置
     */
    createStreamSettings(streamConfig) {
        const settings = {
            network: streamConfig.network || "tcp"
        };

        // TLS设置
        if (streamConfig.security === "tls") {
            settings.security = "tls";
            settings.tlsSettings = {
                serverName: streamConfig.serverName || streamConfig.address,
                allowInsecure: streamConfig.allowInsecure || false
            };

            if (streamConfig.fingerprint) {
                settings.tlsSettings.fingerprint = streamConfig.fingerprint;
            }

            if (streamConfig.alpn) {
                settings.tlsSettings.alpn = streamConfig.alpn;
            }
        }

        // WebSocket设置
        if (streamConfig.network === "ws") {
            settings.wsSettings = {
                path: streamConfig.path || "/",
                headers: streamConfig.headers || {}
            };
        }

        // HTTP/2设置
        if (streamConfig.network === "h2") {
            settings.httpSettings = {
                path: streamConfig.path || "/",
                host: streamConfig.host ? [streamConfig.host] : []
            };
        }

        // gRPC设置
        if (streamConfig.network === "grpc") {
            settings.grpcSettings = {
                serviceName: streamConfig.serviceName || ""
            };
        }

        // xHTTP设置
        if (streamConfig.network === "xhttp") {
            settings.xhttpSettings = {
                host: streamConfig.host,
                mode: streamConfig.mode || "auto",
                path: streamConfig.path || "/"
            };

            if (streamConfig.extra) {
                settings.xhttpSettings.extra = streamConfig.extra;
            }
        }

        return settings;
    }

    /**
     * 创建入站配置
     */
    createInbound(config) {
        const inbound = {
            listen: config.listen || "127.0.0.1",
            port: parseInt(config.localPort),
            protocol: config.inboundProtocol || "socks",
            tag: config.tag || "proxy-in"
        };

        // SOCKS设置
        if (inbound.protocol === "socks") {
            inbound.settings = {
                auth: "noauth",
                udp: config.udpEnabled || false
            };
        }

        // HTTP设置
        if (inbound.protocol === "http") {
            inbound.settings = {};
        }

        // dokodemo-door设置
        if (inbound.protocol === "dokodemo-door") {
            inbound.settings = {
                address: config.targetAddress,
                port: parseInt(config.targetPort),
                network: config.network || "tcp"
            };
        }

        return inbound;
    }

    /**
     * 生成完整的XRay配置
     */
    generateConfig(proxyConfig) {
        const config = this.createBaseConfig();

        // 添加入站配置
        const inbound = this.createInbound(proxyConfig);
        config.inbounds.push(inbound);

        // 添加出站配置
        let outbound;
        switch (proxyConfig.protocol.toLowerCase()) {
            case 'vless':
                outbound = this.createVLESSOutbound(proxyConfig);
                break;
            case 'vmess':
                outbound = this.createVMessOutbound(proxyConfig);
                break;
            case 'trojan':
                outbound = this.createTrojanOutbound(proxyConfig);
                break;
            default:
                throw new Error(`不支持的协议类型: ${proxyConfig.protocol}`);
        }

        config.outbounds.push(outbound);

        return config;
    }

    /**
     * 保存配置文件
     */
    async saveConfig(name, config) {
        try {
            // 验证配置
            const validation = ConfigValidator.validateXRayConfig(config);
            if (!validation.isValid) {
                throw new Error(`配置验证失败: ${validation.errors.join(', ')}`);
            }

            const configPath = path.join(this.configsDir, `${name}.json`);
            await fs.writeJson(configPath, config, { spaces: 2 });
            
            logger.success(`配置文件已保存: ${configPath}`);
            return configPath;
        } catch (error) {
            logger.error(`保存配置文件失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 加载配置文件
     */
    async loadConfig(name) {
        try {
            const configPath = path.join(this.configsDir, `${name}.json`);
            const config = await fs.readJson(configPath);
            
            logger.info(`配置文件已加载: ${configPath}`);
            return config;
        } catch (error) {
            logger.error(`加载配置文件失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 列出所有配置文件
     */
    async listConfigs() {
        try {
            const files = await fs.readdir(this.configsDir);
            const configs = files
                .filter(file => file.endsWith('.json'))
                .map(file => path.basename(file, '.json'));
            
            return configs;
        } catch (error) {
            logger.error(`列出配置文件失败: ${error.message}`);
            return [];
        }
    }

    /**
     * 删除配置文件
     */
    async deleteConfig(name) {
        try {
            const configPath = path.join(this.configsDir, `${name}.json`);
            await fs.remove(configPath);
            
            logger.success(`配置文件已删除: ${name}`);
        } catch (error) {
            logger.error(`删除配置文件失败: ${error.message}`);
            throw error;
        }
    }
}

module.exports = ConfigManager;
