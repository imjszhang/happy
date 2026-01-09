/**
 * 密钥工具函数模块
 */
const CryptoUtils = require('./CryptoUtils');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Base32 转字节
 */
function base32ToBytes(base32) {
  // 标准化输入
  let normalized = base32.toUpperCase()
    .replace(/0/g, 'O')  // Zero to O
    .replace(/1/g, 'I')  // One to I  
    .replace(/8/g, 'B')  // Eight to B
    .replace(/9/g, 'G'); // Nine to G
  
  // 移除所有非 base32 字符
  const cleaned = normalized.replace(/[^A-Z2-7]/g, '');
  
  if (cleaned.length === 0) {
    throw new Error('No valid characters found');
  }
  
  const bytes = [];
  let buffer = 0;
  let bufferLength = 0;

  for (const char of cleaned) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value === -1) {
      throw new Error('Invalid base32 character');
    }

    buffer = (buffer << 5) | value;
    bufferLength += 5;

    if (bufferLength >= 8) {
      bufferLength -= 8;
      bytes.push((buffer >> bufferLength) & 0xff);
    }
  }

  return new Uint8Array(bytes);
}

/**
 * 解析备份 Secret Key
 */
function parseBackupSecretKey(formattedKey) {
  try {
    // 从 base32 转换回字节
    const bytes = base32ToBytes(formattedKey);

    // 确保正好是 32 字节
    if (bytes.length !== 32) {
      throw new Error(`Invalid key length: expected 32 bytes, got ${bytes.length}`);
    }

    // 编码为 base64url
    return CryptoUtils.encodeBase64(Buffer.from(bytes), 'base64url');
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Invalid key length') || 
          error.message.includes('No valid characters found')) {
        throw error;
      }
    }
    throw new Error('Invalid secret key format: ' + error.message);
  }
}

/**
 * 标准化 Secret Key
 */
function normalizeSecretKey(key) {
  // 去除空白字符
  const trimmed = key.trim();
  
  // 检查是否是格式化版本（包含连字符或空格）
  if (/[-\s]/.test(trimmed) || trimmed.length > 50) {
    return parseBackupSecretKey(trimmed);
  }

  // 否则尝试解析为 base64url
  try {
    const bytes = CryptoUtils.decodeBase64(trimmed, 'base64url');
    if (bytes.length !== 32) {
      throw new Error('Invalid secret key');
    }
    return trimmed;
  } catch (error) {
    // 如果 base64 解析失败，尝试解析为格式化密钥
    return parseBackupSecretKey(trimmed);
  }
}

module.exports = {
  base32ToBytes,
  parseBackupSecretKey,
  normalizeSecretKey
};
