/**
 * 路径管理器
 * 处理应用程序的各种路径，确保在asar打包后正常工作
 */

const path = require('path');
const fs = require('fs-extra');
const { app } = require('electron');

class PathManager {
    constructor() {
        this.isPackaged = app ? app.isPackaged : false;
        this.appPath = this.isPackaged ? path.dirname(process.execPath) : __dirname;
        this.userDataPath = app ? app.getPath('userData') : path.join(require('os').homedir(), '.edgelink');
        
        this.initializePaths();
    }

    /**
     * 初始化路径
     */
    initializePaths() {
        // 用户数据目录下的子目录
        this.paths = {
            // 用户数据目录
            userData: this.userDataPath,
            
            // 配置文件目录
            configs: path.join(this.userDataPath, 'configs'),
            
            // 日志目录
            logs: path.join(this.userDataPath, 'logs'),
            
            // 缓存目录
            cache: path.join(this.userDataPath, 'cache'),
            
            // 二进制文件目录
            bin: path.join(this.userDataPath, 'bin'),
            
            // 模板目录
            templates: path.join(this.userDataPath, 'templates'),
            
            // 代理配置文件
            proxies: path.join(this.userDataPath, 'proxies.json'),
            
            // 应用程序目录（只读）
            app: this.appPath,
            
            // 资源目录（只读）
            assets: this.isPackaged 
                ? path.join(process.resourcesPath, 'assets')
                : path.join(__dirname, '..', 'assets'),
                
            // 公共文件目录（只读）
            public: this.isPackaged
                ? path.join(process.resourcesPath, 'public')
                : path.join(__dirname, '..', 'public')
        };
    }

    /**
     * 获取路径
     */
    get(pathName) {
        if (!this.paths[pathName]) {
            throw new Error(`未知的路径名称: ${pathName}`);
        }
        return this.paths[pathName];
    }

    /**
     * 确保目录存在
     */
    async ensureDir(pathName) {
        const dirPath = this.get(pathName);
        await fs.ensureDir(dirPath);
        return dirPath;
    }

    /**
     * 确保所有必要的目录存在
     */
    async ensureAllDirs() {
        const dirsToCreate = ['userData', 'configs', 'logs', 'cache', 'bin', 'templates'];
        
        for (const dirName of dirsToCreate) {
            await this.ensureDir(dirName);
        }
    }

    /**
     * 获取相对于某个基础路径的路径
     */
    join(basePath, ...paths) {
        const base = this.get(basePath);
        return path.join(base, ...paths);
    }

    /**
     * 检查路径是否存在
     */
    async exists(pathName) {
        const fullPath = this.get(pathName);
        return await fs.pathExists(fullPath);
    }

    /**
     * 获取所有路径信息（用于调试）
     */
    getAllPaths() {
        return {
            isPackaged: this.isPackaged,
            appPath: this.appPath,
            userDataPath: this.userDataPath,
            paths: this.paths
        };
    }
}

// 创建单例实例
let pathManagerInstance = null;

/**
 * 获取路径管理器实例
 */
function getPathManager() {
    if (!pathManagerInstance) {
        pathManagerInstance = new PathManager();
    }
    return pathManagerInstance;
}

/**
 * 初始化路径管理器（在主进程中调用）
 */
async function initializePathManager() {
    const pathManager = getPathManager();
    await pathManager.ensureAllDirs();
    return pathManager;
}

module.exports = {
    PathManager,
    getPathManager,
    initializePathManager
};
