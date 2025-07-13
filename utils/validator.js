/**
 * 配置验证工具
 * 验证XRay配置的有效性
 */

const logger = require('./logger');

class ConfigValidator {
    /**
     * 验证IP地址格式
     */
    static isValidIP(ip) {
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        return ipRegex.test(ip);
    }

    /**
     * 验证域名格式
     */
    static isValidDomain(domain) {
        const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
        return domainRegex.test(domain);
    }

    /**
     * 验证端口号
     */
    static isValidPort(port) {
        const portNum = parseInt(port);
        return !isNaN(portNum) && portNum >= 1 && portNum <= 65535;
    }

    /**
     * 验证UUID格式
     */
    static isValidUUID(uuid) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        return uuidRegex.test(uuid);
    }

    /**
     * 验证协议类型
     */
    static isValidProtocol(protocol) {
        const validProtocols = ['vless', 'vmess', 'trojan', 'shadowsocks', 'socks', 'http'];
        return validProtocols.includes(protocol.toLowerCase());
    }

    /**
     * 验证网络类型
     */
    static isValidNetwork(network) {
        const validNetworks = ['tcp', 'udp', 'ws', 'h2', 'grpc', 'xhttp'];
        return validNetworks.includes(network.toLowerCase());
    }

    /**
     * 验证安全类型
     */
    static isValidSecurity(security) {
        const validSecurities = ['none', 'tls', 'reality'];
        return validSecurities.includes(security.toLowerCase());
    }

    /**
     * 验证基本代理配置
     */
    static validateProxyConfig(config) {
        const errors = [];

        // 验证远程地址
        if (!config.address) {
            errors.push('远程地址不能为空');
        } else if (!this.isValidIP(config.address) && !this.isValidDomain(config.address)) {
            errors.push('远程地址格式无效');
        }

        // 验证远程端口
        if (!config.port) {
            errors.push('远程端口不能为空');
        } else if (!this.isValidPort(config.port)) {
            errors.push('远程端口无效（1-65535）');
        }

        // 验证本地端口
        if (!config.localPort) {
            errors.push('本地端口不能为空');
        } else if (!this.isValidPort(config.localPort)) {
            errors.push('本地端口无效（1-65535）');
        }

        // 验证协议
        if (!config.protocol) {
            errors.push('协议类型不能为空');
        } else if (!this.isValidProtocol(config.protocol)) {
            errors.push('不支持的协议类型');
        }

        // 验证用户ID（如果是VLESS或VMess）
        if (['vless', 'vmess'].includes(config.protocol) && config.userId) {
            if (!this.isValidUUID(config.userId)) {
                errors.push('用户ID格式无效（需要UUID格式）');
            }
        }

        // 验证网络类型
        if (config.network && !this.isValidNetwork(config.network)) {
            errors.push('不支持的网络类型');
        }

        // 验证安全类型
        if (config.security && !this.isValidSecurity(config.security)) {
            errors.push('不支持的安全类型');
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * 验证完整的XRay配置
     */
    static validateXRayConfig(config) {
        const errors = [];

        try {
            // 验证JSON格式
            if (typeof config !== 'object') {
                errors.push('配置必须是有效的JSON对象');
                return { isValid: false, errors };
            }

            // 验证入站配置
            if (!config.inbounds || !Array.isArray(config.inbounds)) {
                errors.push('入站配置缺失或格式错误');
            } else {
                config.inbounds.forEach((inbound, index) => {
                    if (!inbound.port || !this.isValidPort(inbound.port)) {
                        errors.push(`入站配置 ${index + 1} 端口无效`);
                    }
                    if (!inbound.protocol) {
                        errors.push(`入站配置 ${index + 1} 协议缺失`);
                    }
                });
            }

            // 验证出站配置
            if (!config.outbounds || !Array.isArray(config.outbounds)) {
                errors.push('出站配置缺失或格式错误');
            } else {
                config.outbounds.forEach((outbound, index) => {
                    if (!outbound.protocol) {
                        errors.push(`出站配置 ${index + 1} 协议缺失`);
                    }
                });
            }

        } catch (error) {
            errors.push(`配置解析错误: ${error.message}`);
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }
}

module.exports = ConfigValidator;
