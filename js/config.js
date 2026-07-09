/**
 * 配置文件
 * 此文件包含占位符，将由 Cloudflare Pages 构建时替换
 */

// 应用配置对象（新增统一配置入口）
window.APP_CONFIG = {
  password: '__PASSWORD__' // 访问密码（构建时注入）
};

// 访问密码（构建时注入）- 保持向后兼容
window.APP_PASSWORD = '__PASSWORD__';

// OSS 配置（构建时注入）
window.OSS_CONFIG = {
  region: '__OSS_REGION__',
  accessKeyId: '__OSS_ACCESS_KEY_ID__',
  accessKeySecret: '__OSS_ACCESS_KEY_SECRET__',
  bucket: '__OSS_BUCKET__',
  endpoint: '__OSS_ENDPOINT__'
};

// 数据文件路径
window.DATA_FILE_PATH = 'countdown-data.json';

// 本地存储键名
window.STORAGE_KEYS = {
  events: 'countdown_events',
  authToken: 'countdown_auth',
  lastSync: 'countdown_last_sync'
};

// 密码校验（简单 hash，用于前端验证）
window.validatePassword = function(input) {
  if (window.APP_PASSWORD === '__PASSWORD__') {
    // 开发模式：占位符未替换，允许任何密码通过
    console.warn('开发模式：密码验证已禁用');
    return true;
  }
  return input === window.APP_PASSWORD;
};

// 检查是否已认证
window.isAuthenticated = function() {
  const token = localStorage.getItem(window.STORAGE_KEYS.authToken);
  if (!token) return false;

  // 简单的时效检查（24小时）
  try {
    const data = JSON.parse(atob(token));
    const expiry = data.expiry || 0;
    return Date.now() < expiry;
  } catch (e) {
    return false;
  }
};

// 设置认证令牌
window.setAuthToken = function() {
  const expiry = Date.now() + 24 * 60 * 60 * 1000; // 24小时后过期
  const token = btoa(JSON.stringify({ expiry }));
  localStorage.setItem(window.STORAGE_KEYS.authToken, token);
};

// 清除认证
window.clearAuth = function() {
  localStorage.removeItem(window.STORAGE_KEYS.authToken);
};
