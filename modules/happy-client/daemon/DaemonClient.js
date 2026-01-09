/**
 * Happy Daemon 客户端
 * 
 * 封装与 Happy Daemon 的 HTTP API 交互
 * 
 * 功能：
 * - 检查 daemon 运行状态
 * - 启动/停止 daemon
 * - 创建/管理 session
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');

class DaemonClient {
    constructor(options = {}) {
        this.options = {
            happyHomeDir: options.happyHomeDir || process.env.HAPPY_HOME_DIR || path.join(os.homedir(), '.happy'),
            httpTimeout: options.httpTimeout || 15000,
            daemonStartTimeout: options.daemonStartTimeout || 10000,
            ...options
        };
        
        this.stateFilePath = path.join(this.options.happyHomeDir, 'daemon.state.json');
    }

    /**
     * 获取 daemon 状态文件内容
     * @returns {Object|null} 状态对象或 null
     */
    getDaemonState() {
        try {
            if (!fs.existsSync(this.stateFilePath)) {
                return null;
            }
            const content = fs.readFileSync(this.stateFilePath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            return null;
        }
    }

    /**
     * 检查进程是否在运行
     * @param {number} pid - 进程 ID
     * @returns {boolean}
     */
    isProcessRunning(pid) {
        try {
            process.kill(pid, 0);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * 检查 daemon 是否在运行
     * @returns {boolean}
     */
    isDaemonRunning() {
        const state = this.getDaemonState();
        if (!state || !state.pid) {
            return false;
        }
        return this.isProcessRunning(state.pid);
    }

    /**
     * 获取 daemon HTTP 端口
     * @returns {number|null} HTTP 端口或 null
     */
    getHttpPort() {
        const state = this.getDaemonState();
        return state?.httpPort || null;
    }

    /**
     * 获取 daemon 基础 URL
     * @returns {string|null}
     */
    getBaseUrl() {
        const port = this.getHttpPort();
        if (!port) return null;
        return `http://127.0.0.1:${port}`;
    }

    /**
     * 发送 HTTP 请求到 daemon
     * @param {string} endpoint - API 端点
     * @param {Object} body - 请求体
     * @returns {Promise<Object>} 响应数据
     */
    async request(endpoint, body = {}) {
        const baseUrl = this.getBaseUrl();
        if (!baseUrl) {
            throw new Error('Daemon 未运行或无法获取端口');
        }

        const url = `${baseUrl}${endpoint}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.options.httpTimeout);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error(`请求超时: ${endpoint}`);
            }
            throw error;
        }
    }

    /**
     * 启动 daemon
     * @returns {Promise<boolean>} 是否成功启动
     */
    async startDaemon() {
        if (this.isDaemonRunning()) {
            console.log('[DaemonClient] Daemon 已在运行');
            return true;
        }

        console.log('[DaemonClient] 启动 Happy Daemon...');

        return new Promise((resolve, reject) => {
            const isWindows = process.platform === 'win32';
            
            // 使用 spawn 启动 daemon（后台运行）
            const daemonProcess = spawn('happy', ['daemon', 'start'], {
                detached: true,
                stdio: 'ignore',
                shell: isWindows,
                windowsHide: true
            });

            daemonProcess.unref();

            // 等待 daemon 启动
            const startTime = Date.now();
            const checkInterval = setInterval(() => {
                if (this.isDaemonRunning()) {
                    clearInterval(checkInterval);
                    console.log('[DaemonClient] Daemon 启动成功');
                    resolve(true);
                } else if (Date.now() - startTime > this.options.daemonStartTimeout) {
                    clearInterval(checkInterval);
                    reject(new Error('Daemon 启动超时'));
                }
            }, 500);
        });
    }

    /**
     * 停止 daemon
     * @returns {Promise<Object>} 响应数据
     */
    async stopDaemon() {
        if (!this.isDaemonRunning()) {
            console.log('[DaemonClient] Daemon 未在运行');
            return { type: 'success', message: 'Daemon not running' };
        }

        try {
            const result = await this.request('/stop', {});
            console.log('[DaemonClient] Daemon 已停止');
            return result;
        } catch (error) {
            // daemon 停止后连接会断开，这是正常的
            if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
                return { type: 'success', message: 'Daemon stopped' };
            }
            throw error;
        }
    }

    /**
     * 确保 daemon 运行
     * @returns {Promise<boolean>}
     */
    async ensureDaemonRunning() {
        if (this.isDaemonRunning()) {
            return true;
        }
        return await this.startDaemon();
    }

    /**
     * 通过 daemon 创建 session
     * @param {string} directory - 工作目录
     * @returns {Promise<Object>} 包含 sessionId 的响应
     */
    async spawnSession(directory) {
        // 确保 daemon 运行
        await this.ensureDaemonRunning();

        console.log(`[DaemonClient] 创建 session，工作目录: ${directory}`);

        const result = await this.request('/spawn-session', { directory });

        if (result.type === 'error') {
            throw new Error(result.errorMessage || 'spawn-session 失败');
        }

        console.log(`[DaemonClient] Session 创建成功: ${result.sessionId}`);
        return result;
    }

    /**
     * 列出所有 session
     * @returns {Promise<Array>} session 列表
     */
    async listSessions() {
        if (!this.isDaemonRunning()) {
            return [];
        }

        const result = await this.request('/list', {});
        return result.children || [];
    }

    /**
     * 停止指定 session
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object>} 响应数据
     */
    async stopSession(sessionId) {
        if (!this.isDaemonRunning()) {
            throw new Error('Daemon 未运行');
        }

        console.log(`[DaemonClient] 停止 session: ${sessionId}`);
        return await this.request('/stop-session', { sessionId });
    }

    /**
     * 通过 PID 查找 session ID
     * @param {number} pid - 进程 ID
     * @returns {Promise<string|null>} Session ID 或 null
     */
    async findSessionByPid(pid) {
        const sessions = await this.listSessions();
        const session = sessions.find(s => s.pid === pid);
        return session?.happySessionId || null;
    }

    /**
     * 获取 daemon 状态信息
     * @returns {Object} 状态信息
     */
    getStatus() {
        const state = this.getDaemonState();
        const isRunning = this.isDaemonRunning();

        return {
            running: isRunning,
            pid: state?.pid || null,
            httpPort: state?.httpPort || null,
            startTime: state?.startTime || null,
            cliVersion: state?.startedWithCliVersion || null,
            lastHeartbeat: state?.lastHeartbeat || null,
            logPath: state?.daemonLogPath || null
        };
    }
}

module.exports = DaemonClient;

