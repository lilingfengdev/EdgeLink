/**
 * XRay-core 自动下载器
 * 从 GitHub 自动下载最新版本的 XRay-core
 */

const fs = require('fs-extra');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');
const logger = require('./utils/logger');

class XRayDownloader {
    constructor() {
        this.binDir = path.join(__dirname, 'bin');
        this.githubAPI = 'https://api.github.com/repos/XTLS/Xray-core/releases/latest';
        this.platform = this.detectPlatform();
        this.architecture = this.detectArchitecture();
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
                logger.info(`找到XRay可执行文件: ${executablePath}`);
                return executablePath;
            }
        } catch (error) {
            // 文件不存在或不可执行
        }

        // 检查系统PATH中的xray
        try {
            const result = await this.runCommand('xray', ['version']);
            if (result.success) {
                logger.info('在系统PATH中找到XRay');
                return 'xray';
            }
        } catch (error) {
            // 系统中没有xray
        }

        return null;
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
     * 获取最新版本信息
     */
    async getLatestRelease() {
        return new Promise((resolve, reject) => {
            https.get(this.githubAPI, {
                headers: {
                    'User-Agent': 'EdgeLink-XRay-Downloader'
                }
            }, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const release = JSON.parse(data);
                        resolve(release);
                    } catch (error) {
                        reject(new Error('解析GitHub API响应失败'));
                    }
                });
            }).on('error', (error) => {
                reject(new Error(`获取版本信息失败: ${error.message}`));
            });
        });
    }

    /**
     * 查找下载链接
     */
    findDownloadUrl(release) {
        const fileName = this.getDownloadFileName();
        const asset = release.assets.find(asset => asset.name === fileName);
        
        if (!asset) {
            throw new Error(`未找到适合的下载文件: ${fileName}`);
        }

        return asset.browser_download_url;
    }

    /**
     * 下载文件
     */
    async downloadFile(url, outputPath, onProgress) {
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(outputPath);
            
            https.get(url, (response) => {
                if (response.statusCode !== 200) {
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
                    fs.unlink(outputPath);
                    reject(error);
                });
            }).on('error', (error) => {
                reject(error);
            });
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
    async downloadAndInstall(onProgress) {
        try {
            logger.info('开始下载XRay-core...');

            // 确保bin目录存在
            await fs.ensureDir(this.binDir);

            // 获取最新版本信息
            logger.info('获取最新版本信息...');
            const release = await this.getLatestRelease();
            logger.info(`最新版本: ${release.tag_name}`);

            // 查找下载链接
            const downloadUrl = this.findDownloadUrl(release);
            logger.info(`下载链接: ${downloadUrl}`);

            // 下载文件
            const fileName = this.getDownloadFileName();
            const downloadPath = path.join(this.binDir, fileName);
            
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

            // 解压文件
            if (onProgress) {
                onProgress({ type: 'extract', progress: 0 });
            }
            
            logger.info('开始解压文件...');
            await this.extractFile(downloadPath, this.binDir);

            // 清理下载的压缩文件
            await fs.remove(downloadPath);

            // 验证安装
            const executablePath = path.join(this.binDir, this.getExecutableName());
            if (await fs.pathExists(executablePath)) {
                logger.success(`XRay安装成功: ${executablePath}`);
                
                if (onProgress) {
                    onProgress({ type: 'complete', progress: 100 });
                }
                
                return executablePath;
            } else {
                throw new Error('安装验证失败：可执行文件不存在');
            }

        } catch (error) {
            logger.error(`XRay下载安装失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 检查并提示下载
     */
    async checkAndPromptDownload() {
        const existingPath = await this.checkXRayInstalled();
        
        if (existingPath) {
            return existingPath;
        }

        logger.warn('未找到XRay-core，需要下载安装');
        
        // 在Electron环境中，通过IPC通知主进程显示下载对话框
        if (typeof process !== 'undefined' && process.versions && process.versions.electron) {
            const { ipcMain } = require('electron');
            return new Promise((resolve, reject) => {
                ipcMain.emit('xray-download-required', { resolve, reject });
            });
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
}

module.exports = XRayDownloader;
