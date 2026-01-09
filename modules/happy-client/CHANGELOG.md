# 更新日志

本文档记录 HappyClient 模块的所有重要更新和变更。

## [未发布]

### 计划中
- 待添加的功能和改进

---

## [3.0.0] - 2026-01-09

### 新增
- ✨ **Todo 任务管理** - 完整的任务增删改查功能
  - `getTodos()` - 获取所有任务列表
  - `addTodo(title)` - 添加新任务
  - `toggleTodo(id)` - 切换任务完成状态
  - `editTodo(id, title)` - 编辑任务标题
  - `deleteTodo(id)` - 删除任务
  - 支持任务 ID 前缀匹配
  - 新增事件：`todo:added`, `todo:toggled`, `todo:edited`, `todo:deleted`
- ✨ **Machine RPC 基础设施** - 支持远程机器控制
  - `machineRPC(machineId, method, params)` - 通用机器 RPC 调用
  - `spawnRemoteSession(machineId, directory, options)` - 远程启动会话，支持多 Agent 类型（claude/codex/gemini）
  - `stopMachineDaemon(machineId)` - 停止远程机器 Daemon
  - `executeMachineCommand(machineId, command, cwd)` - 在远程机器执行命令
  - 新增事件：`machine:sessionSpawned`, `machine:daemonStopped`
- ✨ **Session 文件操作 RPC** - 远程文件系统操作
  - `readRemoteFile(sessionId, filePath)` - 读取远程文件
  - `writeRemoteFile(sessionId, filePath, content, expectedHash)` - 写入远程文件
  - `listRemoteDirectory(sessionId, dirPath)` - 列出目录内容
  - `getRemoteDirectoryTree(sessionId, dirPath, maxDepth)` - 获取目录树结构
  - `searchRemoteFiles(sessionId, pattern, cwd)` - 使用 ripgrep 搜索文件
  - `executeRemoteCommand(sessionId, command, cwd)` - 执行 bash 命令

### 新增模块
- ✨ **todo/TodoManager.js** - Todo 任务管理器
  - 使用 KV 存储，SecretBox 加密
  - 支持任务索引和排序
  - 维护已完成和未完成任务列表

### 技术细节
- WebSocketClient.js 新增 `machineRPC` 方法
- HappyClient.js 新增 TodoManager 初始化和便捷方法
- 新建 todo 目录，包含 TodoManager.js 和 index.js

### 兼容性
- ✅ 向后兼容：所有新功能为增量添加
- ✅ 与 happy-mini-client.js v3.0.0 功能对齐

---

## [2.2.0] - 2026-01-04

### 新增
- ✨ **X-API-Key 认证支持** - 支持服务器 API Key 保护
  - `apiKey` 构造选项，用于配置服务级别 API Key
  - 支持 `HAPPY_API_KEY` 环境变量
  - 所有 HTTP 请求自动添加 `X-API-Key` 请求头
  - WebSocket 连接支持 API Key（通过 `extraHeaders`）
  - 认证请求（`/v1/auth`）支持 API Key

### 技术细节
- HttpApi.js 新增 `apiKey` 参数和 `_getHeaders(token)` 私有方法
- WebSocketClient.js 新增 `apiKey` 参数和 `extraHeaders` 配置
- Auth.js 新增 `apiKey` 参数，认证请求添加 `X-API-Key` 头
- HappyClient.js 新增 `apiKey` 配置选项，支持从环境变量读取

### 兼容性
- ✅ 向后兼容：如果不配置 `apiKey`，行为与之前完全一致
- ✅ 与 happy-mini-client.js v2.2.0 行为一致
- ✅ 符合 happy-client-development-guide.md 规范

---

## [2.1.0] - 2025-12-26

### 新增
- ✨ **Session RPC 调用** - 通用 RPC 调用机制，用于向会话发送控制命令
  - `sessionRPC(sessionId, method, params)` - 发送 RPC 调用并获取结果
- ✨ **软中止功能** - 中止当前操作，会话继续存活
  - `abortSession(sessionId, reason)` - 软中止会话当前操作
  - 默认中止原因提示 Agent 停止并等待用户指令
- ✨ **硬中止功能** - 完全终止会话进程
  - `killSession(sessionId)` - 终止会话进程
  - 终止后自动触发 `session:killed` 事件
- ✨ **新增事件** - 会话控制相关事件
  - `session:aborted` - 会话软中止完成
  - `session:killed` - 会话硬中止完成

### 技术细节
- WebSocketClient.js 新增 `sessionRPC` 方法，支持加密的 RPC 调用
- 使用 `socket.emitWithAck('rpc-call')` 实现同步 RPC 调用
- RPC 参数和返回值均使用会话加密密钥加密

---

## [2.0.0] - 2025-12-21

