/**
 * Happy Client 模块 - 统一入口
 * 
 * 提供统一的 API 接口，供其他模块使用
 */

const HappyClient = require('./HappyClient');
const Encryption = require('./core/Encryption');
const Auth = require('./core/Auth');
const SessionManager = require('./core/SessionManager');
const ConversationManager = require('./conversation/ConversationManager');
const ModeUtils = require('./utils/ModeUtils');
const { DaemonClient, createDaemonClient } = require('./daemon');

// 导出主要类
module.exports = {
  // 主客户端类（推荐使用）
  HappyClient,
  
  // Daemon 客户端
  DaemonClient,
  createDaemonClient,
  
  // 核心组件（高级用法）
  Encryption,
  Auth,
  SessionManager,
  ConversationManager,
  
  // 模式相关
  VALID_MODES: ModeUtils.VALID_MODES,
  MODE_DISPLAY_NAMES: ModeUtils.MODE_DISPLAY_NAMES,
  
  // 工具函数
  utils: require('./utils'),
  
  // 便捷方法：创建客户端实例
  createClient: (options) => {
    return new HappyClient(options);
  }
};
