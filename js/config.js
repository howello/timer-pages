/**
 * 配置文件
 * 此文件包含占位符，将由 Cloudflare Pages 构建时替换
 */

// 应用配置对象（Cloudflare Pages 构建期注入）
window.APP_CONFIG = {
  password: '__PASSWORD__',
  oss: {
    region: '__OSS_REGION__',
    bucket: '__OSS_BUCKET__',
    accessKeyId: '__OSS_AK__',
    accessKeySecret: '__OSS_SK__',
    objectKey: '__OSS_OBJECT_KEY__'
  }
};

// 访问密码（保持向后兼容）
window.APP_PASSWORD = window.APP_CONFIG.password;

// OSS 配置（保持向后兼容）
window.OSS_CONFIG = window.APP_CONFIG.oss;
window.DATA_FILE_PATH = window.APP_CONFIG.oss.objectKey || 'countdown-data.json';

// 本地存储键名
window.STORAGE_KEYS = {
  events: 'countdown_events',
  authToken: 'countdown_auth',
  lastSync: 'countdown_last_sync'
};

// 密码校验（兼容旧入口；新逻辑使用 access-gate.js）
window.validatePassword = function(input) {
  if (window.APP_PASSWORD === '__PASSWORD__') {
    console.warn('开发模式：密码验证已禁用');
    return true;
  }
  return input === window.APP_PASSWORD;
};

// 检查是否已认证（兼容旧入口；新逻辑使用 access-gate.js）
window.isAuthenticated = function() {
  const token = localStorage.getItem(window.STORAGE_KEYS.authToken);
  if (!token) return false;

  try {
    const data = JSON.parse(atob(token));
    const expiry = data.expiry || 0;
    return Date.now() < expiry;
  } catch (e) {
    return false;
  }
};

window.setAuthToken = function() {
  const expiry = Date.now() + 24 * 60 * 60 * 1000;
  const token = btoa(JSON.stringify({ expiry }));
  localStorage.setItem(window.STORAGE_KEYS.authToken, token);
};

window.clearAuth = function() {
  localStorage.removeItem(window.STORAGE_KEYS.authToken);
};
