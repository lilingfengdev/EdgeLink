/**
 * XRay-core 自动下载器
 * 从 GitHub 自动下载最新版本的 XRay-core
 * 支持平台检测、版本管理、缓存和错误恢复
 */

const fs = require('fs-extra');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');
const logger = require('./utils/logger');
const DownloadSettingsManager = require('./download-settings-manager');

class XRayDownloader {
    constructor() {
        try {
            const { getPathManager } = require('./utils/path-manager');
            const pathManager = getPathManager();
            this.binDir = pathManager.get('bin');
            this.cacheDir = pathManager.get('cache');
        } catch (error) {
            // 如果路径管理器不可用，使用默认路径
            this.binDir = path.join(__dirname, 'bin');
            this.cacheDir = path.join(__dirname, 'cache');
        }

        this.githubAPI = 'https://api.github.com/repos/XTLS/Xray-core/releases/latest';
        this.fallbackAPI = 'https://github.com/XTLS/Xray-core/releases/latest';
        this.platform = this.detectPlatform();
        this.architecture = this.detectArchitecture();
        this.maxRetries = 3;
        this.retryDelay = 2000; // 2 seconds
        this.versionFile = path.join(this.binDir, '.version');
        this.settingsManager = new DownloadSettingsManager();
    }

    /**
     * 检测操作系统平台
     */
    detectPlatform() {
        const platform = process.platform;
        switch (platform) {
            case 'win32':
                return 'windows';
            case 'darwin':
                return 'macos';
            case 'linux':
                return 'linux';
            default:
                return 'linux';
        }
    }

    /**
     * 检测系统架构
     */
    detectArchitecture() {
        const arch = process.arch;
        switch (arch) {
            case 'x64':
                return '64';
            case 'x32':
            case 'ia32':
                return '32';
            case 'arm64':
                return 'arm64-v8a';
            case 'arm':
                return 'arm32-v7a';
            default:
                return '64';
        }
    }

    /**
     * 获取下载文件名
     */
    getDownloadFileName() {
        const platform = this.platform;
        const arch = this.architecture;
        
        if (platform === 'windows') {
            return `Xray-${platform}-${arch}.zip`;
        } else {
            return `Xray-${platform}-${arch}.zip`;
        }
    }

    /**
     * 获取可执行文件名
     */
    getExecutableName() {
        return this.platform === 'windows' ? 'xray.exe' : 'xray';
    }

    /**
     * 检查是否已安装 XRay
     */
    async checkXRayInstalled() {
        const executablePath = path.join(this.binDir, this.getExecutableName());

        try {
            if (await fs.pathExists(executablePath)) {
                // 检查文件是否可执行
                await fs.access(executablePath, fs.constants.F_OK | fs.constants.X_OK);

                // 检查必需的数据文件
                const geoipPath = path.join(this.binDir, 'geoip.dat');
                const geositePath = path.join(this.binDir, 'geosite.dat');

                if (!await fs.pathExists(geoipPath) || !await fs.pathExists(geositePath)) {
                    logger.warn('XRay可执行文件存在，但缺少必需的数据文件 (geoip.dat 或 geosite.dat)');
                    return null;
                }

                // 验证版本信息
                const version = await this.getInstalledVersion(executablePath);
                if (version) {
                    logger.info(`找到完整的XRay安装: ${executablePath}, 版本: ${version}`);
                    return executablePath;
                }
            }
        } catch (error) {
            logger.debug(`本地XRay检查失败: ${error.message}`);
        }

        // 检查系统PATH中的xray
        try {
            const result = await this.runCommand('xray', ['version']);
            if (result.success) {
                logger.info('在系统PATH中找到XRay');
                return 'xray';
            }
        } catch (error) {
            logger.debug(`系统PATH中XRay检查失败: ${error.message}`);
        }

        return null;
    }

    /**
     * 获取已安装的XRay版本
     */
    async getInstalledVersion(executablePath) {
        try {
            const result = await this.runCommand(executablePath, ['version']);
            if (result.success && result.stdout) {
                // 解析版本信息
                const versionMatch = result.stdout.match(/Xray\s+(\d+\.\d+\.\d+)/i);
                return versionMatch ? versionMatch[1] : null;
            }
        } catch (error) {
            logger.debug(`获取版本信息失败: ${error.message}`);
        }
        return null;
    }

