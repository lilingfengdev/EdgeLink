/**
 * 代理管理器
 * 负责管理多个代理配置和实例
 */

const fs = require('fs-extra');
const path = require('path');
const logger = require('./utils/logger');
const ConfigManager = require('./config-manager');
const ProcessManager = require('./process-manager');
const ConfigValidator = require('./utils/validator');

class ProxyManager {
    constructor() {
        const { getPathManager } = require('./utils/path-manager');
        const pathManager = getPathManager();

        this.configManager = new ConfigManager();
        this.processManager = new ProcessManager();
        this.proxiesFile = pathManager.get('proxies');
        this.proxies = new Map(); // 存储代理配置
        this.loadProxies();
    }

    /**
     * 加载代理配置
     */
    async loadProxies() {
        try {
            if (await fs.pathExists(this.proxiesFile)) {
                const data = await fs.readJson(this.proxiesFile);
                for (const [name, config] of Object.entries(data)) {
                    this.proxies.set(name, config);
                }
                logger.info(`已加载 ${this.proxies.size} 个代理配置`);
            }
        } catch (error) {
            logger.error(`加载代理配置失败: ${error.message}`);
        }
    }

    /**
     * 保存代理配置
     */
    async saveProxies() {
        try {
            const data = Object.fromEntries(this.proxies);
            await fs.writeJson(this.proxiesFile, data, { spaces: 2 });
            logger.info('代理配置已保存');
        } catch (error) {
            logger.error(`保存代理配置失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 添加新的代理配置
     */
    async addProxy(name, config) {
        try {
            // 验证配置
            const validation = ConfigValidator.validateProxyConfig(config);
            if (!validation.isValid) {
                throw new Error(`配置验证失败: ${validation.errors.join(', ')}`);
            }

            // 检查名称是否已存在
            if (this.proxies.has(name)) {
                throw new Error(`代理名称 "${name}" 已存在`);
            }

            // 生成XRay配置
            const xrayConfig = this.configManager.generateConfig(config);

            // 保存XRay配置文件
            const configPath = await this.configManager.saveConfig(name, xrayConfig);

            // 保存代理信息
            const proxyInfo = {
                ...config,
                configPath: configPath,
                createdAt: new Date().toISOString(),
                status: 'stopped'
            };

            this.proxies.set(name, proxyInfo);
            await this.saveProxies();

            logger.success(`代理 "${name}" 添加成功`);
            return proxyInfo;

        } catch (error) {
            logger.error(`添加代理失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 更新代理配置
     */
    async updateProxy(name, config) {
        try {
            if (!this.proxies.has(name)) {
                throw new Error(`代理 "${name}" 不存在`);
            }

            // 验证配置
            const validation = ConfigValidator.validateProxyConfig(config);
            if (!validation.isValid) {
                throw new Error(`配置验证失败: ${validation.errors.join(', ')}`);
            }

            // 如果代理正在运行，先停止
            const processStatus = this.processManager.getProcessStatus(name);
            const wasRunning = processStatus.status === 'running';

            if (wasRunning) {
                await this.stopProxy(name);
            }

            // 生成新的XRay配置
            const xrayConfig = this.configManager.generateConfig(config);

            // 保存XRay配置文件
            const configPath = await this.configManager.saveConfig(name, xrayConfig);

            // 更新代理信息
            const existingProxy = this.proxies.get(name);
            const proxyInfo = {
                ...config,
                configPath: configPath,
                createdAt: existingProxy.createdAt,
                updatedAt: new Date().toISOString(),
                status: 'stopped'
            };

            this.proxies.set(name, proxyInfo);
            await this.saveProxies();

            // 如果之前在运行，重新启动
            if (wasRunning) {
                await this.startProxy(name);
            }

            logger.success(`代理 "${name}" 更新成功`);
            return proxyInfo;

        } catch (error) {
            logger.error(`更新代理失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 删除代理
     */
    async deleteProxy(name) {
        try {
            if (!this.proxies.has(name)) {
                throw new Error(`代理 "${name}" 不存在`);
            }

            // 如果代理正在运行，先停止
            const processStatus = this.processManager.getProcessStatus(name);
            if (processStatus.status === 'running') {
                await this.stopProxy(name);
            }

            // 删除配置文件
            await this.configManager.deleteConfig(name);

            // 删除代理信息
            this.proxies.delete(name);
            await this.saveProxies();

            logger.success(`代理 "${name}" 删除成功`);

        } catch (error) {
            logger.error(`删除代理失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 启动代理
     */
    async startProxy(name) {
        try {
            if (!this.proxies.has(name)) {
                throw new Error(`代理 "${name}" 不存在`);
            }

            const proxyInfo = this.proxies.get(name);
            await this.processManager.startProxy(name, proxyInfo.configPath);

            // 更新状态
            proxyInfo.status = 'running';
            proxyInfo.lastStarted = new Date().toISOString();
            this.proxies.set(name, proxyInfo);
            await this.saveProxies();

            return true;

        } catch (error) {
            logger.error(`启动代理失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 停止代理
     */
    async stopProxy(name) {
        try {
            if (!this.proxies.has(name)) {
                throw new Error(`代理 "${name}" 不存在`);
            }

            await this.processManager.stopProxy(name);

            // 更新状态
            const proxyInfo = this.proxies.get(name);
            proxyInfo.status = 'stopped';
            proxyInfo.lastStopped = new Date().toISOString();
            this.proxies.set(name, proxyInfo);
            await this.saveProxies();

            return true;

        } catch (error) {
            logger.error(`停止代理失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 重启代理
     */
    async restartProxy(name) {
        try {
            await this.processManager.restartProxy(name);

            // 更新状态
            const proxyInfo = this.proxies.get(name);
            proxyInfo.status = 'running';
            proxyInfo.lastStarted = new Date().toISOString();
            this.proxies.set(name, proxyInfo);
            await this.saveProxies();

            return true;

        } catch (error) {
            logger.error(`重启代理失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 获取代理列表
     */
    getProxyList() {
        const proxies = [];
        for (const [name, config] of this.proxies) {
            const processStatus = this.processManager.getProcessStatus(name);
            proxies.push({
                name: name,
                address: config.address,
                port: config.port,
                localPort: config.localPort,
                protocol: config.protocol,
                status: processStatus.status,
                createdAt: config.createdAt,
                lastStarted: config.lastStarted,
                uptime: processStatus.uptime
            });
        }
        return proxies;
    }

    /**
     * 获取代理详细信息
     */
    getProxyDetails(name) {
        if (!this.proxies.has(name)) {
            return null;
        }

        const config = this.proxies.get(name);
        const processStatus = this.processManager.getProcessStatus(name);

        return {
            ...config,
            processStatus: processStatus
        };
    }

    /**
     * 停止所有代理
     */
    async stopAllProxies() {
        const results = await this.processManager.stopAllProxies();
        
        // 更新所有代理状态
        for (const [name, proxyInfo] of this.proxies) {
            proxyInfo.status = 'stopped';
            proxyInfo.lastStopped = new Date().toISOString();
        }
        await this.saveProxies();

        return results;
    }

    /**
     * 获取统计信息
     */
    getStatistics() {
        const total = this.proxies.size;
        const running = this.getProxyList().filter(p => p.status === 'running').length;
        const stopped = total - running;

        return {
            total: total,
            running: running,
            stopped: stopped
        };
    }
}

module.exports = ProxyManager;
