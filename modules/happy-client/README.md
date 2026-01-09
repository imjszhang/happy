# HappyClient Happy 客户端模块

> 创建时间: 2025-12-20  
> 最后更新: 2025-12-26

## 概述

HappyClient 是一个模块化的客户端库，用于与 Happy Server 进行交互。封装了认证、加密、WebSocket 通信、多轮对话等功能，提供简洁的 API 接口，便于其他模块集成使用。

## 核心功能

- 🔐 **自动认证** - 支持从 Secret Key 自动恢复 Token，简化认证流程
- 🔒 **加密通信** - 基于 libsodium 的端到端加密，保障通信安全
- 📡 **WebSocket 连接** - 实时双向通信，支持自动重连机制
- 💬 **多轮对话** - 自动处理多轮交互，支持对话上下文管理
- ✅ **确认处理** - 自动或手动处理技能调用中的确认请求
- 📍 **会话管理** - 通过工作目录自动匹配 Session，支持会话诊断和删除
- ⏹️ **会话控制** - 支持软中止（abort）和硬中止（kill）操作
- ⚙️ **权限模式** - 支持多种权限模式（default、acceptEdits、plan、yolo 等）
- 📢 **事件驱动** - 基于 EventEmitter 的事件系统，便于监听和集成
- 👤 **账户管理** - 查看和修改账户资料、设置
- 🖥️ **机器管理** - 查看 CLI 实例列表和状态
- 📊 **使用量统计** - 查询 Token 使用量和费用
- 📦 **Artifacts** - 创建、查看、更新、删除制品
- 🔑 **KV 存储** - 键值对存储操作
- 👥 **社交功能** - 好友列表、用户搜索、动态 Feed
- 🔗 **服务连接** - 管理第三方服务连接状态

## 架构设计

```
happy-client/
├── index.js                    # 模块入口，导出主要类和工具
├── HappyClient.js              # 核心客户端类，统一接口封装
├── core/                       # 核心功能模块
│   ├── Encryption.js           # 加密管理，处理会话/机器/Artifact加密
│   ├── Auth.js                 # 认证管理，Token 获取和验证
│   └── SessionManager.js       # 会话管理，Session 查找和匹配
├── api/                        # API 封装层
│   ├── HttpApi.js              # HTTP API 封装，完整 REST 接口
│   └── WebSocketClient.js      # WebSocket 客户端，实时通信
├── conversation/               # 对话管理模块
│   ├── ConversationManager.js  # 对话管理器，处理多轮交互
│   ├── ConfirmationHandler.js  # 确认处理器，处理确认请求
│   └── MessageExtractor.js     # 消息提取器，解析响应内容
└── utils/                      # 工具函数
    ├── CryptoUtils.js          # 加密工具函数
    ├── KeyUtils.js             # 密钥工具函数
    ├── ModeUtils.js            # 权限模式工具函数
    ├── EnvLoader.js            # 环境变量加载器
    └── index.js                # 工具函数统一导出
```

## 组件说明

### HappyClient

主客户端类，提供统一的 API 接口：

- 初始化连接（认证、Session 查找、WebSocket 连接）
- 发送消息并等待响应（自动处理多轮交互）
- 发送消息（不等待响应）
- 会话管理（获取会话列表、消息列表、删除会话、诊断会话）
- 会话控制（软中止、硬中止、RPC 调用）
- 账户管理（获取资料、设置，更新设置）
- 机器管理（获取机器列表）
- 使用量统计（查询使用量）
- Artifacts 管理（CRUD 操作）
- KV 存储（列表、获取、设置、删除）
- 社交功能（好友、用户搜索、Feed）
- 服务连接管理
- 权限模式管理（设置和获取权限模式）
- 事件监听（连接、对话、错误等事件）

**状态枚举**:
- `isConnected` - 连接状态（boolean）
- `currentSessionId` - 当前会话 ID（string | null）
- `currentPermissionMode` - 当前权限模式（string）

### Encryption

加密管理模块，负责端到端加密：

- 从 Master Secret 生成加密密钥
- 加密和解密消息内容
- 管理会话、机器、Artifact 的加密上下文
- 支持旧版加密（用于设置等）

### Auth

认证管理模块，处理用户认证：

- 从 Secret Key 恢复 Token
- 生成挑战签名
- 标准化 Secret Key 格式

### SessionManager

会话管理模块，处理 Session 相关操作：

- 通过工作目录查找匹配的 Session
- 初始化会话加密
- 诊断会话状态和加密信息

### HttpApi

HTTP API 封装，提供完整的 RESTful 接口：

