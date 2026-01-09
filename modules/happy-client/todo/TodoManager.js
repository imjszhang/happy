/**
 * Todo 任务管理器
 * 
 * 封装所有 Todo 操作，使用 KV 存储和 SecretBox 加密
 * 
 * 数据结构：
 * - 索引 (todo.index): { undoneOrder: [...ids], completedOrder: [...ids] }
 * - 单个 Todo (todo.{id}): { id, title, done, createdAt, updatedAt, completedAt, linkedSessions }
 */
const crypto = require('crypto');

// 常量
const TODO_PREFIX = 'todo.';
const TODO_INDEX_KEY = 'todo.index';

class TodoManager {
  /**
   * 创建 TodoManager 实例
   * @param {object} options - 配置选项
   * @param {object} options.httpApi - HttpApi 实例
   * @param {object} options.encryption - Encryption 实例
   * @param {function} options.getToken - 获取 token 的函数
   */
  constructor(options = {}) {
    this.httpApi = options.httpApi;
    this.encryption = options.encryption;
    this.getToken = options.getToken;
    
    // 缓存
    this._cachedState = null;
  }
  
  /**
   * 获取 Todo Key
   * @param {string} id - Todo ID
   * @returns {string} KV 存储键
   */
  _getTodoKey(id) {
    return `${TODO_PREFIX}${id}`;
  }
  
  /**
   * 加密 Todo 数据
   * @param {object} data - 要加密的数据
   * @returns {string} 加密后的 base64 字符串
   */
  _encryptData(data) {
    return this.encryption.encryptLegacy(data);
  }
  
  /**
   * 解密 Todo 数据
   * @param {string} encrypted - 加密的 base64 字符串
   * @returns {object|null} 解密后的数据
   */
  _decryptData(encrypted) {
    return this.encryption.decryptLegacy(encrypted);
  }
  
  /**
   * 获取所有 Todo 任务
   * @returns {Promise<object>} Todo 状态对象
   */
  async fetchTodos() {
    const token = await this.getToken();
    
    const response = await this.httpApi.kvList(token, {
      prefix: TODO_PREFIX,
      limit: 1000
    });
    
    const state = {
      todos: {},
      undoneOrder: [],
      doneOrder: [],
      versions: {}
    };
    
    for (const item of (response.items || [])) {
      state.versions[item.key] = item.version;
      
      try {
        const decrypted = this._decryptData(item.value);
        
        if (item.key === TODO_INDEX_KEY) {
          const index = decrypted;
          state.undoneOrder = index.undoneOrder || [];
          state.doneOrder = index.completedOrder || [];
        } else if (item.key.startsWith(TODO_PREFIX)) {
          const todoId = item.key.substring(TODO_PREFIX.length);
          if (todoId && todoId !== 'index') {
            state.todos[todoId] = decrypted;
          }
        }
      } catch (error) {
        // 忽略解密错误
      }
    }
    
    // 清理：移除不存在的 ID
    state.undoneOrder = state.undoneOrder.filter(id => id in state.todos);
    state.doneOrder = state.doneOrder.filter(id => id in state.todos);
    
    // 添加未在任何列表中的 todo
    const allOrderedIds = new Set([...state.undoneOrder, ...state.doneOrder]);
    for (const todoId in state.todos) {
      if (!allOrderedIds.has(todoId)) {
        if (state.todos[todoId].done) {
          state.doneOrder.push(todoId);
        } else {
          state.undoneOrder.push(todoId);
        }
      }
    }
    
    this._cachedState = state;
    return state;
  }
  
  /**
   * 添加新任务
   * @param {string} title - 任务标题
   * @returns {Promise<string>} 新任务 ID
   */
  async addTodo(title) {
    const token = await this.getToken();
    const id = crypto.randomUUID();
    const now = Date.now();
    
    const newTodo = {
      id,
      title,
      done: false,
      createdAt: now,
      updatedAt: now,
      linkedSessions: {}
    };
    
    // 获取当前索引
    const indexResponse = await this.httpApi.kvGet(token, TODO_INDEX_KEY);
    let currentIndex = { undoneOrder: [], completedOrder: [] };
    let indexVersion = -1;
    
    if (indexResponse) {
      indexVersion = indexResponse.version;
      try {
        currentIndex = this._decryptData(indexResponse.value);
      } catch (err) {
        // 使用默认索引
      }
    }
    
    // 更新索引
    const newIndex = {
      undoneOrder: [...(currentIndex.undoneOrder || []), id],
      completedOrder: currentIndex.completedOrder || []
    };
    
    // 写入 todo 和索引
    const mutations = [
      {
        key: this._getTodoKey(id),
        value: this._encryptData(newTodo),
        version: -1
      },
      {
        key: TODO_INDEX_KEY,
        value: this._encryptData(newIndex),
        version: indexVersion
      }
    ];
    
    const result = await this.httpApi.kvMutate(token, mutations);
    
    if (result.success) {
      this._cachedState = null; // 清除缓存
      return id;
    }
    
    throw new Error(result.errors?.[0]?.error || '添加任务失败');
  }
  
