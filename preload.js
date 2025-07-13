/**
 * EdgeLink Electron 预加载脚本
 * 在渲染进程中提供安全的API接口
 */

const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的API到渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
    // 窗口控制
    minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
    maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
    closeApp: () => ipcRenderer.invoke('app-quit'),
    
    // 平台信息
    platform: process.platform,
    
    // 版本信息
    versions: {
        node: process.versions.node,
        chrome: process.versions.chrome,
        electron: process.versions.electron
    }
});

// 暴露通知API
contextBridge.exposeInMainWorld('notificationAPI', {
    show: (title, body, options = {}) => {
        if (Notification.permission === 'granted') {
            return new Notification(title, { body, ...options });
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    return new Notification(title, { body, ...options });
                }
            });
        }
    }
});

// 在页面加载完成后设置
window.addEventListener('DOMContentLoaded', () => {
    // 请求通知权限
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
});