- 会话管理（列表、消息、删除）
- 账户管理（资料、设置）
- 机器管理
- 使用量统计
- Artifacts CRUD
- KV 存储
- 社交功能
- Feed 动态
- 服务连接

### WebSocketClient

WebSocket 客户端，处理实时通信：

- 建立和维护 WebSocket 连接
- 自动重连机制
- 发送加密消息
- 接收服务器更新

### ConversationManager

对话管理器，处理多轮交互：

- 发送消息并等待完整响应
- 提取和解析响应内容
- 管理对话上下文

**配置选项**:
- `strategy` - 消息处理策略（auto/smart/manual）
- `timeout` - 默认超时时间（毫秒，默认 60000）
- `permissionMode` - 权限模式（默认 'default'）

### MessageExtractor

消息提取器，解析响应内容：

- 提取 JSON 格式的响应
- 提取文本格式的响应
- 识别计划文件路径
- 解析消息类型

## 配置说明

### 环境变量

支持通过环境变量或 `.env` 文件配置：

```bash
HAPPY_SECRET=your_secret_key_here          # 必需，Secret Key
HAPPY_TOKEN=your_token_here                # 可选，Token（会自动从 Secret Key 恢复）
HAPPY_SERVER_URL=https://api.cluster-fluster.com  # 可选，服务器地址
HAPPY_MODE=default                          # 可选，默认权限模式
```

### 构造函数选项

```javascript
{
  secret: string,              // Secret Key（必需）
  token: string,               // Token（可选，会自动恢复）
  serverUrl: string,           // 服务器地址（默认 https://api.cluster-fluster.com）
  workDir: string,            // 工作目录（默认 process.cwd()）
  autoReconnect: boolean,      // 自动重连（默认 true）
  reconnectInterval: number,   // 重连间隔（毫秒，默认 60000）
  permissionMode: string,     // 权限模式（默认 'default'）
  conversation: {             // 对话配置
    strategy: string,         // 消息处理策略（默认 'auto'）
    timeout: number           // 默认超时时间（毫秒，默认 60000）
  }
}
```

### 权限模式

支持的权限模式：

| 模式 | 显示名称 | 说明 |
|------|---------|------|
| `default` | 默认 | 标准权限模式 |
| `acceptEdits` | 接受编辑 | 允许接受编辑操作 |
| `plan` | 计划模式 | 仅生成计划，不执行 |
| `bypassPermissions` | 跳过权限 | 跳过权限检查 |
| `read-only` | 只读 | 只读模式 |
| `safe-yolo` | Safe YOLO | 安全 YOLO 模式 |
| `yolo` | YOLO | YOLO 模式 |

### 确认策略

- `auto` - 自动确认（默认）
- `smart` - 智能确认（根据场景判断）
- `manual` - 手动确认（需要监听事件并手动调用）

## API 参考

### 会话管理

```javascript
// 获取会话列表（含解密的元数据）
const { sessions } = await client.getSessions();

// 获取消息列表
const { messages } = await client.getMessages(sessionId);

// 删除会话
await client.deleteSession(sessionId);

// 诊断会话
const diagnosis = await client.diagnoseSession(sessionId);
```

### 会话控制

```javascript
// 软中止 - 中止当前操作，会话继续存活
await client.abortSession();                    // 中止当前会话
await client.abortSession(sessionId);           // 中止指定会话
await client.abortSession(sessionId, '用户取消'); // 自定义中止原因

// 硬中止 - 完全终止会话进程
await client.killSession();                     // 终止当前会话
await client.killSession(sessionId);            // 终止指定会话

// 通用 RPC 调用（高级用法）
const result = await client.sessionRPC(sessionId, 'methodName', { param: 'value' });
```

### 消息收发

```javascript
// 发送消息并等待响应
const result = await client.sendAndWait('你好', {
  timeout: 60000,
  onProgress: (progress) => console.log(progress)
});

// 发送消息（不等待响应）
await client.sendMessage('你好');

// 使用特定权限模式发送
await client.sendMessage('你好', 'yolo');
```

### 账户管理

```javascript
// 获取账户资料
const profile = await client.getProfile();
console.log(profile.firstName, profile.github?.login);

// 获取账户设置
const { settings, settingsVersion } = await client.getSettings();

// 更新账户设置
await client.updateSettings({
  viewInline: true,
  showLineNumbers: true
});
```

### 机器管理

```javascript
// 获取机器列表（含解密的元数据）
const machines = await client.getMachines();
for (const machine of machines) {
  console.log(machine.id, machine.active, machine.decryptedMetadata?.hostname);
}
```

### 使用量统计