  /**
   * 切换任务完成状态
   * @param {string} id - 任务 ID
   * @returns {Promise<boolean>} 新的完成状态
   */
  async toggleTodo(id) {
    const token = await this.getToken();
    
    if (!this._cachedState) {
      await this.fetchTodos();
    }
    
    const todo = this._cachedState.todos[id];
    if (!todo) {
      throw new Error('任务不存在');
    }
    
    const now = Date.now();
    const updatedTodo = {
      ...todo,
      done: !todo.done,
      updatedAt: now,
      completedAt: !todo.done ? now : undefined
    };
    
    // 获取当前索引
    const indexResponse = await this.httpApi.kvGet(token, TODO_INDEX_KEY);
    let currentIndex = { undoneOrder: [], completedOrder: [] };
    let indexVersion = -1;
    
    if (indexResponse) {
      indexVersion = indexResponse.version;
      try {
        currentIndex = this._decryptData(indexResponse.value);
      } catch (err) {
        // 使用默认索引
      }
    }
    
    // 更新索引
    let newUndoneOrder = [...(currentIndex.undoneOrder || [])];
    let newCompletedOrder = [...(currentIndex.completedOrder || [])];
    
    if (updatedTodo.done) {
      newUndoneOrder = newUndoneOrder.filter(tid => tid !== id);
      newCompletedOrder = [id, ...newCompletedOrder.filter(tid => tid !== id)];
    } else {
      newCompletedOrder = newCompletedOrder.filter(tid => tid !== id);
      newUndoneOrder = [...newUndoneOrder.filter(tid => tid !== id), id];
    }
    
    const newIndex = {
      undoneOrder: newUndoneOrder,
      completedOrder: newCompletedOrder
    };
    
    // 获取 todo 版本
    const todoResponse = await this.httpApi.kvGet(token, this._getTodoKey(id));
    const todoVersion = todoResponse?.version || -1;
    
    // 写入更新
    const mutations = [
      {
        key: this._getTodoKey(id),
        value: this._encryptData(updatedTodo),
        version: todoVersion
      },
      {
        key: TODO_INDEX_KEY,
        value: this._encryptData(newIndex),
        version: indexVersion
      }
    ];
    
    const result = await this.httpApi.kvMutate(token, mutations);
    
    if (result.success) {
      this._cachedState = null;
      return updatedTodo.done;
    }
    
    throw new Error(result.errors?.[0]?.error || '更新任务失败');
  }
  
  /**
   * 编辑任务标题
   * @param {string} id - 任务 ID
   * @param {string} title - 新标题
   * @returns {Promise<void>}
   */
  async editTodoTitle(id, title) {
    const token = await this.getToken();
    
    if (!this._cachedState) {
      await this.fetchTodos();
    }
    
    const todo = this._cachedState.todos[id];
    if (!todo) {
      throw new Error('任务不存在');
    }
    
    const updatedTodo = {
      ...todo,
      title,
      updatedAt: Date.now()
    };
    
    const todoResponse = await this.httpApi.kvGet(token, this._getTodoKey(id));
    const todoVersion = todoResponse?.version || -1;
    
    const result = await this.httpApi.kvMutate(token, [{
      key: this._getTodoKey(id),
      value: this._encryptData(updatedTodo),
      version: todoVersion
    }]);
    
    if (result.success) {
      this._cachedState = null;
      return;
    }
    
    throw new Error(result.errors?.[0]?.error || '编辑任务失败');
  }
  
  /**
   * 删除任务
   * @param {string} id - 任务 ID
   * @returns {Promise<void>}
   */
  async deleteTodo(id) {
    const token = await this.getToken();
    
    if (!this._cachedState) {
      await this.fetchTodos();
    }
    
    if (!this._cachedState.todos[id]) {
      throw new Error('任务不存在');
    }
    
    // 获取当前索引
    const indexResponse = await this.httpApi.kvGet(token, TODO_INDEX_KEY);
    let currentIndex = { undoneOrder: [], completedOrder: [] };
    let indexVersion = -1;
    
    if (indexResponse) {
      indexVersion = indexResponse.version;
      try {
        currentIndex = this._decryptData(indexResponse.value);
      } catch (err) {
        // 使用默认索引
      }
    }
    
    // 更新索引
    const newIndex = {
      undoneOrder: (currentIndex.undoneOrder || []).filter(tid => tid !== id),
      completedOrder: (currentIndex.completedOrder || []).filter(tid => tid !== id)
    };
    
    // 获取 todo 版本
    const todoResponse = await this.httpApi.kvGet(token, this._getTodoKey(id));
    const todoVersion = todoResponse?.version || 0;
    
    // 删除 todo 并更新索引
    const mutations = [
      {
        key: this._getTodoKey(id),
        value: null,
        version: todoVersion
      },
      {
        key: TODO_INDEX_KEY,
        value: this._encryptData(newIndex),
        version: indexVersion
      }
    ];
    
    const result = await this.httpApi.kvMutate(token, mutations);
    
    if (result.success) {
      this._cachedState = null;
      return;
    }
    
    throw new Error(result.errors?.[0]?.error || '删除任务失败');
  }
  
  /**
   * 清除缓存
   */
  clearCache() {
    this._cachedState = null;
  }
  
  /**
   * 获取缓存的状态
   * @returns {object|null} 缓存的状态或 null
   */
  getCachedState() {
    return this._cachedState;
  }
}

// 导出常量
TodoManager.TODO_PREFIX = TODO_PREFIX;
TodoManager.TODO_INDEX_KEY = TODO_INDEX_KEY;

module.exports = TodoManager;
