/**
 * Todo 模块导出
 */
const TodoManager = require('./TodoManager');

module.exports = {
  TodoManager,
  TODO_PREFIX: TodoManager.TODO_PREFIX,
  TODO_INDEX_KEY: TodoManager.TODO_INDEX_KEY
};
