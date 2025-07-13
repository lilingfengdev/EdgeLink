/**
 * EdgeLink 打包脚本
 * 自动化构建和打包流程
 */

const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

class BuildManager {
    constructor() {
        this.projectRoot = __dirname;
        this.distDir = path.join(this.projectRoot, 'dist');
    }

    /**
     * 执行命令并显示输出
     */
    exec(command, options = {}) {
        console.log(`🔧 执行: ${command}`);
        try {
            const result = execSync(command, {
                stdio: 'inherit',
                cwd: this.projectRoot,
                ...options
            });
            return result;
        } catch (error) {
            console.error(`❌ 命令执行失败: ${command}`);
            throw error;
        }
    }

    /**
     * 检查环境
     */
    async checkEnvironment() {
        console.log('🔍 检查构建环境...');
        
        // 检查Node.js版本
        try {
            const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
            console.log(`✅ Node.js 版本: ${nodeVersion}`);
        } catch (error) {
            throw new Error('Node.js 未安装或不可用');
        }

        // 检查npm
        try {
            const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
            console.log(`✅ npm 版本: ${npmVersion}`);
        } catch (error) {
            throw new Error('npm 未安装或不可用');
        }

        // 检查依赖
        if (!fs.existsSync(path.join(this.projectRoot, 'node_modules'))) {
            console.log('📦 安装依赖包...');
            this.exec('npm install');
        } else {
            console.log('✅ 依赖包已安装');
        }
    }

    /**
     * 清理构建目录
     */
    async clean() {
        console.log('🧹 清理构建目录...');
        if (fs.existsSync(this.distDir)) {
            await fs.remove(this.distDir);
            console.log('✅ 构建目录已清理');
        }
    }

    /**
     * 创建图标
     */
    async createIcons() {
        console.log('🎨 创建应用图标...');
        
        try {
            this.exec('node create-icon.js');
            console.log('✅ SVG图标已创建');
            
            // 检查是否有现成的图标文件
            const iconFiles = ['icon.png', 'icon.ico', 'icon.icns'];
            const assetsDir = path.join(this.projectRoot, 'assets');
            
            for (const iconFile of iconFiles) {
                const iconPath = path.join(assetsDir, iconFile);
                if (fs.existsSync(iconPath)) {
                    console.log(`✅ 找到图标文件: ${iconFile}`);
                } else {
                    console.log(`⚠️  缺少图标文件: ${iconFile}`);
                }
            }
        } catch (error) {
            console.log('⚠️  图标创建失败，将使用默认图标');
        }
    }

    /**
     * 构建应用程序
     */
    async build(platform = 'current') {
        console.log(`🏗️  开始构建应用程序 (${platform})...`);
        
        const buildCommands = {
            'current': 'npm run build',
            'win': 'npm run build:win',
            'mac': 'npm run build:mac',
            'linux': 'npm run build:linux',
            'all': 'npm run build -- --win --mac --linux'
        };

        const command = buildCommands[platform] || buildCommands['current'];
        
        try {
            this.exec(command);
            console.log('✅ 应用程序构建完成');
        } catch (error) {
            console.error('❌ 构建失败');
            throw error;
        }
    }

    /**
     * 显示构建结果
     */
    async showResults() {
        console.log('\n📊 构建结果:');
        console.log('='.repeat(50));
        
        if (fs.existsSync(this.distDir)) {
            const files = await fs.readdir(this.distDir);
            
            if (files.length === 0) {
                console.log('❌ 构建目录为空');
                return;
            }

            for (const file of files) {
                const filePath = path.join(this.distDir, file);
                const stats = await fs.stat(filePath);
                
                if (stats.isFile()) {
                    const size = (stats.size / 1024 / 1024).toFixed(2);
                    console.log(`📦 ${file} (${size} MB)`);
                } else if (stats.isDirectory()) {
                    console.log(`📁 ${file}/`);
                }
            }
            
            console.log('\n✅ 构建文件位置:', this.distDir);
        } else {
            console.log('❌ 构建目录不存在');
        }
    }

    /**
     * 完整构建流程
     */
    async fullBuild(platform = 'current') {
        const startTime = Date.now();
        
        try {
            console.log('🚀 EdgeLink 构建开始...\n');
            
            await this.checkEnvironment();
            await this.clean();
            await this.createIcons();
            await this.build(platform);
            await this.showResults();
            
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`\n🎉 构建完成! 耗时: ${duration}秒`);
            
        } catch (error) {
            console.error('\n❌ 构建失败:', error.message);
            process.exit(1);
        }
    }
}

// 命令行使用
if (require.main === module) {
    const platform = process.argv[2] || 'current';
    const validPlatforms = ['current', 'win', 'mac', 'linux', 'all'];
    
    if (!validPlatforms.includes(platform)) {
        console.error('❌ 无效的平台参数');
        console.log('使用方法: node build.js [platform]');
        console.log('支持的平台:', validPlatforms.join(', '));
        process.exit(1);
    }
    
    const builder = new BuildManager();
    builder.fullBuild(platform);
}

module.exports = BuildManager;
