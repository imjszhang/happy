/**
 * 会话管理模块
 */
const path = require('path');
const CryptoUtils = require('../utils/CryptoUtils');

class SessionManager {
  constructor(options = {}) {
    this.options = options;
  }
  
  /**
   * 通过工作目录查找 Session
   */
  async findSessionByWorkDir(sessions, workDir) {
    if (!sessions || sessions.length === 0) {
      return null;
    }
    
    const normalizedWorkDir = path.resolve(workDir).replace(/\\/g, '/');
    
    // 先初始化所有会话的加密，然后匹配工作目录
    for (const session of sessions) {
      // 返回第一个会话 ID（实际使用时需要解密 metadata 匹配）
      // 这里简化处理，返回第一个会话
      return session.id;
    }
    
    return null;
  }
  
  /**
   * 通过工作目录精确匹配 Session
   */
  async findSessionByWorkDirExact(sessions, workDir, encryption) {
    if (!sessions || sessions.length === 0) {
      return null;
    }
    
    const normalizedWorkDir = path.resolve(workDir).replace(/\\/g, '/');
    
    for (const session of sessions) {
      // 初始化会话加密
      await this.initializeSessionEncryption(session, encryption);
      
      // 解密元数据
      const metadata = this.decryptSessionMetadata(session, encryption);
      if (!metadata) continue;
      
      // 匹配工作目录
      const sessionWorkDir = metadata.path || metadata.cwd;
      if (sessionWorkDir) {
        const normalizedSessionWorkDir = path.resolve(sessionWorkDir).replace(/\\/g, '/');
        if (normalizedSessionWorkDir === normalizedWorkDir) {
          return session.id;
        }
      }
    }
    
    // 如果找不到精确匹配，返回第一个会话
    return sessions.length > 0 ? sessions[0].id : null;
  }
  
  /**
   * 初始化会话加密
   */
  async initializeSessionEncryption(session, encryption) {
    if (session.dataEncryptionKey) {
      const decryptedKey = await encryption.decryptEncryptionKey(session.dataEncryptionKey);
      await encryption.initializeSession(session.id, decryptedKey);
    } else {
      await encryption.initializeSession(session.id, null);
    }
  }
  
  /**
   * 解密会话元数据
   */
  decryptSessionMetadata(session, encryption) {
    if (!session.metadata) return null;
    
    const enc = encryption.getSessionEncryption(session.id);
    if (!enc) return null;
    
    try {
      const metadataData = CryptoUtils.decodeBase64(session.metadata, 'base64');
      return encryption.decrypt(enc, metadataData);
    } catch (error) {
      return null;
    }
  }
  
  /**
   * 诊断会话
   */
  async diagnoseSession(session, encryption) {
    await this.initializeSessionEncryption(session, encryption);
    
    const metadata = this.decryptSessionMetadata(session, encryption);
    const enc = encryption.getSessionEncryption(session.id);
    
    let agentState = null;
    if (enc && session.agentState) {
      try {
        const agentStateData = CryptoUtils.decodeBase64(session.agentState, 'base64');
        agentState = encryption.decrypt(enc, agentStateData);
      } catch (error) {
        // 忽略解密错误
      }
    }
    
    return {
      sessionId: session.id,
      active: session.active,
      updatedAt: session.updatedAt,
      activeAt: session.activeAt,
      metadata,
      agentState,
      encryptionType: enc ? enc.type : null,
      hasDataEncryptionKey: !!session.dataEncryptionKey
    };
  }
}

module.exports = SessionManager;
