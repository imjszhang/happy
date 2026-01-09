/**
 * Happy Client - 核心客户端类
 * 
 * 封装所有功能，提供统一接口，包括：
 * - 认证与加密
 * - 会话管理
 * - 消息收发
 * - 账户管理
 * - 机器管理
 * - 使用量统计
 * - Artifacts 管理
 * - KV 存储
 * - 社交功能
 * - Feed 动态
 * - 服务连接
 * - Todo 任务管理
 */
const EventEmitter = require('events');
const Encryption = require('./core/Encryption');
const Auth = require('./core/Auth');
const SessionManager = require('./core/SessionManager');
const HttpApi = require('./api/HttpApi');
const WebSocketClient = require('./api/WebSocketClient');
const ConversationManager = require('./conversation/ConversationManager');
const CryptoUtils = require('./utils/CryptoUtils');
const { loadEnvFile } = require('./utils/EnvLoader');
const { 
  VALID_MODES, 
  MODE_DISPLAY_NAMES, 
  isValidMode, 
  normalizeMode, 
  getModeDisplayName,
  normalizeAndConvertMode,
  detectBackendType,
  getSupportedModes,
  BACKEND_TYPES
} = require('./utils/ModeUtils');
const DaemonClient = require('./daemon/DaemonClient');
const TodoManager = require('./todo/TodoManager');