### 新增
- ✨ **账户管理** - 查看账户资料 (`getProfile`)、设置 (`getSettings`)、更新设置 (`updateSettings`)
- ✨ **机器管理** - 查看机器列表及解密的元数据 (`getMachines`)
- ✨ **使用量统计** - 查询 Token 使用量和费用 (`getUsage`)，支持 today/7days/30days 周期
- ✨ **Artifacts 管理** - 完整 CRUD 功能
  - `getArtifacts()` - 获取 Artifacts 列表
  - `getArtifact(id)` - 获取单个 Artifact（含解密内容）
  - `createArtifact(header, body)` - 创建 Artifact
  - `updateArtifact(id, header, body)` - 更新 Artifact
  - `deleteArtifact(id)` - 删除 Artifact
- ✨ **KV 存储** - 键值对存储操作
  - `kvList(prefix)` - 列出 KV 数据
  - `kvGet(key)` - 获取 KV 值
  - `kvSet(key, value)` - 设置 KV 值
  - `kvDelete(key)` - 删除 KV 值
- ✨ **社交功能** - 好友和用户管理
  - `getFriends()` - 获取好友列表
  - `searchUsers(query)` - 搜索用户
  - `getUser(userId)` - 获取用户资料
  - `addFriend(userId)` - 添加好友
  - `removeFriend(userId)` - 移除好友
- ✨ **Feed 动态** - `getFeed(options)` 获取动态 Feed，支持分页
- ✨ **服务连接管理**
  - `getConnectedServices()` - 获取已连接服务列表
  - `disconnectService(service)` - 断开服务连接
- ✨ **会话删除** - `deleteSession(sessionId)` 删除指定会话
- ✨ **机器加密** - Encryption 模块支持机器数据加密/解密
- ✨ **Artifact 加密** - Encryption 模块支持 Artifact 数据加密/解密
- ✨ **旧版加密** - `encryptLegacy()` 方法用于设置等数据的加密

### 改进
- 🔄 **HttpApi 扩展** - 新增 18 个 HTTP API 方法，覆盖所有服务端接口
- 🔄 **Encryption 增强** - 支持会话、机器、Artifact 三种类型的加密上下文管理
- 🔄 **Token 缓存** - 添加 Token 缓存机制，减少重复认证请求
- 🔄 **会话列表增强** - `getSessions()` 返回解密后的元数据
- 📝 **文档更新** - 完善 API 参考文档，添加所有新功能的使用示例

### 技术细节
- HttpApi.js 新增方法：`deleteSession`, `fetchProfile`, `fetchSettings`, `updateSettings`, `fetchMachines`, `queryUsage`, `fetchArtifacts`, `fetchArtifact`, `createArtifact`, `updateArtifact`, `deleteArtifact`, `kvList`, `kvGet`, `kvMutate`, `fetchFriends`, `searchUsers`, `fetchUser`, `addFriend`, `removeFriend`, `fetchFeed`, `disconnectService`
- Encryption.js 新增属性：`machineEncryptions`, `artifactEncryptions`
- Encryption.js 新增方法：`initializeMachine`, `initializeArtifact`, `getMachineEncryption`, `getArtifactEncryption`, `encryptLegacy`
- HappyClient.js 新增约 20 个高层 API 方法

---

## [1.0.0] - 2025-12-20

### 新增
- ✨ 初始版本发布
- ✨ 核心客户端类 HappyClient，提供统一 API 接口
- ✨ 自动认证功能，支持从 Secret Key 恢复 Token
- ✨ 加密通信模块，基于 libsodium 的端到端加密
- ✨ WebSocket 客户端，支持实时双向通信和自动重连
- ✨ 会话管理功能，通过工作目录自动匹配 Session
- ✨ 多轮对话管理，自动处理多轮交互和上下文
- ✨ 确认处理机制，支持自动和手动确认
- ✨ 权限模式支持，提供多种权限模式（default、acceptEdits、plan、yolo 等）
- ✨ 事件驱动架构，基于 EventEmitter 的事件系统
- ✨ HTTP API 封装，提供会话和消息查询接口
- ✨ 消息提取器，支持 JSON 和文本格式的响应解析
- ✨ 环境变量支持，可通过 .env 文件配置

### 改进
- 🔄 模块化设计，核心功能独立，易于扩展和维护

---

## 更新说明

### 版本号规则
- **主版本号** (x.0.0): 不兼容的 API 变更
- **次版本号** (0.x.0): 新增功能，向后兼容
- **修订号** (0.0.x): 问题修复和小改进

### 更新类型标记
- ✨ **新增** - 新功能
- 🔄 **改进** - 功能改进或优化
- 🐛 **修复** - Bug 修复
- 📝 **文档** - 文档更新
- 🔧 **配置** - 配置变更
- ⚠️ **破坏性变更** - 不兼容的变更
- 🗑️ **废弃** - 即将移除的功能
- 🚀 **发布** - 正式发布
- 🔐 **安全** - 安全相关修复

---

*最后更新: 2026-01-09*
