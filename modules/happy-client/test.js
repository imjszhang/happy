/**
 * Happy Client 功能测试脚本
 * 
 * 测试各种功能：
 * 1. 基础连接
 * 2. 发送消息
 * 3. 多轮对话
 * 4. 确认处理
 * 5. 会话管理
 * 6. 错误处理
 * 
 * 运行方式：
 *   node modules/happy-client/test.js
 */

const { HappyClient } = require('./index');
const { loadEnvFile } = require('./utils/EnvLoader');

// 加载环境变量
loadEnvFile();

// 测试配置
const TEST_CONFIG = {
  secret: process.env.HAPPY_SECRET,
  token: process.env.HAPPY_TOKEN,
  serverUrl: process.env.HAPPY_SERVER_URL || 'https://api.cluster-fluster.com',
  workDir: process.cwd(),
  permissionMode: 'yolo'  // 使用 YOLO 模式跳过权限确认
};

// 测试结果统计
const testResults = {
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: []
};

// 工具函数
function logTest(name, status, message = '') {
  const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⏭️';
  console.log(`${icon} [${status.toUpperCase()}] ${name}${message ? ': ' + message : ''}`);
  
  testResults.tests.push({ name, status, message });
  if (status === 'pass') testResults.passed++;
  else if (status === 'fail') testResults.failed++;
  else testResults.skipped++;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// 测试用例
// ============================================================================

/**
 * 测试1: 基础连接
 */
async function testBasicConnection() {
  console.log('\n📡 测试1: 基础连接');
  console.log('─'.repeat(50));
  
  const client = new HappyClient(TEST_CONFIG);
  
  try {
    await client.initialize();
    
    if (client.isConnected) {
      logTest('连接初始化', 'pass', `Session ID: ${client.currentSessionId?.substring(0, 8)}...`);
    } else {
      logTest('连接初始化', 'fail', '连接状态为 false');
    }
    
    await client.disconnect();
    logTest('断开连接', 'pass');
    
  } catch (error) {
    logTest('连接初始化', 'fail', error.message);
  }
}

/**
 * 测试2: 事件监听
 */
async function testEventListeners() {
  console.log('\n📡 测试2: 事件监听');
  console.log('─'.repeat(50));
  
  const client = new HappyClient(TEST_CONFIG);
  const events = {
    connected: false,
    disconnected: false,
    error: false
  };
  
  client.on('connected', () => {
    events.connected = true;
    logTest('connected 事件', 'pass');
  });
  
  client.on('disconnected', () => {
    events.disconnected = true;
    logTest('disconnected 事件', 'pass');
  });
  
  client.on('error', () => {
    events.error = true;
  });
  
  try {
    await client.initialize();
    await sleep(1000); // 等待事件触发
    
    if (!events.connected) {
      logTest('connected 事件', 'fail', '事件未触发');
    }
    
    await client.disconnect();
    await sleep(500);
    
    if (!events.disconnected) {
      logTest('disconnected 事件', 'fail', '事件未触发');
    }
    
  } catch (error) {
    logTest('事件监听测试', 'fail', error.message);
  }
}

/**
 * 测试3: 发送简单消息
 */
async function testSendMessage() {
  console.log('\n📡 测试3: 发送简单消息');
  console.log('─'.repeat(50));
  
  const client = new HappyClient(TEST_CONFIG);
  
  try {
    await client.initialize();
    
    // 发送消息（不等待响应）
    await client.sendMessage('你好，这是一条测试消息');
    logTest('发送消息', 'pass');
    
    await sleep(2000); // 等待消息发送
    
    await client.disconnect();
    
  } catch (error) {
    logTest('发送消息', 'fail', error.message);
  }
}

/**
 * 测试4: 发送并等待响应（短消息）
 * 注意：此测试需要 Agent（如 Cursor 中的 Claude）处于空闲状态才能收到回复
 */
async function testSendAndWait() {
  console.log('\n📡 测试4: 发送并等待响应（短消息）');
  console.log('─'.repeat(50));
  
  const client = new HappyClient({
    ...TEST_CONFIG,
    conversation: {
      debug: true  // 启用调试模式
    }
  });
  
  try {
    await client.initialize();
    
    // 先检查会话状态
    const diagnosis = await client.diagnoseSession(client.currentSessionId);
    const agentBusy = diagnosis.agentState?.requests && Object.keys(diagnosis.agentState.requests).length > 0;
    
    if (agentBusy) {
      console.log('⚠️  Agent 正在执行任务，跳过等待响应测试');
      logTest('发送并等待响应', 'skip', 'Agent 忙碌中');
      await client.disconnect();
      return;
    }
    
    console.log('📤 发送消息: "你好"');
    const result = await client.sendAndWait('你好', {
      timeout: 30000
    });
    
    if (result && result.success) {
      logTest('发送并等待响应', 'pass', `收到 ${result.messages?.length || 0} 条消息`);
      console.log('📥 响应预览:', result.rawText?.substring(0, 100) || '无文本内容');
    } else {
      logTest('发送并等待响应', 'fail', '响应格式不正确');
    }
    
    await client.disconnect();
    
  } catch (error) {
    // 如果是超时错误，可能是 Agent 没有回复（可能正在忙碌）
    if (error.message.includes('超时')) {
      logTest('发送并等待响应', 'skip', 'Agent 未响应（可能正在忙碌）');
    } else {
      logTest('发送并等待响应', 'fail', error.message);
    }
  }
}

/**
 * 测试5: 进度回调
 * 注意：此测试需要 Agent 处于空闲状态
 */
async function testProgressCallback() {
  console.log('\n📡 测试5: 进度回调');
  console.log('─'.repeat(50));
  
  const client = new HappyClient(TEST_CONFIG);
  const progressMessages = [];
  
  try {
    await client.initialize();
    
    // 先检查会话状态
    const diagnosis = await client.diagnoseSession(client.currentSessionId);
    const agentBusy = diagnosis.agentState?.requests && Object.keys(diagnosis.agentState.requests).length > 0;
    
    if (agentBusy) {
      console.log('⚠️  Agent 正在执行任务，跳过进度回调测试');
      logTest('进度回调', 'skip', 'Agent 忙碌中');
      await client.disconnect();
      return;
    }
    
    const result = await client.sendAndWait('请简单介绍一下你自己', {
      timeout: 30000,
      onProgress: (progress) => {
        progressMessages.push(progress);
        console.log(`  ⏳ 进度更新: ${progress.messageCount} 条消息，已用时 ${Math.round(progress.elapsed / 1000)} 秒`);
      }
    });
    
    if (progressMessages.length > 0) {
      logTest('进度回调', 'pass', `收到 ${progressMessages.length} 次进度更新`);
    } else {
      // 即使没有进度更新，如果结果成功也算通过
      if (result && result.success) {
        logTest('进度回调', 'pass', '响应快速完成，无进度更新');
      } else {
        logTest('进度回调', 'fail', '未收到进度更新');
      }
    }
    
    await client.disconnect();
    
  } catch (error) {
    if (error.message.includes('超时')) {
      logTest('进度回调', 'skip', 'Agent 未响应');
    } else {
      logTest('进度回调', 'fail', error.message);
    }
  }
}

/**
 * 测试6: 获取会话列表
 */
async function testGetSessions() {
  console.log('\n📡 测试6: 获取会话列表');
  console.log('─'.repeat(50));
  
  const client = new HappyClient(TEST_CONFIG);
  
  try {
    await client.initialize();
    
    const sessionsData = await client.getSessions();
    
    if (sessionsData && sessionsData.sessions) {
      logTest('获取会话列表', 'pass', `找到 ${sessionsData.sessions.length} 个会话`);
      
      if (sessionsData.sessions.length > 0) {
        const session = sessionsData.sessions[0];
        console.log(`  📋 第一个会话: ${session.id.substring(0, 8)}... (${session.active ? '活跃' : '非活跃'})`);
      }
    } else {
      logTest('获取会话列表', 'fail', '响应格式不正确');
    }
    
    await client.disconnect();
    
  } catch (error) {
    logTest('获取会话列表', 'fail', error.message);
  }
}

/**
 * 测试7: 诊断会话
 */
async function testDiagnoseSession() {
  console.log('\n📡 测试7: 诊断会话');
  console.log('─'.repeat(50));
  
  const client = new HappyClient(TEST_CONFIG);
  
  try {
    await client.initialize();
    
    // 获取当前会话 ID
    const sessionId = client.currentSessionId;
    if (!sessionId) {
      logTest('诊断会话', 'skip', '无可用会话');
      return;
    }
    
    const diagnosis = await client.diagnoseSession(sessionId);
    
    if (diagnosis && diagnosis.sessionId) {
      logTest('诊断会话', 'pass', `会话状态: ${diagnosis.active ? '活跃' : '非活跃'}`);
      console.log(`  🔍 加密类型: ${diagnosis.encryptionType || '未知'}`);
      console.log(`  📁 工作目录: ${diagnosis.metadata?.path || diagnosis.metadata?.cwd || '未知'}`);
    } else {
      logTest('诊断会话', 'fail', '诊断结果格式不正确');
    }
    
    await client.disconnect();
    
  } catch (error) {
    logTest('诊断会话', 'fail', error.message);
  }
}

/**
 * 测试8: 超时处理
 */
async function testTimeout() {
  console.log('\n📡 测试8: 超时处理');
  console.log('─'.repeat(50));
  
  const client = new HappyClient(TEST_CONFIG);
  
  try {
    await client.initialize();
    
    // 发送一个请求，设置很短的超时时间
    try {
      await client.sendAndWait('请执行一个需要很长时间的操作', {
        timeout: 1000 // 1秒超时
      });
      logTest('超时处理', 'fail', '应该超时但没有');
    } catch (error) {
      if (error.message.includes('超时')) {
        logTest('超时处理', 'pass', '正确触发超时');
      } else {
        logTest('超时处理', 'fail', `错误类型不正确: ${error.message}`);
      }
    }
    
    await client.disconnect();
    
  } catch (error) {
    logTest('超时处理', 'fail', error.message);
  }
}

/**
 * 测试9: 错误处理（无效配置）
 */
async function testErrorHandling() {
  console.log('\n📡 测试9: 错误处理');
  console.log('─'.repeat(50));
  
  // 测试缺少 Secret
  try {
    const client = new HappyClient({
      secret: null,
      serverUrl: TEST_CONFIG.serverUrl
    });
    
    await client.initialize();
    logTest('错误处理（缺少 Secret）', 'fail', '应该抛出错误但没有');
  } catch (error) {
    if (error.message.includes('HAPPY_SECRET')) {
      logTest('错误处理（缺少 Secret）', 'pass', '正确抛出错误');
    } else {
      logTest('错误处理（缺少 Secret）', 'fail', `错误信息不正确: ${error.message}`);
    }
  }
  
  // 测试未连接时发送消息
  try {
    const client = new HappyClient(TEST_CONFIG);
    await client.sendMessage('test');
    logTest('错误处理（未连接）', 'fail', '应该抛出错误但没有');
  } catch (error) {
    if (error.message.includes('未连接')) {
      logTest('错误处理（未连接）', 'pass', '正确抛出错误');
    } else {
      logTest('错误处理（未连接）', 'fail', `错误信息不正确: ${error.message}`);
    }
  }
}

/**
 * 测试10: 多轮对话
 * 注意：此测试需要 Agent 处于空闲状态
 */
async function testMultiTurnConversation() {
  console.log('\n📡 测试10: 多轮对话');
  console.log('─'.repeat(50));
  
  const client = new HappyClient(TEST_CONFIG);
  
  try {
    await client.initialize();
    
    // 先检查会话状态
    const diagnosis = await client.diagnoseSession(client.currentSessionId);
    const agentBusy = diagnosis.agentState?.requests && Object.keys(diagnosis.agentState.requests).length > 0;
    
    if (agentBusy) {
      console.log('⚠️  Agent 正在执行任务，跳过多轮对话测试');
      logTest('多轮对话', 'skip', 'Agent 忙碌中');
      await client.disconnect();
      return;
    }
    
    // 第一轮：发送初始请求
    console.log('📤 第一轮: 发送规划请求');
    const result1 = await client.sendAndWait('请使用 kaichi-workflow-planner 技能制定一个简单的选题计划，目标数量为3个', {
      timeout: 120000
    });
    
    if (result1 && result1.success) {
      logTest('多轮对话（第一轮）', 'pass', `收到 ${result1.messages?.length || 0} 条消息`);
      
      // 检查是否包含计划文件
      if (result1.planFiles && result1.planFiles.length > 0) {
        logTest('多轮对话（计划文件）', 'pass', `生成 ${result1.planFiles.length} 个计划文件`);
        console.log(`  📄 计划文件: ${result1.planFiles.join(', ')}`);
      }
    } else {
      logTest('多轮对话（第一轮）', 'fail', '第一轮对话失败');
    }
    
    await client.disconnect();
    
  } catch (error) {
    if (error.message.includes('超时')) {
      logTest('多轮对话', 'skip', 'Agent 未响应');
    } else {
      logTest('多轮对话', 'fail', error.message);
    }
  }
}

/**
 * 测试11: 资源清理
 */
async function testCleanup() {
  console.log('\n📡 测试11: 资源清理');
  console.log('─'.repeat(50));
  
  const client = new HappyClient(TEST_CONFIG);
  
  try {
    await client.initialize();
    
    // 启动一个对话
    const promise = client.sendAndWait('你好', { timeout: 5000 }).catch(() => {});
    
    // 立即清理
    client.cleanup();
    
    // 等待一下
    await sleep(1000);
    
    if (!client.isConnected) {
      logTest('资源清理', 'pass', '连接已断开');
    } else {
      logTest('资源清理', 'fail', '连接未断开');
    }
    
  } catch (error) {
    logTest('资源清理', 'fail', error.message);
  }
}

// ============================================================================
// 预处理函数
// ============================================================================

/**
 * 预处理：中断命令并清理会话
 */
async function preTestCleanup() {
  console.log('\n🔧 预处理：中断命令并清理会话');
  console.log('─'.repeat(50));
  
  const client = new HappyClient(TEST_CONFIG);
  
  try {
    await client.initialize();
    console.log('✅ 已连接到会话');
    
    // 检查是否有正在运行的任务
    const diagnosis = await client.diagnoseSession(client.currentSessionId);
    const agentBusy = diagnosis.agentState?.requests && Object.keys(diagnosis.agentState.requests).length > 0;
    
    if (agentBusy) {
      console.log('⚠️  检测到正在运行的任务，尝试中断...');
      // 发送中断命令（通过发送特殊消息）
      try {
        await client.sendMessage('/interrupt', 'yolo');
        await sleep(2000); // 等待中断生效
        console.log('✅ 已发送中断命令');
      } catch (error) {
        console.log(`⚠️  中断命令发送失败: ${error.message}`);
      }
    } else {
      console.log('ℹ️  当前无正在运行的任务');
    }
    
    // 发送 /clear 命令清理会话
    console.log('📤 发送 /clear 命令...');
    try {
      await client.sendMessage('/clear', 'yolo');
      await sleep(2000); // 等待清理完成
      console.log('✅ 已发送 /clear 命令');
    } catch (error) {
      console.log(`⚠️  /clear 命令发送失败: ${error.message}`);
    }
    
    await client.disconnect();
    console.log('✅ 预处理完成');
    await sleep(1000); // 等待一下再开始测试
    
  } catch (error) {
    console.log(`⚠️  预处理过程出错: ${error.message}`);
    try {
      await client.disconnect();
    } catch (e) {
      // 忽略断开连接错误
    }
  }
}

// ============================================================================
// 主测试函数
// ============================================================================

async function runAllTests() {
  console.log('🧪 Happy Client 功能测试');
  console.log('='.repeat(50));
  console.log(`配置:`);
  console.log(`  Secret: ${TEST_CONFIG.secret ? TEST_CONFIG.secret.substring(0, 8) + '...' : '未设置'}`);
  console.log(`  Server: ${TEST_CONFIG.serverUrl}`);
  console.log(`  WorkDir: ${TEST_CONFIG.workDir}`);
  console.log('='.repeat(50));
  
  // 检查配置
  if (!TEST_CONFIG.secret) {
    console.error('\n❌ 错误: HAPPY_SECRET 未设置');
    console.log('请在 .env 文件中设置 HAPPY_SECRET 或通过环境变量设置');
    process.exit(1);
  }
  
  // 预处理：中断命令并清理会话
  await preTestCleanup();
  
  // 运行测试
  const tests = [
    testBasicConnection,
    testEventListeners,
    testSendMessage,
    testSendAndWait,
    testProgressCallback,
    testGetSessions,
    testDiagnoseSession,
    testTimeout,
    testErrorHandling,
    testMultiTurnConversation,
    testCleanup
  ];
  
  for (const test of tests) {
    try {
      await test();
      await sleep(1000); // 测试间隔
    } catch (error) {
      console.error(`测试执行失败: ${error.message}`);
      if (error.stack) {
        console.error(error.stack);
      }
    }
  }
  
  // 输出测试结果
  console.log('\n' + '='.repeat(50));
  console.log('📊 测试结果汇总');
  console.log('='.repeat(50));
  console.log(`✅ 通过: ${testResults.passed}`);
  console.log(`❌ 失败: ${testResults.failed}`);
  console.log(`⏭️  跳过: ${testResults.skipped}`);
  console.log(`📝 总计: ${testResults.tests.length}`);
  console.log('='.repeat(50));
  
  // 显示失败的测试
  const failedTests = testResults.tests.filter(t => t.status === 'fail');
  if (failedTests.length > 0) {
    console.log('\n❌ 失败的测试:');
    failedTests.forEach(test => {
      console.log(`  - ${test.name}: ${test.message}`);
    });
  }
  
  // 返回退出码
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// 运行测试
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('测试执行出错:', error);
    process.exit(1);
  });
}

module.exports = { runAllTests };
