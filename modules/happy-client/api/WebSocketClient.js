/**
 * WebSocket 客户端模块
 */
const EventEmitter = require('events');
const crypto = require('crypto');
const CryptoUtils = require('../utils/CryptoUtils');

class WebSocketClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.serverUrl = options.serverUrl;
    this.token = options.token;
    this.apiKey = options.apiKey || null;
    this.autoReconnect = options.autoReconnect !== false;
    this.reconnectInterval = options.reconnectInterval || 60000;
    this.socket = null;
    this.reconnectTimer = null;
  }
  
  /**
   * 连接 WebSocket
   */
  async connect() {
    const { io } = require('socket.io-client');
    
    // 构建 extraHeaders（包含 API Key）
    const extraHeaders = {};
    if (this.apiKey) {
      extraHeaders['X-API-Key'] = this.apiKey;
    }
    
    return new Promise((resolve, reject) => {
      this.socket = io(this.serverUrl, {
        path: '/v1/updates',
        extraHeaders,
        auth: {
          token: this.token,
          clientType: 'user-scoped'
        },
        transports: ['websocket'],
        reconnection: this.autoReconnect,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity
      });
      
      this.socket.on('connect', () => {
        this.emit('connect');
        resolve(this.socket);
      });
      
      this.socket.on('disconnect', (reason) => {
        this.emit('disconnect', reason);
      });
      
      this.socket.on('connect_error', (error) => {
        this.emit('connect_error', error);
        if (!this.autoReconnect) {
          reject(error);
        }
      });
      
      this.socket.on('update', (data) => {
        this.emit('update', data);
      });
      
      this.socket.on('ephemeral', (data) => {
        this.emit('ephemeral', data);
      });
    });
  }
  
  /**
   * 发送消息
   * @param {string} sessionId - 会话 ID
   * @param {string} text - 消息文本
   * @param {object} enc - 加密器
   * @param {object} encryption - 加密管理器
   * @param {string} permissionMode - 权限模式 (default, acceptEdits, plan, bypassPermissions, read-only, safe-yolo, yolo)
   */
  async sendMessage(sessionId, text, enc, encryption, permissionMode = 'default') {
    if (!this.socket) {
      throw new Error('WebSocket 未连接');
    }
    
    // 构建消息内容（与项目源码一致）
    const content = {
      role: 'user',
      content: {
        type: 'text',
        text: text
      },
      meta: {
        sentFrom: 'happy-client-module',
        permissionMode: permissionMode
      }
    };
    
    // 加密消息
    const encrypted = encryption.encrypt(enc, content);
    const encryptedBase64 = CryptoUtils.encodeBase64(encrypted, 'base64');
    
    // 生成本地 ID
    const localId = crypto.randomUUID();
    
    // 发送消息（同时在 WebSocket 层面也传递 permissionMode）
    this.socket.emit('message', {
      sid: sessionId,
      message: encryptedBase64,
      localId: localId,
      sentFrom: 'happy-client-module',
      permissionMode: permissionMode
    });
    
    return localId;
  }
  
  /**
   * 断开连接
   */
  async disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.emit('disconnected');
  }
  
  /**
   * 检查连接状态
   */
  isConnected() {
    return this.socket && this.socket.connected;
  }
  
  /**
   * 发送 Session RPC 调用
   * @param {string} sessionId - 会话 ID
   * @param {string} method - RPC 方法名（如 'abort', 'killSession'）
   * @param {object} params - 参数对象
   * @param {object} enc - 会话加密器
   * @param {object} encryption - 加密管理器
   * @returns {Promise<object>} 解密后的 RPC 结果
   */
  async sessionRPC(sessionId, method, params, enc, encryption) {
    if (!this.socket) {
      throw new Error('WebSocket 未连接');
    }
    
    // 加密参数
    const encrypted = encryption.encrypt(enc, params);
    const encryptedBase64 = CryptoUtils.encodeBase64(encrypted, 'base64');
    
    // 发送 RPC 调用并等待响应
    const result = await this.socket.emitWithAck('rpc-call', {
      method: `${sessionId}:${method}`,
      params: encryptedBase64
    });
    
    // 处理响应
    if (result.ok) {
      if (result.result) {
        // 解密返回结果
        const decrypted = encryption.decrypt(
          enc, 
          CryptoUtils.decodeBase64(result.result, 'base64')
        );
        return decrypted;
      }
      return {};
    }
    
    // 抛出错误，包含错误信息（如果有）
    throw new Error(result.error || 'RPC 调用失败');
  }
  
  /**
   * 发送 Machine RPC 调用
   * @param {string} machineId - 机器 ID
   * @param {string} method - RPC 方法名（如 'spawn-happy-session', 'stop-daemon', 'bash'）
   * @param {object} params - 参数对象
   * @param {object} enc - 机器加密器
   * @param {object} encryption - 加密管理器
   * @returns {Promise<object>} 解密后的 RPC 结果
   */
  async machineRPC(machineId, method, params, enc, encryption) {
    if (!this.socket) {
      throw new Error('WebSocket 未连接');
    }
    
    // 加密参数
    const encrypted = encryption.encrypt(enc, params);
    const encryptedBase64 = CryptoUtils.encodeBase64(encrypted, 'base64');
    
    // 发送 RPC 调用并等待响应
    const result = await this.socket.emitWithAck('rpc-call', {
      method: `${machineId}:${method}`,
      params: encryptedBase64
    });
    
    // 处理响应
    if (result.ok) {
      if (result.result) {
        // 解密返回结果
        const decrypted = encryption.decrypt(
          enc, 
          CryptoUtils.decodeBase64(result.result, 'base64')
        );
        return decrypted;
      }
      return {};
    }
    
    // 抛出错误，包含错误信息（如果有）
    throw new Error(result.error || 'Machine RPC 调用失败');
  }
}

module.exports = WebSocketClient;
