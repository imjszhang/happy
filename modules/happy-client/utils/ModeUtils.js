/**
 * 权限模式工具模块
 * 
 * 支持 Claude Code 和 Codex 两种后端的权限模式
 * 自动进行模式转换以确保兼容性
 */

// 后端类型
const BACKEND_TYPES = {
  CLAUDE_CODE: 'claude-code',
  CODEX: 'codex'
};

// Claude Code 支持的模式
const CLAUDE_CODE_MODES = ['default', 'acceptEdits', 'plan', 'bypassPermissions'];

// Codex 支持的模式
const CODEX_MODES = ['default', 'read-only', 'safe-yolo', 'yolo'];

// 有效的权限模式列表（所有后端的并集）
const VALID_MODES = [
  'default',
  'acceptEdits',
  'plan',
  'bypassPermissions',
  'read-only',
  'safe-yolo',
  'yolo'
];

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

// 模式别名映射
const MODE_ALIASES = {
  'readonly': 'read-only',
  'safeyolo': 'safe-yolo',
  'bypass': 'bypassPermissions',
  'accept': 'acceptEdits',
  'edit': 'acceptEdits',
  'edits': 'acceptEdits'
};

// Codex 模式 → Claude Code 模式的转换映射
const CODEX_TO_CLAUDE_CODE_MAP = {
  'yolo': 'bypassPermissions',
  'safe-yolo': 'acceptEdits',
  'read-only': 'plan'
};

// Claude Code 模式 → Codex 模式的转换映射
const CLAUDE_CODE_TO_CODEX_MAP = {
  'bypassPermissions': 'yolo',
  'acceptEdits': 'safe-yolo',
  'plan': 'read-only'
};

/**
 * 验证模式是否有效
 */
function isValidMode(mode) {
  return VALID_MODES.includes(mode);
}

/**
 * 标准化模式名称（处理别名）
 */
function normalizeMode(mode) {
  if (!mode) return 'default';
  const lowerMode = mode.toLowerCase();
  return MODE_ALIASES[lowerMode] || lowerMode;
}

/**
 * 获取模式显示名称
 */
function getModeDisplayName(mode) {
  return MODE_DISPLAY_NAMES[mode] || mode;
}

/**
 * 获取所有有效模式
 */
function getValidModes() {
  return [...VALID_MODES];
}

/**
 * 获取模式信息（用于显示）
 */
function getModeInfo(mode) {
  return {
    mode,
    displayName: getModeDisplayName(mode),
    isValid: isValidMode(mode)
  };
}

/**
 * 检测后端类型
 * 通过服务器 URL 或环境变量判断
 * @param {string} serverUrl - 服务器 URL
 * @returns {string} 后端类型
 */
function detectBackendType(serverUrl) {
  // 通过环境变量显式指定
  const envBackend = process.env.HAPPY_BACKEND_TYPE;
  if (envBackend) {
    return envBackend.toLowerCase() === 'codex' ? BACKEND_TYPES.CODEX : BACKEND_TYPES.CLAUDE_CODE;
  }
  
  // 通过 URL 判断（可根据实际情况调整）
  if (serverUrl) {
    const url = serverUrl.toLowerCase();
    if (url.includes('codex') || url.includes('openai')) {
      return BACKEND_TYPES.CODEX;
    }
  }
  
  // 默认为 Claude Code（Happy/Cursor 使用的后端）
  return BACKEND_TYPES.CLAUDE_CODE;
}

/**
 * 检查模式是否被指定后端支持
 * @param {string} mode - 模式名称
 * @param {string} backendType - 后端类型
 * @returns {boolean}
 */
function isModeSupported(mode, backendType) {
  if (backendType === BACKEND_TYPES.CODEX) {
    return CODEX_MODES.includes(mode);
  }
  return CLAUDE_CODE_MODES.includes(mode);
}

/**
 * 转换模式以适配目标后端
 * 如果模式不被目标后端支持，自动转换为等效模式
 * @param {string} mode - 原始模式
 * @param {string} backendType - 目标后端类型
 * @returns {string} 转换后的模式
 */
function convertModeForBackend(mode, backendType) {
  // 如果模式已被目标后端支持，直接返回
  if (isModeSupported(mode, backendType)) {
    return mode;
  }
  
  // 根据目标后端进行转换
  if (backendType === BACKEND_TYPES.CLAUDE_CODE) {
    // Codex 模式转 Claude Code 模式
    const converted = CODEX_TO_CLAUDE_CODE_MAP[mode];
    if (converted) {
      console.log(`[ModeUtils] 模式 "${mode}" 在 Claude Code 中不支持，已自动转换为 "${converted}"`);
      return converted;
    }
  } else if (backendType === BACKEND_TYPES.CODEX) {
    // Claude Code 模式转 Codex 模式
    const converted = CLAUDE_CODE_TO_CODEX_MAP[mode];
    if (converted) {
      console.log(`[ModeUtils] 模式 "${mode}" 在 Codex 中不支持，已自动转换为 "${converted}"`);
      return converted;
    }
  }
  
  // 无法转换时返回默认模式
  console.warn(`[ModeUtils] 模式 "${mode}" 无法转换，使用默认模式`);
  return 'default';
}

/**
 * 标准化并转换模式（一站式处理）
 * @param {string} mode - 原始模式
 * @param {string} serverUrl - 服务器 URL（用于检测后端类型）
 * @returns {string} 处理后的模式
 */
function normalizeAndConvertMode(mode, serverUrl) {
  const normalized = normalizeMode(mode);
  const backendType = detectBackendType(serverUrl);
  return convertModeForBackend(normalized, backendType);
}

/**
 * 获取指定后端支持的模式列表
 * @param {string} backendType - 后端类型
 * @returns {Array<string>}
 */
function getSupportedModes(backendType) {
  if (backendType === BACKEND_TYPES.CODEX) {
    return [...CODEX_MODES];
  }
  return [...CLAUDE_CODE_MODES];
}

module.exports = {
  BACKEND_TYPES,
  CLAUDE_CODE_MODES,
  CODEX_MODES,
  VALID_MODES,
  MODE_DISPLAY_NAMES,
  MODE_ALIASES,
  CODEX_TO_CLAUDE_CODE_MAP,
  CLAUDE_CODE_TO_CODEX_MAP,
  isValidMode,
  normalizeMode,
  getModeDisplayName,
  getValidModes,
  getModeInfo,
  detectBackendType,
  isModeSupported,
  convertModeForBackend,
  normalizeAndConvertMode,
  getSupportedModes
};
