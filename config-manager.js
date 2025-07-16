/**
 * XRay配置管理器
 * 负责生成、保存和管理XRay配置文件
 */

const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('./utils/logger');
const ConfigValidator = require('./utils/validator');
const { getPathManager } = require('./utils/path-manager');

class ConfigManager {
    constructor() {
        const pathManager = getPathManager();
        this.configsDir = pathManager.get('configs');
        this.templatesDir = pathManager.get('templates');
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

        // TLS设置 - 强制使用TLS安全协议
        if (streamConfig.security === "tls" || !streamConfig.security) {
            settings.security = "tls"; // 强制使用TLS
            settings.tlsSettings = {
                serverName: streamConfig.serverName || streamConfig.address,
                allowInsecure: true // 强制设置为true
            };

            if (streamConfig.fingerprint) {
                settings.tlsSettings.fingerprint = streamConfig.fingerprint;
            }

            if (streamConfig.alpn) {
                settings.tlsSettings.alpn = streamConfig.alpn;
            }
        }

        // 移除REALITY支持 - 用户要求security必须是TLS

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
                path: streamConfig.path || "/mcproxy"
            };

            // 构建完整的extra配置
            const extra = {
                headers: streamConfig.headers || {},
                xPaddingBytes: streamConfig.xPaddingBytes || "100-1000",
                noGRPCHeader: streamConfig.noGRPCHeader || false,
                noSSEHeader: streamConfig.noSSEHeader || false,
                // 根据用户要求和参考配置修正的参数
                scMaxEachPostBytes: streamConfig.scMaxEachPostBytes || 1000000, // 1MB固定值
                scMinPostsIntervalMs: streamConfig.scMinPostsIntervalMs || "0-100", // 范围值
                scMaxBufferedPosts: streamConfig.scMaxBufferedPosts || 30,
                scStreamUpServerSecs: streamConfig.scStreamUpServerSecs || "20-80"
            };

            // XMUX配置 - 根据官方文档完善
            if (streamConfig.enableXMUX !== false) {
                extra.xmux = {
                    maxConcurrency: streamConfig.maxConcurrency || "16-32",
                    maxConnections: streamConfig.maxConnections || 0,
                    cMaxReuseTimes: streamConfig.cMaxReuseTimes || 0,
                    hMaxRequestTimes: streamConfig.hMaxRequestTimes || "600-900",
                    hMaxReusableSecs: streamConfig.hMaxReusableSecs || "1800-3000",
                    hKeepAlivePeriod: streamConfig.hKeepAlivePeriod || 0
                };
            }

            // 上下行分离配置
            if (streamConfig.downloadSettings) {
                extra.downloadSettings = streamConfig.downloadSettings;
            }

            // 合并用户自定义的extra配置
            if (streamConfig.extra) {
                Object.assign(extra, streamConfig.extra);
            }

            settings.xhttpSettings.extra = extra;
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
            protocol: "dokodemo-door", // 强制使用dokodemo-door
            tag: config.tag || "proxy-in"
        };

        // dokodemo-door设置 - 必须使用此协议
        inbound.settings = {
            address: config.address, // 使用远程服务器地址
            port: parseInt(config.port), // 使用远程服务器端口
            network: "tcp"
        };

        return inbound;
    }

    /**
     * 生成完整的XRay配置
     */
    generateConfig(proxyConfig) {
        const config = this.createBaseConfig();

        // 确保使用正确的默认配置
        if (!proxyConfig.streamSettings) {
            proxyConfig.streamSettings = {};
        }

        // 强制设置必需的配置
        proxyConfig.streamSettings.network = "xhttp";
        proxyConfig.streamSettings.security = "tls";
        proxyConfig.streamSettings.mode = "auto";
        proxyConfig.streamSettings.path = "/mcproxy";

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