    /**
     * 检查是否需要更新
     */
    async checkForUpdates() {
        try {
            const currentVersion = await this.getCurrentVersion();
            const latestRelease = await this.getLatestRelease();
            const latestVersion = latestRelease.tag_name.replace(/^v/, '');

            if (!currentVersion) {
                return { needsUpdate: true, reason: 'not_installed', latestVersion };
            }

            if (this.compareVersions(latestVersion, currentVersion) > 0) {
                return { needsUpdate: true, reason: 'outdated', currentVersion, latestVersion };
            }

            return { needsUpdate: false, currentVersion, latestVersion };
        } catch (error) {
            logger.warn(`检查更新失败: ${error.message}`);
            return { needsUpdate: false, error: error.message };
        }
    }

    /**
     * 获取当前安装的版本
     */
    async getCurrentVersion() {
        try {
            if (await fs.pathExists(this.versionFile)) {
                const versionData = await fs.readJson(this.versionFile);
                return versionData.version;
            }
        } catch (error) {
            logger.debug(`读取版本文件失败: ${error.message}`);
        }

        // 尝试从可执行文件获取版本
        const executablePath = path.join(this.binDir, this.getExecutableName());
        return await this.getInstalledVersion(executablePath);
    }

    /**
     * 保存版本信息
     */
    async saveVersionInfo(version, downloadUrl) {
        try {
            await fs.ensureDir(this.binDir);
            await fs.writeJson(this.versionFile, {
                version,
                downloadUrl,
                downloadDate: new Date().toISOString(),
                platform: this.platform,
                architecture: this.architecture
            }, { spaces: 2 });
        } catch (error) {
            logger.warn(`保存版本信息失败: ${error.message}`);
        }
    }

    /**
     * 比较版本号
     */
    compareVersions(version1, version2) {
        const v1Parts = version1.split('.').map(Number);
        const v2Parts = version2.split('.').map(Number);

        for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
            const v1Part = v1Parts[i] || 0;
            const v2Part = v2Parts[i] || 0;

            if (v1Part > v2Part) return 1;
            if (v1Part < v2Part) return -1;
        }

