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
const AUTO_DIAGNOSE = args.diagnose;  // --diagnose=sessionId
const AUTO_TEST = args.test;  // --test=sessionId  (发送测试消息)

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
            // 注意：源码中 agent 消息的 role 是 'agent'，不是 'assistant'
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
            // 数据结构: { id, seq, body: { t, sid, ... }, createdAt }
            const sessionId = data.body?.sid || data.body?.id;
            
            // 如果在对话模式中，处理当前会话的消息
            if (currentChatSessionId && sessionId === currentChatSessionId) {
                handleChatModeUpdate(data);
            }
        });

        socket.on('ephemeral', (data) => {
            // 静默处理 ephemeral 更新 (心跳等)
            // 如果需要调试，取消下面的注释
            // if (data.type === 'activity') {
            //     console.log(`[ephemeral] thinking=${data.thinking}, active=${data.active}`);
            // }
        });
    });
}

async function sendMessage(sessionId, encryptedMessage, localId) {
    if (!socket) {
        console.error('WebSocket 未连接');
        return;
    }
    
    // 直接发送消息（与源码一致，使用 emit 而不是 emitWithAck）
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

// 显示带编号的会话列表，返回编号到会话ID的映射
async function displaySessionsWithIndex() {
    console.log('\n📋 获取会话列表...');
    
    try {
        const data = await fetchSessions(CURRENT_TOKEN);
        sessions = {};
        const indexMap = {};  // { '1': 'full-session-id', ... }
        
        if (!data.sessions || data.sessions.length === 0) {
            console.log('(暂无会话)');
            return indexMap;
        }
        
        // 按活动状态和更新时间排序（活动的在前，最近更新的在前）
        const sorted = [...data.sessions].sort((a, b) => {
            if (a.active !== b.active) return b.active - a.active;
            return new Date(b.updatedAt) - new Date(a.updatedAt);
        });
        
        console.log('\n=== 选择会话 ===\n');
        
        for (let i = 0; i < sorted.length; i++) {
            const session = sorted[i];
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
                    
                    // 跳过 event 类型消息和 meta/sidechain 消息
                    if (role === 'agent') {
                        const content = decrypted.content;
                        if (content?.type === 'event') continue;
                        if (content?.type === 'output' && (content.data?.isMeta || content.data?.isSidechain || content.data?.isCompactSummary)) {
                            continue;
                        }
                    }
                    
                    // 角色图标：user -> 👤, agent -> 🤖
                    const roleIcon = role === 'user' ? '👤' : role === 'agent' ? '🤖' : '📝';
                    const date = new Date(msg.createdAt).toLocaleTimeString();
                    
                    // 使用统一的文本提取函数
                    let text = extractMessageText(decrypted);
                    
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
    await sendMessage(fullId, encryptedBase64, localId);

    console.log(`✅ 消息已发送到会话 ${fullId.substring(0, 8)}...`);
}

// ============================================================================
// 对话模式
// ============================================================================

async function startChatMode(rl) {
    // 1. 显示会话列表（带编号）
    const indexMap = await displaySessionsWithIndex();
    
    if (Object.keys(indexMap).length === 0) {
        console.log('没有可用的会话');
        return;
    }
    
    // 2. 等待用户选择
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
    
    // 获取会话信息用于显示
    const session = sessions[sessionId];
    let metadata = null;
    if (session?.metadata) {
        const enc = encryption.getSessionEncryption(sessionId);
        const metadataData = decodeBase64(session.metadata, 'base64');
        metadata = encryption.decrypt(enc, metadataData);
    }
    const projectName = (metadata?.path ?? metadata?.cwd)?.split(/[/\\]/).pop() || '未知项目';
    
    // 3. 显示最近消息
    await displayMessages(sessionId);
    
    // 4. 进入对话循环
    console.log('─'.repeat(50));
    console.log(`💬 对话模式 - ${projectName}`);
    console.log('   输入消息直接发送 | /refresh 刷新 | /exit 退出');
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
        
        if (trimmed === '/help' || trimmed === '/?') {
            console.log('命令: /refresh 刷新消息 | /exit 退出对话');
            continue;
        }
        
        if (trimmed === '') {
            continue;
        }
        
        // 发送消息
        await sendUserMessage(sessionId, trimmed);
    }
    
    currentChatSessionId = null;
    chatModeRl = null;
}

async function showMenu() {
    console.log('\n=== Happy Coder 最简客户端 ===');
    console.log('[1] 查看会话列表');
    console.log('[2] 查看会话消息');
    console.log('[3] 发送消息');
    console.log('[4] 💬 进入对话模式');
    console.log('[5] 🔍 诊断会话状态');
    console.log('[6] 退出');
    console.log('');
}

// 诊断会话状态
async function diagnoseSession(sessionId) {
    const fullId = Object.keys(sessions).find(id => id.startsWith(sessionId)) || sessionId;
    
    if (!sessions[fullId]) {
        console.log('❌ 会话不存在，请先获取会话列表');
        return;
    }
    
    const session = sessions[fullId];
    
    console.log('\n=== 会话诊断信息 ===\n');
    console.log(`会话 ID: ${fullId}`);
    console.log(`状态: ${session.active ? '🟢 在线' : '⚪ 离线'}`);
    console.log(`最后活跃: ${new Date(session.activeAt).toLocaleString()}`);
    console.log(`更新时间: ${new Date(session.updatedAt).toLocaleString()}`);
    
    // 解密并显示 agentState
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
    } else {
        console.log('\n--- Agent 状态 ---');
        console.log(`enc=${!!enc}, session.agentState=${!!session.agentState}`);
        console.log('无 agentState 数据或加密器未初始化');
    }
    
    // 解密并显示 metadata
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
            } else {
                console.log('解密返回 null');
            }
        } catch (error) {
            console.log('无法解密 metadata:', error.message);
        }
    } else {
        console.log('\n--- 元数据 ---');
        console.log(`enc=${!!enc}, session.metadata=${!!session.metadata}`);
    }
    
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

    // 自动诊断模式
    if (AUTO_DIAGNOSE) {
        console.log(`\n🔍 自动诊断模式: ${AUTO_DIAGNOSE}`);
        // 先获取会话列表
        await displaySessions();
        // 然后诊断指定会话
        await diagnoseSession(AUTO_DIAGNOSE);
        rl.close();
        if (socket) socket.close();
        process.exit(0);
    }
    
    // 自动测试模式
    if (AUTO_TEST) {
        console.log(`\n🧪 自动测试模式: ${AUTO_TEST}`);
        // 先获取会话列表
        await displaySessions();
        
        // 设置当前会话以接收实时更新
        const fullId = Object.keys(sessions).find(id => id.startsWith(AUTO_TEST)) || AUTO_TEST;
        currentChatSessionId = fullId;
        chatModeRl = rl;
        
        // 发送测试消息
        const testMessage = '你好，这是来自 mini-client 的测试消息，请简短回复';
        console.log(`\n📤 发送测试消息: "${testMessage}"`);
        await sendUserMessage(AUTO_TEST, testMessage);
        
        // 等待 15 秒看看有没有回复
        console.log('\n⏳ 等待 15 秒接收回复...');
        await new Promise(resolve => setTimeout(resolve, 15000));
        
        // 获取并显示最新消息
        console.log('\n📥 获取最新消息:');
        await displayMessages(AUTO_TEST);
        
        rl.close();
        if (socket) socket.close();
        process.exit(0);
    }

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
                await startChatMode(rl);
                break;
            
            case '5':
                const sessionIdForDiag = await question('请输入会话 ID (可以只输入前几位): ');
                if (sessionIdForDiag.trim()) {
                    await diagnoseSession(sessionIdForDiag.trim());
                }
                break;
            
            case '6':
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
