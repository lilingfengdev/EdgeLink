/**
 * 日志记录工具
 * 提供统一的日志记录功能
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

class Logger {
    constructor() {
        this.logDir = null;
        this.initialized = false;
    }

    /**
     * 初始化日志目录
     */
    initialize() {
        if (this.initialized) return;

        try {
            // 尝试获取路径管理器
            const { getPathManager } = require('./path-manager');
            const pathManager = getPathManager();
            this.logDir = pathManager.get('logs');
        } catch (error) {
            // 如果路径管理器不可用，使用默认路径
            this.logDir = path.join(require('os').homedir(), '.edgelink', 'logs');
        }

        this.ensureLogDir();
        this.initialized = true;
    }

    /**
     * 确保日志目录存在
     */
    ensureLogDir() {
        if (this.logDir && !fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    /**
     * 获取当前时间戳
     */
    getTimestamp() {
        return new Date().toLocaleString('zh-CN');
    }

    /**
     * 写入日志文件
     */
    writeToFile(level, message) {
        if (!this.initialized) {
            this.initialize();
        }

        if (!this.logDir) {
            return; // 无法写入日志文件
        }

        try {
            const timestamp = this.getTimestamp();
            const logEntry = `[${timestamp}] [${level}] ${message}\n`;
            const logFile = path.join(this.logDir, `${new Date().toISOString().split('T')[0]}.log`);

            fs.appendFileSync(logFile, logEntry);
        } catch (error) {
            // 静默处理日志写入错误，避免循环错误
            console.error('日志写入失败:', error.message);
        }
    }

    /**
     * 信息日志
     */
    info(message) {
        console.log(chalk.blue(`[信息] ${message}`));
        this.writeToFile('信息', message);
    }

    /**
     * 成功日志
     */
    success(message) {
        console.log(chalk.green(`[成功] ${message}`));
        this.writeToFile('成功', message);
    }

    /**
     * 警告日志
     */
    warn(message) {
        console.log(chalk.yellow(`[警告] ${message}`));
        this.writeToFile('警告', message);
    }

    /**
     * 错误日志
     */
    error(message) {
        console.log(chalk.red(`[错误] ${message}`));
        this.writeToFile('错误', message);
    }

    /**
     * 调试日志
     */
    debug(message) {
        if (process.env.DEBUG) {
            console.log(chalk.gray(`[调试] ${message}`));
            this.writeToFile('调试', message);
        }
    }
}

module.exports = new Logger();
