/**
 * Happy Daemon 模块
 * 
 * 提供与 Happy Daemon 交互的功能
 */

const DaemonClient = require('./DaemonClient');

module.exports = {
    DaemonClient,
    
    /**
     * 创建 DaemonClient 实例
     * @param {Object} options - 配置选项
     * @returns {DaemonClient}
     */
    createDaemonClient: (options) => {
        return new DaemonClient(options);
    }
};

