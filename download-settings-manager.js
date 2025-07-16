/**
 * 下载设置管理器
 * 管理xray下载的镜像配置和相关设置
 */

const fs = require('fs-extra');
const path = require('path');
const logger = require('./utils/logger');

class DownloadSettingsManager {
    constructor() {
        try {
            const { getPathManager } = require('./utils/path-manager');
            const pathManager = getPathManager();
            this.settingsFile = path.join(pathManager.get('userData'), 'download-settings.json');
        } catch (error) {
            this.settingsFile = path.join(__dirname, 'download-settings.json');
        }
        
        this.defaultSettings = {
            // 下载镜像配置 - 只影响文件下载，API始终走官方
            downloadMirror: {
                enabled: false,
                type: 'github' // github, bgithub, ghproxy
            },

            // 下载配置
            download: {
                timeout: 300000, // 5分钟
                retries: 3,
                retryDelay: 2000,
                useCache: true
            },

            // 预定义下载镜像
            mirrors: {
                github: {
                    name: 'GitHub官方',
                    baseUrl: 'https://github.com',
                    description: '官方下载，可能较慢'
                },
                bgithub: {
                    name: 'BGitHub镜像',
                    baseUrl: 'https://bgithub.xyz',
                    description: '国内镜像，下载较快'
                },
                ghproxy: {
                    name: 'GitHub代理',
                    baseUrl: 'https://ghproxy.com/https://github.com',
                    description: '代理下载服务'
                }
            }
        };
        
        this.settings = null;
    }

    /**
     * 加载设置
     */
    async loadSettings() {
        try {
            if (await fs.pathExists(this.settingsFile)) {
                const data = await fs.readJson(this.settingsFile);
                this.settings = { ...this.defaultSettings, ...data };
            } else {
                this.settings = { ...this.defaultSettings };
                await this.saveSettings();
            }
        } catch (error) {
            logger.warn(`加载下载设置失败: ${error.message}`);
            this.settings = { ...this.defaultSettings };
        }
        
        return this.settings;
    }

    /**
     * 保存设置
     */
    async saveSettings() {
        try {
            await fs.ensureDir(path.dirname(this.settingsFile));
            await fs.writeJson(this.settingsFile, this.settings, { spaces: 2 });
            logger.info('下载设置已保存');
        } catch (error) {
            logger.error(`保存下载设置失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 获取当前设置
     */
    async getSettings() {
        if (!this.settings) {
            await this.loadSettings();
        }
        return this.settings;
    }

    /**
     * 更新下载镜像设置
     */
    async updateDownloadMirror(type) {
        if (!this.settings) {
            await this.loadSettings();
        }

        this.settings.downloadMirror = {
            enabled: type !== 'github',
            type: type
        };

        await this.saveSettings();
        logger.info(`下载镜像已更新: ${type}`);
    }

    /**
     * 获取当前下载镜像配置
     */
    async getCurrentDownloadMirror() {
        const settings = await this.getSettings();
        const type = settings.downloadMirror.enabled ? settings.downloadMirror.type : 'github';

        return {
            type: type,
            ...settings.mirrors[type]
        };
    }

    /**
     * 获取下载URL（使用镜像）
     */
    async getDownloadUrl(version, fileName) {
        const mirror = await this.getCurrentDownloadMirror();
        return `${mirror.baseUrl}/XTLS/Xray-core/releases/download/v${version}/${fileName}`;
    }

    /**
     * 获取API URL（始终使用GitHub官方API）
     */
    async getApiUrl() {
        return 'https://api.github.com/repos/XTLS/Xray-core/releases/latest';
    }

    /**
     * 获取可用的镜像列表
     */
    async getAvailableMirrors() {
        const settings = await this.getSettings();
        return Object.keys(settings.mirrors).map(type => ({
            type,
            ...settings.mirrors[type]
        }));
    }

    /**
     * 重置为默认设置
     */
    async resetToDefault() {
        this.settings = { ...this.defaultSettings };
        await this.saveSettings();
        logger.info('下载设置已重置为默认值');
    }
}

module.exports = DownloadSettingsManager;
