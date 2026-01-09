/**
 * 加密工具函数模块
 */
const crypto = require('crypto');

let sodium = null;

/**
 * 初始化 libsodium
 */
async function initSodium() {
  if (sodium) return sodium;
  const _sodium = require('libsodium-wrappers');
  await _sodium.ready;
  sodium = _sodium;
  return sodium;
}

/**
 * 获取 sodium 实例
 */
function getSodium() {
  if (!sodium) {
    throw new Error('Sodium 未初始化，请先调用 initSodium()');
  }
  return sodium;
}

/**
 * Base64 解码
 */
function decodeBase64(base64, encoding = 'base64') {
  let normalizedBase64 = base64;
  
  if (encoding === 'base64url') {
    normalizedBase64 = base64
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    const padding = normalizedBase64.length % 4;
    if (padding) {
      normalizedBase64 += '='.repeat(4 - padding);
    }
  }
  
  return Buffer.from(normalizedBase64, 'base64');
}

/**
 * Base64 编码
 */
function encodeBase64(buffer, encoding = 'base64') {
  const base64 = Buffer.from(buffer).toString('base64');
  
  if (encoding === 'base64url') {
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
  
  return base64;
}

/**
 * HMAC-SHA512
 */
async function hmacSha512(key, data) {
  const hmac = crypto.createHmac('sha512', key);
  hmac.update(data);
  return hmac.digest();
}

/**
 * 派生密钥树根节点
 */
async function deriveSecretKeyTreeRoot(seed, usage) {
  const I = await hmacSha512(
    Buffer.from(usage + ' Master Seed', 'utf8'),
    seed
  );
  return {
    key: I.slice(0, 32),
    chainCode: I.slice(32)
  };
}

/**
 * 派生密钥树子节点
 */
async function deriveSecretKeyTreeChild(chainCode, index) {
  const data = Buffer.concat([Buffer.from([0x00]), Buffer.from(index, 'utf8')]);
  const I = await hmacSha512(chainCode, data);
  return {
    key: I.slice(0, 32),
    chainCode: I.slice(32)
  };
}

/**
 * 派生密钥
 */
async function deriveKey(master, usage, path) {
  let state = await deriveSecretKeyTreeRoot(master, usage);
  for (const index of path) {
    state = await deriveSecretKeyTreeChild(state.chainCode, index);
  }
  return state.key;
}

/**
 * SecretBox 加密
 */
function encryptSecretBox(data, secret) {
  const _sodium = getSodium();
  const nonce = _sodium.randombytes_buf(_sodium.crypto_secretbox_NONCEBYTES);
  const message = Buffer.from(JSON.stringify(data), 'utf8');
  const encrypted = _sodium.crypto_secretbox_easy(message, nonce, secret);
  
  const result = new Uint8Array(nonce.length + encrypted.length);
  result.set(nonce);
  result.set(encrypted, nonce.length);
  return result;
}

/**
 * SecretBox 解密
 */
function decryptSecretBox(data, secret) {
  const _sodium = getSodium();
  const nonce = data.slice(0, _sodium.crypto_secretbox_NONCEBYTES);
  const encrypted = data.slice(_sodium.crypto_secretbox_NONCEBYTES);
  
  try {
    const decrypted = _sodium.crypto_secretbox_open_easy(encrypted, nonce, secret);
    if (!decrypted) return null;
    return JSON.parse(Buffer.from(decrypted).toString('utf8'));
  } catch (error) {
    return null;
  }
}

/**
 * Box 解密（公钥加密）
 */
function decryptBox(encryptedBundle, recipientSecretKey) {
  const _sodium = getSodium();
  const publicKeyBytes = _sodium.crypto_box_PUBLICKEYBYTES;
  const nonceBytes = _sodium.crypto_box_NONCEBYTES;
  
  const ephemeralPublicKey = encryptedBundle.slice(0, publicKeyBytes);
  const nonce = encryptedBundle.slice(publicKeyBytes, publicKeyBytes + nonceBytes);
  const encrypted = encryptedBundle.slice(publicKeyBytes + nonceBytes);
  
  try {
    const decrypted = _sodium.crypto_box_open_easy(encrypted, nonce, ephemeralPublicKey, recipientSecretKey);
    return decrypted;
  } catch (error) {
    return null;
  }
}

/**
 * AES-256-GCM 加密
 */
function encryptAESGCM(data, keyBuffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
  
  const jsonStr = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(jsonStr, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  // rn-encryption 格式: iv (12) + ciphertext + authTag (16)
  const result = Buffer.concat([iv, encrypted, authTag]);
  
  // 添加版本字节
  const output = new Uint8Array(result.length + 1);
  output[0] = 0;
  output.set(result, 1);
  return output;
}

/**
 * AES-256-GCM 解密
 */
function decryptAESGCM(data, keyBuffer) {
  try {
    if (data[0] !== 0) return null;
    
    const payload = data.slice(1);
    
    // rn-encryption 格式: iv (12) + ciphertext + authTag (16)
    const iv = payload.slice(0, 12);
    const authTag = payload.slice(payload.length - 16);
    const encrypted = payload.slice(12, payload.length - 16);
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch (error) {
    return null;
  }
}

module.exports = {
  initSodium,
  getSodium,
  decodeBase64,
  encodeBase64,
  hmacSha512,
  deriveSecretKeyTreeRoot,
  deriveSecretKeyTreeChild,
  deriveKey,
  encryptSecretBox,
  decryptSecretBox,
  decryptBox,
  encryptAESGCM,
  decryptAESGCM
};