class HappyClient extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // 加载环境变量
    loadEnvFile();
    
    // 确定服务器 URL
    const serverUrl = options.serverUrl || process.env.HAPPY_SERVER_URL || 'https://api.cluster-fluster.com';
    
    // 检测后端类型
    this.backendType = detectBackendType(serverUrl);
    
    // 处理权限模式（自动根据后端类型转换）
    const requestedMode = options.permissionMode || process.env.HAPPY_MODE || 'default';
    const initialMode = normalizeAndConvertMode(requestedMode, serverUrl);
    
    if (!isValidMode(initialMode)) {
      throw new Error(`无效的权限模式: ${initialMode}，有效模式: ${VALID_MODES.join(', ')}`);
    }
    
    this.options = {
      secret: options.secret || process.env.HAPPY_SECRET,
      token: options.token || process.env.HAPPY_TOKEN,
      apiKey: options.apiKey || process.env.HAPPY_API_KEY || null,
      serverUrl: serverUrl,
      workDir: options.workDir || process.cwd(),
      autoReconnect: options.autoReconnect !== false,
      reconnectInterval: options.reconnectInterval || 60000,
      permissionMode: initialMode,
      // 直接指定 sessionId（优先级最高）
      sessionId: options.sessionId || null,
      // Daemon 相关配置
      useDaemon: options.useDaemon !== false, // 默认启用 daemon 模式
      daemonTimeout: options.daemonTimeout || 30000, // daemon 操作超时时间
      autoSpawnSession: options.autoSpawnSession !== false, // 自动创建 session
      ...options
    };
    
    // 初始化组件
    this.encryption = null;
    this.auth = new Auth(this.options);
    this.sessionManager = new SessionManager(this.options);
    this.httpApi = new HttpApi(this.options);
    this.wsClient = null;
    this.conversationManager = null;
    
    // Daemon 客户端（延迟初始化）
    this.daemonClient = null;
    if (this.options.useDaemon) {
      this.daemonClient = new DaemonClient({
        httpTimeout: this.options.daemonTimeout
      });
    }
    
    // Todo 管理器（延迟初始化，需要 encryption）
    this.todoManager = null;
    
    // 状态
    this.isConnected = false;
    this.currentSessionId = null;
    this.currentPermissionMode = initialMode;
    
    // 缓存
    this._cachedToken = null;
    this._cachedProfile = null;
    this._cachedSettings = null;
    this._cachedSettingsVersion = null;
  }
  
  // ============================================================================
  // 初始化与连接
  // ============================================================================
  
  /**
   * 初始化连接
   */
  async initialize() {
    try {
      // 1. 初始化加密
      await this._initializeEncryption();
      
      // 2. 获取或恢复 Token
      const token = await this._getToken();
      
      // 3. 查找或创建 Session
      this.currentSessionId = await this._findSession(token);
      
      // 4. 连接 WebSocket
      await this._connectWebSocket(token);
      
      // 5. 创建对话管理器
      this.conversationManager = new ConversationManager(
        this.wsClient.socket,
        this.encryption,
        this.currentSessionId,
        {
          permissionMode: this.currentPermissionMode,
          ...this.options.conversation,
          // 超时时调用软中止，让 AI 停止当前操作
          onTimeout: async (conversationId, conversation) => {
            console.log(`⏱️ 对话 ${conversationId} 超时，执行软中止...`);
            try {
              await this.abortSession(null, '对话超时，自动中止');
              console.log(`✅ 软中止完成`);
            } catch (e) {
              console.warn(`⚠️ 软中止失败: ${e.message}`);
            }
          }
        }
      );
      
      // 6. 设置事件转发
      this._setupEventForwarding();
      
      this.isConnected = true;
      this.emit('connected', { sessionId: this.currentSessionId });
      
      return this;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
  
  /**
   * 初始化加密
   */
  async _initializeEncryption() {
    const secret = this.options.secret;
    if (!secret) {
      throw new Error('HAPPY_SECRET 未配置');
    }
    
    const secretBytes = this.auth.normalizeSecretKey(secret);
    const masterSecret = Buffer.from(secretBytes, 'base64url');
    
    this.encryption = await Encryption.create(masterSecret);
    
    // 初始化 Todo 管理器
    this.todoManager = new TodoManager({
      httpApi: this.httpApi,
      encryption: this.encryption,
      getToken: () => this._getToken()
    });
  }
  
  /**
   * 获取 Token
   */
  async _getToken() {
    if (this._cachedToken) {
      return this._cachedToken;
    }
    
    if (this.options.token) {
      this._cachedToken = this.options.token;
      return this._cachedToken;
    }
    
    const secret = this.options.secret;
    if (!secret) {
      throw new Error('HAPPY_SECRET 未配置');
    }
    
    const secretBytes = this.auth.normalizeSecretKey(secret);
    const masterSecret = Buffer.from(secretBytes, 'base64url');
    
    this._cachedToken = await this.auth.getToken(masterSecret, this.options.serverUrl);
    return this._cachedToken;
  }
  
  /**
   * 查找 Session
   */
  async _findSession(token) {
    // 优先使用直接指定的 sessionId
    if (this.options.sessionId) {
      console.log(`[HappyClient] 使用指定的 sessionId: ${this.options.sessionId}`);
      
      // 验证 session 是否存在
      const sessionsData = await this.httpApi.fetchSessions(token);
      const sessions = sessionsData.sessions || [];
      const targetSession = sessions.find(s => s.id === this.options.sessionId);
      
      if (targetSession) {
        // 初始化目标 session 的加密
        await this.sessionManager.initializeSessionEncryption(targetSession, this.encryption);
        return this.options.sessionId;
      } else {
        console.warn(`[HappyClient] 指定的 sessionId 不存在: ${this.options.sessionId}`);
        // 如果指定的 session 不存在，不自动创建，直接报错
        throw new Error(`指定的 session 不存在: ${this.options.sessionId}`);
      }
    }
    
    // 没有指定 sessionId，走原有逻辑
    const sessionsData = await this.httpApi.fetchSessions(token);
    const sessions = sessionsData.sessions || [];
    
    // 如果有 session，尝试匹配
    if (sessions.length > 0) {
      // 初始化所有会话的加密
      for (const session of sessions) {
        await this.sessionManager.initializeSessionEncryption(session, this.encryption);
      }
      
      // 通过工作目录精确匹配
      if (this.options.workDir) {
        const matchedSessionId = await this.sessionManager.findSessionByWorkDirExact(
          sessions,
          this.options.workDir,
          this.encryption
        );
        
        if (matchedSessionId) {
          return matchedSessionId;
        }
      }
      
      // 如果找不到精确匹配但有 session，返回第一个
      return sessions[0].id;
    }
    
    // 没有找到 session，尝试通过 daemon 创建
    if (this.options.useDaemon && this.options.autoSpawnSession && this.daemonClient) {
      console.log('[HappyClient] 未找到匹配的 session，通过 daemon 创建新 session...');
      const sessionId = await this._spawnSessionViaDaemon();
      if (sessionId) {
        return sessionId;
      }
    }
    
    return null;
  }
  
  /**
   * 通过 Daemon 创建 Session
   * @returns {Promise<string|null>} Session ID 或 null
   */
  async _spawnSessionViaDaemon() {
    if (!this.daemonClient) {
      console.warn('[HappyClient] Daemon 客户端未初始化');
      return null;
    }
    
    try {
      // 确保 daemon 运行
      await this.daemonClient.ensureDaemonRunning();
      
      // 创建 session
      const workDir = this.options.workDir;
      console.log(`[HappyClient] 通过 daemon 创建 session，工作目录: ${workDir}`);
      
      const result = await this.daemonClient.spawnSession(workDir);
      
      if (result && result.sessionId) {
        console.log(`[HappyClient] Session 创建成功: ${result.sessionId}`);
        this.emit('daemon:sessionSpawned', { sessionId: result.sessionId, workDir });
        
        // 等待一小段时间让 session 完全初始化
        await this._sleep(2000);
        
        return result.sessionId;
      }
      
      return null;
    } catch (error) {
      console.error(`[HappyClient] 通过 daemon 创建 session 失败: ${error.message}`);
      this.emit('daemon:error', { error: error.message, operation: 'spawnSession' });
      return null;
    }
  }
  
  /**
   * 休眠函数
   * @param {number} ms - 毫秒数
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * 连接 WebSocket
   */
  async _connectWebSocket(token) {
    this.wsClient = new WebSocketClient({
      serverUrl: this.options.serverUrl,
      token,
      apiKey: this.options.apiKey,
      autoReconnect: this.options.autoReconnect,
      reconnectInterval: this.options.reconnectInterval
    });
    
    await this.wsClient.connect();
  }
  
  /**
   * 设置事件转发
   */
  _setupEventForwarding() {
    // 转发 WebSocket 事件
    this.wsClient.on('connect', () => {
      this.isConnected = true;  // 重连时恢复状态
      this.emit('ws:connect');
    });
    
    this.wsClient.on('disconnect', (reason) => {
      this.isConnected = false;  // 断开时更新状态
      this.emit('ws:disconnect', reason);
    });
    
    // 转发对话事件
    if (this.conversationManager) {
      this.conversationManager.on('message', (event) => {
        this.emit('conversation:message', event);
      });
      
      // 转发消息流结束事件
      this.conversationManager.on('streamEnded', (event) => {
        this.emit('conversation:streamEnded', event);
      });
      
      // 转发事件状态变更（ready, processing, switch 等）
      this.conversationManager.on('eventStatus', (event) => {
        this.emit('conversation:eventStatus', event);
      });
      
      // 转发同步消息事件（包括来自其他客户端的消息）
      // 这个事件用于让上层代码同步显示所有来自同一 session 的消息
      this.conversationManager.on('syncMessage', (event) => {
        this.emit('conversation:syncMessage', event);
      });
    }
  }
  
  // ============================================================================
  // 消息收发
  // ============================================================================
  
  /**
   * 发送消息并等待响应（自动交互）
   */
  async sendAndWait(message, options = {}) {
    if (!this.isConnected || !this.conversationManager) {
      throw new Error('客户端未连接，请先调用 initialize()');
    }
    
    return await this.conversationManager.sendAndWait(message, options);
  }
  
  /**
   * 发送消息（不等待响应）
   * @param {string} message - 消息文本
   * @param {string} permissionMode - 权限模式 (可选，默认使用当前模式)
   */
  async sendMessage(message, permissionMode = null) {
    if (!this.isConnected || !this.wsClient) {
      throw new Error('客户端未连接，请先调用 initialize()');
    }
    
    const enc = this.encryption.getSessionEncryption(this.currentSessionId);
    if (!enc) {
      throw new Error('会话加密未初始化');
    }
    
    const mode = permissionMode || this.currentPermissionMode;
    return await this.wsClient.sendMessage(this.currentSessionId, message, enc, this.encryption, mode);
  }
  
  // ============================================================================
  // 权限模式管理
  // ============================================================================
  
  /**
   * 设置权限模式
   * @param {string} mode - 权限模式（会根据后端类型自动转换）
   */
  setPermissionMode(mode) {
    const convertedMode = normalizeAndConvertMode(mode, this.options.serverUrl);
    if (!isValidMode(convertedMode)) {
      throw new Error(`无效的权限模式: ${mode}，有效模式: ${VALID_MODES.join(', ')}`);
    }
    this.currentPermissionMode = convertedMode;
    this.emit('permissionModeChanged', { mode: convertedMode, originalMode: mode });
    return convertedMode;
  }
  
  /**
   * 获取当前后端类型
   */
  getBackendType() {
    return this.backendType;
  }
  
  /**
   * 获取当前后端支持的模式列表
   */
  getSupportedModes() {
    return getSupportedModes(this.backendType);
  }
  
  /**
   * 获取当前权限模式
   */
  getPermissionMode() {
    return this.currentPermissionMode;
  }
  
  /**
   * 获取权限模式显示名称
   */
  getPermissionModeDisplayName() {
    return getModeDisplayName(this.currentPermissionMode);
  }
  
  /**
   * 获取所有有效的权限模式
   */
  static getValidModes() {
    return VALID_MODES;
  }
  
  /**
   * 获取模式显示名称映射
   */
  static getModeDisplayNames() {
    return MODE_DISPLAY_NAMES;
  }
  
  // ============================================================================
  // 会话管理
  // ============================================================================
  
  /**
   * 获取会话列表
   * @returns {Promise<{sessions: Array}>} 会话列表
   */
  async getSessions() {
    const token = await this._getToken();
    const data = await this.httpApi.fetchSessions(token);
    
    // 初始化所有会话的加密并解密元数据
    const sessions = data.sessions || [];
    const decryptedSessions = [];
    
    for (const session of sessions) {
      await this.sessionManager.initializeSessionEncryption(session, this.encryption);
      const metadata = this.sessionManager.decryptSessionMetadata(session, this.encryption);
      
      decryptedSessions.push({
        ...session,
        decryptedMetadata: metadata
      });
    }
    
    return { sessions: decryptedSessions };
  }
  
  /**
   * 获取消息列表
   * @param {string} sessionId - 会话 ID
   * @returns {Promise<{messages: Array}>} 消息列表
   */
  async getMessages(sessionId) {
    const token = await this._getToken();
    return await this.httpApi.fetchMessages(token, sessionId);
  }
  
  /**
   * 删除会话
   * @param {string} sessionId - 会话 ID
   */
  async deleteSession(sessionId) {
    const token = await this._getToken();
    return await this.httpApi.deleteSession(token, sessionId);
  }
  
  /**
   * 诊断会话
   * @param {string} sessionId - 会话 ID
   * @returns {Promise<object>} 诊断信息
   */
  async diagnoseSession(sessionId) {
    const token = await this._getToken();
    const sessionsData = await this.httpApi.fetchSessions(token);
    const sessions = sessionsData.sessions || [];
    const session = sessions.find(s => s.id === sessionId);
    
    if (!session) {
      throw new Error('会话不存在');
    }
    
    return await this.sessionManager.diagnoseSession(session, this.encryption);
  }
  
  // ============================================================================
  // Daemon 管理
  // ============================================================================
  
  /**
   * 获取 Daemon 状态
   * @returns {Object} Daemon 状态信息
   */
  getDaemonStatus() {
    if (!this.daemonClient) {
      return { running: false, enabled: false };
    }
    return {
      enabled: true,
      ...this.daemonClient.getStatus()
    };
  }
  
  /**
   * 检查 Daemon 是否运行
   * @returns {boolean}
   */
  isDaemonRunning() {
    if (!this.daemonClient) return false;
    return this.daemonClient.isDaemonRunning();
  }
  
  /**
   * 确保 Daemon 运行
   * @returns {Promise<boolean>}
   */
  async ensureDaemonRunning() {
    if (!this.daemonClient) {
      throw new Error('Daemon 模式未启用');
    }
    return await this.daemonClient.ensureDaemonRunning();
  }
  
  /**
   * 列出 Daemon 管理的所有 Session
   * @returns {Promise<Array>} Session 列表
   */
  async listDaemonSessions() {
    if (!this.daemonClient) {
      return [];
    }
    return await this.daemonClient.listSessions();
  }
  
  /**
   * 通过 Daemon 停止 Session
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>}
   */
  async stopDaemonSession(sessionId) {
    if (!this.daemonClient) {
      throw new Error('Daemon 模式未启用');
    }
    return await this.daemonClient.stopSession(sessionId);
  }
  
  // ============================================================================
  // 账户管理
  // ============================================================================
  
  /**
   * 获取账户资料
   * @returns {Promise<object>} 账户资料
   */
  async getProfile() {
    const token = await this._getToken();
    const profile = await this.httpApi.fetchProfile(token);
    this._cachedProfile = profile;
    return profile;
  }
  
  /**
   * 获取账户设置
   * @returns {Promise<object>} 解密后的设置
   */
  async getSettings() {
    const token = await this._getToken();
    const data = await this.httpApi.fetchSettings(token);
    
    let settings = null;
    if (data.settings && this.encryption) {
      settings = this.encryption.decryptLegacy(data.settings);
    }
    
    this._cachedSettings = settings;
    this._cachedSettingsVersion = data.settingsVersion;
    
    return {
      settings,
      settingsVersion: data.settingsVersion
    };
  }
  
  /**
   * 更新账户设置
   * @param {object} settings - 新的设置对象
   * @returns {Promise<object>} 更新结果
   */
  async updateSettings(settings) {
    const token = await this._getToken();
    
    // 获取当前版本号
    if (this._cachedSettingsVersion === null) {
      await this.getSettings();
    }
    
    // 加密设置
    const encryptedSettings = this.encryption.encryptLegacy(settings);
    
    const result = await this.httpApi.updateSettings(
      token, 
      encryptedSettings, 
      this._cachedSettingsVersion
    );
    
    // 更新缓存
    this._cachedSettings = settings;
    if (result.settingsVersion) {
      this._cachedSettingsVersion = result.settingsVersion;
    }
    
    return result;
  }
  
  // ============================================================================
  // 机器管理
  // ============================================================================
  
  /**
   * 获取机器列表
   * @returns {Promise<Array>} 机器列表（含解密的元数据）
   */
  async getMachines() {
    const token = await this._getToken();
    const machines = await this.httpApi.fetchMachines(token);
    
    if (!Array.isArray(machines)) {
      return [];
    }
    
    const decryptedMachines = [];
    
    for (const machine of machines) {
      // 初始化机器加密
      if (machine.dataEncryptionKey) {
        const decryptedKey = await this.encryption.decryptEncryptionKey(machine.dataEncryptionKey);
        await this.encryption.initializeMachine(machine.id, decryptedKey);
      } else {
        await this.encryption.initializeMachine(machine.id, null);
      }
      
      // 解密元数据
      let metadata = null;
      if (machine.metadata) {
        const enc = this.encryption.getMachineEncryption(machine.id);
        if (enc) {
          try {
            const metadataData = CryptoUtils.decodeBase64(machine.metadata, 'base64');
            metadata = this.encryption.decrypt(enc, metadataData);
          } catch (e) {
            // 忽略解密错误
          }
        }
      }
      
      decryptedMachines.push({
        ...machine,
        decryptedMetadata: metadata
      });
    }
    
    return decryptedMachines;
  }
  
  // ============================================================================
  // 使用量统计
  // ============================================================================
  
  /**
   * 获取使用量统计
   * @param {string} period - 时间段 ('today' | '7days' | '30days')
   * @returns {Promise<object>} 使用量统计
   */
  async getUsage(period = '7days') {
    const token = await this._getToken();
    
    const now = Math.floor(Date.now() / 1000);
    const oneDaySeconds = 24 * 60 * 60;
    
    let startTime;
    let groupBy;
    
    switch (period) {
      case 'today':
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        startTime = Math.floor(today.getTime() / 1000);
        groupBy = 'hour';
        break;
      case '30days':
        startTime = now - (30 * oneDaySeconds);
        groupBy = 'day';
        break;
      case '7days':
      default:
        startTime = now - (7 * oneDaySeconds);
        groupBy = 'day';
        break;
    }
    
    const data = await this.httpApi.queryUsage(token, {
      startTime,
      endTime: now,
      groupBy
    });
    
    // 计算汇总数据
    let totalTokens = 0;
    let totalCost = 0;
    const tokensByModel = {};
    const costByModel = {};
    
    for (const dataPoint of (data.usage || [])) {
      for (const [model, tokens] of Object.entries(dataPoint.tokens || {})) {
        if (typeof tokens === 'number') {
          totalTokens += tokens;
          tokensByModel[model] = (tokensByModel[model] || 0) + tokens;
        }
      }
      
      for (const [model, cost] of Object.entries(dataPoint.cost || {})) {
        if (typeof cost === 'number') {
          totalCost += cost;
          costByModel[model] = (costByModel[model] || 0) + cost;
        }
      }
    }
    
    return {
      ...data,
      summary: {
        totalTokens,
        totalCost,
        tokensByModel,
        costByModel
      }
    };
  }
  
  // ============================================================================
  // Artifacts 管理
  // ============================================================================
  
  /**
   * 获取 Artifacts 列表
   * @returns {Promise<Array>} Artifacts 列表（含解密的 header）
   */
  async getArtifacts() {
    const token = await this._getToken();
    const artifacts = await this.httpApi.fetchArtifacts(token);
    
    if (!Array.isArray(artifacts)) {
      return [];
    }
    
    const decryptedArtifacts = [];
    
    for (const artifact of artifacts) {
      // 初始化 Artifact 加密
      if (artifact.dataEncryptionKey) {
        const decryptedKey = await this.encryption.decryptEncryptionKey(artifact.dataEncryptionKey);
        await this.encryption.initializeArtifact(artifact.id, decryptedKey);
      } else {
        await this.encryption.initializeArtifact(artifact.id, null);
      }
      
      // 解密 header
      let header = null;
      if (artifact.header) {
        const enc = this.encryption.getArtifactEncryption(artifact.id);
        if (enc) {
          try {
            const headerData = CryptoUtils.decodeBase64(artifact.header, 'base64');
            header = this.encryption.decrypt(enc, headerData);
          } catch (e) {
            // 忽略解密错误
          }
        }
      }
      
      decryptedArtifacts.push({
        ...artifact,
        decryptedHeader: header
      });
    }
    
    return decryptedArtifacts;
  }
  
  /**
   * 获取单个 Artifact
   * @param {string} artifactId - Artifact ID
   * @returns {Promise<object>} Artifact（含解密的 header 和 body）
   */
  async getArtifact(artifactId) {
    const token = await this._getToken();
    const artifact = await this.httpApi.fetchArtifact(token, artifactId);
    
    // 初始化加密
    if (artifact.dataEncryptionKey) {
      const decryptedKey = await this.encryption.decryptEncryptionKey(artifact.dataEncryptionKey);
      await this.encryption.initializeArtifact(artifact.id, decryptedKey);
    } else {
      await this.encryption.initializeArtifact(artifact.id, null);
    }
    
    const enc = this.encryption.getArtifactEncryption(artifact.id);
    
    // 解密 header
    let header = null;
    if (artifact.header && enc) {
      try {
        const headerData = CryptoUtils.decodeBase64(artifact.header, 'base64');
        header = this.encryption.decrypt(enc, headerData);
      } catch (e) {
        // 忽略解密错误
      }
    }
    
    // 解密 body
    let body = null;
    if (artifact.body && enc) {
      try {
        const bodyData = CryptoUtils.decodeBase64(artifact.body, 'base64');
        body = this.encryption.decrypt(enc, bodyData);
      } catch (e) {
        // 忽略解密错误
      }
    }
    
    return {
      ...artifact,
      decryptedHeader: header,
      decryptedBody: body
    };
  }
  
  /**
   * 创建 Artifact
   * @param {object} header - Artifact header（如 { title, draft }）
   * @param {object} body - Artifact body（如 { body: '内容' }）
   * @returns {Promise<object>} 创建结果
   */
  async createArtifact(header, body) {
    const token = await this._getToken();
    
    // 使用旧版加密加密 header 和 body
    const encryptedHeader = this.encryption.encryptLegacy(header);
    const encryptedBody = this.encryption.encryptLegacy(body);
    
    return await this.httpApi.createArtifact(token, {
      header: encryptedHeader,
      body: encryptedBody
    });
  }
  
  /**
   * 更新 Artifact
   * @param {string} artifactId - Artifact ID
   * @param {object} header - 新的 header
   * @param {object} body - 新的 body
   * @returns {Promise<object>} 更新结果
   */
  async updateArtifact(artifactId, header, body) {
    const token = await this._getToken();
    
    // 获取 Artifact 以初始化加密
    await this.getArtifact(artifactId);
    
    const enc = this.encryption.getArtifactEncryption(artifactId);
    
    // 加密 header 和 body
    let encryptedHeader = null;
    let encryptedBody = null;
    
    if (enc) {
      if (header) {
        const headerBytes = this.encryption.encrypt(enc, header);
        encryptedHeader = CryptoUtils.encodeBase64(headerBytes, 'base64');
      }
      if (body) {
        const bodyBytes = this.encryption.encrypt(enc, body);
        encryptedBody = CryptoUtils.encodeBase64(bodyBytes, 'base64');
      }
    }
    
    return await this.httpApi.updateArtifact(token, artifactId, {
      header: encryptedHeader,
      body: encryptedBody
    });
  }
  
  /**
   * 删除 Artifact
   * @param {string} artifactId - Artifact ID
   */
  async deleteArtifact(artifactId) {
    const token = await this._getToken();
    return await this.httpApi.deleteArtifact(token, artifactId);
  }
  
  // ============================================================================
  // KV 存储
  // ============================================================================
  
  /**
   * 获取 KV 列表
   * @param {string} prefix - 键前缀（可选）
   * @param {number} limit - 返回数量限制（可选）
   * @returns {Promise<{items: Array}>} KV 列表
   */
  async kvList(prefix = '', limit = 100) {
    const token = await this._getToken();
    return await this.httpApi.kvList(token, { prefix, limit });
  }
  
  /**
   * 获取 KV 值
   * @param {string} key - 键
   * @returns {Promise<object|null>} KV 项或 null
   */
  async kvGet(key) {
    const token = await this._getToken();
    return await this.httpApi.kvGet(token, key);
  }
  
  /**
   * 设置 KV 值
   * @param {string} key - 键
   * @param {string} value - 值
   * @returns {Promise<object>} 操作结果
   */
  async kvSet(key, value) {
    const token = await this._getToken();
    
    // 先获取当前版本
    const existing = await this.httpApi.kvGet(token, key);
    const version = existing ? existing.version : -1;
    
    return await this.httpApi.kvMutate(token, [{
      key,
      value,
      version
    }]);
  }
  
  /**
   * 删除 KV 值
   * @param {string} key - 键
   * @returns {Promise<object>} 操作结果
   */
  async kvDelete(key) {
    const token = await this._getToken();
    
    const existing = await this.httpApi.kvGet(token, key);
    if (!existing) {
      throw new Error('Key 不存在');
    }
    
    return await this.httpApi.kvMutate(token, [{
      key,
      value: null,
      version: existing.version
    }]);
  }
  
  // ============================================================================
  // 社交功能
  // ============================================================================
  
  /**
   * 获取好友列表
   * @returns {Promise<{friends: Array}>} 好友列表
   */
  async getFriends() {
    const token = await this._getToken();
    return await this.httpApi.fetchFriends(token);
  }
  
  /**
   * 搜索用户
   * @param {string} query - 搜索关键词
   * @returns {Promise<{users: Array}>} 用户列表
   */
  async searchUsers(query) {
    const token = await this._getToken();
    return await this.httpApi.searchUsers(token, query);
  }
  
  /**
   * 获取用户资料
   * @param {string} userId - 用户 ID
   * @returns {Promise<object|null>} 用户资料
   */
  async getUser(userId) {
    const token = await this._getToken();
    return await this.httpApi.fetchUser(token, userId);
  }
  
  /**
   * 添加好友
   * @param {string} userId - 用户 ID
   * @returns {Promise<object>} 操作结果
   */
  async addFriend(userId) {
    const token = await this._getToken();
    return await this.httpApi.addFriend(token, userId);
  }
  
  /**
   * 移除好友
   * @param {string} userId - 用户 ID
   * @returns {Promise<object>} 操作结果
   */
  async removeFriend(userId) {
    const token = await this._getToken();
    return await this.httpApi.removeFriend(token, userId);
  }
  
  // ============================================================================
  // Feed 动态
  // ============================================================================
  
  /**
   * 获取动态 Feed
   * @param {object} options - 查询选项
   * @param {number} options.limit - 返回数量限制
   * @param {string} options.before - 获取该时间之前的动态
   * @param {string} options.after - 获取该时间之后的动态
   * @returns {Promise<{items: Array, hasMore: boolean}>} Feed 数据
   */
  async getFeed(options = {}) {
    const token = await this._getToken();
    return await this.httpApi.fetchFeed(token, options);
  }
  
  // ============================================================================
  // 服务连接
  // ============================================================================
  
  /**
   * 获取已连接服务列表
   * @returns {Promise<object>} 包含已连接服务信息的账户资料
   */
  async getConnectedServices() {
    const profile = this._cachedProfile || await this.getProfile();
    
    return {
      github: profile.github || null,
      connectedServices: profile.connectedServices || []
    };
  }
  
  /**
   * 断开服务连接
   * @param {string} service - 服务名称（如 'github'）
   */
  async disconnectService(service) {
    const token = await this._getToken();
    await this.httpApi.disconnectService(token, service);
    
    // 清除缓存
    this._cachedProfile = null;
  }
  
  // ============================================================================
  // Session RPC 调用
  // ============================================================================
  
  /**
   * 发送 Session RPC 调用
   * @param {string} sessionId - 会话 ID（可选，默认使用当前会话）
   * @param {string} method - RPC 方法名（如 'abort', 'killSession'）
   * @param {object} params - 参数对象
   * @returns {Promise<object>} RPC 结果
   */
  async sessionRPC(sessionId, method, params = {}) {
    if (!this.isConnected || !this.wsClient) {
      throw new Error('客户端未连接，请先调用 initialize()');
    }
    
    const targetSessionId = sessionId || this.currentSessionId;
    if (!targetSessionId) {
      throw new Error('未指定会话 ID');
    }
    
    const enc = this.encryption.getSessionEncryption(targetSessionId);
    if (!enc) {
      throw new Error('会话加密未初始化');
    }
    
    return await this.wsClient.sessionRPC(targetSessionId, method, params, enc, this.encryption);
  }
  
  /**
   * 软中止会话 - 中止当前操作，会话继续存活
   * @param {string} sessionId - 会话 ID（可选，默认使用当前会话）
   * @param {string} reason - 中止原因（可选）
   * @returns {Promise<object>} 操作结果
   */
  async abortSession(sessionId = null, reason = null) {
    const defaultReason = `The user doesn't want to proceed with this tool use. The tool use was rejected. STOP what you are doing and wait for the user to tell you how to proceed.`;
    
    const result = await this.sessionRPC(sessionId, 'abort', {
      reason: reason || defaultReason
    });
    
    this.emit('session:aborted', { sessionId: sessionId || this.currentSessionId });
    return result;
  }
  
  /**
   * 硬中止会话 - 完全终止会话进程
   * @param {string} sessionId - 会话 ID（可选，默认使用当前会话）
   * @returns {Promise<object>} 操作结果
   */
  async killSession(sessionId = null) {
    const targetSessionId = sessionId || this.currentSessionId;
    
    const result = await this.sessionRPC(targetSessionId, 'killSession', {});
    
    // 如果终止成功，清除会话相关状态
    if (result?.success !== false) {
      this.emit('session:killed', { sessionId: targetSessionId });
      
      // 如果终止的是当前会话，清空当前会话 ID
      if (targetSessionId === this.currentSessionId) {
        this.currentSessionId = null;
      }
    }
    
    return result;
  }
  
  // ============================================================================
  // Machine RPC 调用
  // ============================================================================
  
  /**
   * 发送 Machine RPC 调用
   * @param {string} machineId - 机器 ID
   * @param {string} method - RPC 方法名（如 'spawn-happy-session', 'stop-daemon', 'bash'）
   * @param {object} params - 参数对象
   * @returns {Promise<object>} RPC 结果
   */
  async machineRPC(machineId, method, params = {}) {
    if (!this.isConnected || !this.wsClient) {
      throw new Error('客户端未连接，请先调用 initialize()');
    }
    
    if (!machineId) {
      throw new Error('未指定机器 ID');
    }
    
    const enc = this.encryption.getMachineEncryption(machineId);
    if (!enc) {
      throw new Error('机器加密未初始化，请先调用 getMachines()');
    }
    
    return await this.wsClient.machineRPC(machineId, method, params, enc, this.encryption);
  }
  
  /**
   * 在远程机器上启动新会话
   * @param {string} machineId - 机器 ID
   * @param {string} directory - 工作目录
   * @param {object} options - 选项
   * @param {string} options.agent - Agent 类型 ('claude' | 'codex' | 'gemini')，默认 'claude'
   * @param {boolean} options.approveCreate - 是否批准创建新目录，默认 false
   * @returns {Promise<object>} 启动结果
   */
  async spawnRemoteSession(machineId, directory, options = {}) {
    const { agent = 'claude', approveCreate = false } = options;
    
    // 确保机器列表已加载（初始化机器加密）
    const machines = await this.getMachines();
    const machine = machines.find(m => m.id === machineId || m.id.startsWith(machineId));
    
    if (!machine) {
      throw new Error(`机器不存在: ${machineId}`);
    }
    
    if (!machine.active) {
      throw new Error('机器离线，无法启动会话');
    }
    
    const result = await this.machineRPC(machine.id, 'spawn-happy-session', {
      type: 'spawn-in-directory',
      directory,
      approvedNewDirectoryCreation: approveCreate,
      agent
    });
    
    if (result.type === 'success') {
      this.emit('machine:sessionSpawned', { 
        machineId: machine.id, 
        sessionId: result.sessionId, 
        directory 
      });
    }
    
    return result;
  }
  
  /**
   * 停止远程机器上的 Daemon
   * @param {string} machineId - 机器 ID
   * @returns {Promise<object>} 操作结果
   */
  async stopMachineDaemon(machineId) {
    // 确保机器列表已加载
    const machines = await this.getMachines();
    const machine = machines.find(m => m.id === machineId || m.id.startsWith(machineId));
    
    if (!machine) {
      throw new Error(`机器不存在: ${machineId}`);
    }
    
    const result = await this.machineRPC(machine.id, 'stop-daemon', {});
    
    this.emit('machine:daemonStopped', { machineId: machine.id });
    return result;
  }
  
  /**
   * 在远程机器上执行命令
   * @param {string} machineId - 机器 ID
   * @param {string} command - 要执行的命令
   * @param {string} cwd - 工作目录，默认 '~'
   * @returns {Promise<object>} 执行结果
   */
  async executeMachineCommand(machineId, command, cwd = '~') {
    // 确保机器列表已加载
    const machines = await this.getMachines();
    const machine = machines.find(m => m.id === machineId || m.id.startsWith(machineId));
    
    if (!machine) {
      throw new Error(`机器不存在: ${machineId}`);
    }
    
    return await this.machineRPC(machine.id, 'bash', { command, cwd });
  }
  
  // ============================================================================
  // Session 文件操作 RPC
  // ============================================================================
  
  /**
   * 读取远程文件
   * @param {string} sessionId - 会话 ID（可选，默认使用当前会话）
   * @param {string} filePath - 文件路径
   * @returns {Promise<object>} 文件内容
   */
  async readRemoteFile(sessionId, filePath) {
    const targetSessionId = sessionId || this.currentSessionId;
    return await this.sessionRPC(targetSessionId, 'readFile', { path: filePath });
  }
  
  /**
   * 写入远程文件
   * @param {string} sessionId - 会话 ID（可选，默认使用当前会话）
   * @param {string} filePath - 文件路径
   * @param {string} content - 文件内容
   * @param {string} expectedHash - 预期哈希值（可选，用于冲突检测）
   * @returns {Promise<object>} 操作结果
   */
  async writeRemoteFile(sessionId, filePath, content, expectedHash = null) {
    const targetSessionId = sessionId || this.currentSessionId;
    
    // 将内容编码为 base64
    const contentBase64 = Buffer.from(content, 'utf8').toString('base64');
    
    return await this.sessionRPC(targetSessionId, 'writeFile', {
      path: filePath,
      content: contentBase64,
      expectedHash
    });
  }
  
  /**
   * 列出远程目录内容
   * @param {string} sessionId - 会话 ID（可选，默认使用当前会话）
   * @param {string} dirPath - 目录路径
   * @returns {Promise<object>} 目录内容
   */
  async listRemoteDirectory(sessionId, dirPath) {
    const targetSessionId = sessionId || this.currentSessionId;
    return await this.sessionRPC(targetSessionId, 'listDirectory', { path: dirPath });
  }
  
  /**
   * 获取远程目录树结构
   * @param {string} sessionId - 会话 ID（可选，默认使用当前会话）
   * @param {string} dirPath - 目录路径
   * @param {number} maxDepth - 最大深度，默认 3
   * @returns {Promise<object>} 目录树结构
   */
  async getRemoteDirectoryTree(sessionId, dirPath, maxDepth = 3) {
    const targetSessionId = sessionId || this.currentSessionId;
    return await this.sessionRPC(targetSessionId, 'getDirectoryTree', { 
      path: dirPath, 
      maxDepth 
    });
  }
  
  /**
   * 在远程会话中搜索文件内容（使用 ripgrep）
   * @param {string} sessionId - 会话 ID（可选，默认使用当前会话）
   * @param {string} pattern - 搜索模式
   * @param {string} cwd - 搜索目录，默认 '.'
   * @returns {Promise<object>} 搜索结果
   */
  async searchRemoteFiles(sessionId, pattern, cwd = '.') {
    const targetSessionId = sessionId || this.currentSessionId;
    return await this.sessionRPC(targetSessionId, 'ripgrep', { 
      args: [pattern], 
      cwd 
    });
  }
  
  /**
   * 在远程会话中执行 bash 命令
   * @param {string} sessionId - 会话 ID（可选，默认使用当前会话）
   * @param {string} command - 要执行的命令
   * @param {string} cwd - 工作目录，默认 '.'
   * @returns {Promise<object>} 执行结果
   */
  async executeRemoteCommand(sessionId, command, cwd = '.') {
    const targetSessionId = sessionId || this.currentSessionId;
    return await this.sessionRPC(targetSessionId, 'bash', { command, cwd });
  }
  
  // ============================================================================
  // Todo 任务管理
  // ============================================================================
  
  /**
   * 获取所有 Todo 任务
   * @returns {Promise<object>} Todo 状态对象 { todos, undoneOrder, doneOrder }
   */
  async getTodos() {
    if (!this.todoManager) {
      throw new Error('Todo 管理器未初始化，请先调用 initialize()');
    }
    return await this.todoManager.fetchTodos();
  }
  
  /**
   * 添加新任务
   * @param {string} title - 任务标题
   * @returns {Promise<string>} 新任务 ID
   */
  async addTodo(title) {
    if (!this.todoManager) {
      throw new Error('Todo 管理器未初始化，请先调用 initialize()');
    }
    const id = await this.todoManager.addTodo(title);
    this.emit('todo:added', { id, title });
    return id;
  }
  
  /**
   * 切换任务完成状态
   * @param {string} id - 任务 ID（支持前缀匹配）
   * @returns {Promise<boolean>} 新的完成状态
   */
  async toggleTodo(id) {
    if (!this.todoManager) {
      throw new Error('Todo 管理器未初始化，请先调用 initialize()');
    }
    
    // 支持前缀匹配
    const state = this.todoManager.getCachedState() || await this.todoManager.fetchTodos();
    const fullId = Object.keys(state.todos).find(tid => tid === id || tid.startsWith(id));
    
    if (!fullId) {
      throw new Error(`任务不存在: ${id}`);
    }
    
    const done = await this.todoManager.toggleTodo(fullId);
    this.emit('todo:toggled', { id: fullId, done });
    return done;
  }
  
  /**
   * 编辑任务标题
   * @param {string} id - 任务 ID（支持前缀匹配）
   * @param {string} title - 新标题
   * @returns {Promise<void>}
   */
  async editTodo(id, title) {
    if (!this.todoManager) {
      throw new Error('Todo 管理器未初始化，请先调用 initialize()');
    }
    
    // 支持前缀匹配
    const state = this.todoManager.getCachedState() || await this.todoManager.fetchTodos();
    const fullId = Object.keys(state.todos).find(tid => tid === id || tid.startsWith(id));
    
    if (!fullId) {
      throw new Error(`任务不存在: ${id}`);
    }
    
    await this.todoManager.editTodoTitle(fullId, title);
    this.emit('todo:edited', { id: fullId, title });
  }
  
  /**
   * 删除任务
   * @param {string} id - 任务 ID（支持前缀匹配）
   * @returns {Promise<void>}
   */
  async deleteTodo(id) {
    if (!this.todoManager) {
      throw new Error('Todo 管理器未初始化，请先调用 initialize()');
    }
    
    // 支持前缀匹配
    const state = this.todoManager.getCachedState() || await this.todoManager.fetchTodos();
    const fullId = Object.keys(state.todos).find(tid => tid === id || tid.startsWith(id));
    
    if (!fullId) {
      throw new Error(`任务不存在: ${id}`);
    }
    
    await this.todoManager.deleteTodo(fullId);
    this.emit('todo:deleted', { id: fullId });
  }
  
  // ============================================================================
  // 连接管理
  // ============================================================================
  
  /**
   * 断开连接
   */
  async disconnect() {
    if (this.conversationManager) {
      this.conversationManager.cleanup();
    }
    
    if (this.wsClient) {
      await this.wsClient.disconnect();
    }
    
    this.isConnected = false;
    this.emit('disconnected');
  }
  
  /**
   * 清理资源
   */
  cleanup() {
    this.disconnect();
    this.removeAllListeners();
    
    // 清除缓存
    this._cachedToken = null;
    this._cachedProfile = null;
    this._cachedSettings = null;
    this._cachedSettingsVersion = null;
  }
}

module.exports = HappyClient;
