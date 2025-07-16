/**
 * EdgeLink - XRay代理管理器主应用程序
 * 提供中文交互界面管理XRay-core代理配置和进程
 */

const inquirer = require('inquirer');
const chalk = require('chalk');
const logger = require('./utils/logger');
const ProxyManager = require('./proxy-manager');

class EdgeLinkApp {
    constructor() {
        this.proxyManager = new ProxyManager();
        this.running = true;
    }

    /**
     * 启动应用程序
     */
    async start() {
        console.clear();
        this.showBanner();

        try {
            // 初始化XRay（包括自动下载）
            logger.info('正在初始化XRay-core...');
            await this.proxyManager.processManager.initialize();

            // 检查XRay版本
            await this.proxyManager.processManager.checkXRayVersion();

            // 检查更新
            const updateInfo = await this.proxyManager.processManager.checkXRayUpdates();
            if (updateInfo.needsUpdate && updateInfo.reason === 'outdated') {
                logger.info(`发现新版本 ${updateInfo.latestVersion}，当前版本 ${updateInfo.currentVersion}`);

                const { shouldUpdate } = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'shouldUpdate',
                        message: '是否要更新到最新版本？',
                        default: false
                    }
                ]);

                if (shouldUpdate) {
                    await this.updateXRay();
                }
            }

        } catch (error) {
            logger.error(`XRay初始化失败: ${error.message}`);

            // 尝试提示用户手动下载
            try {
                const { tryDownload } = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'tryDownload',
                        message: '是否要尝试自动下载XRay-core？',
                        default: true
                    }
                ]);

                if (tryDownload) {
                    await this.downloadXRay();
                } else {
                    logger.error('无法继续，请手动安装XRay-core');
                    process.exit(1);
                }
            } catch (promptError) {
                logger.error('无法继续，请手动安装XRay-core');
                process.exit(1);
            }
        }

        await this.showMainMenu();
    }

    /**
     * 显示应用程序横幅
     */
    showBanner() {
        console.log(chalk.cyan('╔══════════════════════════════════════╗'));
        console.log(chalk.cyan('║            EdgeLink 代理管理器        ║'));
        console.log(chalk.cyan('║        XRay-core 配置管理和启动器      ║'));
        console.log(chalk.cyan('╚══════════════════════════════════════╝'));
        console.log();
    }

    /**
     * 显示主菜单
     */
    async showMainMenu() {
        while (this.running) {
            try {
                const stats = this.proxyManager.getStatistics();
                console.log(chalk.blue(`\n当前状态: 总计 ${stats.total} 个代理，运行中 ${stats.running} 个，已停止 ${stats.stopped} 个\n`));

                const { action } = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'action',
                        message: '请选择操作:',
                        choices: [
                            { name: '📋 查看代理列表', value: 'list' },
                            { name: '➕ 添加新代理', value: 'add' },
                            { name: '✏️  编辑代理配置', value: 'edit' },
                            { name: '🗑️  删除代理', value: 'delete' },
                            { name: '▶️  启动代理', value: 'start' },
                            { name: '⏹️  停止代理', value: 'stop' },
                            { name: '🔄 重启代理', value: 'restart' },
                            { name: '⏹️  停止所有代理', value: 'stopall' },
                            { name: '📊 查看代理详情', value: 'details' },
                            { name: '🔧 XRay管理', value: 'xray' },
                            { name: '❌ 退出程序', value: 'exit' }
                        ]
                    }
                ]);

                await this.handleAction(action);

            } catch (error) {
                logger.error(`操作失败: ${error.message}`);
                await this.pressAnyKey();
            }
        }
    }

    /**
     * 处理用户选择的操作
     */
    async handleAction(action) {
        switch (action) {
            case 'list':
                await this.showProxyList();
                break;
            case 'add':
                await this.addProxy();
                break;
            case 'edit':
                await this.editProxy();
                break;
            case 'delete':
                await this.deleteProxy();
                break;
            case 'start':
                await this.startProxy();
                break;
            case 'stop':
                await this.stopProxy();
                break;
            case 'restart':
                await this.restartProxy();
                break;
            case 'stopall':
                await this.stopAllProxies();
                break;
            case 'details':
                await this.showProxyDetails();
                break;
            case 'xray':
                await this.showXRayMenu();
                break;
            case 'exit':
                await this.exitApp();
                break;
        }
    }

    /**
     * 显示代理列表
     */
    async showProxyList() {
        const proxies = this.proxyManager.getProxyList();
        
        if (proxies.length === 0) {
            console.log(chalk.yellow('\n暂无代理配置'));
        } else {
            console.log(chalk.green('\n代理列表:'));
            console.log('─'.repeat(80));
            
            proxies.forEach((proxy, index) => {
                const status = proxy.status === 'running' ? 
                    chalk.green('运行中') : chalk.red('已停止');
                const uptime = proxy.uptime ? 
                    `运行时间: ${Math.floor(proxy.uptime / 1000)}秒` : '';
                
                console.log(`${index + 1}. ${chalk.cyan(proxy.name)}`);
                console.log(`   地址: ${proxy.address}:${proxy.port} -> 本地:${proxy.localPort}`);
                console.log(`   协议: ${proxy.protocol} | 状态: ${status} ${uptime}`);
                console.log();
            });
        }
        
        await this.pressAnyKey();
    }

    /**
     * 添加新代理
     */
    async addProxy() {
        console.log(chalk.green('\n添加新代理配置'));
        
        const config = await this.getProxyConfig();
        if (!config) return;

        const { name } = await inquirer.prompt([
            {
                type: 'input',
                name: 'name',
                message: '代理名称:',
                validate: (input) => {
                    if (!input.trim()) return '代理名称不能为空';
                    if (this.proxyManager.proxies.has(input.trim())) {
                        return '代理名称已存在';
                    }
                    return true;
                }
            }
        ]);

        try {
            await this.proxyManager.addProxy(name.trim(), config);
            logger.success(`代理 "${name}" 添加成功！`);
        } catch (error) {
            logger.error(`添加代理失败: ${error.message}`);
        }

        await this.pressAnyKey();
    }

    /**
     * 获取代理配置输入
     */
    async getProxyConfig(existingConfig = {}) {
        try {
            const answers = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'address',
                    message: '远程服务器地址:',
                    default: existingConfig.address,
                    validate: (input) => input.trim() ? true : '服务器地址不能为空'
                },
                {
                    type: 'number',
                    name: 'port',
                    message: '远程端口:',
                    default: existingConfig.port || 443,
                    validate: (input) => {
                        const port = parseInt(input);
                        return (port >= 1 && port <= 65535) ? true : '端口范围: 1-65535';
                    }
                },
                {
                    type: 'number',
                    name: 'localPort',
                    message: '本地监听端口:',
                    default: existingConfig.localPort || 1080,
                    validate: (input) => {
                        const port = parseInt(input);
                        return (port >= 1 && port <= 65535) ? true : '端口范围: 1-65535';
                    }
                },
                {
                    type: 'list',
                    name: 'protocol',
                    message: '协议类型:',
                    choices: [
                        { name: 'VLESS', value: 'vless' },
                        { name: 'VMess', value: 'vmess' },
                        { name: 'Trojan', value: 'trojan' }
                    ],
                    default: existingConfig.protocol || 'vless'
                }
            ]);

            // 根据协议类型获取额外配置
            if (answers.protocol === 'vless' || answers.protocol === 'vmess') {
                const { userId } = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'userId',
                        message: '用户ID (UUID):',
                        default: existingConfig.userId,
                        validate: (input) => {
                            if (!input.trim()) return '用户ID不能为空';
                            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
                            return uuidRegex.test(input) ? true : '请输入有效的UUID格式';
                        }
                    }
                ]);
                answers.userId = userId;
            }

            if (answers.protocol === 'trojan') {
                const { password } = await inquirer.prompt([
                    {
                        type: 'password',
                        name: 'password',
                        message: 'Trojan密码:',
                        validate: (input) => input.trim() ? true : '密码不能为空'
                    }
                ]);
                answers.password = password;
            }

            // 高级设置
            const { advancedSettings } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'advancedSettings',
                    message: '是否配置高级设置?',
                    default: false
                }
            ]);

            if (advancedSettings) {
                const streamSettings = await this.getStreamSettings(existingConfig.streamSettings);
                answers.streamSettings = streamSettings;
            }

            return answers;

        } catch (error) {
            logger.error('配置输入被取消');
            return null;
        }
    }

    /**
     * 获取流设置配置
     */
    async getStreamSettings(existingSettings = {}) {
        const settings = await inquirer.prompt([
            {
                type: 'list',
                name: 'network',
                message: '传输协议:',
                choices: [
                    { name: 'TCP', value: 'tcp' },
                    { name: 'WebSocket', value: 'ws' },
                    { name: 'HTTP/2', value: 'h2' },
                    { name: 'gRPC', value: 'grpc' },
                    { name: 'xHTTP', value: 'xhttp' }
                ],
                default: existingSettings.network || 'tcp'
            },
            {
                type: 'list',
                name: 'security',
                message: '安全类型:',
                choices: [
                    { name: 'TLS (强制)', value: 'tls' }
                ],
                default: 'tls' // 强制使用TLS
            }
        ]);

        // TLS设置
        if (settings.security === 'tls') {
            const tlsSettings = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'serverName',
                    message: 'TLS服务器名称:',
                    default: existingSettings.serverName
                },
                {
                    type: 'confirm',
                    name: 'allowInsecure',
                    message: '允许不安全连接?',
                    default: true // 强制设置为true
                }
            ]);
            
            settings.serverName = tlsSettings.serverName;
            settings.allowInsecure = tlsSettings.allowInsecure;
        }

        // 根据网络类型添加特定设置
        if (settings.network === 'ws') {
            const { path } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'path',
                    message: 'WebSocket路径:',
                    default: existingSettings.path || '/'
                }
            ]);
            settings.path = path;
        }

        if (settings.network === 'xhttp') {
            const xhttpSettings = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'host',
                    message: 'xHTTP主机:',
                    default: existingSettings.host
                },
                {
                    type: 'input',
                    name: 'path',
                    message: 'xHTTP路径:',
                    default: existingSettings.path || '/mcproxy'
                },
                {
                    type: 'list',
                    name: 'mode',
                    message: 'xHTTP模式:',
                    choices: ['auto', 'packet-up', 'stream-up', 'stream-one'],
                    default: existingSettings.mode || 'auto'
                }
            ]);

            Object.assign(settings, xhttpSettings);
        }

        return settings;
    }

    /**
     * 选择代理
     */
    async selectProxy(message = '请选择代理:') {
        const proxies = this.proxyManager.getProxyList();
        
        if (proxies.length === 0) {
            logger.warn('暂无可用的代理配置');
            return null;
        }

        const choices = proxies.map(proxy => ({
            name: `${proxy.name} (${proxy.address}:${proxy.port} -> :${proxy.localPort}) [${proxy.status}]`,
            value: proxy.name
        }));

        const { selectedProxy } = await inquirer.prompt([
            {
                type: 'list',
                name: 'selectedProxy',
                message: message,
                choices: choices
            }
        ]);

        return selectedProxy;
    }

    /**
     * 编辑代理配置
     */
    async editProxy() {
        const proxyName = await this.selectProxy('选择要编辑的代理:');
        if (!proxyName) return;

        const existingConfig = this.proxyManager.getProxyDetails(proxyName);
        console.log(chalk.green(`\n编辑代理: ${proxyName}`));

        const newConfig = await this.getProxyConfig(existingConfig);
        if (!newConfig) return;

        try {
            await this.proxyManager.updateProxy(proxyName, newConfig);
            logger.success(`代理 "${proxyName}" 更新成功！`);
        } catch (error) {
            logger.error(`更新代理失败: ${error.message}`);
        }

        await this.pressAnyKey();
    }

    /**
     * 删除代理
     */
    async deleteProxy() {
        const proxyName = await this.selectProxy('选择要删除的代理:');
        if (!proxyName) return;

        const { confirm } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirm',
                message: `确定要删除代理 "${proxyName}" 吗？此操作不可撤销。`,
                default: false
            }
        ]);

        if (confirm) {
            try {
                await this.proxyManager.deleteProxy(proxyName);
                logger.success(`代理 "${proxyName}" 删除成功！`);
            } catch (error) {
                logger.error(`删除代理失败: ${error.message}`);
            }
        }

        await this.pressAnyKey();
    }

    /**
     * 启动代理
     */
    async startProxy() {
        const proxyName = await this.selectProxy('选择要启动的代理:');
        if (!proxyName) return;

        try {
            await this.proxyManager.startProxy(proxyName);
            logger.success(`代理 "${proxyName}" 启动成功！`);
        } catch (error) {
            logger.error(`启动代理失败: ${error.message}`);
        }

        await this.pressAnyKey();
    }

    /**
     * 停止代理
     */
    async stopProxy() {
        const proxyName = await this.selectProxy('选择要停止的代理:');
        if (!proxyName) return;

        try {
            await this.proxyManager.stopProxy(proxyName);
            logger.success(`代理 "${proxyName}" 停止成功！`);
        } catch (error) {
            logger.error(`停止代理失败: ${error.message}`);
        }

        await this.pressAnyKey();
    }

    /**
     * 重启代理
     */
    async restartProxy() {
        const proxyName = await this.selectProxy('选择要重启的代理:');
        if (!proxyName) return;

        try {
            await this.proxyManager.restartProxy(proxyName);
            logger.success(`代理 "${proxyName}" 重启成功！`);
        } catch (error) {
            logger.error(`重启代理失败: ${error.message}`);
        }

        await this.pressAnyKey();
    }

    /**
     * 停止所有代理
     */
    async stopAllProxies() {
        const { confirm } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirm',
                message: '确定要停止所有运行中的代理吗？',
                default: false
            }
        ]);

        if (confirm) {
            try {
                const results = await this.proxyManager.stopAllProxies();
                const successful = results.filter(r => r.success).length;
                const failed = results.filter(r => !r.success).length;
                
                logger.success(`成功停止 ${successful} 个代理`);
                if (failed > 0) {
                    logger.warn(`${failed} 个代理停止失败`);
                }
            } catch (error) {
                logger.error(`停止所有代理失败: ${error.message}`);
            }
        }

        await this.pressAnyKey();
    }

    /**
     * 显示代理详情
     */
    async showProxyDetails() {
        const proxyName = await this.selectProxy('选择要查看详情的代理:');
        if (!proxyName) return;

        const details = this.proxyManager.getProxyDetails(proxyName);
        if (!details) {
            logger.error('代理不存在');
            return;
        }

        console.log(chalk.green(`\n代理详情: ${proxyName}`));
        console.log('─'.repeat(50));
        console.log(`远程地址: ${details.address}:${details.port}`);
        console.log(`本地端口: ${details.localPort}`);
        console.log(`协议类型: ${details.protocol}`);
        console.log(`创建时间: ${new Date(details.createdAt).toLocaleString('zh-CN')}`);
        
        if (details.lastStarted) {
            console.log(`最后启动: ${new Date(details.lastStarted).toLocaleString('zh-CN')}`);
        }
        
        if (details.processStatus) {
            const status = details.processStatus.status === 'running' ? 
                chalk.green('运行中') : chalk.red('已停止');
            console.log(`当前状态: ${status}`);
            
            if (details.processStatus.pid) {
                console.log(`进程ID: ${details.processStatus.pid}`);
            }
            
            if (details.processStatus.uptime) {
                const uptime = Math.floor(details.processStatus.uptime / 1000);
                console.log(`运行时间: ${uptime} 秒`);
            }
        }

        await this.pressAnyKey();
    }

    /**
     * XRay管理菜单
     */
    async showXRayMenu() {
        const { action } = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: '请选择XRay管理操作:',
                choices: [
                    { name: '📊 查看XRay状态', value: 'status' },
                    { name: '🔍 检查更新', value: 'check_update' },
                    { name: '⬇️  更新XRay', value: 'update' },
                    { name: '🗑️  清理缓存', value: 'clean_cache' },
                    { name: '🔄 重新初始化', value: 'reinit' },
                    { name: '⬅️  返回主菜单', value: 'back' }
                ]
            }
        ]);

        switch (action) {
            case 'status':
                await this.showXRayStatus();
                break;
            case 'check_update':
                await this.checkXRayUpdate();
                break;
            case 'update':
                await this.updateXRay();
                break;
            case 'clean_cache':
                await this.cleanXRayCache();
                break;
            case 'reinit':
                await this.reinitializeXRay();
                break;
            case 'back':
                return;
        }

        if (action !== 'back') {
            await this.showXRayMenu();
        }
    }

    /**
     * 显示XRay状态
     */
    async showXRayStatus() {
        try {
            const status = this.proxyManager.processManager.getXRayStatus();
            const version = await this.proxyManager.processManager.checkXRayVersion();

            console.log(chalk.green('\nXRay状态信息:'));
            console.log('─'.repeat(50));
            console.log(`初始化状态: ${status.initialized ? chalk.green('已初始化') : chalk.red('未初始化')}`);
            console.log(`可执行文件: ${status.path || '未找到'}`);
            console.log(`版本信息: ${version}`);
            console.log(`运行中的代理: ${status.processCount} 个`);

            if (status.runningProcesses.length > 0) {
                console.log(`代理列表: ${status.runningProcesses.join(', ')}`);
            }

        } catch (error) {
            logger.error(`获取XRay状态失败: ${error.message}`);
        }

        await this.pressAnyKey();
    }

    /**
     * 检查XRay更新
     */
    async checkXRayUpdate() {
        try {
            logger.info('正在检查XRay更新...');
            const updateInfo = await this.proxyManager.processManager.checkXRayUpdates();

            if (updateInfo.needsUpdate) {
                console.log(chalk.yellow(`\n发现新版本: ${updateInfo.latestVersion}`));
                if (updateInfo.currentVersion) {
                    console.log(`当前版本: ${updateInfo.currentVersion}`);
                }
                console.log(`更新原因: ${updateInfo.reason === 'outdated' ? '版本过旧' : '未安装'}`);
            } else {
                console.log(chalk.green('\n当前已是最新版本'));
            }

        } catch (error) {
            logger.error(`检查更新失败: ${error.message}`);
        }

        await this.pressAnyKey();
    }

    /**
     * 更新XRay
     */
    async updateXRay() {
        try {
            const { confirm } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'confirm',
                    message: '确定要更新XRay吗？这将停止所有运行中的代理。',
                    default: false
                }
            ]);

            if (!confirm) {
                return;
            }

            logger.info('正在更新XRay...');

            await this.proxyManager.processManager.updateXRay((progress) => {
                if (progress.type === 'download') {
                    process.stdout.write(`\r下载进度: ${progress.progress}%`);
                } else if (progress.type === 'extract') {
                    process.stdout.write('\r正在解压...');
                } else if (progress.type === 'complete') {
                    process.stdout.write('\r更新完成！\n');
                }
            });

            logger.success('XRay更新完成！');

        } catch (error) {
            logger.error(`更新失败: ${error.message}`);
        }

        await this.pressAnyKey();
    }

    /**
     * 下载XRay
     */
    async downloadXRay() {
        try {
            logger.info('正在下载XRay...');

            await this.proxyManager.processManager.xrayDownloader.downloadAndInstall((progress) => {
                if (progress.type === 'download') {
                    process.stdout.write(`\r下载进度: ${progress.progress}%`);
                } else if (progress.type === 'extract') {
                    process.stdout.write('\r正在解压...');
                } else if (progress.type === 'complete') {
                    process.stdout.write('\r下载完成！\n');
                }
            });

            // 重新初始化
            await this.proxyManager.processManager.initialize();
            logger.success('XRay下载并初始化完成！');

        } catch (error) {
            logger.error(`下载失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 清理XRay缓存
     */
    async cleanXRayCache() {
        try {
            const { confirm } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'confirm',
                    message: '确定要清理XRay缓存吗？',
                    default: true
                }
            ]);

            if (confirm) {
                await this.proxyManager.processManager.xrayDownloader.cleanCache();
                logger.success('缓存清理完成！');
            }

        } catch (error) {
            logger.error(`清理缓存失败: ${error.message}`);
        }

        await this.pressAnyKey();
    }

    /**
     * 重新初始化XRay
     */
    async reinitializeXRay() {
        try {
            const { confirm } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'confirm',
                    message: '确定要重新初始化XRay吗？这将停止所有运行中的代理。',
                    default: false
                }
            ]);

            if (!confirm) {
                return;
            }

            // 停止所有代理
            await this.proxyManager.stopAllProxies();

            // 重置初始化状态
            this.proxyManager.processManager.initialized = false;
            this.proxyManager.processManager.xrayPath = null;

            // 重新初始化
            await this.proxyManager.processManager.initialize();
            logger.success('XRay重新初始化完成！');

        } catch (error) {
            logger.error(`重新初始化失败: ${error.message}`);
        }

        await this.pressAnyKey();
    }

    /**
     * 等待用户按键
     */
    async pressAnyKey() {
        await inquirer.prompt([
            {
                type: 'input',
                name: 'continue',
                message: '按回车键继续...'
            }
        ]);
    }

    /**
     * 退出应用程序
     */
    async exitApp() {
        const stats = this.proxyManager.getStatistics();
        
        if (stats.running > 0) {
            const { stopBeforeExit } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'stopBeforeExit',
                    message: `当前有 ${stats.running} 个代理正在运行，是否在退出前停止它们？`,
                    default: true
                }
            ]);

            if (stopBeforeExit) {
                logger.info('正在停止所有代理...');
                await this.proxyManager.stopAllProxies();
            }
        }

        console.log(chalk.cyan('\n感谢使用 EdgeLink 代理管理器！'));
        this.running = false;
        process.exit(0);
    }
}

// 启动应用程序
if (require.main === module) {
    const app = new EdgeLinkApp();
    
    // 处理程序退出
    process.on('SIGINT', async () => {
        console.log('\n\n收到退出信号...');
        await app.exitApp();
    });

    process.on('SIGTERM', async () => {
        console.log('\n\n收到终止信号...');
        await app.exitApp();
    });

    // 启动应用
    app.start().catch((error) => {
        logger.error(`应用程序启动失败: ${error.message}`);
        process.exit(1);
    });
}

module.exports = EdgeLinkApp;
