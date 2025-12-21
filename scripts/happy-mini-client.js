/**
 * HappyMiniClient - Happy Coder 完整命令行客户端
 * 
 * > 创建时间: 2025-12-20
 * > 最后更新: 2025-12-21
 * > 当前版本: 2.0.0
 * 
 * 功能简介：
 * ==========
 * HappyMiniClient 是一个独立的 Node.js 脚本，用于与 happy-server 交互。
 * 支持完整的账户管理、会话操作、数据同步等功能。
 * 
 * 支持的功能：
 * -----------
 * - 会话管理 - 查看会话列表、消息、发送消息、删除会话
 * - 账户管理 - 查看/修改资料和设置
 * - 机器管理 - 查看 CLI 实例列表和状态
 * - 使用量统计 - 查询 Token 使用量和费用
 * - Artifacts - 创建、查看、更新、删除制品
 * - KV 存储 - 键值对存储操作
 * - 社交功能 - 好友列表、用户搜索、动态 Feed
 * - 服务连接 - 管理第三方服务连接状态
 * 
 * 主要功能：
 * ---------
 * 1. 从 Secret Key 自动恢复 Token 认证
 * 2. 端到端加密的数据读写
 * 3. WebSocket 实时消息同步
 * 4. 命令行模式快速操作
 * 5. 交互式菜单导航
 * 
 * 使用方法：
 * ---------
 * ```bash
 * # 基本使用
 * node scripts/happy-mini-client.js --secret=YOUR_SECRET
 * 
 * # 指定服务器和模式
 * node scripts/happy-mini-client.js --secret=xxx --server=URL --mode=yolo
 * 
 * # 交互式命令
 * > profile          # 查看账户资料
 * > settings         # 查看账户设置
 * > machines         # 查看机器列表
 * > usage            # 查看使用量统计
 * > help             # 显示帮助
 * ```
 * 
 * 返回数据格式：
 * -------------
 * 所有加密数据使用 AES-256-GCM 或 libsodium SecretBox 解密
 * - 会话数据：metadata, agentState (加密)
 * - 消息内容：role, content (加密)
 * - 设置数据：key-value pairs (加密)
 * 
 * CHANGELOG：
 * ==========
 * 
 * ## [2.0.0] - 2025-12-21
 * 
 * ### 新增
 * - ✨ 账户资料查看功能
 * - ✨ 账户设置查看/修改功能
 * - ✨ 机器列表查看功能
 * - ✨ 使用量统计查询功能
 * - ✨ Artifacts 完整 CRUD 功能
 * - ✨ KV 存储操作功能
 * - ✨ 好友列表和用户搜索功能
 * - ✨ 动态 Feed 查看功能
 * - ✨ 会话删除功能
 * - ✨ 服务连接管理功能
 * - ✨ 命令行模式交互
 * 
 * ## [1.0.0] - 2025-12-20
 * 
 * ### 新增
 * - ✨ 初始版本：会话列表、消息查看、发送消息
 * 
 * 版本说明：
 * ---------
 * - **主版本号** (x.0.0): 不兼容的 API 变更
 * - **次版本号** (0.x.0): 新增功能，向后兼容
 * - **修订号** (0.0.x): 问题修复和小改进
 */

const crypto = require('crypto');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// ============================================================================
// 加载 .env 文件
// ============================================================================

function loadEnvFile() {
    // 查找 .env 文件: 先在项目根目录，再在脚本目录
    const possiblePaths = [
        path.join(__dirname, '..', '.env'),      // 项目根目录
        path.join(__dirname, '.env'),             // scripts 目录
        path.join(process.cwd(), '.env')          // 当前工作目录
    ];
    
    for (const envPath of possiblePaths) {
        if (fs.existsSync(envPath)) {
            try {
                const content = fs.readFileSync(envPath, 'utf8');
                const lines = content.split('\n');
                
                for (const line of lines) {
                    // 跳过空行和注释
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith('#')) continue;
                    
                    // 解析 KEY=VALUE
                    const match = trimmed.match(/^([^=]+)=(.*)$/);
                    if (match) {
                        const key = match[1].trim();
                        let value = match[2].trim();
                        
                        // 移除行内注释（# 后面的内容）
                        const commentIndex = value.indexOf(' #');
                        if (commentIndex !== -1) {
                            value = value.substring(0, commentIndex).trim();
                        }
                        
                        // 移除引号
                        if ((value.startsWith('"') && value.endsWith('"')) ||
                            (value.startsWith("'") && value.endsWith("'"))) {
                            value = value.slice(1, -1);
                        }
                        
                        // 只在环境变量未设置时才使用 .env 的值
                        if (!process.env[key]) {
                            process.env[key] = value;
                        }
                    }
                }
                
                console.log(`📁 已加载 .env 文件: ${envPath}`);
                return true;
            } catch (error) {
                // 忽略读取错误
            }
        }
    }
    return false;
}

// 加载 .env 文件
loadEnvFile();

// ============================================================================
// 配置
// ============================================================================

const DEFAULT_SERVER_URL = 'https://api.cluster-fluster.com';

// 解析命令行参数
function parseArgs() {
    const args = {};
    process.argv.slice(2).forEach(arg => {
        if (arg.startsWith('--')) {
            const [key, value] = arg.slice(2).split('=');
            args[key] = value || true;
        }
    });
    return args;
}

const args = parseArgs();
const TOKEN = args.token || process.env.HAPPY_TOKEN;
const SECRET = args.secret || process.env.HAPPY_SECRET;
const SERVER_URL = args.server || process.env.HAPPY_SERVER_URL || DEFAULT_SERVER_URL;
const AUTO_DIAGNOSE = args.diagnose;  // --diagnose=sessionId
const AUTO_TEST = args.test;  // --test=sessionId  (发送测试消息)

// ============================================================================
// 权限模式配置
// ============================================================================

// 有效的权限模式列表
// Claude Code 模式: default, acceptEdits, plan, bypassPermissions
// Codex 模式: default, read-only, safe-yolo, yolo
const VALID_MODES = ['default', 'acceptEdits', 'plan', 'bypassPermissions', 'read-only', 'safe-yolo', 'yolo'];

// 模式显示名称映射
const MODE_DISPLAY_NAMES = {
    'default': '默认',
    'acceptEdits': '接受编辑',
    'plan': '计划模式',
    'bypassPermissions': '跳过权限',
    'read-only': '只读',
    'safe-yolo': 'Safe YOLO',
    'yolo': 'YOLO'
};

// 当前权限模式（可通过命令行、环境变量或运行时切换）
let currentPermissionMode = args.mode || process.env.HAPPY_MODE || 'default';

// 验证模式是否有效
if (!VALID_MODES.includes(currentPermissionMode)) {
    console.error(`❌ 无效的模式: ${currentPermissionMode}`);
    console.log(`有效模式: ${VALID_MODES.join(', ')}`);
    process.exit(1);
}

// ============================================================================
// Base64 编解码
// ============================================================================

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

// ============================================================================
// HMAC-SHA512 密钥派生 (参考 sources/encryption/deriveKey.ts)
// ============================================================================

async function hmacSha512(key, data) {
    const hmac = crypto.createHmac('sha512', key);
    hmac.update(data);
    return hmac.digest();
}

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

async function deriveSecretKeyTreeChild(chainCode, index) {
    const data = Buffer.concat([Buffer.from([0x00]), Buffer.from(index, 'utf8')]);
    const I = await hmacSha512(chainCode, data);
    return {
        key: I.slice(0, 32),
        chainCode: I.slice(32)
    };
}

async function deriveKey(master, usage, path) {
    let state = await deriveSecretKeyTreeRoot(master, usage);
    for (const index of path) {
        state = await deriveSecretKeyTreeChild(state.chainCode, index);
    }
    return state.key;
}

// ============================================================================
// Secret Key 标准化 (参考 sources/auth/secretKeyBackup.ts)
// ============================================================================

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

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

