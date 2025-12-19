/**
 * Happy Coder - 最简客户端
 * 
 * 一个独立的 Node.js 脚本，用于与 happy-server 交互。
 * 支持查看会话列表、查看消息、发送消息等基础功能。
 * 
 * 使用方式:
 *   node scripts/mini-client.js --token=YOUR_TOKEN --secret=YOUR_SECRET
 * 
 * 或通过环境变量 (支持从根目录 .env 文件读取):
 *   HAPPY_TOKEN=xxx HAPPY_SECRET=xxx node scripts/mini-client.js
 * 
 * 如果只提供 HAPPY_SECRET，脚本会自动从 Secret Key 恢复 Token
 * 
 * 可选参数:
 *   --server=URL  指定服务器地址 (默认: https://api.cluster-fluster.com)
 * 
 * .env 文件格式:
 *   HAPPY_SECRET=your_secret_key_here  # 只需要提供 Secret Key，Token 会自动恢复
 *   # 或者同时提供:
 *   HAPPY_TOKEN=your_token_here
 *   HAPPY_SECRET=your_secret_here
 *   HAPPY_SERVER_URL=https://api.cluster-fluster.com  # 可选
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
    
    // 格式: iv (12) + authTag (16) + encrypted
    const result = Buffer.concat([iv, authTag, encrypted]);
    
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
        const iv = payload.slice(0, 12);
        const authTag = payload.slice(12, 28);
        const encrypted = payload.slice(28);
        
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

    // 获取会话加密器
    getSessionEncryption(sessionId) {
        return this.sessionEncryptions.get(sessionId);
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
// HTTP API
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

// 获取当前 Token（从 main 函数中设置）
let CURRENT_TOKEN = null;

// ============================================================================
// WebSocket 连接
// ============================================================================

let socket = null;

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
            console.log('\n📨 收到更新:', JSON.stringify(data).substring(0, 200));
        });

        socket.on('ephemeral', (data) => {
            // 静默处理 ephemeral 更新
        });
    });
}

function sendMessage(sessionId, encryptedMessage, localId) {
    if (!socket) {
        console.error('WebSocket 未连接');
        return;
    }
    
    socket.emit('message', {
        sid: sessionId,
        message: encryptedMessage,
        localId: localId,
        sentFrom: 'mini-client',
        permissionMode: 'default'
    });
}

// ============================================================================
// 命令行界面
// ============================================================================

let encryption = null;
let sessions = {};

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
            
            const projectName = metadata?.cwd?.split(/[/\\]/).pop() || '未知项目';
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

async function displayMessages(sessionId) {
    // 支持短 ID
    const fullId = Object.keys(sessions).find(id => id.startsWith(sessionId)) || sessionId;
    
    if (!sessions[fullId]) {
        console.log('❌ 会话不存在，请先获取会话列表');
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
        
        // 只显示最近 10 条消息
        const recentMessages = data.messages.slice(-10);
        
        for (const msg of recentMessages) {
            if (msg.content?.t === 'encrypted') {
                const encryptedData = decodeBase64(msg.content.c, 'base64');
                const decrypted = encryption.decrypt(enc, encryptedData);
                
                if (decrypted) {
                    const role = decrypted.role || 'unknown';
                    const roleIcon = role === 'user' ? '👤' : role === 'assistant' ? '🤖' : '📝';
                    const date = new Date(msg.createdAt).toLocaleTimeString();
                    
                    // 提取文本内容
                    let text = '';
                    if (typeof decrypted.content === 'string') {
                        text = decrypted.content;
                    } else if (decrypted.content?.text) {
                        text = decrypted.content.text;
                    } else if (decrypted.content?.type === 'text') {
                        text = decrypted.content.text;
                    } else if (Array.isArray(decrypted.content)) {
                        const textContent = decrypted.content.find(c => c.type === 'text');
                        text = textContent?.text || JSON.stringify(decrypted.content).substring(0, 100);
                    } else {
                        text = JSON.stringify(decrypted.content).substring(0, 100);
                    }
                    
                    // 截断过长的文本
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

async function sendUserMessage(sessionId, text) {
    // 支持短 ID
    const fullId = Object.keys(sessions).find(id => id.startsWith(sessionId)) || sessionId;
    
    if (!sessions[fullId]) {
        console.log('❌ 会话不存在，请先获取会话列表');
        return;
    }
    
    const enc = encryption.getSessionEncryption(fullId);
    if (!enc) {
        console.log('❌ 会话加密未初始化');
        return;
    }
    
    // 构建消息内容
    const content = {
        role: 'user',
        content: {
            type: 'text',
            text: text
        },
        meta: {
            sentFrom: 'mini-client',
            permissionMode: 'default'
        }
    };
    
    // 加密消息
    const encrypted = encryption.encrypt(enc, content);
    const encryptedBase64 = encodeBase64(encrypted, 'base64');
    
    // 生成本地 ID
    const localId = crypto.randomUUID();
    
    // 发送消息
    sendMessage(fullId, encryptedBase64, localId);
    
    console.log(`✅ 消息已发送到会话 ${fullId.substring(0, 8)}...`);
}

async function showMenu() {
    console.log('\n=== Happy Coder 最简客户端 ===');
    console.log('[1] 查看会话列表');
    console.log('[2] 查看会话消息');
    console.log('[3] 发送消息');
    console.log('[4] 退出');
    console.log('');
}

async function main() {
    // 检查 Secret Key
    if (!SECRET) {
        console.error('❌ 请提供 Secret Key');
        console.log('');
        console.log('使用方式:');
        console.log('  node scripts/mini-client.js --secret=YOUR_SECRET_KEY');
        console.log('');
        console.log('或通过环境变量 (.env 文件):');
        console.log('  HAPPY_SECRET=your_secret_key_here');
        console.log('');
        console.log('Secret Key 可以是:');
        console.log('  - 格式化版本: XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX');
        console.log('  - Base64URL 版本: abc123def456...');
        process.exit(1);
    }

    console.log(`🔗 服务器: ${SERVER_URL}`);
    
    let token = TOKEN;
    let secret = SECRET;
    
    // 如果没有提供 Token，从 Secret Key 恢复
    if (!token) {
        console.log('🔑 未提供 Token，正在从 Secret Key 恢复...');
        
        try {
            // 标准化 Secret Key
            const normalizedSecret = normalizeSecretKey(secret);
            const secretBytes = decodeBase64(normalizedSecret, 'base64url');
            
            if (secretBytes.length !== 32) {
                throw new Error(`Secret Key 长度无效: ${secretBytes.length}, 需要 32 字节`);
            }
            
            // 从 Secret Key 获取 Token
            token = await authGetToken(secretBytes, SERVER_URL);
            secret = normalizedSecret; // 使用标准化后的 Secret
            
            console.log('✅ Token 恢复成功');
        } catch (error) {
            console.error('❌ 从 Secret Key 恢复 Token 失败:', error.message);
            console.log('');
            console.log('可能的原因:');
            console.log('  1. Secret Key 格式不正确');
            console.log('  2. Secret Key 不属于此服务器');
            console.log('  3. 网络连接问题');
            process.exit(1);
        }
    } else {
        // 如果提供了 Token，也需要标准化 Secret Key
        try {
            secret = normalizeSecretKey(secret);
        } catch (error) {
            console.error('❌ Secret Key 格式错误:', error.message);
            process.exit(1);
        }
    }
    
    console.log('🔐 正在初始化加密...');
    
    // 初始化加密
    const masterSecret = decodeBase64(secret, 'base64url');
    if (masterSecret.length !== 32) {
        console.error(`❌ Secret 长度无效: ${masterSecret.length}, 需要 32 字节`);
        process.exit(1);
    }
    
    encryption = await Encryption.create(masterSecret);
    console.log('✅ 加密初始化完成');
    
    // 连接 WebSocket
    console.log('🔌 正在连接 WebSocket...');
    try {
        await connectWebSocket(token);
    } catch (error) {
        console.error('❌ WebSocket 连接失败:', error.message);
        console.log('将继续使用 HTTP API...');
    }
    
    // 更新全局 TOKEN 变量（用于后续 API 调用）
    CURRENT_TOKEN = token;
    
    // 创建 readline 接口
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

    // 主循环
    while (true) {
        await showMenu();
        const choice = await question('请选择操作: ');
        
        switch (choice.trim()) {
            case '1':
                await displaySessions();
                break;
            
            case '2':
                const sessionIdForView = await question('请输入会话 ID (可以只输入前几位): ');
                if (sessionIdForView.trim()) {
                    await displayMessages(sessionIdForView.trim());
                }
                break;
            
            case '3':
                const sessionIdForSend = await question('请输入会话 ID (可以只输入前几位): ');
                if (sessionIdForSend.trim()) {
                    const message = await question('请输入消息内容: ');
                    if (message.trim()) {
                        await sendUserMessage(sessionIdForSend.trim(), message.trim());
                    }
                }
                break;
            
            case '4':
            case 'q':
            case 'quit':
            case 'exit':
                console.log('👋 再见!');
                rl.close();
                if (socket) socket.close();
                process.exit(0);
                break;
            
            default:
                console.log('❓ 无效选择，请重试');
        }
    }
}

// 启动
main().catch(error => {
    console.error('❌ 程序错误:', error);
    process.exit(1);
});
