/**
 * HTTP API 封装
 * 
 * 提供完整的 HTTP API 接口，包括：
 * - 会话管理
 * - 账户管理
 * - 机器管理
 * - 使用量统计
 * - Artifacts 管理
 * - KV 存储
 * - 社交功能
 * - Feed 动态
 * - 服务连接
 */
class HttpApi {
  constructor(options = {}) {
    this.serverUrl = options.serverUrl || 'https://api.cluster-fluster.com';
    this.apiKey = options.apiKey || null;
  }
  
  /**
   * 获取通用请求头（包含 X-API-Key 和 Authorization）
   * @param {string} token - 认证 token（可选）
   * @returns {object} 请求头对象
   */
  _getHeaders(token) {
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    return headers;
  }
  
  // ============================================================================
  // 会话管理
  // ============================================================================
  
  /**
   * 获取会话列表
   */
  async fetchSessions(token) {
    const response = await fetch(`${this.serverUrl}/v1/sessions`, {
      headers: this._getHeaders(token)
    });
    
    if (!response.ok) {
      throw new Error(`获取会话失败: ${response.status}`);
    }
    
    return response.json();
  }
  
  /**
   * 获取消息列表
   */
  async fetchMessages(token, sessionId) {
    const response = await fetch(`${this.serverUrl}/v1/sessions/${sessionId}/messages`, {
      headers: this._getHeaders(token)
    });
    
    if (!response.ok) {
      throw new Error(`获取消息失败: ${response.status}`);
    }
    
    return response.json();
  }
  