function parseBackupSecretKey(formattedKey) {
    try {
        // 从 base32 转换回字节
        const bytes = base32ToBytes(formattedKey);

        // 确保正好是 32 字节
        if (bytes.length !== 32) {
            throw new Error(`Invalid key length: expected 32 bytes, got ${bytes.length}`);
        }

        // 编码为 base64url
        return encodeBase64(Buffer.from(bytes), 'base64url');
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

function normalizeSecretKey(key) {
    // 去除空白字符
    const trimmed = key.trim();
    
    // 检查是否是格式化版本（包含连字符或空格）
    if (/[-\s]/.test(trimmed) || trimmed.length > 50) {
        return parseBackupSecretKey(trimmed);
    }

    // 否则尝试解析为 base64url
    try {
        const bytes = decodeBase64(trimmed, 'base64url');
        if (bytes.length !== 32) {
            throw new Error('Invalid secret key');
        }
        return trimmed;
    } catch (error) {
        // 如果 base64 解析失败，尝试解析为格式化密钥
        return parseBackupSecretKey(trimmed);
    }
}

// ============================================================================
// libsodium 加密 (SecretBox) - 需要 libsodium-wrappers
// ============================================================================

let sodium = null;

async function initSodium() {
    if (sodium) return sodium;
    const _sodium = require('libsodium-wrappers');
    await _sodium.ready;
    sodium = _sodium;
    return sodium;
}

// SecretBox 加密 (参考 sources/encryption/libsodium.ts)
function encryptSecretBox(data, secret) {
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    const message = Buffer.from(JSON.stringify(data), 'utf8');
    const encrypted = sodium.crypto_secretbox_easy(message, nonce, secret);
    
    const result = new Uint8Array(nonce.length + encrypted.length);
    result.set(nonce);
    result.set(encrypted, nonce.length);
    return result;
}

function decryptSecretBox(data, secret) {
    const nonce = data.slice(0, sodium.crypto_secretbox_NONCEBYTES);
    const encrypted = data.slice(sodium.crypto_secretbox_NONCEBYTES);
    
    try {
        const decrypted = sodium.crypto_secretbox_open_easy(encrypted, nonce, secret);
        if (!decrypted) return null;
        return JSON.parse(Buffer.from(decrypted).toString('utf8'));
    } catch (error) {
        return null;
    }
}

// Box 加密 (公钥加密)
function encryptBox(data, recipientPublicKey, senderSecretKey) {
    const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
    const message = Buffer.from(JSON.stringify(data), 'utf8');
    const encrypted = sodium.crypto_box_easy(message, nonce, recipientPublicKey, senderSecretKey);
    
    // 格式: ephemeralPublicKey + nonce + encrypted
    const ephemeralKeypair = sodium.crypto_box_keypair();
    const result = new Uint8Array(sodium.crypto_box_PUBLICKEYBYTES + nonce.length + encrypted.length);
    result.set(ephemeralKeypair.publicKey);
    result.set(nonce, sodium.crypto_box_PUBLICKEYBYTES);
    result.set(encrypted, sodium.crypto_box_PUBLICKEYBYTES + nonce.length);
    return result;
}

function decryptBox(encryptedBundle, recipientSecretKey) {
    const publicKeyBytes = sodium.crypto_box_PUBLICKEYBYTES;
    const nonceBytes = sodium.crypto_box_NONCEBYTES;
    
    const ephemeralPublicKey = encryptedBundle.slice(0, publicKeyBytes);
    const nonce = encryptedBundle.slice(publicKeyBytes, publicKeyBytes + nonceBytes);
    const encrypted = encryptedBundle.slice(publicKeyBytes + nonceBytes);
    
    try {
        const decrypted = sodium.crypto_box_open_easy(encrypted, nonce, ephemeralPublicKey, recipientSecretKey);
        return decrypted;
    } catch (error) {
        return null;
    }
}

// ============================================================================
// AES-256-GCM 加密 (参考 sources/encryption/aes.ts)
// ============================================================================

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

function decryptAESGCM(data, keyBuffer) {
    try {
        if (data[0] !== 0) return null;
        
        const payload = data.slice(1);
        
        // rn-encryption 格式: iv (12) + ciphertext + authTag (16)
        const iv = payload.slice(0, 12);
        const authTag = payload.slice(payload.length - 16);  // 最后 16 字节是 authTag
        const encrypted = payload.slice(12, payload.length - 16);  // 中间是密文
        
        const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
        decipher.setAuthTag(authTag);
        
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return JSON.parse(decrypted.toString('utf8'));
    } catch (error) {
        return null;
    }
}

// ============================================================================
// 加密管理器
// ============================================================================

class Encryption {
    constructor(masterSecret, contentKeyPair) {
        this.masterSecret = masterSecret;
        this.contentKeyPair = contentKeyPair;
        this.sessionEncryptions = new Map();
        this.machineEncryptions = new Map();
        this.artifactEncryptions = new Map();
    }

    static async create(masterSecret) {
        await initSodium();
        
        // 派生 content data key
        const contentDataKey = await deriveKey(masterSecret, 'Happy EnCoder', ['content']);
        
        // 生成密钥对
        const contentKeyPair = sodium.crypto_box_seed_keypair(contentDataKey);
        
        return new Encryption(masterSecret, contentKeyPair);
    }

    // 解密数据加密密钥
    async decryptEncryptionKey(encrypted) {
        const encryptedKey = decodeBase64(encrypted, 'base64');
        if (encryptedKey[0] !== 0) return null;
        
        const decrypted = decryptBox(encryptedKey.slice(1), this.contentKeyPair.privateKey);
        return decrypted;
    }

    // 初始化会话加密
    async initializeSession(sessionId, dataEncryptionKey) {
        const encryptor = dataEncryptionKey 
            ? { type: 'aes', key: dataEncryptionKey }
            : { type: 'secretbox', key: this.masterSecret };
        
        this.sessionEncryptions.set(sessionId, encryptor);
    }

    // 初始化机器加密
    async initializeMachine(machineId, dataEncryptionKey) {
        const encryptor = dataEncryptionKey 
            ? { type: 'aes', key: dataEncryptionKey }
            : { type: 'secretbox', key: this.masterSecret };
        
        this.machineEncryptions.set(machineId, encryptor);
    }

    // 初始化 Artifact 加密
    async initializeArtifact(artifactId, dataEncryptionKey) {
        const encryptor = dataEncryptionKey 
            ? { type: 'aes', key: dataEncryptionKey }
            : { type: 'secretbox', key: this.masterSecret };
        
        this.artifactEncryptions.set(artifactId, encryptor);
    }

    // 获取会话加密器
    getSessionEncryption(sessionId) {
        return this.sessionEncryptions.get(sessionId);
    }

    // 获取机器加密器
    getMachineEncryption(machineId) {
        return this.machineEncryptions.get(machineId);
    }

    // 获取 Artifact 加密器
    getArtifactEncryption(artifactId) {
        return this.artifactEncryptions.get(artifactId);
    }

    // 加密数据
    encrypt(encryptor, data) {
        if (encryptor.type === 'aes') {
            return encryptAESGCM(data, encryptor.key);
        } else {
            return encryptSecretBox(data, encryptor.key);
        }
    }

    // 解密数据
    decrypt(encryptor, data) {
        if (encryptor.type === 'aes') {
            return decryptAESGCM(data, encryptor.key);
        } else {
            return decryptSecretBox(data, encryptor.key);
        }
    }

    // 使用旧版加密解密 (用于设置等)
    decryptLegacy(encrypted) {
        const encryptedData = decodeBase64(encrypted, 'base64');
        return decryptSecretBox(encryptedData, this.masterSecret);
    }

    // 使用旧版加密加密
    encryptLegacy(data) {
        const encrypted = encryptSecretBox(data, this.masterSecret);
        return encodeBase64(encrypted, 'base64');
    }
}

// ============================================================================
// 从 Secret Key 恢复 Token (参考 sources/auth/authGetToken.ts)
// ============================================================================

/**
 * 生成挑战签名 (参考 sources/auth/authChallenge.ts)
 */
async function authChallenge(secret) {
    await initSodium();
    
    // 使用 secret 作为种子生成 Ed25519 密钥对
    const keypair = sodium.crypto_sign_seed_keypair(secret);
    
    // 生成随机挑战（32字节）
    const challenge = crypto.randomBytes(32);
    
    // 使用私钥签名挑战
    const signature = sodium.crypto_sign_detached(challenge, keypair.privateKey);
    
    return { challenge, signature, publicKey: keypair.publicKey };
}

/**
 * 从 Secret Key 获取 Token (参考 sources/auth/authGetToken.ts)
 */
async function authGetToken(secret, serverUrl) {
    try {
        // 生成挑战签名
        const { challenge, signature, publicKey } = await authChallenge(secret);
        
        // 发送到服务器验证
        const response = await axios.post(`${serverUrl}/v1/auth`, {
            challenge: encodeBase64(challenge, 'base64'),
            signature: encodeBase64(signature, 'base64'),
            publicKey: encodeBase64(publicKey, 'base64')
        });
        
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

// ============================================================================
// HTTP API - 基础
// ============================================================================

async function fetchSessions(token) {
    const response = await fetch(`${SERVER_URL}/v1/sessions`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    
    if (!response.ok) {
        throw new Error(`获取会话失败: ${response.status}`);
    }
    
    return response.json();
}

async function fetchMessages(token, sessionId) {
    const response = await fetch(`${SERVER_URL}/v1/sessions/${sessionId}/messages`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    
    if (!response.ok) {
        throw new Error(`获取消息失败: ${response.status}`);
    }
    
    return response.json();
}

// ============================================================================
// HTTP API - 账户资料
// ============================================================================

async function fetchProfile(token) {
    const response = await fetch(`${SERVER_URL}/v1/account/profile`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    
    if (!response.ok) {
        throw new Error(`获取账户资料失败: ${response.status}`);
    }
    
    return response.json();
}

// ============================================================================
// HTTP API - 账户设置
// ============================================================================

async function fetchSettings(token) {
    const response = await fetch(`${SERVER_URL}/v1/account/settings`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    
    if (!response.ok) {
        throw new Error(`获取账户设置失败: ${response.status}`);
    }
    
    return response.json();
}

async function updateSettings(token, settings, version) {
    const response = await fetch(`${SERVER_URL}/v1/account/settings`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            settings: settings,
            version: version
        })
    });
    
    if (!response.ok) {
        throw new Error(`更新账户设置失败: ${response.status}`);
    }
    
    return response.json();
}

// ============================================================================
// HTTP API - 机器列表
// ============================================================================

async function fetchMachines(token) {
    const response = await fetch(`${SERVER_URL}/v1/machines`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    
    if (!response.ok) {
        throw new Error(`获取机器列表失败: ${response.status}`);
    }
    
    return response.json();
}

// ============================================================================
// HTTP API - 使用量统计
// ============================================================================

async function queryUsage(token, params = {}) {
    const response = await fetch(`${SERVER_URL}/v1/usage/query`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
    });
    
    if (!response.ok) {
        throw new Error(`查询使用量失败: ${response.status}`);
    }
    
    return response.json();
}

// ============================================================================
// HTTP API - Artifacts
// ============================================================================

async function fetchArtifacts(token) {
    const response = await fetch(`${SERVER_URL}/v1/artifacts`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    
    if (!response.ok) {
        throw new Error(`获取 Artifacts 失败: ${response.status}`);
    }
    
    return response.json();
}

async function fetchArtifact(token, artifactId) {
    const response = await fetch(`${SERVER_URL}/v1/artifacts/${artifactId}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    
    if (!response.ok) {
        if (response.status === 404) {
            throw new Error('Artifact 不存在');
        }
        throw new Error(`获取 Artifact 失败: ${response.status}`);
    }
    
    return response.json();
}

async function createArtifact(token, data) {
    const response = await fetch(`${SERVER_URL}/v1/artifacts`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });
    
    if (!response.ok) {
        throw new Error(`创建 Artifact 失败: ${response.status}`);
    }
    
    return response.json();
}

async function updateArtifact(token, artifactId, data) {
    const response = await fetch(`${SERVER_URL}/v1/artifacts/${artifactId}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });
    
    if (!response.ok) {
        throw new Error(`更新 Artifact 失败: ${response.status}`);
    }
    
    return response.json();
}

async function deleteArtifact(token, artifactId) {
    const response = await fetch(`${SERVER_URL}/v1/artifacts/${artifactId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    
    if (!response.ok) {
        throw new Error(`删除 Artifact 失败: ${response.status}`);
    }
}

// ============================================================================
// HTTP API - KV 存储
// ============================================================================

async function kvList(token, params = {}) {
    const queryParams = new URLSearchParams();
    if (params.prefix) queryParams.append('prefix', params.prefix);
    if (params.limit) queryParams.append('limit', params.limit.toString());
    
    const url = queryParams.toString()
        ? `${SERVER_URL}/v1/kv?${queryParams.toString()}`
        : `${SERVER_URL}/v1/kv`;
    
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    
    if (!response.ok) {
        throw new Error(`获取 KV 列表失败: ${response.status}`);
    }
    
    return response.json();
}

async function kvGet(token, key) {
    const response = await fetch(`${SERVER_URL}/v1/kv/${encodeURIComponent(key)}`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    
    if (response.status === 404) {
        return null;
    }
    
    if (!response.ok) {
        throw new Error(`获取 KV 值失败: ${response.status}`);
    }
    
    return response.json();
}

async function kvMutate(token, mutations) {
    const response = await fetch(`${SERVER_URL}/v1/kv`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ mutations })
    });
    
    if (!response.ok && response.status !== 409) {
        throw new Error(`KV 操作失败: ${response.status}`);
    }
    
    return response.json();
}

// ============================================================================
// HTTP API - 好友系统
// ============================================================================

async function fetchFriends(token) {
    const response = await fetch(`${SERVER_URL}/v1/friends`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    
    if (!response.ok) {
        throw new Error(`获取好友列表失败: ${response.status}`);
    }
    
    return response.json();
}

async function searchUsers(token, query) {
    const response = await fetch(`${SERVER_URL}/v1/user/search?${new URLSearchParams({ query })}`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    
    if (!response.ok) {
        if (response.status === 404) {
            return { users: [] };
        }
        throw new Error(`搜索用户失败: ${response.status}`);
    }
    
    return response.json();
}

async function fetchUser(token, userId) {
    const response = await fetch(`${SERVER_URL}/v1/user/${userId}`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    
    if (response.status === 404) {
        return null;
    }
    
    if (!response.ok) {
        throw new Error(`获取用户资料失败: ${response.status}`);
    }
    
    return response.json();
}

async function addFriend(token, userId) {
    const response = await fetch(`${SERVER_URL}/v1/friends/add`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ uid: userId })
    });
    
    if (!response.ok) {
        throw new Error(`添加好友失败: ${response.status}`);
    }
    
    return response.json();
}

async function removeFriend(token, userId) {
    const response = await fetch(`${SERVER_URL}/v1/friends/remove`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ uid: userId })
    });
    
    if (!response.ok) {
        throw new Error(`移除好友失败: ${response.status}`);
    }
    
    return response.json();
}

// ============================================================================
// HTTP API - Feed 动态
// ============================================================================

async function fetchFeed(token, options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', options.limit.toString());
    if (options.before) params.set('before', options.before);
    if (options.after) params.set('after', options.after);
    
    const url = `${SERVER_URL}/v1/feed${params.toString() ? `?${params}` : ''}`;
    
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    
    if (!response.ok) {
        throw new Error(`获取 Feed 失败: ${response.status}`);
    }
    
    return response.json();
}

// ============================================================================
// HTTP API - 会话删除
// ============================================================================

async function deleteSession(token, sessionId) {
    const response = await fetch(`${SERVER_URL}/v1/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    
    if (!response.ok) {
        throw new Error(`删除会话失败: ${response.status}`);
    }
    
    return response.json();
}

// ============================================================================
// HTTP API - 服务连接
// ============================================================================

async function disconnectService(token, service) {
    const response = await fetch(`${SERVER_URL}/v1/connect/${service}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    
    if (!response.ok) {
        throw new Error(`断开服务失败: ${response.status}`);
    }
}

// 获取当前 Token（从 main 函数中设置）
let CURRENT_TOKEN = null;

// ============================================================================
// WebSocket 连接
// ============================================================================

let socket = null;
let currentChatSessionId = null;  // 当前对话会话ID
let chatModeRl = null;  // 对话模式的 readline 接口

// ============================================================================
// 消息文本提取工具函数
// ============================================================================

function extractMessageText(decrypted) {
    // 处理用户消息 (role: 'user')
    if (decrypted.role === 'user') {
        if (typeof decrypted.content === 'string') return decrypted.content;
        if (decrypted.content?.text) return decrypted.content.text;
        if (decrypted.content?.type === 'text') return decrypted.content.text;
        return JSON.stringify(decrypted.content).substring(0, 200);
    }
    
    // 处理 agent 消息 (role: 'agent')
    if (decrypted.role === 'agent') {
        const content = decrypted.content;
        
        // 处理 codex 格式
        if (content?.type === 'codex') {
            if (content.data?.type === 'message' || content.data?.type === 'reasoning') {
                return content.data.message;
            }
            if (content.data?.type === 'tool-call') {
                return `[工具调用: ${content.data.name || 'unknown'}]`;
            }
            if (content.data?.type === 'tool-call-result') {
                return `[工具结果]`;
            }
        }
        
        // 处理 output 格式
        if (content?.type === 'output') {
            const data = content.data;
            
            // assistant 消息
            if (data?.type === 'assistant' && data.message?.content) {
                const parts = data.message.content.map(part => {
                    if (part.type === 'text') return part.text;
                    if (part.type === 'tool_use') return `[工具调用: ${part.name}]`;
                    if (part.type === 'tool_result') return `[工具结果]`;
                    return null;
                }).filter(Boolean);
                return parts.join('\n') || '[助手消息]';
            }
            
            // user/tool result 消息
            if (data?.type === 'user' && data.message?.content) {
                if (typeof data.message.content === 'string') {
                    return data.message.content;
                }
                if (Array.isArray(data.message.content)) {
                    const parts = data.message.content.map(part => {
                        if (part.type === 'text') return part.text;
                        if (part.type === 'tool_result') return `[工具结果]`;
                        return null;
                    }).filter(Boolean);
                    return parts.join('\n') || '[工具结果]';
                }
            }
            
            // summary 消息
            if (data?.type === 'summary') {
                return data.summary;
            }
        }
        
        // 处理 event 格式
        if (content?.type === 'event') {
            const event = content.data;
            if (event?.type === 'switch') {
                return `[模式切换: ${event.mode}]`;
            }
            if (event?.type === 'message') {
                return event.message;
            }
            if (event?.type === 'ready') {
                return '[Agent 就绪]';
            }
            return `[事件: ${event?.type || 'unknown'}]`;
        }
    }
    
    // 兼容旧格式
    if (typeof decrypted.content === 'string') return decrypted.content;
    if (decrypted.content?.text) return decrypted.content.text;
    if (decrypted.content?.type === 'text') return decrypted.content.text;
    if (Array.isArray(decrypted.content)) {
        const parts = decrypted.content.map(part => {
            if (part.type === 'text') return part.text;
            if (part.type === 'tool_use') return `[工具调用: ${part.name}]`;
            if (part.type === 'tool_result') return `[工具结果]`;
            return `[${part.type}]`;
        }).filter(Boolean);
        return parts.join('\n') || '[复杂内容]';
    }
    return JSON.stringify(decrypted.content).substring(0, 200);
}

// 处理对话模式下收到的 WebSocket 更新
function handleChatModeUpdate(data) {
    try {
        // 数据结构: { id, seq, body: { t: 'new-message', sid, message }, createdAt }
        const body = data.body;
        if (!body || body.t !== 'new-message') return;
        
        const message = body.message;
        if (!message || message.content?.t !== 'encrypted') return;
        
        const enc = encryption.getSessionEncryption(currentChatSessionId);
        if (!enc) return;
        
        const encryptedData = decodeBase64(message.content.c, 'base64');
        const decrypted = encryption.decrypt(enc, encryptedData);
        
        if (decrypted) {
            const role = decrypted.role || 'unknown';
            
            // 只显示 agent 的回复（用户消息是自己发的，不需要显示）
            if (role === 'agent') {
                // 跳过 meta 消息和 sidechain 消息
                const content = decrypted.content;
                if (content?.type === 'output' && (content.data?.isMeta || content.data?.isSidechain)) {
                    return;
                }
                
                const text = extractMessageText(decrypted);
                if (!text || text.startsWith('[事件:') || text === '[Agent 就绪]') {
                    return; // 跳过事件类消息
                }
                
                const time = new Date().toLocaleTimeString();
                
                // 清除当前行并显示消息
                process.stdout.write('\r' + ' '.repeat(50) + '\r');
                console.log(`\n🤖 [${time}] ${text}`);
                
                // 恢复提示符
                if (chatModeRl) {
                    process.stdout.write('> ');
                }
            }
        }
    } catch (error) {
        // 静默处理解密错误
    }
}

async function connectWebSocket(token) {
    const { io } = require('socket.io-client');
    
    return new Promise((resolve, reject) => {
        socket = io(SERVER_URL, {
            path: '/v1/updates',
            auth: {
                token: token,
                clientType: 'user-scoped'
            },
            transports: ['websocket'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: Infinity
        });

        socket.on('connect', () => {
            console.log('✅ WebSocket 已连接');
            resolve(socket);
        });

        socket.on('disconnect', (reason) => {
            console.log('❌ WebSocket 断开:', reason);
        });

        socket.on('connect_error', (error) => {
            console.error('❌ WebSocket 连接错误:', error.message);
            reject(error);
        });

        socket.on('update', (data) => {
            const sessionId = data.body?.sid || data.body?.id;
            
            if (currentChatSessionId && sessionId === currentChatSessionId) {
                handleChatModeUpdate(data);
            }
        });

        socket.on('ephemeral', (data) => {
            // 静默处理 ephemeral 更新 (心跳等)
        });
    });
}

async function sendMessage(sessionId, encryptedMessage, localId, permissionMode = 'default') {
    if (!socket) {
        console.error('WebSocket 未连接');
        return;
    }
    
    socket.emit('message', {
        sid: sessionId,
        message: encryptedMessage,
        localId: localId,
        sentFrom: 'mini-client',
        permissionMode: permissionMode
    });
}

// ============================================================================
// 命令行界面 - 全局状态
// ============================================================================

let encryption = null;
let sessions = {};
let machines = {};
let cachedProfile = null;
let cachedSettings = null;
let cachedSettingsVersion = null;

// ============================================================================
// 显示函数 - 会话
// ============================================================================

async function displaySessions() {
    console.log('\n📋 获取会话列表...');
    
    try {
        const data = await fetchSessions(CURRENT_TOKEN);
        sessions = {};
        
        console.log('\n=== 会话列表 ===\n');
        
        if (!data.sessions || data.sessions.length === 0) {
            console.log('(暂无会话)');
            return;
        }
        
        for (const session of data.sessions) {
            sessions[session.id] = session;
            
            // 初始化会话加密
            if (session.dataEncryptionKey) {
                const decryptedKey = await encryption.decryptEncryptionKey(session.dataEncryptionKey);
                await encryption.initializeSession(session.id, decryptedKey);
            } else {
                await encryption.initializeSession(session.id, null);
            }
            
            // 解密元数据
            let metadata = null;
            if (session.metadata) {
                const enc = encryption.getSessionEncryption(session.id);
                const metadataData = decodeBase64(session.metadata, 'base64');
                metadata = encryption.decrypt(enc, metadataData);
            }
            
            const projectName = (metadata?.path ?? metadata?.cwd)?.split(/[/\\]/).pop() || '未知项目';
            const status = session.active ? '🟢 在线' : '⚪ 离线';
            const date = new Date(session.updatedAt).toLocaleString();
            
            console.log(`${status} [${session.id.substring(0, 8)}...] ${projectName}`);
            console.log(`   更新于: ${date}`);
            console.log('');
        }
    } catch (error) {
        console.error('获取会话失败:', error.message);
    }
}

async function displaySessionsWithIndex() {
    console.log('\n📋 获取会话列表...');
    
    try {
        const data = await fetchSessions(CURRENT_TOKEN);
        sessions = {};
        const indexMap = {};
        
        if (!data.sessions || data.sessions.length === 0) {
            console.log('(暂无会话)');
            return indexMap;
        }
        
        const sorted = [...data.sessions].sort((a, b) => {
            if (a.active !== b.active) return b.active - a.active;
            return new Date(b.updatedAt) - new Date(a.updatedAt);
        });
        
        console.log('\n=== 选择会话 ===\n');
        
        for (let i = 0; i < sorted.length; i++) {
            const session = sorted[i];
            sessions[session.id] = session;
            
            if (session.dataEncryptionKey) {
                const decryptedKey = await encryption.decryptEncryptionKey(session.dataEncryptionKey);
                await encryption.initializeSession(session.id, decryptedKey);
            } else {
                await encryption.initializeSession(session.id, null);
            }
            
            let metadata = null;
            if (session.metadata) {
                const enc = encryption.getSessionEncryption(session.id);
                const metadataData = decodeBase64(session.metadata, 'base64');
                metadata = encryption.decrypt(enc, metadataData);
            }
            
            const idx = i + 1;
            indexMap[idx] = session.id;
            
            const projectName = (metadata?.path ?? metadata?.cwd)?.split(/[/\\]/).pop() || '未知项目';
            const status = session.active ? '🟢' : '⚪';
            const date = new Date(session.updatedAt).toLocaleString();
            
            console.log(`[${idx}] ${status} ${projectName}`);
            console.log(`    ID: ${session.id.substring(0, 8)}... | 更新: ${date}`);
        }
        
        console.log('');
        return indexMap;
    } catch (error) {
        console.error('获取会话失败:', error.message);
        return {};
    }
}

async function displayMessages(sessionId) {
    const fullId = Object.keys(sessions).find(id => id.startsWith(sessionId)) || sessionId;
    
    if (!sessions[fullId]) {
        console.log('❌ 会话不存在，请先执行 sessions 命令');
        return;
    }
    
    console.log(`\n📨 获取会话 ${fullId.substring(0, 8)}... 的消息...`);
    
    try {
        const data = await fetchMessages(CURRENT_TOKEN, fullId);
        const enc = encryption.getSessionEncryption(fullId);
        
        console.log('\n=== 消息列表 ===\n');
        
        if (!data.messages || data.messages.length === 0) {
            console.log('(暂无消息)');
            return;
        }
        
        const recentMessages = data.messages.slice(-10);
        
        for (const msg of recentMessages) {
            if (msg.content?.t === 'encrypted') {
                const encryptedData = decodeBase64(msg.content.c, 'base64');
                const decrypted = encryption.decrypt(enc, encryptedData);
                
                if (decrypted) {
                    const role = decrypted.role || 'unknown';
                    
                    if (role === 'agent') {
                        const content = decrypted.content;
                        if (content?.type === 'event') continue;
                        if (content?.type === 'output' && (content.data?.isMeta || content.data?.isSidechain || content.data?.isCompactSummary)) {
                            continue;
                        }
                    }
                    
                    const roleIcon = role === 'user' ? '👤' : role === 'agent' ? '🤖' : '📝';
                    const date = new Date(msg.createdAt).toLocaleTimeString();
                    
                    let text = extractMessageText(decrypted);
                    
                    if (text.length > 200) {
                        text = text.substring(0, 200) + '...';
                    }
                    
                    console.log(`${roleIcon} [${date}] ${text}`);
                    console.log('');
                }
            }
        }
    } catch (error) {
        console.error('获取消息失败:', error.message);
    }
}

async function sendUserMessage(sessionId, text, permissionMode = null) {
    const fullId = Object.keys(sessions).find(id => id.startsWith(sessionId)) || sessionId;
    
    if (!sessions[fullId]) {
        console.log('❌ 会话不存在，请先执行 sessions 命令');
        return;
    }
    
    const enc = encryption.getSessionEncryption(fullId);
    if (!enc) {
        console.log('❌ 会话加密未初始化');
        return;
    }
    
    const mode = permissionMode || currentPermissionMode;
    
    const content = {
        role: 'user',
        content: {
            type: 'text',
            text: text
        },
        meta: {
            sentFrom: 'mini-client',
            permissionMode: mode
        }
    };
    
    const encrypted = encryption.encrypt(enc, content);
    const encryptedBase64 = encodeBase64(encrypted, 'base64');
    const localId = crypto.randomUUID();
    
    await sendMessage(fullId, encryptedBase64, localId, mode);

    const modeDisplay = MODE_DISPLAY_NAMES[mode] || mode;
    console.log(`✅ 消息已发送到会话 ${fullId.substring(0, 8)}... [模式: ${modeDisplay}]`);
}

// ============================================================================
// 显示函数 - 账户
// ============================================================================

async function displayProfile() {
    console.log('\n👤 获取账户资料...');
    
    try {
        const profile = await fetchProfile(CURRENT_TOKEN);
        cachedProfile = profile;
        
        console.log('\n=== 账户资料 ===\n');
        console.log(`用户 ID: ${profile.id}`);
        console.log(`名字: ${profile.firstName || '(未设置)'}`);
        console.log(`姓氏: ${profile.lastName || '(未设置)'}`);
        console.log(`头像: ${profile.avatar?.url ? '✓ 已设置' : '✗ 未设置'}`);
        
        if (profile.github) {
            console.log('\n--- GitHub 连接 ---');
            console.log(`  用户名: ${profile.github.login}`);
            console.log(`  名称: ${profile.github.name || '(无)'}`);
            console.log(`  邮箱: ${profile.github.email || '(无)'}`);
        } else {
            console.log('\nGitHub: ✗ 未连接');
        }
        
        if (profile.connectedServices && profile.connectedServices.length > 0) {
            console.log(`\n已连接服务: ${profile.connectedServices.join(', ')}`);
        }
        
        console.log('');
    } catch (error) {
        console.error('获取账户资料失败:', error.message);
    }
}

async function displaySettings() {
    console.log('\n⚙️  获取账户设置...');
    
    try {
        const data = await fetchSettings(CURRENT_TOKEN);
        
        let settings = null;
        if (data.settings) {
            settings = encryption.decryptLegacy(data.settings);
        }
        
        cachedSettings = settings;
        cachedSettingsVersion = data.settingsVersion;
        
        console.log('\n=== 账户设置 ===\n');
        
        if (!settings) {
            console.log('(使用默认设置)');
            return;
        }
        
        console.log(`视图内联工具调用: ${settings.viewInline ? '✓' : '✗'}`);
        console.log(`展开 Todo 列表: ${settings.expandTodos ? '✓' : '✗'}`);
        console.log(`显示行号: ${settings.showLineNumbers ? '✓' : '✗'}`);
        console.log(`换行显示: ${settings.wrapLinesInDiffs ? '✓' : '✗'}`);
        console.log(`分析数据收集: ${settings.analyticsOptOut ? '已禁用' : '已启用'}`);
        console.log(`实验性功能: ${settings.experiments ? '✓' : '✗'}`);
        console.log(`头像样式: ${settings.avatarStyle || 'brutalist'}`);
        console.log(`紧凑会话视图: ${settings.compactSessionView ? '✓' : '✗'}`);
        console.log(`隐藏不活动会话: ${settings.hideInactiveSessions ? '✓' : '✗'}`);
        console.log(`界面语言: ${settings.preferredLanguage || '自动'}`);
        console.log(`语音助手语言: ${settings.voiceAssistantLanguage || '自动'}`);
        
        if (settings.inferenceOpenAIKey) {
            console.log(`OpenAI Key: ✓ 已设置`);
        }
        
        console.log(`\n设置版本: ${data.settingsVersion || '未知'}`);
        console.log('');
    } catch (error) {
        console.error('获取账户设置失败:', error.message);
    }
}

// ============================================================================
// 显示函数 - 机器
// ============================================================================

async function displayMachines() {
    console.log('\n🖥️  获取机器列表...');
    
    try {
        const data = await fetchMachines(CURRENT_TOKEN);
        machines = {};
        
        console.log('\n=== 机器列表 ===\n');
        
        if (!Array.isArray(data) || data.length === 0) {
            console.log('(暂无机器)');
            return;
        }
        
        for (const machine of data) {
            machines[machine.id] = machine;
            
            // 初始化机器加密
            if (machine.dataEncryptionKey) {
                const decryptedKey = await encryption.decryptEncryptionKey(machine.dataEncryptionKey);
                await encryption.initializeMachine(machine.id, decryptedKey);
            } else {
                await encryption.initializeMachine(machine.id, null);
            }
            
            // 解密元数据
            let metadata = null;
            if (machine.metadata) {
                const enc = encryption.getMachineEncryption(machine.id);
                if (enc) {
                    const metadataData = decodeBase64(machine.metadata, 'base64');
                    metadata = encryption.decrypt(enc, metadataData);
                }
            }
            
            const status = machine.active ? '🟢 在线' : '⚪ 离线';
            const hostname = metadata?.host || metadata?.hostname || '未知主机';
            const platform = metadata?.os || metadata?.platform || '未知平台';
            const date = new Date(machine.activeAt).toLocaleString();
            
            console.log(`${status} [${machine.id.substring(0, 8)}...] ${hostname}`);
            console.log(`   平台: ${platform}`);
            console.log(`   最后活跃: ${date}`);
            console.log('');
        }
    } catch (error) {
        console.error('获取机器列表失败:', error.message);
    }
}

// ============================================================================
// 显示函数 - 使用量
// ============================================================================

async function displayUsage(period = '7days') {
    console.log(`\n📊 获取使用量统计 (${period})...`);
    
    try {
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
        
        const data = await queryUsage(CURRENT_TOKEN, {
            startTime,
            endTime: now,
            groupBy
        });
        
        console.log('\n=== 使用量统计 ===\n');
        
        if (!data.usage || data.usage.length === 0) {
            console.log('(暂无使用记录)');
            return;
        }
        
        let totalTokens = 0;
        let totalCost = 0;
        const tokensByModel = {};
        const costByModel = {};
        
        for (const dataPoint of data.usage) {
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
        
        console.log(`总 Tokens: ${totalTokens.toLocaleString()}`);
        console.log(`总费用: $${totalCost.toFixed(4)}`);
        
        if (Object.keys(tokensByModel).length > 0) {
            console.log('\n--- 按模型统计 ---');
            for (const [model, tokens] of Object.entries(tokensByModel)) {
                const cost = costByModel[model] || 0;
                console.log(`  ${model}: ${tokens.toLocaleString()} tokens ($${cost.toFixed(4)})`);
            }
        }
        
        console.log('');
    } catch (error) {
        console.error('获取使用量失败:', error.message);
    }
}

// ============================================================================
// 显示函数 - Artifacts
// ============================================================================

async function displayArtifacts() {
    console.log('\n📦 获取 Artifacts 列表...');
    
    try {
        const artifacts = await fetchArtifacts(CURRENT_TOKEN);
        
        console.log('\n=== Artifacts 列表 ===\n');
        
        if (!Array.isArray(artifacts) || artifacts.length === 0) {
            console.log('(暂无 Artifacts)');
            return;
        }
        
        for (const artifact of artifacts) {
            // 初始化 Artifact 加密
            if (artifact.dataEncryptionKey) {
                const decryptedKey = await encryption.decryptEncryptionKey(artifact.dataEncryptionKey);
                await encryption.initializeArtifact(artifact.id, decryptedKey);
            } else {
                await encryption.initializeArtifact(artifact.id, null);
            }
            
            // 解密 header
            let header = null;
            if (artifact.header) {
                const enc = encryption.getArtifactEncryption(artifact.id);
                if (enc) {
                    const headerData = decodeBase64(artifact.header, 'base64');
                    header = encryption.decrypt(enc, headerData);
                }
            }
            
            const title = header?.title || '(无标题)';
            const isDraft = header?.draft ? ' [草稿]' : '';
            const date = new Date(artifact.updatedAt).toLocaleString();
            
            console.log(`📄 [${artifact.id.substring(0, 8)}...] ${title}${isDraft}`);
            console.log(`   更新于: ${date}`);
            console.log('');
        }
    } catch (error) {
        console.error('获取 Artifacts 失败:', error.message);
    }
}

async function displayArtifact(artifactId) {
    console.log(`\n📄 获取 Artifact ${artifactId}...`);
    
    try {
        const artifact = await fetchArtifact(CURRENT_TOKEN, artifactId);
        
        // 初始化加密
        if (artifact.dataEncryptionKey) {
            const decryptedKey = await encryption.decryptEncryptionKey(artifact.dataEncryptionKey);
            await encryption.initializeArtifact(artifact.id, decryptedKey);
        } else {
            await encryption.initializeArtifact(artifact.id, null);
        }
        
        const enc = encryption.getArtifactEncryption(artifact.id);
        
        // 解密 header
        let header = null;
        if (artifact.header && enc) {
            const headerData = decodeBase64(artifact.header, 'base64');
            header = encryption.decrypt(enc, headerData);
        }
        
        // 解密 body
        let body = null;
        if (artifact.body && enc) {
            const bodyData = decodeBase64(artifact.body, 'base64');
            body = encryption.decrypt(enc, bodyData);
        }
        
        console.log('\n=== Artifact 详情 ===\n');
        console.log(`ID: ${artifact.id}`);
        console.log(`标题: ${header?.title || '(无标题)'}`);
        console.log(`草稿: ${header?.draft ? '是' : '否'}`);
        console.log(`创建于: ${new Date(artifact.createdAt).toLocaleString()}`);
        console.log(`更新于: ${new Date(artifact.updatedAt).toLocaleString()}`);
        
        if (body?.body) {
            console.log('\n--- 内容 ---');
            console.log(body.body.substring(0, 500) + (body.body.length > 500 ? '...' : ''));
        }
        
        console.log('');
    } catch (error) {
        console.error('获取 Artifact 失败:', error.message);
    }
}

// ============================================================================
// 显示函数 - KV 存储
// ============================================================================

async function displayKvList(prefix = '') {
    console.log(`\n🔑 获取 KV 列表${prefix ? ` (前缀: ${prefix})` : ''}...`);
    
    try {
        const data = await kvList(CURRENT_TOKEN, { prefix, limit: 100 });
        
        console.log('\n=== KV 列表 ===\n');
        
        if (!data.items || data.items.length === 0) {
            console.log('(暂无数据)');
            return;
        }
        
        for (const item of data.items) {
            const valuePreview = item.value.length > 50 
                ? item.value.substring(0, 50) + '...' 
                : item.value;
            console.log(`[v${item.version}] ${item.key} = ${valuePreview}`);
        }
        
        console.log(`\n共 ${data.items.length} 项`);
        console.log('');
    } catch (error) {
        console.error('获取 KV 列表失败:', error.message);
    }
}

async function displayKvGet(key) {
    console.log(`\n🔑 获取 KV: ${key}...`);
    
    try {
        const item = await kvGet(CURRENT_TOKEN, key);
        
        if (!item) {
            console.log('❌ Key 不存在');
            return;
        }
        
        console.log('\n=== KV 值 ===\n');
        console.log(`Key: ${item.key}`);
        console.log(`Version: ${item.version}`);
        console.log(`Value: ${item.value}`);
        console.log('');
    } catch (error) {
        console.error('获取 KV 失败:', error.message);
    }
}

async function kvSet(key, value) {
    console.log(`\n🔑 设置 KV: ${key}...`);
    
    try {
        // 先获取当前版本
        const existing = await kvGet(CURRENT_TOKEN, key);
        const version = existing ? existing.version : -1;
        
        const result = await kvMutate(CURRENT_TOKEN, [{
            key,
            value,
            version
        }]);
        
        if (result.success) {
            console.log(`✅ 已设置 ${key}`);
        } else {
            console.log(`❌ 设置失败: ${result.errors?.[0]?.error || '未知错误'}`);
        }
    } catch (error) {
        console.error('设置 KV 失败:', error.message);
    }
}

async function kvDelete(key) {
    console.log(`\n🔑 删除 KV: ${key}...`);
    
    try {
        const existing = await kvGet(CURRENT_TOKEN, key);
        
        if (!existing) {
            console.log('❌ Key 不存在');
            return;
        }
        
        const result = await kvMutate(CURRENT_TOKEN, [{
            key,
            value: null,
            version: existing.version
        }]);
        
        if (result.success) {
            console.log(`✅ 已删除 ${key}`);
        } else {
            console.log(`❌ 删除失败: ${result.errors?.[0]?.error || '未知错误'}`);
        }
    } catch (error) {
        console.error('删除 KV 失败:', error.message);
    }
}

// ============================================================================
// 显示函数 - 社交
// ============================================================================

async function displayFriends() {
    console.log('\n👥 获取好友列表...');
    
    try {
        const data = await fetchFriends(CURRENT_TOKEN);
        
        console.log('\n=== 好友列表 ===\n');
        
        if (!data.friends || data.friends.length === 0) {
            console.log('(暂无好友)');
            return;
        }
        
        const statusIcons = {
            'friend': '✓',
            'pending': '⏳',
            'requested': '📤',
            'rejected': '✗',
            'none': '○'
        };
        
        for (const friend of data.friends) {
            const icon = statusIcons[friend.status] || '○';
            const name = [friend.firstName, friend.lastName].filter(Boolean).join(' ') || friend.username;
            console.log(`${icon} ${name} (@${friend.username})`);
            console.log(`   ID: ${friend.id.substring(0, 8)}... | 状态: ${friend.status}`);
            if (friend.bio) {
                console.log(`   简介: ${friend.bio.substring(0, 50)}${friend.bio.length > 50 ? '...' : ''}`);
            }
            console.log('');
        }
    } catch (error) {
        console.error('获取好友列表失败:', error.message);
    }
}

async function displaySearchUsers(query) {
    console.log(`\n🔍 搜索用户: ${query}...`);
    
    try {
        const data = await searchUsers(CURRENT_TOKEN, query);
        
        console.log('\n=== 搜索结果 ===\n');
        
        if (!data.users || data.users.length === 0) {
            console.log('(未找到用户)');
            return;
        }
        
        for (const user of data.users) {
            const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username;
            console.log(`👤 ${name} (@${user.username})`);
            console.log(`   ID: ${user.id}`);
            if (user.bio) {
                console.log(`   简介: ${user.bio.substring(0, 50)}${user.bio.length > 50 ? '...' : ''}`);
            }
            console.log('');
        }
    } catch (error) {
        console.error('搜索用户失败:', error.message);
    }
}

async function displayUser(userId) {
    console.log(`\n👤 获取用户资料: ${userId}...`);
    
    try {
        const data = await fetchUser(CURRENT_TOKEN, userId);
        
        if (!data || !data.user) {
            console.log('❌ 用户不存在');
            return;
        }
        
        const user = data.user;
        
        console.log('\n=== 用户资料 ===\n');
        console.log(`ID: ${user.id}`);
        console.log(`用户名: @${user.username}`);
        console.log(`名字: ${user.firstName || '(未设置)'}`);
        console.log(`姓氏: ${user.lastName || '(未设置)'}`);
        console.log(`头像: ${user.avatar?.url ? '✓ 已设置' : '✗ 未设置'}`);
        console.log(`简介: ${user.bio || '(无)'}`);
        console.log(`关系状态: ${user.status}`);
        console.log('');
    } catch (error) {
        console.error('获取用户资料失败:', error.message);
    }
}

// ============================================================================
// 显示函数 - Feed
// ============================================================================

async function displayFeed() {
    console.log('\n📰 获取动态...');
    
    try {
        const data = await fetchFeed(CURRENT_TOKEN, { limit: 20 });
        
        console.log('\n=== 动态 Feed ===\n');
        
        if (!data.items || data.items.length === 0) {
            console.log('(暂无动态)');
            return;
        }
        
        for (const item of data.items) {
            const date = new Date(item.createdAt).toLocaleString();
            let content = '';
            
            switch (item.body.kind) {
                case 'friend_request':
                    content = `📤 收到好友请求 (用户 ${item.body.uid?.substring(0, 8)}...)`;
                    break;
                case 'friend_accepted':
                    content = `✓ 好友请求已接受 (用户 ${item.body.uid?.substring(0, 8)}...)`;
                    break;
                case 'text':
                    content = `📝 ${item.body.text}`;
                    break;
                default:
                    content = `[${item.body.kind}]`;
            }
            
            console.log(`[${date}] ${content}`);
        }
        
        if (data.hasMore) {
            console.log('\n(还有更多动态...)');
        }
        
        console.log('');
    } catch (error) {
        console.error('获取动态失败:', error.message);
    }
}

// ============================================================================
// 显示函数 - 服务连接
// ============================================================================

async function displayConnectedServices() {
    console.log('\n🔗 获取已连接服务...');
    
    try {
        const profile = cachedProfile || await fetchProfile(CURRENT_TOKEN);
        
        console.log('\n=== 已连接服务 ===\n');
        
        if (profile.github) {
            console.log(`✓ GitHub - @${profile.github.login}`);
        } else {
            console.log('✗ GitHub - 未连接');
        }
        
        if (profile.connectedServices && profile.connectedServices.length > 0) {
            for (const service of profile.connectedServices) {
                if (service !== 'github') {
                    console.log(`✓ ${service}`);
                }
            }
        }
        
        console.log('');
    } catch (error) {
        console.error('获取服务连接状态失败:', error.message);
    }
}

async function handleDisconnectService(service) {
    console.log(`\n🔗 断开服务: ${service}...`);
    
    try {
        await disconnectService(CURRENT_TOKEN, service);
        console.log(`✅ 已断开 ${service}`);
        cachedProfile = null; // 清除缓存
    } catch (error) {
        console.error(`断开服务失败:`, error.message);
    }
}

// ============================================================================
// 显示函数 - 会话删除
// ============================================================================

async function handleDeleteSession(sessionId) {
    const fullId = Object.keys(sessions).find(id => id.startsWith(sessionId)) || sessionId;
    
    if (!sessions[fullId]) {
        console.log('❌ 会话不存在，请先执行 sessions 命令');
        return;
    }
    
    console.log(`\n🗑️  删除会话 ${fullId.substring(0, 8)}...`);
    
    try {
        await deleteSession(CURRENT_TOKEN, fullId);
        delete sessions[fullId];
        console.log('✅ 会话已删除');
    } catch (error) {
        console.error('删除会话失败:', error.message);
    }
}

// ============================================================================
// 诊断会话状态
// ============================================================================

async function diagnoseSession(sessionId) {
    const fullId = Object.keys(sessions).find(id => id.startsWith(sessionId)) || sessionId;
    
    if (!sessions[fullId]) {
        console.log('❌ 会话不存在，请先执行 sessions 命令');
        return;
    }
    
    const session = sessions[fullId];
    
    console.log('\n=== 会话诊断信息 ===\n');
    console.log(`会话 ID: ${fullId}`);
    console.log(`状态: ${session.active ? '🟢 在线' : '⚪ 离线'}`);
    console.log(`最后活跃: ${new Date(session.activeAt).toLocaleString()}`);
    console.log(`更新时间: ${new Date(session.updatedAt).toLocaleString()}`);
    
    const enc = encryption.getSessionEncryption(fullId);
    console.log(`\n加密类型: ${enc ? enc.type : '未初始化'}`);
    console.log(`数据加密密钥: ${session.dataEncryptionKey ? '✓ 有' : '✗ 无'}`);
    console.log(`agentState: ${session.agentState ? '✓ 有' : '✗ 无'}`);
    console.log(`metadata: ${session.metadata ? '✓ 有' : '✗ 无'}`);
    
    if (enc && session.agentState) {
        try {
            const agentStateData = decodeBase64(session.agentState, 'base64');
            const agentState = encryption.decrypt(enc, agentStateData);
            console.log('\n--- Agent 状态 ---');
            console.log(`controlledByUser: ${agentState?.controlledByUser ?? 'undefined'}`);
            console.log(`mode: ${agentState?.mode ?? 'undefined'}`);
            console.log(`pending requests: ${Object.keys(agentState?.requests || {}).length}`);
            if (agentState?.error) {
                console.log(`错误: ${agentState.error}`);
            }
            console.log('\n完整 agentState:');
            console.log(JSON.stringify(agentState, null, 2).substring(0, 1000));
        } catch (error) {
            console.log('无法解密 agentState:', error.message);
        }
    }
    
    if (enc && session.metadata) {
        try {
            const metadataData = decodeBase64(session.metadata, 'base64');
            const metadata = encryption.decrypt(enc, metadataData);
            console.log('\n--- 元数据 ---');
            if (metadata) {
                console.log(`工作目录: ${metadata.path ?? metadata.cwd ?? 'unknown'}`);
                console.log(`平台: ${metadata.os ?? metadata.platform ?? 'unknown'}`);
                console.log(`主机名: ${metadata.host ?? metadata.hostname ?? 'unknown'}`);
                console.log(`版本: ${metadata.version ?? 'unknown'}`);
            }
        } catch (error) {
            console.log('无法解密 metadata:', error.message);
        }
    }
    
    console.log('');
}

// ============================================================================
// 对话模式
// ============================================================================

async function startChatMode(rl) {
    const indexMap = await displaySessionsWithIndex();
    
    if (Object.keys(indexMap).length === 0) {
        console.log('没有可用的会话');
        return;
    }
    
    const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));
    const choice = await question('输入编号选择会话 (或输入 q 返回): ');
    
    if (choice.toLowerCase() === 'q' || choice.trim() === '') {
        return;
    }
    
    const sessionId = indexMap[parseInt(choice)];
    if (!sessionId) {
        console.log('❌ 无效的编号');
        return;
    }
    
    currentChatSessionId = sessionId;
    chatModeRl = rl;
    
    const session = sessions[sessionId];
    let metadata = null;
    if (session?.metadata) {
        const enc = encryption.getSessionEncryption(sessionId);
        const metadataData = decodeBase64(session.metadata, 'base64');
        metadata = encryption.decrypt(enc, metadataData);
    }
    const projectName = (metadata?.path ?? metadata?.cwd)?.split(/[/\\]/).pop() || '未知项目';
    
    await displayMessages(sessionId);
    
    const modeDisplay = MODE_DISPLAY_NAMES[currentPermissionMode] || currentPermissionMode;
    console.log('─'.repeat(50));
    console.log(`💬 对话模式 - ${projectName}`);
    console.log(`   当前模式: ${modeDisplay}`);
    console.log('   /mode [模式] 切换模式 | /refresh 刷新 | /exit 退出');
    console.log('─'.repeat(50));
    
    while (true) {
        const input = await question('> ');
        const trimmed = input.trim();
        
        if (trimmed === '/exit' || trimmed === '/quit' || trimmed === '/q') {
            console.log('👋 退出对话模式');
            break;
        }
        
        if (trimmed === '/refresh' || trimmed === '/r') {
            await displayMessages(sessionId);
            continue;
        }
        
        if (trimmed === '/mode' || trimmed.startsWith('/mode ')) {
            const parts = trimmed.split(' ');
            if (parts.length === 1) {
                const currentDisplay = MODE_DISPLAY_NAMES[currentPermissionMode] || currentPermissionMode;
                console.log(`\n当前模式: ${currentPermissionMode} (${currentDisplay})`);
                console.log('\n可用模式: ' + VALID_MODES.join(', '));
            } else {
                const newMode = parts[1].toLowerCase();
                const modeAliases = {
                    'readonly': 'read-only',
                    'safeyolo': 'safe-yolo',
                    'bypass': 'bypassPermissions',
                    'accept': 'acceptEdits'
                };
                const normalizedMode = modeAliases[newMode] || newMode;
                
                if (VALID_MODES.includes(normalizedMode)) {
                    currentPermissionMode = normalizedMode;
                    console.log(`✅ 模式已切换为: ${normalizedMode}`);
                } else {
                    console.log(`❌ 无效的模式: ${newMode}`);
                }
            }
            continue;
        }
        
        if (trimmed === '/help' || trimmed === '/?') {
            console.log('\n对话模式命令:');
            console.log('  /mode [模式]  - 显示或切换权限模式');
            console.log('  /refresh      - 刷新消息列表');
            console.log('  /exit         - 退出对话模式');
            continue;
        }
        
        if (trimmed === '') {
            continue;
        }
        
        await sendUserMessage(sessionId, trimmed);
    }
    
    currentChatSessionId = null;
    chatModeRl = null;
}

// ============================================================================
// 帮助命令
// ============================================================================

function showHelp() {
    console.log(`
=== Happy Coder 客户端命令 ===

会话管理:
  sessions, list, ls     查看会话列表
  messages <id>          查看会话消息
  send <id> <text>       发送消息
  delete <id>            删除会话
  chat                   进入对话模式
  diagnose <id>          诊断会话状态

账户管理:
  profile                查看账户资料
  settings               查看账户设置

设备管理:
  machines               查看机器列表

使用统计:
  usage [period]         查看使用量 (today/7days/30days)

制品管理:
  artifacts              查看 Artifacts 列表
  artifact <id>          查看 Artifact 详情

KV 存储:
  kv [prefix]            列出 KV 数据
  kv get <key>           获取 KV 值
  kv set <key> <value>   设置 KV 值
  kv delete <key>        删除 KV 值

社交功能:
  friends                查看好友列表
  search <query>         搜索用户
  user <id>              查看用户资料
  feed                   查看动态

服务连接:
  services               查看已连接服务
  disconnect <service>   断开服务连接

其他:
  mode [mode]            显示/切换权限模式
  help, ?                显示此帮助
  quit, exit, q          退出程序

可用权限模式: ${VALID_MODES.join(', ')}
`);
}

// ============================================================================
// 命令处理器
// ============================================================================

async function processCommand(input, rl) {
    const parts = input.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    switch (cmd) {
        // 会话管理
        case 'sessions':
        case 'list':
        case 'ls':
            await displaySessions();
            break;
        
        case 'messages':
        case 'msg':
            if (args[0]) {
                await displayMessages(args[0]);
            } else {
                console.log('用法: messages <session-id>');
            }
            break;
        
        case 'send':
            if (args.length >= 2) {
                const sessionId = args[0];
                const text = args.slice(1).join(' ');
                await sendUserMessage(sessionId, text);
            } else {
                console.log('用法: send <session-id> <message>');
            }
            break;
        
        case 'delete':
        case 'del':
            if (args[0]) {
                await handleDeleteSession(args[0]);
            } else {
                console.log('用法: delete <session-id>');
            }
            break;
        
        case 'chat':
            await startChatMode(rl);
            break;
        
        case 'diagnose':
        case 'diag':
            if (args[0]) {
                await diagnoseSession(args[0]);
            } else {
                console.log('用法: diagnose <session-id>');
            }
            break;
        
        // 账户管理
        case 'profile':
            await displayProfile();
            break;
        
        case 'settings':
            await displaySettings();
            break;
        
        // 设备管理
        case 'machines':
            await displayMachines();
            break;
        
        // 使用统计
        case 'usage':
            await displayUsage(args[0] || '7days');
            break;
        
        // 制品管理
        case 'artifacts':
            await displayArtifacts();
            break;
        
        case 'artifact':
            if (args[0]) {
                await displayArtifact(args[0]);
            } else {
                console.log('用法: artifact <artifact-id>');
            }
            break;
        
        // KV 存储
        case 'kv':
            if (args[0] === 'get' && args[1]) {
                await displayKvGet(args[1]);
            } else if (args[0] === 'set' && args.length >= 3) {
                await kvSet(args[1], args.slice(2).join(' '));
            } else if (args[0] === 'delete' && args[1]) {
                await kvDelete(args[1]);
            } else {
                await displayKvList(args[0] || '');
            }
            break;
        
        // 社交功能
        case 'friends':
            await displayFriends();
            break;
        
        case 'search':
            if (args[0]) {
                await displaySearchUsers(args.join(' '));
            } else {
                console.log('用法: search <username>');
            }
            break;
        
        case 'user':
            if (args[0]) {
                await displayUser(args[0]);
            } else {
                console.log('用法: user <user-id>');
            }
            break;
        
        case 'feed':
            await displayFeed();
            break;
        
        // 服务连接
        case 'services':
            await displayConnectedServices();
            break;
        
        case 'disconnect':
            if (args[0]) {
                await handleDisconnectService(args[0]);
            } else {
                console.log('用法: disconnect <service>');
            }
            break;
        
        // 模式切换
        case 'mode':
            if (args[0]) {
                const modeAliases = {
                    'readonly': 'read-only',
                    'safeyolo': 'safe-yolo',
                    'bypass': 'bypassPermissions',
                    'accept': 'acceptEdits'
                };
                const newMode = modeAliases[args[0].toLowerCase()] || args[0].toLowerCase();
                
                if (VALID_MODES.includes(newMode)) {
                    currentPermissionMode = newMode;
                    const display = MODE_DISPLAY_NAMES[newMode] || newMode;
                    console.log(`✅ 模式已切换为: ${newMode} (${display})`);
                } else {
                    console.log(`❌ 无效的模式: ${args[0]}`);
                    console.log(`可用模式: ${VALID_MODES.join(', ')}`);
                }
            } else {
                const display = MODE_DISPLAY_NAMES[currentPermissionMode] || currentPermissionMode;
                console.log(`当前模式: ${currentPermissionMode} (${display})`);
                console.log(`可用模式: ${VALID_MODES.join(', ')}`);
            }
            break;
        
        // 帮助
        case 'help':
        case '?':
            showHelp();
            break;
        
        // 退出
        case 'quit':
        case 'exit':
        case 'q':
            return false;
        
        default:
            if (cmd) {
                console.log(`❓ 未知命令: ${cmd}`);
                console.log('输入 help 查看可用命令');
            }
    }
    
    return true;
}

// ============================================================================
// 主函数
// ============================================================================

async function main() {
    console.log('\n🚀 Happy Coder 客户端 v2.0.0');
    console.log(`📡 服务器: ${SERVER_URL}`);
    console.log(`🔐 权限模式: ${currentPermissionMode}`);
    console.log('');

    // 获取 Token
    let token = CURRENT_TOKEN || TOKEN;

    if (!token && SECRET) {
        console.log('🔑 从 Secret Key 获取 Token...');
        try {
            const normalizedSecret = normalizeSecretKey(SECRET);
            const secretBytes = decodeBase64(normalizedSecret, 'base64url');
            
            token = await authGetToken(secretBytes, SERVER_URL);
            console.log('✅ Token 获取成功');
            
            // 初始化加密管理器
            encryption = await Encryption.create(secretBytes);
            console.log('✅ 加密管理器已初始化');
        } catch (error) {
            console.error('❌ 获取 Token 失败:', error.message);
            process.exit(1);
        }
    } else if (!token) {
        console.error('❌ 请提供 --token 或 --secret 参数');
        console.log('   或设置环境变量 HAPPY_TOKEN / HAPPY_SECRET');
        process.exit(1);
    }

    CURRENT_TOKEN = token;

    // 如果只有 token 没有 secret，尝试初始化加密
    if (!encryption && SECRET) {
        try {
            const normalizedSecret = normalizeSecretKey(SECRET);
            const secretBytes = decodeBase64(normalizedSecret, 'base64url');
            encryption = await Encryption.create(secretBytes);
            console.log('✅ 加密管理器已初始化');
        } catch (error) {
            console.error('⚠️ 加密管理器初始化失败:', error.message);
        }
    }

    // 连接 WebSocket
    console.log('🔌 正在连接 WebSocket...');
    try {
        await connectWebSocket(token);
    } catch (error) {
        console.error('❌ WebSocket 连接失败:', error.message);
        console.log('将继续使用 HTTP API...');
    }

    // 创建 readline 接口
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

    // 自动诊断模式
    if (AUTO_DIAGNOSE) {
        console.log(`\n🔍 自动诊断模式: ${AUTO_DIAGNOSE}`);
        await displaySessions();
        await diagnoseSession(AUTO_DIAGNOSE);
        rl.close();
        if (socket) socket.close();
        process.exit(0);
    }

    // 自动测试模式
    if (AUTO_TEST) {
        console.log(`\n🧪 自动测试模式: ${AUTO_TEST}`);
        await displaySessions();
        
        const fullId = Object.keys(sessions).find(id => id.startsWith(AUTO_TEST)) || AUTO_TEST;
        currentChatSessionId = fullId;
        chatModeRl = rl;
        
        const testMessage = '你好，这是来自 mini-client 的测试消息，请简短回复';
        console.log(`\n📤 发送测试消息: "${testMessage}"`);
        await sendUserMessage(AUTO_TEST, testMessage);
        
        console.log('\n⏳ 等待 15 秒接收回复...');
        await new Promise(resolve => setTimeout(resolve, 15000));
        
        console.log('\n📥 获取最新消息:');
        await displayMessages(AUTO_TEST);
        
        rl.close();
        if (socket) socket.close();
        process.exit(0);
    }

    // 显示帮助
    console.log('输入 help 查看可用命令\n');

    // 主循环 - 命令行模式
    while (true) {
        const input = await question('happy> ');
        
        if (!input.trim()) {
            continue;
        }
        
        const shouldContinue = await processCommand(input, rl);
        
        if (!shouldContinue) {
            console.log('👋 再见!');
            rl.close();
            if (socket) socket.close();
            process.exit(0);
        }
    }
}

// ============================================================================
// 启动
// ============================================================================

main().catch(error => {
    console.error('❌ 程序错误:', error);
    process.exit(1);
});