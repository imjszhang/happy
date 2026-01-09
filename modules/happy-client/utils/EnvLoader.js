/**
 * 环境变量加载工具
 */
const fs = require('fs');
const path = require('path');

/**
 * 加载 .env 文件
 */
function loadEnvFile(searchPaths = []) {
  // 默认搜索路径
  const defaultPaths = [
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '..', '..', '..', '.env'),
    path.join(__dirname, '.env')
  ];
  
  const possiblePaths = searchPaths.length > 0 ? searchPaths : defaultPaths;
  
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
        
        return { success: true, path: envPath };
      } catch (error) {
        // 忽略读取错误
        continue;
      }
    }
  }
  
  return { success: false };
}

module.exports = {
  loadEnvFile
};
