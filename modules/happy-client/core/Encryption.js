/**
 * 加密管理模块
 * 
 * 提供端到端加密支持，包括：
 * - 会话加密
 * - 机器加密
 * - Artifact 加密
 * - 旧版加密（用于设置等）
 */
const CryptoUtils = require('../utils/CryptoUtils');

class Encryption {
  constructor(masterSecret, contentKeyPair) {
    this.masterSecret = masterSecret;
    this.contentKeyPair = contentKeyPair;
    this.sessionEncryptions = new Map();
    this.machineEncryptions = new Map();
    this.artifactEncryptions = new Map();
  }
  
  /**
   * 创建加密实例
   */
  static async create(masterSecret) {
    await CryptoUtils.initSodium();
    
    const contentDataKey = await CryptoUtils.deriveKey(
      masterSecret, 
      'Happy EnCoder', 
      ['content']
    );
    
    const sodium = CryptoUtils.getSodium();
    const contentKeyPair = sodium.crypto_box_seed_keypair(contentDataKey);
    
    return new Encryption(masterSecret, contentKeyPair);
  }
  
  /**
   * 解密数据加密密钥
   */
  async decryptEncryptionKey(encrypted) {
    const encryptedKey = CryptoUtils.decodeBase64(encrypted, 'base64');
    if (encryptedKey[0] !== 0) return null;
    
    const sodium = CryptoUtils.getSodium();
    const decrypted = CryptoUtils.decryptBox(
      encryptedKey.slice(1), 
      this.contentKeyPair.privateKey,
      sodium
    );
    return decrypted;
  }
  
  // ============================================================================
  // 会话加密
  // ============================================================================
  
  /**
   * 初始化会话加密
   */
  async initializeSession(sessionId, dataEncryptionKey) {
    const encryptor = dataEncryptionKey 
      ? { type: 'aes', key: dataEncryptionKey }
      : { type: 'secretbox', key: this.masterSecret };
    
    this.sessionEncryptions.set(sessionId, encryptor);
  }
  
  /**
   * 获取会话加密器
   */
  getSessionEncryption(sessionId) {
    return this.sessionEncryptions.get(sessionId);
  }
  
  // ============================================================================
  // 机器加密
  // ============================================================================
  
  /**
   * 初始化机器加密
   */
  async initializeMachine(machineId, dataEncryptionKey) {
    const encryptor = dataEncryptionKey 
      ? { type: 'aes', key: dataEncryptionKey }
      : { type: 'secretbox', key: this.masterSecret };
    
    this.machineEncryptions.set(machineId, encryptor);
  }
  
  /**
   * 获取机器加密器
   */
  getMachineEncryption(machineId) {
    return this.machineEncryptions.get(machineId);
  }
  
  // ============================================================================
  // Artifact 加密
  // ============================================================================
  
  /**
   * 初始化 Artifact 加密
   */
  async initializeArtifact(artifactId, dataEncryptionKey) {
    const encryptor = dataEncryptionKey 
      ? { type: 'aes', key: dataEncryptionKey }
      : { type: 'secretbox', key: this.masterSecret };
    
    this.artifactEncryptions.set(artifactId, encryptor);
  }
  
  /**
   * 获取 Artifact 加密器
   */
  getArtifactEncryption(artifactId) {
    return this.artifactEncryptions.get(artifactId);
  }
  
  // ============================================================================
  // 通用加解密
  // ============================================================================
  
  /**
   * 加密数据
   */
  encrypt(encryptor, data) {
    if (encryptor.type === 'aes') {
      return CryptoUtils.encryptAESGCM(data, encryptor.key);
    } else {
      return CryptoUtils.encryptSecretBox(data, encryptor.key);
    }
  }
  
  /**
   * 解密数据
   */
  decrypt(encryptor, data) {
    if (encryptor.type === 'aes') {
      return CryptoUtils.decryptAESGCM(data, encryptor.key);
    } else {
      return CryptoUtils.decryptSecretBox(data, encryptor.key);
    }
  }
  
  // ============================================================================
  // 旧版加密（用于设置等）
  // ============================================================================
  
  /**
   * 使用旧版加密解密（用于设置等）
   */
  decryptLegacy(encrypted) {
    const encryptedData = CryptoUtils.decodeBase64(encrypted, 'base64');
    return CryptoUtils.decryptSecretBox(encryptedData, this.masterSecret);
  }
  
  /**
   * 使用旧版加密加密（用于设置等）
   */
  encryptLegacy(data) {
    const encrypted = CryptoUtils.encryptSecretBox(data, this.masterSecret);
    return CryptoUtils.encodeBase64(encrypted, 'base64');
  }
}

module.exports = Encryption;