```javascript
// 获取 7 天使用量
const usage = await client.getUsage('7days');
console.log('总 Tokens:', usage.summary.totalTokens);
console.log('总费用:', usage.summary.totalCost);

// 支持的周期: 'today', '7days', '30days'
const todayUsage = await client.getUsage('today');
```

### Artifacts 管理

```javascript
// 获取 Artifacts 列表
const artifacts = await client.getArtifacts();

// 获取单个 Artifact（含解密内容）
const artifact = await client.getArtifact(artifactId);
console.log(artifact.decryptedHeader?.title);
console.log(artifact.decryptedBody?.body);

// 创建 Artifact
const result = await client.createArtifact(
  { title: '我的笔记', draft: false },
  { body: '笔记内容...' }
);

// 更新 Artifact
await client.updateArtifact(artifactId,
  { title: '更新的标题' },
  { body: '更新的内容' }
);

// 删除 Artifact
await client.deleteArtifact(artifactId);
```

### KV 存储

```javascript
// 列出 KV 数据
const { items } = await client.kvList('prefix:');

// 获取 KV 值
const item = await client.kvGet('my-key');
if (item) {
  console.log(item.key, item.value, item.version);
}

// 设置 KV 值
await client.kvSet('my-key', 'my-value');

// 删除 KV 值
await client.kvDelete('my-key');
```

### 社交功能

```javascript
// 获取好友列表
const { friends } = await client.getFriends();

// 搜索用户
const { users } = await client.searchUsers('username');

// 获取用户资料
const userData = await client.getUser(userId);

// 添加好友
await client.addFriend(userId);

// 移除好友
await client.removeFriend(userId);
```

### Feed 动态

```javascript
// 获取动态
const { items, hasMore } = await client.getFeed({ limit: 20 });

// 分页获取
const olderItems = await client.getFeed({ 
  limit: 20, 
  before: lastItemTimestamp 
});
```

### 服务连接

```javascript
// 获取已连接服务
const services = await client.getConnectedServices();
console.log(services.github?.login);
console.log(services.connectedServices);

// 断开服务连接
await client.disconnectService('github');
```

### 权限模式

```javascript
// 获取当前模式
const mode = client.getPermissionMode();

// 获取模式显示名称
const displayName = client.getPermissionModeDisplayName();

// 设置模式
client.setPermissionMode('yolo');

// 获取支持的模式
const supportedModes = client.getSupportedModes();

// 静态方法
const allModes = HappyClient.getValidModes();
const modeNames = HappyClient.getModeDisplayNames();
```

## HTTP API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/v1/auth` | 认证接口，获取 Token |
| GET | `/v1/sessions` | 获取会话列表 |
| GET | `/v1/sessions/:id/messages` | 获取会话消息 |
| DELETE | `/v1/sessions/:id` | 删除会话 |
| GET | `/v1/account/profile` | 获取账户资料 |
| GET | `/v1/account/settings` | 获取账户设置 |
| POST | `/v1/account/settings` | 更新账户设置 |
| GET | `/v1/machines` | 获取机器列表 |
| POST | `/v1/usage/query` | 查询使用量 |
| GET | `/v1/artifacts` | 获取 Artifacts 列表 |
| GET | `/v1/artifacts/:id` | 获取单个 Artifact |
| POST | `/v1/artifacts` | 创建 Artifact |
| POST | `/v1/artifacts/:id` | 更新 Artifact |
| DELETE | `/v1/artifacts/:id` | 删除 Artifact |
| GET | `/v1/kv` | 获取 KV 列表 |
| GET | `/v1/kv/:key` | 获取 KV 值 |
| POST | `/v1/kv` | KV 批量操作 |
| GET | `/v1/friends` | 获取好友列表 |
| POST | `/v1/friends/add` | 添加好友 |
| POST | `/v1/friends/remove` | 移除好友 |
| GET | `/v1/user/search` | 搜索用户 |
| GET | `/v1/user/:id` | 获取用户资料 |
| GET | `/v1/feed` | 获取动态 |
| DELETE | `/v1/connect/:service` | 断开服务连接 |

## WebSocket 事件

**命名空间**: `/v1/updates`

**服务端事件**:
- `update` - 服务器推送的更新消息

**客户端事件**:
- `message` - 发送消息到服务器
- `rpc-call` - 发送 RPC 调用（如 abort、killSession）

## 客户端事件

HappyClient 继承自 EventEmitter，支持以下事件：

