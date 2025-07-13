/**
 * 配置验证器
 * 验证代理配置的有效性
 */

const logger = require('./utils/logger');

class ConfigValidator {
    /**
     * 验证代理配置
     */
    static validateProxyConfig(config) {
        const errors = [];

        try {
            console.log('🔍 ConfigValidator: 开始验证配置');
            console.log('待验证配置:', config);

            // 基本字段验证
            if (!config.name || typeof config.name !== 'string') {
                errors.push('代理名称不能为空');
            }

            if (!config.address || typeof config.address !== 'string') {
                errors.push('服务器地址不能为空');
            }

            if (!config.port || !Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
                errors.push('端口号必须是1-65535之间的整数');
            }

            if (!config.localPort || !Number.isInteger(config.localPort) || config.localPort < 1 || config.localPort > 65535) {
                errors.push('本地端口必须是1-65535之间的整数');
            }

            if (!config.protocol || !['vless', 'vmess', 'trojan'].includes(config.protocol)) {
                errors.push('协议类型必须是 vless、vmess 或 trojan');
            }

            // 协议特定验证
            if (config.protocol === 'vless' || config.protocol === 'vmess') {
                if (!config.userId || typeof config.userId !== 'string') {
                    errors.push('VLESS/VMess 协议需要有效的用户ID (UUID)');
                } else if (!this.isValidUUID(config.userId)) {
                    errors.push('用户ID必须是有效的UUID格式');
                }
            }

            if (config.protocol === 'trojan') {
                if (!config.password || typeof config.password !== 'string') {
                    errors.push('Trojan 协议需要密码');
                }
            }

            // 流设置验证
            if (config.streamSettings) {
                const streamErrors = this.validateStreamSettings(config.streamSettings);
                errors.push(...streamErrors);
            }

            const result = {
                isValid: errors.length === 0,
                errors: errors
            };

            console.log('✅ ConfigValidator: 验证完成');
            console.log('验证结果:', result);

            return result;

        } catch (error) {
            console.error('❌ ConfigValidator: 验证过程出错:', error);
            return {
                isValid: false,
                errors: [`验证过程出错: ${error.message}`]
            };
        }
    }

    /**
     * 验证流设置
     */
    static validateStreamSettings(streamSettings) {
        const errors = [];

        if (streamSettings.network && !['tcp', 'ws', 'h2', 'grpc', 'xhttp'].includes(streamSettings.network)) {
            errors.push('传输协议必须是 tcp、ws、h2、grpc 或 xhttp');
        }

        if (streamSettings.security && !['none', 'tls', 'reality'].includes(streamSettings.security)) {
            errors.push('安全类型必须是 none、tls 或 reality');
        }

        if (streamSettings.security === 'tls' && !streamSettings.serverName) {
            // TLS 可以没有 serverName，使用默认值
        }

        return errors;
    }

    /**
     * 验证UUID格式
     */
    static isValidUUID(uuid) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        return uuidRegex.test(uuid);
    }

    /**
     * 验证IP地址
     */
    static isValidIP(ip) {
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        return ipRegex.test(ip);
    }

    /**
     * 验证域名
     */
    static isValidDomain(domain) {
        const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
        return domainRegex.test(domain);
    }

    /**
     * 验证端口号
     */
    static isValidPort(port) {
        return Number.isInteger(port) && port >= 1 && port <= 65535;
    }

    /**
     * 清理和标准化配置
     */
    static normalizeConfig(config) {
        const normalized = { ...config };

        // 确保端口是数字
        if (normalized.port) {
            normalized.port = parseInt(normalized.port);
        }
        if (normalized.localPort) {
            normalized.localPort = parseInt(normalized.localPort);
        }

        // 清理字符串字段
        if (normalized.name) {
            normalized.name = normalized.name.trim();
        }
        if (normalized.address) {
            normalized.address = normalized.address.trim();
        }
        if (normalized.userId) {
            normalized.userId = normalized.userId.trim();
        }

        return normalized;
    }
}

module.exports = ConfigValidator;