        return 0;
    }

    /**
     * 运行命令
     */
    runCommand(command, args = []) {
        return new Promise((resolve) => {
            const process = spawn(command, args, { stdio: 'pipe' });
            
            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('close', (code) => {
                resolve({
                    success: code === 0,
                    stdout: stdout.trim(),
                    stderr: stderr.trim(),
                    code: code
                });
            });

            process.on('error', (error) => {
                resolve({
                    success: false,
                    error: error.message
                });
            });
        });
    }

    /**
     * 获取最新版本信息（带重试机制）
     */
    async getLatestRelease() {
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                return await this._fetchLatestRelease();
            } catch (error) {
                logger.warn(`获取版本信息失败 (尝试 ${attempt}/${this.maxRetries}): ${error.message}`);

                // 如果是速率限制错误，尝试使用备用方法
                if (error.message.includes('rate limit') || error.message.includes('403')) {
                    logger.info('检测到API速率限制，尝试使用备用方法...');
                    try {
                        return await this._fetchLatestReleaseFromWeb();
                    } catch (fallbackError) {
                        logger.warn(`备用方法也失败: ${fallbackError.message}`);
                    }
                }

                if (attempt === this.maxRetries) {
                    throw new Error(`获取版本信息失败，已重试 ${this.maxRetries} 次: ${error.message}`);
                }

                // 等待后重试
                await this.delay(this.retryDelay * attempt);
            }
        }
    }

    /**
     * 实际获取版本信息的方法（始终使用GitHub官方API）
     */
    async _fetchLatestRelease() {
        const apiUrl = await this.settingsManager.getApiUrl();

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('请求超时'));
            }, 30000); // 30秒超时

            https.get(apiUrl, {
                headers: {
                    'User-Agent': 'EdgeLink-XRay-Downloader',
                    'Accept': 'application/vnd.github.v3+json'
                }
            }, (res) => {
                clearTimeout(timeout);

                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                    return;
                }

                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const release = JSON.parse(data);
                        if (!release.tag_name || !release.assets) {
                            reject(new Error('无效的GitHub API响应格式'));
                            return;
                        }
                        resolve(release);
                    } catch (error) {
                        reject(new Error('解析GitHub API响应失败'));
                    }
                });
            }).on('error', (error) => {
                clearTimeout(timeout);
                reject(new Error(`网络请求失败: ${error.message}`));
            });
        });
    }



    /**
     * 延迟函数
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 查找下载链接（使用配置的下载镜像）
     */
    async findDownloadUrl(release) {
        const fileName = this.getDownloadFileName();
        const asset = release.assets.find(asset => asset.name === fileName);

        if (!asset) {
            throw new Error(`未找到适合的下载文件: ${fileName}`);
        }

        // 获取版本号并使用配置的下载镜像
        const version = release.tag_name.replace(/^v/, '');
        const downloadUrl = await this.settingsManager.getDownloadUrl(version, fileName);

        logger.info(`使用下载镜像: ${downloadUrl}`);
        return downloadUrl;
    }

    /**
     * 下载文件（带重试和校验）
     */
    async downloadFile(url, outputPath, onProgress, expectedHash = null) {
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                await this._downloadFileAttempt(url, outputPath, onProgress);

                // 如果提供了哈希值，进行校验
                if (expectedHash) {
                    const actualHash = await this.calculateFileHash(outputPath);
                    if (actualHash !== expectedHash) {
                        throw new Error(`文件校验失败: 期望 ${expectedHash}, 实际 ${actualHash}`);
                    }
                    logger.info('文件校验通过');
                }

                return; // 下载成功
            } catch (error) {
                logger.warn(`下载失败 (尝试 ${attempt}/${this.maxRetries}): ${error.message}`);

                // 清理失败的文件
                try {
                    await fs.unlink(outputPath);
                } catch (cleanupError) {
                    // 忽略清理错误
                }

                if (attempt === this.maxRetries) {
                    throw new Error(`下载失败，已重试 ${this.maxRetries} 次: ${error.message}`);
                }

                // 等待后重试
                await this.delay(this.retryDelay * attempt);
            }
        }
    }

    /**
     * 单次下载尝试
     */
    _downloadFileAttempt(url, outputPath, onProgress) {
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(outputPath);

            const timeout = setTimeout(() => {
                file.destroy();
                reject(new Error('下载超时'));
            }, 300000); // 5分钟超时

            https.get(url, (response) => {
                clearTimeout(timeout);

                if (response.statusCode === 302 || response.statusCode === 301) {
                    // 处理重定向
                    file.destroy();
                    this._downloadFileAttempt(response.headers.location, outputPath, onProgress)
                        .then(resolve)
                        .catch(reject);
                    return;
                }

                if (response.statusCode !== 200) {
                    file.destroy();
                    reject(new Error(`下载失败: HTTP ${response.statusCode}`));
                    return;
                }

                const totalSize = parseInt(response.headers['content-length'], 10);
                let downloadedSize = 0;

                response.on('data', (chunk) => {
                    downloadedSize += chunk.length;
                    if (onProgress && totalSize) {
                        const progress = (downloadedSize / totalSize * 100).toFixed(1);
                        onProgress(progress, downloadedSize, totalSize);
                    }
                });

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    resolve();
                });

                file.on('error', (error) => {
                    reject(error);
                });
            }).on('error', (error) => {
                clearTimeout(timeout);
                file.destroy();
                reject(error);
            });
        });
    }

    /**
     * 计算文件哈希值
     */
    async calculateFileHash(filePath, algorithm = 'sha256') {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash(algorithm);
            const stream = fs.createReadStream(filePath);

            stream.on('data', (data) => {
                hash.update(data);
            });

            stream.on('end', () => {
                resolve(hash.digest('hex'));
            });

            stream.on('error', reject);
        });
    }

    /**
     * 解压文件
     */
    async extractFile(zipPath, extractDir) {
        const AdmZip = require('adm-zip');
        
        try {
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(extractDir, true);
            
            // 设置可执行权限 (Unix系统)
            if (this.platform !== 'windows') {
                const executablePath = path.join(extractDir, this.getExecutableName());
                if (await fs.pathExists(executablePath)) {
                    await fs.chmod(executablePath, 0o755);
                }
            }
            
            logger.success('XRay解压完成');
        } catch (error) {
            throw new Error(`解压失败: ${error.message}`);
        }
    }

    /**
     * 下载并安装 XRay
     */
    async downloadAndInstall(onProgress, forceUpdate = false) {
        try {
            logger.info('开始下载XRay-core...');

            // 确保目录存在
            await fs.ensureDir(this.binDir);
            await fs.ensureDir(this.cacheDir);

            // 获取最新版本信息
            if (onProgress) {
                onProgress({ type: 'fetch_info', progress: 10 });
            }

            logger.info('获取最新版本信息...');
            const release = await this.getLatestRelease();
            const version = release.tag_name.replace(/^v/, '');
            logger.info(`最新版本: ${version}`);

            // 检查是否需要下载
            if (!forceUpdate) {
                const currentVersion = await this.getCurrentVersion();
                if (currentVersion && this.compareVersions(version, currentVersion) <= 0) {
                    logger.info(`当前版本 ${currentVersion} 已是最新版本`);
                    const executablePath = path.join(this.binDir, this.getExecutableName());
                    if (await fs.pathExists(executablePath)) {
                        return executablePath;
                    }
                }
            }

            // 查找下载链接
            const downloadUrl = await this.findDownloadUrl(release);
            logger.info(`下载链接: ${downloadUrl}`);

            // 检查缓存
            const fileName = this.getDownloadFileName();
            const cacheFilePath = path.join(this.cacheDir, `${version}-${fileName}`);
            let downloadPath = cacheFilePath;

            if (await fs.pathExists(cacheFilePath)) {
                logger.info('使用缓存文件');
                if (onProgress) {
                    onProgress({ type: 'download', progress: 100 });
                }
            } else {
                // 下载文件
                logger.info('开始下载文件...');
                await this.downloadFile(downloadUrl, downloadPath, (progress, downloaded, total) => {
                    if (onProgress) {
                        onProgress({
                            type: 'download',
                            progress: parseFloat(progress),
                            downloaded: downloaded,
                            total: total
                        });
                    }
                    logger.debug(`下载进度: ${progress}%`);
                });
                logger.success('文件下载完成');
            }

            // 解压文件
            if (onProgress) {
                onProgress({ type: 'extract', progress: 0 });
            }

            logger.info('开始解压文件...');
            await this.extractFile(downloadPath, this.binDir);

            // 保存版本信息
            await this.saveVersionInfo(version, downloadUrl);

            // 验证安装
            const executablePath = path.join(this.binDir, this.getExecutableName());
            const geoipPath = path.join(this.binDir, 'geoip.dat');
            const geositePath = path.join(this.binDir, 'geosite.dat');

            if (await fs.pathExists(executablePath)) {
                // 验证必需的数据文件
                if (!await fs.pathExists(geoipPath)) {
                    throw new Error('安装验证失败：geoip.dat 文件不存在');
                }
                if (!await fs.pathExists(geositePath)) {
                    throw new Error('安装验证失败：geosite.dat 文件不存在');
                }

                // 验证可执行文件
                const installedVersion = await this.getInstalledVersion(executablePath);
                if (installedVersion) {
                    logger.success(`XRay完整安装成功: ${executablePath}, 版本: ${installedVersion}`);
                    logger.info(`数据文件: geoip.dat, geosite.dat 已就绪`);

                    if (onProgress) {
                        onProgress({ type: 'complete', progress: 100 });
                    }

                    return executablePath;
                } else {
                    throw new Error('安装验证失败：无法获取版本信息');
                }
            } else {
                throw new Error('安装验证失败：可执行文件不存在');
            }

        } catch (error) {
            logger.error(`XRay下载安装失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 确保XRay可用（自动下载或更新）
     */
    async ensureXRayAvailable(options = {}) {
        const {
            autoDownload = true,
            checkUpdates = false,
            onProgress = null,
            silent = false
        } = options;

        try {
            // 检查现有安装
            const existingPath = await this.checkXRayInstalled();

            if (existingPath && !checkUpdates) {
                if (!silent) {
                    logger.info(`XRay已可用: ${existingPath}`);
                }
                return existingPath;
            }

            // 检查更新
            if (checkUpdates || !existingPath) {
                const updateCheck = await this.checkForUpdates();

                if (updateCheck.needsUpdate) {
                    if (!silent) {
                        if (updateCheck.reason === 'not_installed') {
                            logger.warn('未找到XRay-core，需要下载安装');
                        } else {
                            logger.info(`发现新版本: ${updateCheck.latestVersion} (当前: ${updateCheck.currentVersion})`);
                        }
                    }

                    if (autoDownload) {
                        return await this.downloadAndInstall(onProgress, true);
                    } else {
                        throw new Error('XRay不可用且未启用自动下载');
                    }
                } else if (existingPath) {
                    return existingPath;
                }
            }

            // 如果到这里说明有问题
            throw new Error('无法确保XRay可用性');

        } catch (error) {
            logger.error(`确保XRay可用失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 检查并自动下载（向后兼容，改为自动下载）
     */
    async checkAndPromptDownload() {
        try {
            return await this.ensureXRayAvailable({
                autoDownload: true,  // 改为自动下载
                checkUpdates: true
            });
        } catch (error) {
            // 如果自动检查失败，直接尝试下载
            logger.warn('自动检查失败，尝试直接下载...');
            return await this.downloadAndInstall();
        }
    }

    /**
     * 提示用户下载（改为自动下载，不显示弹窗）
     */
    async promptUserDownload() {
        // 在Electron环境中，直接开始自动下载而不是显示对话框
        if (typeof process !== 'undefined' && process.versions && process.versions.electron) {
            logger.info('自动开始下载XRay-core...');
            return await this.downloadAndInstall();
        }

        // 在命令行环境中，直接询问用户
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve, reject) => {
            rl.question('是否要自动下载XRay-core？(y/n): ', (answer) => {
                rl.close();

                if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                    this.downloadAndInstall((progress) => {
                        if (progress.type === 'download') {
                            process.stdout.write(`\r下载进度: ${progress.progress}%`);
                        } else if (progress.type === 'extract') {
                            process.stdout.write('\r正在解压...');
                        } else if (progress.type === 'complete') {
                            process.stdout.write('\r下载完成！\n');
                        }
                    }).then(resolve).catch(reject);
                } else {
                    reject(new Error('用户取消下载'));
                }
            });
        });
    }

    /**
     * 清理缓存
     */
    async cleanCache(keepLatest = true) {
        try {
            if (!await fs.pathExists(this.cacheDir)) {
                return;
            }

            const files = await fs.readdir(this.cacheDir);
            const cacheFiles = files.filter(file => file.endsWith('.zip'));

            if (keepLatest && cacheFiles.length <= 1) {
                return; // 保留最新的一个文件
            }

            // 按修改时间排序，保留最新的
            const fileStats = await Promise.all(
                cacheFiles.map(async file => {
                    const filePath = path.join(this.cacheDir, file);
                    const stats = await fs.stat(filePath);
                    return { file, path: filePath, mtime: stats.mtime };
                })
            );

            fileStats.sort((a, b) => b.mtime - a.mtime);

            // 删除旧文件
            const filesToDelete = keepLatest ? fileStats.slice(1) : fileStats;

            for (const fileInfo of filesToDelete) {
                await fs.remove(fileInfo.path);
                logger.info(`清理缓存文件: ${fileInfo.file}`);
            }

        } catch (error) {
            logger.warn(`清理缓存失败: ${error.message}`);
        }
    }
}

module.exports = XRayDownloader;
