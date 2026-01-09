/**
 * 消息提取工具
 */
class MessageExtractor {
  /**
   * 提取消息文本
   */
  static extractMessageText(decrypted) {
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
  
  /**
   * 检查是否是事件消息
   */
  static isEventMessage(decrypted) {
    const content = decrypted.content;
    if (content?.type === 'event') return true;
    if (content?.type === 'output' && (content.data?.isMeta || content.data?.isSidechain || content.data?.isCompactSummary)) {
      return true;
    }
    return false;
  }
}

module.exports = MessageExtractor;
