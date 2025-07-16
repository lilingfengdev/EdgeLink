/**
 * XRay日志管理器
 * 负责收集、存储和管理XRay进程的日志输出
 */

const EventEmitter = require('events');
const logger = require('./logger');

class XRayLogManager extends EventEmitter {
    constructor() {
        super();
        this.logs = new Map(); // 按代理名称存储日志
        this.maxLogsPerProxy = 1000; // 每个代理最大日志条数
        this.maxTotalLogs = 5000; // 总最大日志条数
    }

    /**
     * 添加日志条目
     */
    addLog(proxyName, level, message, source = 'stdout') {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level: this.parseLogLevel(level, message),
            message: message.trim(),
            source,
            proxyName
        };

        // 确保代理的日志数组存在
        if (!this.logs.has(proxyName)) {
            this.logs.set(proxyName, []);
        }

        const proxyLogs = this.logs.get(proxyName);
        proxyLogs.push(logEntry);

        // 限制单个代理的日志数量
        if (proxyLogs.length > this.maxLogsPerProxy) {
            proxyLogs.shift(); // 移除最旧的日志
        }

        // 限制总日志数量
        this.limitTotalLogs();

        // 发出新日志事件
        this.emit('newLog', logEntry);

        // 记录到应用日志（仅错误和警告）
        if (logEntry.level === 'error') {
            logger.error(`[${proxyName}] ${message}`);
        } else if (logEntry.level === 'warn') {
            logger.warn(`[${proxyName}] ${message}`);
        } else if (process.env.DEBUG) {
            logger.debug(`[${proxyName}] ${message}`);
        }
    }

    /**
     * 解析日志级别
     */
    parseLogLevel(level, message) {
        // 如果已经指定了级别，直接使用
        if (level && ['debug', 'info', 'warn', 'error'].includes(level)) {
            return level;
        }

        // 根据消息内容推断级别
        const lowerMessage = message.toLowerCase();
        
        if (lowerMessage.includes('error') || lowerMessage.includes('failed') || lowerMessage.includes('fail')) {
            return 'error';
        } else if (lowerMessage.includes('warn') || lowerMessage.includes('warning')) {
            return 'warn';
        } else if (lowerMessage.includes('debug')) {
            return 'debug';
        } else {
            return 'info';
        }
    }

    /**
     * 限制总日志数量
     */
    limitTotalLogs() {
        let totalLogs = 0;
        for (const proxyLogs of this.logs.values()) {
            totalLogs += proxyLogs.length;
        }

        if (totalLogs > this.maxTotalLogs) {
            // 从最旧的代理开始删除日志
            const sortedProxies = Array.from(this.logs.entries())
                .sort((a, b) => {
                    const aOldest = a[1][0]?.timestamp || '';
                    const bOldest = b[1][0]?.timestamp || '';
                    return aOldest.localeCompare(bOldest);
                });

            for (const [proxyName, proxyLogs] of sortedProxies) {
                if (totalLogs <= this.maxTotalLogs) break;
                
                const removeCount = Math.min(100, proxyLogs.length);
                proxyLogs.splice(0, removeCount);
                totalLogs -= removeCount;

                if (proxyLogs.length === 0) {
                    this.logs.delete(proxyName);
                }
            }
        }
    }

    /**
     * 获取指定代理的日志
     */
    getProxyLogs(proxyName, options = {}) {
        const {
            level = null,
            limit = 100,
            offset = 0,
            startTime = null,
            endTime = null
        } = options;

        const proxyLogs = this.logs.get(proxyName) || [];
        let filteredLogs = [...proxyLogs];

        // 按级别过滤
        if (level) {
            filteredLogs = filteredLogs.filter(log => log.level === level);
        }

        // 按时间范围过滤
        if (startTime) {
            filteredLogs = filteredLogs.filter(log => log.timestamp >= startTime);
        }
        if (endTime) {
            filteredLogs = filteredLogs.filter(log => log.timestamp <= endTime);
        }

        // 排序（最新的在前）
        filteredLogs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

        // 分页
        const total = filteredLogs.length;
        const logs = filteredLogs.slice(offset, offset + limit);

        return {
            logs,
            total,
            hasMore: offset + limit < total
        };
    }

    /**
     * 获取所有日志
     */
    getAllLogs(options = {}) {
        const {
            level = null,
            limit = 100,
            offset = 0,
            proxyName = null
        } = options;

        let allLogs = [];

        // 收集所有日志
        for (const [proxy, logs] of this.logs.entries()) {
            if (proxyName && proxy !== proxyName) continue;
            allLogs.push(...logs);
        }

        // 按级别过滤
        if (level) {
            allLogs = allLogs.filter(log => log.level === level);
        }

        // 排序（最新的在前）
        allLogs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

        // 分页
        const total = allLogs.length;
        const logs = allLogs.slice(offset, offset + limit);

        return {
            logs,
            total,
            hasMore: offset + limit < total
        };
    }

    /**
     * 清空指定代理的日志
     */
    clearProxyLogs(proxyName) {
        if (this.logs.has(proxyName)) {
            this.logs.delete(proxyName);
            this.emit('logsCleared', { proxyName });
        }
    }

    /**
     * 清空所有日志
     */
    clearAllLogs() {
        this.logs.clear();
        this.emit('logsCleared', { all: true });
    }

    /**
     * 获取日志统计信息
     */
    getStatistics() {
        const stats = {
            totalProxies: this.logs.size,
            totalLogs: 0,
            logsByLevel: {
                debug: 0,
                info: 0,
                warn: 0,
                error: 0
            },
            logsByProxy: {}
        };

        for (const [proxyName, logs] of this.logs.entries()) {
            stats.totalLogs += logs.length;
            stats.logsByProxy[proxyName] = {
                total: logs.length,
                byLevel: {
                    debug: 0,
                    info: 0,
                    warn: 0,
                    error: 0
                }
            };

            for (const log of logs) {
                stats.logsByLevel[log.level]++;
                stats.logsByProxy[proxyName].byLevel[log.level]++;
            }
        }

        return stats;
    }

    /**
     * 获取代理列表
     */
    getProxyNames() {
        return Array.from(this.logs.keys());
    }
}

module.exports = XRayLogManager;
