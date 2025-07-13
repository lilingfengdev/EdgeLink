/**
 * 日志记录工具
 * 提供统一的日志记录功能
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

class Logger {
    constructor() {
        this.logDir = path.join(__dirname, '..', 'logs');
        this.ensureLogDir();
    }

    /**
     * 确保日志目录存在
     */
    ensureLogDir() {
        if (!fs.existsSync(this.logDir)) {
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
        const timestamp = this.getTimestamp();
        const logEntry = `[${timestamp}] [${level}] ${message}\n`;
        const logFile = path.join(this.logDir, `${new Date().toISOString().split('T')[0]}.log`);
        
        fs.appendFileSync(logFile, logEntry);
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
