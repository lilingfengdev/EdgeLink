/**
 * EdgeLink 前端应用程序
 * 处理用户界面交互和与后端的通信
 */

class EdgeLinkUI {
    constructor() {
        this.socket = null;
        this.proxies = [];
        this.stats = { total: 0, running: 0, stopped: 0 };
        this.activities = [];
        
        this.init();
    }

    /**
     * 初始化应用程序
     */
    init() {
        this.setupEventListeners();
        this.setupSocket();
        this.loadData();
    }

    /**
     * 设置事件监听器
     */
    setupEventListeners() {
        // 标题栏控制
        if (window.electronAPI) {
            document.getElementById('minimize-btn').addEventListener('click', () => {
                window.electronAPI.minimizeWindow();
            });

            document.getElementById('maximize-btn').addEventListener('click', () => {
                window.electronAPI.maximizeWindow();
            });

            document.getElementById('close-btn').addEventListener('click', () => {
                window.electronAPI.closeApp();
            });
        }

        // 导航菜单
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchPage(item.dataset.page);
            });
        });

        // 代理表单
        document.getElementById('proxy-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addProxy();
        });

        // 协议类型变化
        document.getElementById('protocol').addEventListener('change', (e) => {
            this.updateFormFields(e.target.value);
        });

        // 网络类型变化
        document.getElementById('network').addEventListener('change', (e) => {
            this.updateNetworkFields(e.target.value);
        });

        // 安全类型变化
        document.getElementById('security').addEventListener('change', (e) => {
            this.updateSecurityFields(e.target.value);
        });

        // UUID生成
        document.getElementById('generate-uuid').addEventListener('click', () => {
            this.generateUUID();
        });

        // 刷新代理列表
        document.getElementById('refresh-proxies').addEventListener('click', () => {
            this.loadProxies();
        });

        // 停止所有代理
        document.getElementById('stop-all-proxies').addEventListener('click', () => {
            this.stopAllProxies();
        });

        // 模态框关闭
        document.getElementById('modal-close').addEventListener('click', () => {
            this.closeModal();
        });

        // 点击模态框外部关闭
        document.getElementById('edit-modal').addEventListener('click', (e) => {
            if (e.target.id === 'edit-modal') {
                this.closeModal();
            }
        });
    }

    /**
     * 设置Socket.IO连接
     */
    setupSocket() {
        this.socket = io();

        this.socket.on('connect', () => {
            console.log('已连接到服务器');
            this.showNotification('已连接到服务器', 'success');
        });

        this.socket.on('disconnect', () => {
            console.log('与服务器断开连接');
            this.showNotification('与服务器断开连接', 'warning');
        });

        this.socket.on('proxies-update', (proxies) => {
            this.proxies = proxies;
            this.updateProxyList();
            this.updateDashboard();
        });

        this.socket.on('stats-update', (stats) => {
            this.stats = stats;
            this.updateStats();
        });
    }

    /**
     * 加载初始数据
     */
    async loadData() {
        await this.loadProxies();
        await this.loadStats();
    }

    /**
     * 加载代理列表
     */
    async loadProxies() {
        try {
            const response = await fetch('/api/proxies');
            const result = await response.json();
            
            if (result.success) {
                this.proxies = result.data;
                this.updateProxyList();
                this.updateDashboard();
            }
        } catch (error) {
            console.error('加载代理列表失败:', error);
            this.showNotification('加载代理列表失败', 'error');
        }
    }

    /**
     * 加载统计信息
     */
    async loadStats() {
        try {
            const response = await fetch('/api/stats');
            const result = await response.json();
            
            if (result.success) {
                this.stats = result.data;
                this.updateStats();
            }
        } catch (error) {
            console.error('加载统计信息失败:', error);
        }
    }

    /**
     * 切换页面
     */
    switchPage(pageId) {
        // 更新导航状态
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-page="${pageId}"]`).classList.add('active');

        // 显示对应页面
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });
        document.getElementById(`${pageId}-page`).classList.add('active');
    }

    /**
     * 更新表单字段
     */
    updateFormFields(protocol) {
        const userIdGroup = document.getElementById('user-id-group');
        const passwordGroup = document.getElementById('password-group');

        if (protocol === 'vless' || protocol === 'vmess') {
            userIdGroup.style.display = 'block';
            passwordGroup.style.display = 'none';
            document.getElementById('user-id').required = true;
            document.getElementById('password').required = false;
        } else if (protocol === 'trojan') {
            userIdGroup.style.display = 'none';
            passwordGroup.style.display = 'block';
            document.getElementById('user-id').required = false;
            document.getElementById('password').required = true;
        }
    }

    /**
     * 更新网络字段
     */
    updateNetworkFields(network) {
        const pathGroup = document.getElementById('path-group');

        if (network === 'ws' || network === 'h2' || network === 'xhttp') {
            pathGroup.style.display = 'block';
        } else {
            pathGroup.style.display = 'none';
        }
    }

    /**
     * 更新安全字段
     */
    updateSecurityFields(security) {
        const serverNameGroup = document.getElementById('server-name-group');

        if (security === 'tls' || security === 'reality') {
            serverNameGroup.style.display = 'block';
        } else {
            serverNameGroup.style.display = 'none';
        }
    }

    /**
     * 生成UUID
     */
    generateUUID() {
        const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
        
        document.getElementById('user-id').value = uuid;
    }

    /**
     * 添加代理
     */
    async addProxy() {
        try {
            const formData = new FormData(document.getElementById('proxy-form'));
            const config = Object.fromEntries(formData.entries());
            
            // 处理复选框
            config.allowInsecure = document.getElementById('allow-insecure').checked;
            
            // 构建流设置
            if (config.network !== 'tcp' || config.security !== 'none') {
                config.streamSettings = {
                    network: config.network,
                    security: config.security
                };

                if (config.serverName) {
                    config.streamSettings.serverName = config.serverName;
                    config.streamSettings.allowInsecure = config.allowInsecure;
                }

                if (config.path && (config.network === 'ws' || config.network === 'h2' || config.network === 'xhttp')) {
                    config.streamSettings.path = config.path;
                }
            }

            // 清理不需要的字段
            delete config.network;
            delete config.security;
            delete config.serverName;
            delete config.path;
            delete config.allowInsecure;

            const response = await fetch('/api/proxies', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: config.name,
                    config: config
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification('代理添加成功', 'success');
                document.getElementById('proxy-form').reset();
                this.addActivity('add', `添加代理: ${config.name}`);
            } else {
                this.showNotification(result.error, 'error');
            }
        } catch (error) {
            console.error('添加代理失败:', error);
            this.showNotification('添加代理失败', 'error');
        }
    }

    /**
     * 启动代理
     */
    async startProxy(name) {
        try {
            const response = await fetch(`/api/proxies/${name}/start`, {
                method: 'POST'
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification(`代理 "${name}" 启动成功`, 'success');
                this.addActivity('start', `启动代理: ${name}`);
            } else {
                this.showNotification(result.error, 'error');
            }
        } catch (error) {
            console.error('启动代理失败:', error);
            this.showNotification('启动代理失败', 'error');
        }
    }

    /**
     * 停止代理
     */
    async stopProxy(name) {
        try {
            const response = await fetch(`/api/proxies/${name}/stop`, {
                method: 'POST'
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification(`代理 "${name}" 停止成功`, 'success');
                this.addActivity('stop', `停止代理: ${name}`);
            } else {
                this.showNotification(result.error, 'error');
            }
        } catch (error) {
            console.error('停止代理失败:', error);
            this.showNotification('停止代理失败', 'error');
        }
    }

    /**
     * 删除代理
     */
    async deleteProxy(name) {
        if (!confirm(`确定要删除代理 "${name}" 吗？`)) {
            return;
        }

        try {
            const response = await fetch(`/api/proxies/${name}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification(`代理 "${name}" 删除成功`, 'success');
                this.addActivity('delete', `删除代理: ${name}`);
            } else {
                this.showNotification(result.error, 'error');
            }
        } catch (error) {
            console.error('删除代理失败:', error);
            this.showNotification('删除代理失败', 'error');
        }
    }

    /**
     * 停止所有代理
     */
    async stopAllProxies() {
        if (!confirm('确定要停止所有代理吗？')) {
            return;
        }

        const runningProxies = this.proxies.filter(p => p.status === 'running');
        
        for (const proxy of runningProxies) {
            await this.stopProxy(proxy.name);
        }
    }

    /**
     * 更新代理列表
     */
    updateProxyList() {
        const container = document.getElementById('proxy-list');
        
        if (this.proxies.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <h3>暂无代理配置</h3>
                    <p>点击"添加代理"创建您的第一个代理配置</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.proxies.map(proxy => `
            <div class="proxy-item">
                <div class="proxy-info">
                    <div class="proxy-name">${proxy.name}</div>
                    <div class="proxy-details">
                        <span>${proxy.address}:${proxy.port}</span>
                        <span>→ :${proxy.localPort}</span>
                        <span>${proxy.protocol.toUpperCase()}</span>
                        <div class="proxy-status">
                            <span class="status-indicator ${proxy.status === 'running' ? 'status-running' : 'status-stopped'}"></span>
                            ${proxy.status === 'running' ? '运行中' : '已停止'}
                        </div>
                    </div>
                </div>
                <div class="proxy-actions">
                    ${proxy.status === 'running' 
                        ? `<button class="btn btn-warning" onclick="app.stopProxy('${proxy.name}')">
                             <i class="fas fa-stop"></i> 停止
                           </button>`
                        : `<button class="btn btn-success" onclick="app.startProxy('${proxy.name}')">
                             <i class="fas fa-play"></i> 启动
                           </button>`
                    }
                    <button class="btn btn-secondary" onclick="app.editProxy('${proxy.name}')">
                        <i class="fas fa-edit"></i> 编辑
                    </button>
                    <button class="btn btn-danger" onclick="app.deleteProxy('${proxy.name}')">
                        <i class="fas fa-trash"></i> 删除
                    </button>
                </div>
            </div>
        `).join('');
    }

    /**
     * 更新统计信息
     */
    updateStats() {
        document.getElementById('total-proxies').textContent = this.stats.total;
        document.getElementById('running-proxies').textContent = this.stats.running;
        document.getElementById('stopped-proxies').textContent = this.stats.stopped;
    }

    /**
     * 更新仪表板
     */
    updateDashboard() {
        this.updateStats();
        this.updateActivityList();
    }

    /**
     * 更新活动列表
     */
    updateActivityList() {
        const container = document.getElementById('activity-list');
        
        if (this.activities.length === 0) {
            container.innerHTML = '<p>暂无活动记录</p>';
            return;
        }

        container.innerHTML = this.activities.slice(-5).reverse().map(activity => `
            <div class="activity-item">
                <div class="activity-icon ${activity.type}">
                    <i class="fas fa-${this.getActivityIcon(activity.type)}"></i>
                </div>
                <div class="activity-content">
                    <div class="activity-title">${activity.message}</div>
                    <div class="activity-time">${activity.time}</div>
                </div>
            </div>
        `).join('');
    }

    /**
     * 获取活动图标
     */
    getActivityIcon(type) {
        const icons = {
            start: 'play',
            stop: 'stop',
            add: 'plus',
            delete: 'trash',
            edit: 'edit'
        };
        return icons[type] || 'info';
    }

    /**
     * 添加活动记录
     */
    addActivity(type, message) {
        this.activities.push({
            type: type,
            message: message,
            time: new Date().toLocaleString('zh-CN')
        });
        this.updateActivityList();
    }

    /**
     * 编辑代理
     */
    editProxy(name) {
        // TODO: 实现编辑功能
        this.showNotification('编辑功能开发中', 'info');
    }

    /**
     * 关闭模态框
     */
    closeModal() {
        document.getElementById('edit-modal').classList.remove('active');
    }

    /**
     * 显示通知
     */
    showNotification(message, type = 'info') {
        const container = document.getElementById('notifications');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <strong>${this.getNotificationTitle(type)}</strong>
                <p>${message}</p>
            </div>
        `;

        container.appendChild(notification);

        // 自动移除通知
        setTimeout(() => {
            notification.remove();
        }, 5000);

        // 使用系统通知
        if (window.notificationAPI && type === 'success') {
            window.notificationAPI.show('EdgeLink', message);
        }
    }

    /**
     * 获取通知标题
     */
    getNotificationTitle(type) {
        const titles = {
            success: '成功',
            error: '错误',
            warning: '警告',
            info: '信息'
        };
        return titles[type] || '通知';
    }
}

// 初始化应用程序
const app = new EdgeLinkUI();
