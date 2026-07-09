/**
 * API 客户端模块
 * 通过 Cloudflare Pages Functions 代理 OSS 数据读写
 * 替代旧的 aliyun-oss-sdk 直接调用方式
 */

(function(window) {
  'use strict';

  var EMPTY_CONFIG = {
    version: 1,
    events: [],
    holidayMeta: {}
  };

  /**
   * 从 /api/data 读取事件配置
   * @returns {Promise<Object>}
   */
  function read() {
    return fetch('/api/data').then(function (resp) {
      if (!resp.ok) {
        console.warn('[api-client] 读取数据失败: ' + resp.status);
        return EMPTY_CONFIG;
      }
      return resp.json();
    }).catch(function (err) {
      console.warn('[api-client] 读取数据异常，返回空配置:', err);
      return EMPTY_CONFIG;
    });
  }

  /**
   * 写入事件配置到 /api/data
   * @param {Object} config - 事件配置对象
   * @returns {Promise<boolean>}
   */
  function write(config) {
    return fetch('/api/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    }).then(function (resp) {
      if (!resp.ok) {
        console.warn('[api-client] 写入数据失败: ' + resp.status);
        return false;
      }
      return true;
    }).catch(function (err) {
      console.warn('[api-client] 写入数据异常:', err);
      return false;
    });
  }

  // 导出 API
  window.APIClient = {
    read: read,
    write: write
  };

})(window);