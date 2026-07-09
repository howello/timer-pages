/**
 * OSS 存储模块
 * 负责阿里云 OSS 的读写操作
 */

(function(window) {
  'use strict';

  // 空配置默认值
  const EMPTY_CONFIG = {
    version: 1,
    events: [],
    holidayMeta: {}
  };

  let ossClient = null;

  /**
   * 初始化 OSS 客户端
   * @returns {Object|null} OSS 客户端实例，失败返回 null
   */
  function initClient() {
    if (ossClient) {
      return ossClient;
    }

    try {
      // 兼容两种配置方式：window.APP_CONFIG.oss 或 window.OSS_CONFIG
      const ossConfig = (window.APP_CONFIG && window.APP_CONFIG.oss) || window.OSS_CONFIG;

      if (!ossConfig) {
        console.warn('OSS 配置未找到，降级到本地存储模式');
        return null;
      }

      // 检查必需配置项
      const { region, bucket, accessKeyId, accessKeySecret } = ossConfig;

      if (!region || !bucket || !accessKeyId || !accessKeySecret) {
        console.warn('OSS 配置不完整，降级到本地存储模式');
        return null;
      }

      // 检查是否为占位符（开发模式）
      if (region.startsWith('__') || accessKeyId.startsWith('__')) {
        console.warn('OSS 配置为占位符（开发模式），降级到本地存储模式');
        return null;
      }

      // 初始化 OSS 客户端
      ossClient = new OSS({
        region: region,
        accessKeyId: accessKeyId,
        accessKeySecret: accessKeySecret,
        bucket: bucket,
        authorizationV4: true
      });

      console.log('OSS 客户端初始化成功');
      return ossClient;
    } catch (error) {
      console.error('OSS 客户端初始化失败:', error);
      return null;
    }
  }

  /**
   * 获取 OSS 对象键（文件路径）
   * @returns {string} 对象键
   */
  function getObjectKey() {
    // 优先使用 APP_CONFIG.oss.objectKey
    if (window.APP_CONFIG && window.APP_CONFIG.oss && window.APP_CONFIG.oss.objectKey) {
      return window.APP_CONFIG.oss.objectKey;
    }

    // 降级使用 DATA_FILE_PATH
    if (window.DATA_FILE_PATH) {
      return window.DATA_FILE_PATH;
    }

    // 最终默认值
    return 'countdown-data.json';
  }

  /**
   * 从 OSS 读取配置
   * @returns {Promise<Object>} 配置对象，失败时返回空配置
   */
  async function read() {
    const client = initClient();

    if (!client) {
      console.warn('OSS 客户端不可用，返回空配置');
      return EMPTY_CONFIG;
    }

    try {
      const objectKey = getObjectKey();
      console.log(`正在从 OSS 读取配置: ${objectKey}`);

      // 获取文件
      const result = await client.get(objectKey);

      // 解析 JSON
      if (result && result.content) {
        // result.content 是 Buffer，需要转换为字符串
        const content = result.content.toString();
        const config = JSON.parse(content);
        console.log('OSS 配置读取成功');
        return config;
      }

      console.warn('OSS 返回内容为空，返回空配置');
      return EMPTY_CONFIG;
    } catch (error) {
      // 404 或其他错误，降级返回空配置
      if (error.status === 404 || error.code === 'NoSuchKey') {
        console.warn('OSS 文件不存在，返回空配置（首次使用）');
      } else {
        console.error('从 OSS 读取配置失败:', error);
      }
      return EMPTY_CONFIG;
    }
  }

  /**
   * 写入配置到 OSS
   * @param {Object} config - 配置对象
   * @returns {Promise<void>}
   */
  async function write(config) {
    const client = initClient();

    if (!client) {
      console.warn('OSS 客户端不可用，跳过写入');
      return;
    }

    try {
      const objectKey = getObjectKey();
      console.log(`正在写入配置到 OSS: ${objectKey}`);

      // 序列化配置
      const content = JSON.stringify(config, null, 2);

      // 创建 Blob
      const blob = new Blob([content], { type: 'application/json' });

      // 上传到 OSS
      await client.put(objectKey, blob, {
        mime: 'application/json'
      });

      console.log('OSS 配置写入成功');
    } catch (error) {
      console.error('写入配置到 OSS 失败:', error);
      // 写入失败不抛出异常，仅记录日志
    }
  }

  // 导出 API
  window.OSSStorage = {
    read: read,
    write: write
  };

})(window);