| 事件 | 参数 | 说明 |
|------|------|------|
| `connected` | `{ sessionId }` | 连接成功 |
| `disconnected` | - | 断开连接 |
| `ws:connect` | - | WebSocket 连接成功 |
| `ws:disconnect` | `reason` | WebSocket 断开 |
| `conversation:message` | `{ conversationId, text, type }` | 收到对话消息 |
| `session:aborted` | `{ sessionId }` | 会话软中止完成 |
| `session:killed` | `{ sessionId }` | 会话硬中止完成 |
| `permissionModeChanged` | `{ mode, originalMode }` | 权限模式变更 |
| `error` | `error` | 发生错误 |

## 使用示例

### 基础使用

```javascript
const { HappyClient } = require('./modules/happy-client');

async function main() {
  const client = new HappyClient({
    secret: process.env.HAPPY_SECRET,
    workDir: process.cwd()
  });
  
  try {
    await client.initialize();
    
    // 发送消息并等待响应
    const result = await client.sendAndWait('请帮我规划今日目标', {
      timeout: 120000
    });
    
    console.log('结果:', result);
  } finally {
    await client.disconnect();
  }
}

main();
```

### 完整功能示例

```javascript
const { HappyClient } = require('./modules/happy-client');

async function demo() {
  const client = new HappyClient({
    secret: process.env.HAPPY_SECRET
  });
  
  try {
    await client.initialize();
    
    // 账户信息
    const profile = await client.getProfile();
    console.log('用户:', profile.firstName);
    
    // 使用量统计
    const usage = await client.getUsage('7days');
    console.log('7天 Tokens:', usage.summary.totalTokens);
    
    // 会话列表
    const { sessions } = await client.getSessions();
    console.log('会话数:', sessions.length);
    
    // 机器列表
    const machines = await client.getMachines();
    console.log('机器数:', machines.length);
    
    // Artifacts
    const artifacts = await client.getArtifacts();
    console.log('Artifacts:', artifacts.length);
    
    // KV 存储
    await client.kvSet('test-key', 'test-value');
    const kv = await client.kvGet('test-key');
    console.log('KV:', kv?.value);
    
    // 好友列表
    const { friends } = await client.getFriends();
    console.log('好友数:', friends?.length || 0);
    
    // Feed 动态
    const { items } = await client.getFeed({ limit: 5 });
    console.log('动态数:', items?.length || 0);
    
  } finally {
    await client.disconnect();
  }
}

demo();
```

## 工作流程

```
┌─────────────────┐
│  创建客户端      │
└────────┬────────┘
         ▼
┌─────────────────┐
│  初始化连接      │
└────────┬────────┘
         ▼
    ┌────┴────┐
    │ 认证流程 │
    └────┬────┘
         ▼
┌─────────────────┐
│  查找 Session   │◀──── 通过 workDir 匹配
└────────┬────────┘
         ▼
┌─────────────────┐
│  连接 WebSocket │
└────────┬────────┘
         ▼
┌─────────────────┐
│  创建对话管理器  │
└────────┬────────┘
         ▼
┌─────────────────┐
│  发送消息        │
└────────┬────────┘
         ▼
    ┌────┴────┐
    │ 等待响应 │
    └────┬────┘
         ▼
    ┌────┴────┐
    │需要确认？│
    └────┬────┘
     是 │    │ 否
        ▼    ▼
   ┌────┐  ┌────┐
   │确认│  │返回│
   └────┘  └────┘
```

## 注意事项

1. **依赖安装**: 确保已安装 `libsodium-wrappers`、`axios`、`socket.io-client` 等依赖包
2. **Secret Key**: 必须提供有效的 Secret Key，否则无法进行认证
3. **Session 匹配**: 通过工作目录匹配 Session，确保 `workDir` 配置正确，否则可能匹配到错误的 Session
4. **超时设置**: 规划请求可能需要较长时间，建议设置较大的超时值（如 120 秒）
5. **错误处理**: 建议监听 `error` 事件并妥善处理，避免未捕获的错误导致程序崩溃
6. **连接管理**: 使用完毕后应调用 `disconnect()` 或 `cleanup()` 清理资源
7. **权限模式**: 不同权限模式会影响技能的执行行为，请根据实际需求选择合适的模式
8. **自动确认**: 启用自动确认时，某些危险操作可能会自动执行，请谨慎使用
9. **加密数据**: 所有敏感数据（设置、消息、Artifact 等）都使用端到端加密

## 依赖模块

- `libsodium-wrappers` - 加密库，用于端到端加密
- `axios` - HTTP 客户端，用于 RESTful API 调用
- `socket.io-client` - WebSocket 客户端，用于实时通信
- `events` - Node.js 内置模块，用于事件系统
