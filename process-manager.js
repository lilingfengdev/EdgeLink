/**
 * XRay-core进程管理器
 * 负责启动、停止和管理XRay-core进程
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const logger = require('./utils/logger');

class ProcessManager {
    constructor() {
        this.processes = new Map(); // 存储运行中的进程
        this.xrayPath = this.findXRayExecutable();
    }

    /**
     * 查找XRay可执行文件
     */
    findXRayExecutable() {
        const possiblePaths = [
            './xray',
            './xray.exe',
            'xray',
            'xray.exe',
            path.join(__dirname, 'bin', 'xray'),
            path.join(__dirname, 'bin', 'xray.exe'),
            '/usr/local/bin/xray',
            '/usr/bin/xray'
        ];

        for (const xrayPath of possiblePaths) {
            try {
                if (fs.existsSync(xrayPath)) {
                    logger.info(`找到XRay可执行文件: ${xrayPath}`);
                    return xrayPath;
                }
            } catch (error) {
                // 继续查找
            }
        }

        logger.warn('未找到XRay可执行文件，请确保已安装XRay-core');
        return 'xray'; // 默认使用系统PATH中的xray
    }

    /**
     * 启动XRay进程
     */
    async startProxy(name, configPath) {
        try {
            // 检查配置文件是否存在
            if (!await fs.pathExists(configPath)) {
                throw new Error(`配置文件不存在: ${configPath}`);
            }

            // 检查是否已经运行
            if (this.processes.has(name)) {
                throw new Error(`代理 "${name}" 已经在运行中`);
            }

            logger.info(`正在启动代理: ${name}`);

            // 启动XRay进程
            const xrayProcess = spawn(this.xrayPath, ['-config', configPath], {
                stdio: ['pipe', 'pipe', 'pipe'],
                detached: false
            });

            // 存储进程信息
            this.processes.set(name, {
                process: xrayProcess,
                configPath: configPath,
                startTime: new Date(),
                status: 'starting'
            });

            // 处理进程输出
            xrayProcess.stdout.on('data', (data) => {
                const output = data.toString().trim();
                if (output) {
                    logger.debug(`[${name}] ${output}`);
                }
            });

            xrayProcess.stderr.on('data', (data) => {
                const error = data.toString().trim();
                if (error) {
                    logger.warn(`[${name}] ${error}`);
                }
            });

            // 处理进程退出
            xrayProcess.on('exit', (code, signal) => {
                const processInfo = this.processes.get(name);
                if (processInfo) {
                    processInfo.status = 'stopped';
                    this.processes.delete(name);
                }

                if (code === 0) {
                    logger.info(`代理 "${name}" 正常退出`);
                } else {
                    logger.error(`代理 "${name}" 异常退出，退出码: ${code}, 信号: ${signal}`);
                }
            });

            // 处理进程错误
            xrayProcess.on('error', (error) => {
                logger.error(`代理 "${name}" 启动失败: ${error.message}`);
                this.processes.delete(name);
            });

            // 等待一段时间确认启动成功
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    const processInfo = this.processes.get(name);
                    if (processInfo && !processInfo.process.killed) {
                        processInfo.status = 'running';
                        logger.success(`代理 "${name}" 启动成功`);
                        resolve();
                    } else {
                        reject(new Error('进程启动后立即退出'));
                    }
                }, 2000);

                xrayProcess.on('exit', () => {
                    clearTimeout(timeout);
                    reject(new Error('进程启动失败'));
                });
            });

            return true;

        } catch (error) {
            logger.error(`启动代理失败: ${error.message}`);
            this.processes.delete(name);
            throw error;
        }
    }

    /**
     * 停止XRay进程
     */
    async stopProxy(name) {
        try {
            const processInfo = this.processes.get(name);
            if (!processInfo) {
                throw new Error(`代理 "${name}" 未运行`);
            }

            logger.info(`正在停止代理: ${name}`);

            const { process: xrayProcess } = processInfo;

            // 优雅地终止进程
            xrayProcess.kill('SIGTERM');

            // 等待进程退出
            await new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    // 如果进程没有响应SIGTERM，强制杀死
                    if (!xrayProcess.killed) {
                        logger.warn(`强制终止代理: ${name}`);
                        xrayProcess.kill('SIGKILL');
                    }
                    resolve();
                }, 5000);

                xrayProcess.on('exit', () => {
                    clearTimeout(timeout);
                    resolve();
                });
            });

            this.processes.delete(name);
            logger.success(`代理 "${name}" 已停止`);

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
            const processInfo = this.processes.get(name);
            if (!processInfo) {
                throw new Error(`代理 "${name}" 未运行`);
            }

            const configPath = processInfo.configPath;
            
            await this.stopProxy(name);
            await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒
            await this.startProxy(name, configPath);

            logger.success(`代理 "${name}" 重启成功`);
            return true;

        } catch (error) {
            logger.error(`重启代理失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 获取进程状态
     */
    getProcessStatus(name) {
        const processInfo = this.processes.get(name);
        if (!processInfo) {
            return { status: 'stopped' };
        }

        return {
            status: processInfo.status,
            pid: processInfo.process.pid,
            startTime: processInfo.startTime,
            configPath: processInfo.configPath,
            uptime: Date.now() - processInfo.startTime.getTime()
        };
    }

    /**
     * 获取所有进程状态
     */
    getAllProcessStatus() {
        const statuses = {};
        for (const [name, processInfo] of this.processes) {
            statuses[name] = this.getProcessStatus(name);
        }
        return statuses;
    }

    /**
     * 停止所有进程
     */
    async stopAllProxies() {
        const names = Array.from(this.processes.keys());
        const results = [];

        for (const name of names) {
            try {
                await this.stopProxy(name);
                results.push({ name, success: true });
            } catch (error) {
                results.push({ name, success: false, error: error.message });
            }
        }

        return results;
    }

    /**
     * 检查XRay版本
     */
    async checkXRayVersion() {
        return new Promise((resolve, reject) => {
            exec(`${this.xrayPath} version`, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`无法获取XRay版本: ${error.message}`));
                    return;
                }

                const version = stdout.trim();
                logger.info(`XRay版本: ${version}`);
                resolve(version);
            });
        });
    }
}

module.exports = ProcessManager;
