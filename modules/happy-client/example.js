/**
 * Happy Client 使用示例
 * 
 * 运行方式：
 *   node modules/happy-client/example.js
 */

const { HappyClient } = require('./index');

async function main() {
  console.log('🚀 Happy Client 示例\n');
  
  // 创建客户端
  const client = new HappyClient({
    secret: process.env.HAPPY_SECRET,
    workDir: process.cwd(),
    conversation: {
      timeout: 120000
    }
  });
  
  // 监听事件
  client.on('connected', ({ sessionId }) => {
    console.log('✅ 已连接到 session:', sessionId.substring(0, 8) + '...');
  });
  
  client.on('conversation:message', (event) => {
    console.log(`📨 收到消息 [${event.messageCount}]:`, event.text.substring(0, 100) + '...');
  });
  
  client.on('error', (error) => {
    console.error('❌ 错误:', error.message);
  });
  
  try {
    // 初始化连接
    console.log('📡 正在初始化连接...');
    await client.initialize();
    
    // 发送规划请求
    console.log('\n📤 发送规划请求...');
    const prompt = `请使用 kaichi-workflow-planner 技能为以下目标制定执行规划：

【目标列表】
- 目标1: 生成5个选题 (topic_generation)
- 目标2: 生成3个大纲 (outline_generation)

【规划要求】
1. 为每个目标调用对应的规划技能
2. 生成计划文件并返回文件路径

请以 JSON 格式返回规划结果。`;
    
    const result = await client.sendAndWait(prompt, {
      timeout: 120000,
      onProgress: (progress) => {
        console.log(`⏳ 进度: ${progress.messageCount} 条消息，已用时 ${Math.round(progress.elapsed / 1000)} 秒`);
      }
    });
    
    console.log('\n📥 规划结果:');
    console.log('类型:', result.type);
    
    if (result.type === 'json' && result.data) {
      console.log('数据:', JSON.stringify(result.data, null, 2));
    } else if (result.type === 'text' && result.planFiles) {
      console.log('计划文件:', result.planFiles);
    }
    
    console.log('\n✅ 规划完成！');
    
  } catch (error) {
    console.error('\n❌ 执行失败:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  } finally {
    // 断开连接
    console.log('\n🔌 断开连接...');
    await client.disconnect();
    console.log('👋 再见！');
  }
}

// 运行示例
if (require.main === module) {
  main().catch(error => {
    console.error('未处理的错误:', error);
    process.exit(1);
  });
}

module.exports = { main };
