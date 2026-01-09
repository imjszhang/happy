/**
 * 认证管理模块
 */
const crypto = require('crypto');
const axios = require('axios');
const CryptoUtils = require('../utils/CryptoUtils');
const KeyUtils = require('../utils/KeyUtils');

class Auth {
  constructor(options = {}) {
    this.options = options;
    this.apiKey = options.apiKey || null;
  }
  
  /**
   * 标准化 Secret Key
   */
  normalizeSecretKey(key) {
    return KeyUtils.normalizeSecretKey(key);
  }
  
  /**
   * 生成挑战签名
   */
  async authChallenge(secret) {
    await CryptoUtils.initSodium();
    const sodium = CryptoUtils.getSodium();
    
    const keypair = sodium.crypto_sign_seed_keypair(secret);
    const challenge = crypto.randomBytes(32);
    const signature = sodium.crypto_sign_detached(challenge, keypair.privateKey);
    
    return { challenge, signature, publicKey: keypair.publicKey };
  }
  
  /**
   * 从 Secret Key 获取 Token
   */
  async getToken(secret, serverUrl) {
    try {
      const { challenge, signature, publicKey } = await this.authChallenge(secret);
      
      // 构建请求头（包含 API Key）
      const headers = {};
      if (this.apiKey) {
        headers['X-API-Key'] = this.apiKey;
      }
      
      const response = await axios.post(`${serverUrl}/v1/auth`, {
        challenge: CryptoUtils.encodeBase64(challenge, 'base64'),
        signature: CryptoUtils.encodeBase64(signature, 'base64'),
        publicKey: CryptoUtils.encodeBase64(publicKey, 'base64')
      }, { headers });
      
      return response.data.token;
    } catch (error) {
      if (error.response) {
        throw new Error(`服务器错误: ${error.response.status} - ${error.response.data?.message || error.response.statusText}`);
      } else if (error.request) {
        throw new Error('无法连接到服务器，请检查网络连接');
      } else {
        throw new Error(`请求失败: ${error.message}`);
      }
    }
  }
}

module.exports = Auth;
