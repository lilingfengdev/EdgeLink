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
        this.logs = [];
        this.logFilters = {
            proxy: '',
            level: '',
            autoScroll: true
        };

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



        // 简单模式表单提交
        document.getElementById('simple-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.startSimpleProxy();
        });

        // 简单模式停止服务器
        document.getElementById('simple-stop-server').addEventListener('click', () => {
            this.stopSimpleProxy();
        });

        // 复制连接地址
        document.getElementById('copy-address').addEventListener('click', () => {
            this.copyConnectionAddress();
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

        // 日志页面事件
        document.getElementById('clear-logs').addEventListener('click', () => {
            this.clearLogs();
        });

        // XRay重试下载按钮
        document.getElementById('xray-retry-btn').addEventListener('click', () => {
            this.retryXRayDownload();
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

        // 日志相关事件
        this.socket.on('xray-log', (logEntry) => {
            this.addLogEntry(logEntry);
        });

        this.socket.on('logs-cleared', (data) => {
            this.handleLogsCleared(data);
        });

        // XRay状态更新事件
        this.socket.on('xray-status-update', (statusData) => {
            this.updateXRayStatus(statusData);
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

        // 页面特定的加载逻辑
        if (pageId === 'logs') {
            this.loadLogs();
            this.setupLogFilters();
        }
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
    async editProxy(name) {
        try {
            // 获取代理详情
            const response = await fetch(`/api/proxies`);
            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error);
            }

            const proxy = result.data.find(p => p.name === name);
            if (!proxy) {
                throw new Error('代理不存在');
            }

            // 显示编辑模态框
            this.showEditModal(proxy);

        } catch (error) {
            this.showNotification(`获取代理信息失败: ${error.message}`, 'error');
        }
    }

    /**
     * 显示编辑模态框
     */
    showEditModal(proxy) {
        const modal = document.getElementById('edit-modal');
        const modalBody = modal.querySelector('.modal-body');

        // 生成编辑表单HTML
        modalBody.innerHTML = `
            <form id="edit-proxy-form" class="proxy-form">
                <div class="form-section">
                    <h3>基本配置</h3>

                    <div class="form-group">
                        <label for="edit-proxy-name">代理名称</label>
                        <input type="text" id="edit-proxy-name" name="name" value="${proxy.name}" readonly>
                        <small>代理名称不可修改</small>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="edit-remote-address">远程地址</label>
                            <input type="text" id="edit-remote-address" name="address" value="${proxy.address}" required>
                        </div>
                        <div class="form-group">
                            <label for="edit-remote-port">远程端口</label>
                            <input type="number" id="edit-remote-port" name="port" value="${proxy.port}" min="1" max="65535" required>
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="edit-local-port">本地端口</label>
                            <input type="number" id="edit-local-port" name="localPort" value="${proxy.localPort}" min="1" max="65535" required>
                        </div>
                        <div class="form-group">
                            <label for="edit-protocol">协议类型</label>
                            <select id="edit-protocol" name="protocol" required>
                                <option value="vless" ${proxy.protocol === 'vless' ? 'selected' : ''}>VLESS</option>
                                <option value="vmess" ${proxy.protocol === 'vmess' ? 'selected' : ''}>VMess</option>
                                <option value="trojan" ${proxy.protocol === 'trojan' ? 'selected' : ''}>Trojan</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-group" id="edit-user-id-group">
                        <label for="edit-user-id">用户ID (UUID)</label>
                        <div class="input-group">
                            <input type="text" id="edit-user-id" name="userId" value="${proxy.userId || ''}">
                            <button type="button" class="btn btn-secondary" id="edit-generate-uuid">
                                <i class="fas fa-random"></i>
                                生成
                            </button>
                        </div>
                    </div>

                    <div class="form-group" id="edit-password-group" style="display: none;">
                        <label for="edit-password">密码</label>
                        <input type="password" id="edit-password" name="password" value="${proxy.password || ''}">
                    </div>
                </div>

                <div class="form-section">
                    <h3>高级设置</h3>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="edit-network">传输协议</label>
                            <select id="edit-network" name="network">
                                <option value="tcp" ${proxy.network === 'tcp' ? 'selected' : ''}>TCP</option>
                                <option value="ws" ${proxy.network === 'ws' ? 'selected' : ''}>WebSocket</option>
                                <option value="h2" ${proxy.network === 'h2' ? 'selected' : ''}>HTTP/2</option>
                                <option value="grpc" ${proxy.network === 'grpc' ? 'selected' : ''}>gRPC</option>
                                <option value="xhttp" ${proxy.network === 'xhttp' ? 'selected' : ''}>xHTTP</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="edit-security">安全类型</label>
                            <select id="edit-security" name="security">
                                <option value="none" ${proxy.security === 'none' ? 'selected' : ''}>无加密</option>
                                <option value="tls" ${proxy.security === 'tls' ? 'selected' : ''}>TLS</option>
                                <option value="reality" ${proxy.security === 'reality' ? 'selected' : ''}>Reality</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-group" id="edit-server-name-group">
                        <label for="edit-server-name">服务器名称</label>
                        <input type="text" id="edit-server-name" name="serverName" value="${proxy.serverName || ''}">
                    </div>

                    <div class="form-group" id="edit-path-group" style="display: none;">
                        <label for="edit-path">路径</label>
                        <input type="text" id="edit-path" name="path" value="${proxy.path || '/'}">
                    </div>

                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="edit-allow-insecure" name="allowInsecure" ${proxy.allowInsecure ? 'checked' : ''}>
                            允许不安全连接
                        </label>
                    </div>
                </div>

                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">
                        <i class="fas fa-save"></i>
                        保存修改
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="app.closeModal()">
                        <i class="fas fa-times"></i>
                        取消
                    </button>
                </div>
            </form>
        `;

        // 设置表单事件监听器
        this.setupEditFormListeners(proxy);

        // 显示模态框
        modal.classList.add('active');
    }

    /**
     * 关闭模态框
     */
    closeModal() {
        document.getElementById('edit-modal').classList.remove('active');
    }

    /**
     * 设置编辑表单事件监听器
     */
    setupEditFormListeners(proxy) {
        // 表单提交
        document.getElementById('edit-proxy-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.updateProxy(proxy.name);
        });

        // 协议类型变化
        document.getElementById('edit-protocol').addEventListener('change', (e) => {
            this.updateEditFormFields(e.target.value);
        });

        // 网络类型变化
        document.getElementById('edit-network').addEventListener('change', (e) => {
            this.updateEditNetworkFields(e.target.value);
        });

        // 安全类型变化
        document.getElementById('edit-security').addEventListener('change', (e) => {
            this.updateEditSecurityFields(e.target.value);
        });

        // UUID生成
        document.getElementById('edit-generate-uuid').addEventListener('click', () => {
            this.generateEditUUID();
        });

        // 初始化表单字段显示
        this.updateEditFormFields(proxy.protocol);
        this.updateEditNetworkFields(proxy.network);
        this.updateEditSecurityFields(proxy.security);
    }

    /**
     * 更新代理配置
     */
    async updateProxy(name) {
        try {
            const formData = new FormData(document.getElementById('edit-proxy-form'));
            const config = {
                address: formData.get('address'),
                port: parseInt(formData.get('port')),
                localPort: parseInt(formData.get('localPort')),
                protocol: formData.get('protocol'),
                userId: formData.get('userId'),
                password: formData.get('password'),
                network: formData.get('network'),
                security: formData.get('security'),
                serverName: formData.get('serverName'),
                path: formData.get('path'),
                allowInsecure: formData.get('allowInsecure') === 'on'
            };

            const response = await fetch(`/api/proxies/${encodeURIComponent(name)}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ config })
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification(`代理 "${name}" 更新成功`, 'success');
                this.closeModal();
                this.loadProxies(); // 刷新代理列表
            } else {
                throw new Error(result.error);
            }

        } catch (error) {
            this.showNotification(`更新代理失败: ${error.message}`, 'error');
        }
    }

    /**
     * 更新编辑表单字段显示
     */
    updateEditFormFields(protocol) {
        const userIdGroup = document.getElementById('edit-user-id-group');
        const passwordGroup = document.getElementById('edit-password-group');

        if (protocol === 'trojan') {
            userIdGroup.style.display = 'none';
            passwordGroup.style.display = 'block';
        } else {
            userIdGroup.style.display = 'block';
            passwordGroup.style.display = 'none';
        }
    }

    /**
     * 更新编辑表单网络字段
     */
    updateEditNetworkFields(network) {
        const pathGroup = document.getElementById('edit-path-group');

        if (network === 'ws' || network === 'h2') {
            pathGroup.style.display = 'block';
        } else {
            pathGroup.style.display = 'none';
        }
    }

    /**
     * 更新编辑表单安全字段
     */
    updateEditSecurityFields(security) {
        const serverNameGroup = document.getElementById('edit-server-name-group');

        if (security === 'tls' || security === 'reality') {
            serverNameGroup.style.display = 'block';
        } else {
            serverNameGroup.style.display = 'none';
        }
    }

    /**
     * 生成编辑表单UUID
     */
    generateEditUUID() {
        const uuid = this.generateUUID();
        document.getElementById('edit-user-id').value = uuid;
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



    /**
     * 启动简单代理
     */
    async startSimpleProxy() {
        try {
            const formData = new FormData(document.getElementById('simple-form'));
            const config = {
                uuid: formData.get('uuid'),
                remoteAddress: formData.get('remoteAddress'),
                remotePort: parseInt(formData.get('remotePort')),
                serverName: formData.get('serverName'),
                proxyName: formData.get('proxyName')
            };

            // 验证输入
            if (!config.uuid || !config.remoteAddress || !config.remotePort || !config.serverName || !config.proxyName) {
                throw new Error('请填写所有必需字段');
            }

            // 发送请求到后端
            const response = await fetch('/api/simple-proxy/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(config)
            });

            const result = await response.json();

            if (result.success) {
                this.showSimpleProxyRunning(result.data);
                this.showNotification(result.message, 'success');
            } else {
                throw new Error(result.error);
            }

        } catch (error) {
            this.showNotification(`启动失败: ${error.message}`, 'error');
        }
    }

    /**
     * 停止简单代理
     */
    async stopSimpleProxy() {
        try {
            const response = await fetch('/api/simple-proxy/stop', {
                method: 'POST'
            });

            const result = await response.json();

            if (result.success) {
                this.hideSimpleProxyRunning();
                this.showNotification('简单代理已停止', 'success');
            } else {
                throw new Error(result.error);
            }

        } catch (error) {
            this.showNotification(`停止失败: ${error.message}`, 'error');
        }
    }

    /**
     * 显示简单代理运行状态
     */
    showSimpleProxyRunning(data) {
        // 隐藏启动按钮，显示停止按钮
        document.getElementById('simple-form').querySelector('button[type="submit"]').style.display = 'none';
        document.getElementById('simple-stop-server').style.display = 'inline-block';

        // 显示连接信息
        const connectionInfo = document.getElementById('connection-info');
        const addressSpan = document.getElementById('connection-address');
        const statusIndicator = document.getElementById('status-indicator');
        const statusText = document.getElementById('status-text');

        addressSpan.textContent = `localhost:${data.localPort}`;
        statusIndicator.className = 'status-indicator running';
        statusText.textContent = '运行中';

        connectionInfo.style.display = 'block';

        // 禁用表单输入
        const inputs = document.getElementById('simple-form').querySelectorAll('input');
        inputs.forEach(input => input.disabled = true);
    }

    /**
     * 隐藏简单代理运行状态
     */
    hideSimpleProxyRunning() {
        // 显示启动按钮，隐藏停止按钮
        document.getElementById('simple-form').querySelector('button[type="submit"]').style.display = 'inline-block';
        document.getElementById('simple-stop-server').style.display = 'none';

        // 隐藏连接信息
        document.getElementById('connection-info').style.display = 'none';

        // 启用表单输入
        const inputs = document.getElementById('simple-form').querySelectorAll('input');
        inputs.forEach(input => input.disabled = false);
    }

    /**
     * 复制连接地址
     */
    async copyConnectionAddress() {
        try {
            const address = document.getElementById('connection-address').textContent;
            await navigator.clipboard.writeText(address);
            this.showNotification('连接地址已复制到剪贴板', 'success');
        } catch (error) {
            // 降级方案
            const textArea = document.createElement('textarea');
            textArea.value = document.getElementById('connection-address').textContent;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.showNotification('连接地址已复制到剪贴板', 'success');
        }
    }

    /**
     * 加载日志
     */
    async loadLogs() {
        try {
            const response = await fetch('/api/logs/xray?limit=100');
            const result = await response.json();

            if (result.success) {
                this.logs = result.data.logs;
                this.updateLogViewer();
            }
        } catch (error) {
            console.error('加载日志失败:', error);
            this.showNotification('加载日志失败', 'error');
        }
    }

    /**
     * 设置日志过滤器
     */
    setupLogFilters() {
        const logViewer = document.getElementById('log-viewer');

        // 创建过滤器控件
        if (!document.getElementById('log-filters')) {
            const filtersHtml = `
                <div class="log-filters" id="log-filters">
                    <div class="filter-group">
                        <label for="proxy-filter">代理:</label>
                        <select id="proxy-filter">
                            <option value="">全部</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label for="level-filter">级别:</label>
                        <select id="level-filter">
                            <option value="">全部</option>
                            <option value="debug">调试</option>
                            <option value="info">信息</option>
                            <option value="warn">警告</option>
                            <option value="error">错误</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="auto-scroll" checked>
                            自动滚动
                        </label>
                    </div>
                    <div class="filter-group">
                        <button class="btn btn-secondary" id="export-logs">
                            <i class="fas fa-download"></i>
                            导出日志
                        </button>
                    </div>
                </div>
                <div class="log-content" id="log-content"></div>
            `;

            logViewer.innerHTML = filtersHtml;

            // 绑定过滤器事件
            document.getElementById('proxy-filter').addEventListener('change', (e) => {
                this.logFilters.proxy = e.target.value;
                this.filterLogs();
            });

            document.getElementById('level-filter').addEventListener('change', (e) => {
                this.logFilters.level = e.target.value;
                this.filterLogs();
            });

            document.getElementById('auto-scroll').addEventListener('change', (e) => {
                this.logFilters.autoScroll = e.target.checked;
            });

            document.getElementById('export-logs').addEventListener('click', () => {
                this.exportLogs();
            });
        }

        // 更新代理选项
        this.updateProxyFilter();
    }

    /**
     * 更新代理过滤器选项
     */
    updateProxyFilter() {
        const proxyFilter = document.getElementById('proxy-filter');
        if (!proxyFilter) return;

        // 保存当前选择
        const currentValue = proxyFilter.value;

        // 清空选项
        proxyFilter.innerHTML = '<option value="">全部</option>';

        // 添加代理选项
        const proxyNames = [...new Set(this.logs.map(log => log.proxyName))];
        proxyNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            proxyFilter.appendChild(option);
        });

        // 恢复选择
        proxyFilter.value = currentValue;
    }

    /**
     * 过滤日志
     */
    filterLogs() {
        this.updateLogViewer();
    }

    /**
     * 更新日志查看器
     */
    updateLogViewer() {
        const logContent = document.getElementById('log-content');
        if (!logContent) return;

        // 过滤日志
        let filteredLogs = this.logs;

        if (this.logFilters.proxy) {
            filteredLogs = filteredLogs.filter(log => log.proxyName === this.logFilters.proxy);
        }

        if (this.logFilters.level) {
            filteredLogs = filteredLogs.filter(log => log.level === this.logFilters.level);
        }

        // 生成日志HTML
        const logsHtml = filteredLogs.map(log => {
            const timestamp = new Date(log.timestamp).toLocaleString('zh-CN');
            const levelClass = `log-level-${log.level}`;

            return `
                <div class="log-entry ${levelClass}">
                    <div class="log-header">
                        <span class="log-time">${timestamp}</span>
                        <span class="log-proxy">[${log.proxyName}]</span>
                        <span class="log-level">${log.level.toUpperCase()}</span>
                    </div>
                    <div class="log-message">${this.escapeHtml(log.message)}</div>
                </div>
            `;
        }).join('');

        logContent.innerHTML = logsHtml || '<div class="no-logs">暂无日志</div>';

        // 自动滚动到底部
        if (this.logFilters.autoScroll) {
            logContent.scrollTop = logContent.scrollHeight;
        }

        // 更新代理过滤器
        this.updateProxyFilter();
    }

    /**
     * 添加新日志条目
     */
    addLogEntry(logEntry) {
        this.logs.unshift(logEntry);

        // 限制日志数量
        if (this.logs.length > 1000) {
            this.logs = this.logs.slice(0, 1000);
        }

        // 如果当前在日志页面，更新显示
        if (document.getElementById('logs-page').classList.contains('active')) {
            this.updateLogViewer();
        }
    }

    /**
     * 处理日志清空事件
     */
    handleLogsCleared(data) {
        if (data.all) {
            this.logs = [];
        } else if (data.proxyName) {
            this.logs = this.logs.filter(log => log.proxyName !== data.proxyName);
        }

        // 如果当前在日志页面，更新显示
        if (document.getElementById('logs-page').classList.contains('active')) {
            this.updateLogViewer();
        }

        this.showNotification('日志已清空', 'success');
    }

    /**
     * 清空日志
     */
    async clearLogs() {
        try {
            const response = await fetch('/api/logs/clear', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            });

            const result = await response.json();

            if (result.success) {
                this.logs = [];
                this.updateLogViewer();
                this.showNotification('日志已清空', 'success');
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.showNotification(`清空日志失败: ${error.message}`, 'error');
        }
    }

    /**
     * 导出日志
     */
    exportLogs() {
        try {
            const logText = this.logs.map(log => {
                const timestamp = new Date(log.timestamp).toLocaleString('zh-CN');
                return `[${timestamp}] [${log.proxyName}] [${log.level.toUpperCase()}] ${log.message}`;
            }).join('\n');

            const blob = new Blob([logText], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `edgelink-logs-${new Date().toISOString().split('T')[0]}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            URL.revokeObjectURL(url);
            this.showNotification('日志已导出', 'success');
        } catch (error) {
            this.showNotification('导出日志失败', 'error');
        }
    }

    /**
     * HTML转义
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 初始化应用程序
const app = new EdgeLinkUI();

/**
 * 加载下载镜像设置
 */
async function loadDownloadMirrorSettings() {
    try {
        const response = await fetch('/api/download-mirror');
        if (response.ok) {
            const data = await response.json();
            const select = document.getElementById('download-mirror');
            if (select) {
                select.value = data.type || 'github';
            }
        }
    } catch (error) {
        console.error('加载下载镜像设置失败:', error);
    }
}

/**
 * 保存下载镜像设置
 */
async function saveDownloadMirrorSettings() {
    try {
        const select = document.getElementById('download-mirror');
        if (!select) return;

        const response = await fetch('/api/download-mirror', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ type: select.value })
        });

        if (response.ok) {
            app.showNotification('下载镜像设置已保存', 'success');
        } else {
            app.showNotification('保存设置失败', 'error');
        }
    } catch (error) {
        app.showNotification('网络错误: ' + error.message, 'error');
    }
}

/**
 * 更新XRay状态显示
 */
EdgeLinkUI.prototype.updateXRayStatus = function(statusData) {
    const statusCard = document.getElementById('xray-status-card');
    const statusIcon = document.getElementById('xray-status-icon');
    const statusTitle = document.getElementById('xray-status-title');
    const statusMessage = document.getElementById('xray-status-message');
    const statusActions = document.getElementById('xray-status-actions');
    const progressContainer = document.getElementById('xray-progress-container');
    const progressFill = document.getElementById('xray-progress-fill');
    const progressText = document.getElementById('xray-progress-text');

    // 更新图标和状态
    statusIcon.className = 'xray-status-icon ' + statusData.status;
    statusTitle.textContent = this.getXRayStatusTitle(statusData.status);
    statusMessage.textContent = statusData.message;

    // 更新图标内容
    const iconElement = statusIcon.querySelector('i');
    switch (statusData.status) {
        case 'initializing':
            iconElement.className = 'fas fa-cog fa-spin';
            break;
        case 'downloading':
            iconElement.className = 'fas fa-download';
            break;
        case 'ready':
            iconElement.className = 'fas fa-check-circle';
            break;
        case 'download_required':
        case 'download_failed':
            iconElement.className = 'fas fa-exclamation-triangle';
            break;
        default:
            iconElement.className = 'fas fa-cog';
    }

    // 显示/隐藏操作按钮
    if (statusData.status === 'download_required' || statusData.status === 'download_failed') {
        statusActions.style.display = 'flex';
    } else {
        statusActions.style.display = 'none';
    }

    // 显示/隐藏进度条
    if (statusData.status === 'downloading' && statusData.progress !== undefined) {
        progressContainer.style.display = 'block';
        progressFill.style.width = statusData.progress + '%';
        progressText.textContent = Math.round(statusData.progress) + '%';

        if (statusData.details) {
            statusMessage.textContent = statusData.details;
        }
    } else {
        progressContainer.style.display = 'none';
    }
};

/**
 * 获取XRay状态标题
 */
EdgeLinkUI.prototype.getXRayStatusTitle = function(status) {
    switch (status) {
        case 'initializing':
            return '正在初始化XRay-core';
        case 'downloading':
            return '正在下载XRay-core';
        case 'ready':
            return 'XRay-core已就绪';
        case 'download_required':
            return 'XRay-core需要下载';
        case 'download_failed':
            return 'XRay-core下载失败';
        default:
            return 'XRay-core状态未知';
    }
};

/**
 * 重试XRay下载
 */
EdgeLinkUI.prototype.retryXRayDownload = function() {
    if (window.electronAPI) {
        window.electronAPI.retryXRayDownload()
            .then(() => {
                this.showNotification('开始重试下载XRay-core', 'info');
            })
            .catch((error) => {
                this.showNotification('重试下载失败: ' + error.message, 'error');
            });
    } else {
        this.showNotification('重试下载功能仅在桌面应用中可用', 'warning');
    }
};

// 页面加载时加载设置
document.addEventListener('DOMContentLoaded', () => {
    loadDownloadMirrorSettings();

    // 监听下载镜像选择变化
    const mirrorSelect = document.getElementById('download-mirror');
    if (mirrorSelect) {
        mirrorSelect.addEventListener('change', saveDownloadMirrorSettings);
    }
});
