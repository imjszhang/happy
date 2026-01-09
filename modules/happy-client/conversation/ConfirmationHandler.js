/**
 * 确认处理模块
 * 
 * 注意：isConfirmationRequest 和 CONFIRMATION_PATTERNS 已移除
 * 确认判断现在由 HappyResponseAgent 在消息流结束时统一处理
 */
class ConfirmationHandler {
  /**
   * 提取确认类型
   */
  static getConfirmationType(text) {
    if (/执行|运行/i.test(text)) {
      return 'execution'; // 执行确认
    }
    if (/生成|创建|制定/i.test(text)) {
      return 'generation'; // 生成确认
    }
    if (/参数|配置/i.test(text)) {
      return 'parameter'; // 参数确认
    }
    return 'general'; // 一般确认
  }
  
  /**
   * 检查是否有严重警告
   */
  static hasCriticalWarning(text) {
    const criticalPatterns = [
      /数据.*丢失|文件.*删除|不可恢复/i,
      /资源.*耗尽|内存.*不足/i,
      /严重.*错误|致命.*错误/i
    ];
    
    return criticalPatterns.some(pattern => pattern.test(text));
  }
  
  /**
   * 生成确认回复
   */
  static generateConfirmReply(confirmationType) {
    const replies = {
      execution: ['确认执行', '继续执行', '是的，执行'],
      generation: ['确认生成', '继续生成', '是的，生成'],
      parameter: ['确认参数', '参数正确', '使用默认参数'],
      general: ['确认', '继续', '是的']
    };
    
    return replies[confirmationType]?.[0] || replies.general[0];
  }
}

module.exports = ConfirmationHandler;