  /**
   * 删除会话
   */
  async deleteSession(token, sessionId) {
    const response = await fetch(`${this.serverUrl}/v1/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: this._getHeaders(token)
    });
    
    if (!response.ok) {
      throw new Error(`删除会话失败: ${response.status}`);
    }
    
    return response.json();
  }
  
  // ============================================================================
  // 账户管理
  // ============================================================================
  
  /**
   * 获取账户资料
   */
  async fetchProfile(token) {
    const response = await fetch(`${this.serverUrl}/v1/account/profile`, {
      headers: this._getHeaders(token)
    });
    
    if (!response.ok) {
      throw new Error(`获取账户资料失败: ${response.status}`);
    }
    
    return response.json();
  }
  
  /**
   * 获取账户设置
   */
  async fetchSettings(token) {
    const response = await fetch(`${this.serverUrl}/v1/account/settings`, {
      headers: this._getHeaders(token)
    });
    
    if (!response.ok) {
      throw new Error(`获取账户设置失败: ${response.status}`);
    }
    
    return response.json();
  }
  
  /**
   * 更新账户设置
   */
  async updateSettings(token, settings, version) {
    const response = await fetch(`${this.serverUrl}/v1/account/settings`, {
      method: 'POST',
      headers: this._getHeaders(token),
      body: JSON.stringify({
        settings: settings,
        version: version
      })
    });
    
    if (!response.ok) {
      throw new Error(`更新账户设置失败: ${response.status}`);
    }
    
    return response.json();
  }
  
  // ============================================================================
  // 机器管理
  // ============================================================================
  
  /**
   * 获取机器列表
   */
  async fetchMachines(token) {
    const response = await fetch(`${this.serverUrl}/v1/machines`, {
      headers: this._getHeaders(token)
    });
    
    if (!response.ok) {
      throw new Error(`获取机器列表失败: ${response.status}`);
    }
    
    return response.json();
  }
  
  // ============================================================================
  // 使用量统计
  // ============================================================================
  
  /**
   * 查询使用量
   * @param {string} token - 认证 token
   * @param {object} params - 查询参数
   * @param {number} params.startTime - 开始时间戳（秒）
   * @param {number} params.endTime - 结束时间戳（秒）
   * @param {string} params.groupBy - 分组方式 ('hour' | 'day')
   */
  async queryUsage(token, params = {}) {
    const response = await fetch(`${this.serverUrl}/v1/usage/query`, {
      method: 'POST',
      headers: this._getHeaders(token),
      body: JSON.stringify(params)
    });
    
    if (!response.ok) {
      throw new Error(`查询使用量失败: ${response.status}`);
    }
    
    return response.json();
  }
  
  // ============================================================================
  // Artifacts 管理
  // ============================================================================
  
  /**
   * 获取 Artifacts 列表
   */
  async fetchArtifacts(token) {
    const response = await fetch(`${this.serverUrl}/v1/artifacts`, {
      headers: this._getHeaders(token)
    });
    
    if (!response.ok) {
      throw new Error(`获取 Artifacts 失败: ${response.status}`);
    }
    
    return response.json();
  }
  
  /**
   * 获取单个 Artifact
   */
  async fetchArtifact(token, artifactId) {
    const response = await fetch(`${this.serverUrl}/v1/artifacts/${artifactId}`, {
      headers: this._getHeaders(token)
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Artifact 不存在');
      }
      throw new Error(`获取 Artifact 失败: ${response.status}`);
    }
    
    return response.json();
  }
  
  /**
   * 创建 Artifact
   */
  async createArtifact(token, data) {
    const response = await fetch(`${this.serverUrl}/v1/artifacts`, {
      method: 'POST',
      headers: this._getHeaders(token),
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      throw new Error(`创建 Artifact 失败: ${response.status}`);
    }
    
    return response.json();
  }
  
  /**
   * 更新 Artifact
   */
  async updateArtifact(token, artifactId, data) {
    const response = await fetch(`${this.serverUrl}/v1/artifacts/${artifactId}`, {
      method: 'POST',
      headers: this._getHeaders(token),
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      throw new Error(`更新 Artifact 失败: ${response.status}`);
    }
    
    return response.json();
  }
  
  /**
   * 删除 Artifact
   */
  async deleteArtifact(token, artifactId) {
    const response = await fetch(`${this.serverUrl}/v1/artifacts/${artifactId}`, {
      method: 'DELETE',
      headers: this._getHeaders(token)
    });
    
    if (!response.ok) {
      throw new Error(`删除 Artifact 失败: ${response.status}`);
    }
  }
  
  // ============================================================================
  // KV 存储
  // ============================================================================
  
  /**
   * 获取 KV 列表
   * @param {string} token - 认证 token
   * @param {object} params - 查询参数
   * @param {string} params.prefix - 键前缀
   * @param {number} params.limit - 返回数量限制
   */
  async kvList(token, params = {}) {
    const queryParams = new URLSearchParams();
    if (params.prefix) queryParams.append('prefix', params.prefix);
    if (params.limit) queryParams.append('limit', params.limit.toString());
    
    const url = queryParams.toString()
      ? `${this.serverUrl}/v1/kv?${queryParams.toString()}`
      : `${this.serverUrl}/v1/kv`;
    
    const response = await fetch(url, {
      headers: this._getHeaders(token)
    });
    
    if (!response.ok) {
      throw new Error(`获取 KV 列表失败: ${response.status}`);
    }
    
    return response.json();
  }
  
  /**
   * 获取 KV 值
   */
  async kvGet(token, key) {
    const response = await fetch(`${this.serverUrl}/v1/kv/${encodeURIComponent(key)}`, {
      headers: this._getHeaders(token)
    });
    
    if (response.status === 404) {
      return null;
    }
    
    if (!response.ok) {
      throw new Error(`获取 KV 值失败: ${response.status}`);
    }
    
    return response.json();
  }
  
  /**
   * KV 批量操作
   * @param {string} token - 认证 token
   * @param {Array} mutations - 操作列表
   * @param {string} mutations[].key - 键
   * @param {string|null} mutations[].value - 值（null 表示删除）
   * @param {number} mutations[].version - 版本号（-1 表示新建）
   */
  async kvMutate(token, mutations) {
    const response = await fetch(`${this.serverUrl}/v1/kv`, {
      method: 'POST',
      headers: this._getHeaders(token),
      body: JSON.stringify({ mutations })
    });
    
    if (!response.ok && response.status !== 409) {
      throw new Error(`KV 操作失败: ${response.status}`);
    }
    
    return response.json();
  }
  
  // ============================================================================
  // 社交功能
  // ============================================================================
  
  /**
   * 获取好友列表
   */
  async fetchFriends(token) {
    const response = await fetch(`${this.serverUrl}/v1/friends`, {
      headers: this._getHeaders(token)
    });
    
    if (!response.ok) {
      throw new Error(`获取好友列表失败: ${response.status}`);
    }
    
    return response.json();
  }
  
  /**
   * 搜索用户
   */
  async searchUsers(token, query) {
    const response = await fetch(`${this.serverUrl}/v1/user/search?${new URLSearchParams({ query })}`, {
      headers: this._getHeaders(token)
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        return { users: [] };
      }
      throw new Error(`搜索用户失败: ${response.status}`);
    }
    
    return response.json();
  }
  
  /**
   * 获取用户资料
   */
  async fetchUser(token, userId) {
    const response = await fetch(`${this.serverUrl}/v1/user/${userId}`, {
      headers: this._getHeaders(token)
    });
    
    if (response.status === 404) {
      return null;
    }
    
    if (!response.ok) {
      throw new Error(`获取用户资料失败: ${response.status}`);
    }
    
    return response.json();
  }
  
  /**
   * 添加好友
   */
  async addFriend(token, userId) {
    const response = await fetch(`${this.serverUrl}/v1/friends/add`, {
      method: 'POST',
      headers: this._getHeaders(token),
      body: JSON.stringify({ uid: userId })
    });
    
    if (!response.ok) {
      throw new Error(`添加好友失败: ${response.status}`);
    }
    
    return response.json();
  }
  
  /**
   * 移除好友
   */
  async removeFriend(token, userId) {
    const response = await fetch(`${this.serverUrl}/v1/friends/remove`, {
      method: 'POST',
      headers: this._getHeaders(token),
      body: JSON.stringify({ uid: userId })
    });
    
    if (!response.ok) {
      throw new Error(`移除好友失败: ${response.status}`);
    }
    
    return response.json();
  }
  
  // ============================================================================
  // Feed 动态
  // ============================================================================
  
  /**
   * 获取动态 Feed
   * @param {string} token - 认证 token
   * @param {object} options - 查询选项
   * @param {number} options.limit - 返回数量限制
   * @param {string} options.before - 时间戳，获取该时间之前的动态
   * @param {string} options.after - 时间戳，获取该时间之后的动态
   */
  async fetchFeed(token, options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', options.limit.toString());
    if (options.before) params.set('before', options.before);
    if (options.after) params.set('after', options.after);
    
    const url = `${this.serverUrl}/v1/feed${params.toString() ? `?${params}` : ''}`;
    
    const response = await fetch(url, {
      headers: this._getHeaders(token)
    });
    
    if (!response.ok) {
      throw new Error(`获取 Feed 失败: ${response.status}`);
    }
    
    return response.json();
  }
  
  // ============================================================================
  // 服务连接
  // ============================================================================
  
  /**
   * 断开服务连接
   */
  async disconnectService(token, service) {
    const response = await fetch(`${this.serverUrl}/v1/connect/${service}`, {
      method: 'DELETE',
      headers: this._getHeaders(token)
    });
    
    if (!response.ok) {
      throw new Error(`断开服务失败: ${response.status}`);
    }
  }
}

module.exports = HttpApi;
