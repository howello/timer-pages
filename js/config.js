/**
 * 配置文件 — 运行时从 API 获取
 * 不再包含占位符和密钥
 */

window.APP_CONFIG = null;

/**
 * 加载运行时配置
 * @returns {Promise<Object>}
 */
function loadAppConfig() {
  return fetch('/api/config').then(function (resp) {
    if (!resp.ok) throw new Error('Config fetch failed: ' + resp.status);
    return resp.json();
  }).then(function (config) {
    window.APP_CONFIG = config;
    return config;
  }).catch(function (err) {
    console.warn('[config] 加载失败，使用默认配置', err);
    window.APP_CONFIG = { holidayFreeNames: ['春节', '清明节', '劳动节', '国庆节'] };
    return window.APP_CONFIG;
  });
}