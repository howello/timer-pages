/**
 * 密码访问控制模块
 * 提供密码验证、会话管理和页面守卫功能
 */

(function(window) {
  'use strict';

  const SESSION_KEY = 'countdown_session';

  /**
   * 验证输入密码是否正确
   * @param {string} input - 用户输入的密码
   * @returns {boolean} 密码是否正确
   */
  function verify(input) {
    // 边界处理：空输入
    if (!input || typeof input !== 'string') {
      return false;
    }

    // 从 APP_CONFIG 获取密码配置
    const configPassword = window.APP_CONFIG?.password;

    // 开发模式：如果配置未定义或为占位符，允许任意非空密码
    if (!configPassword || configPassword === '__PASSWORD__') {
      console.warn('[access-gate] 开发模式：密码验证已禁用');
      return true;
    }

    // 比对密码
    return input === configPassword;
  }

  /**
   * 检查用户是否已通过认证
   * @returns {boolean} 是否已认证
   */
  function isAuthed() {
    try {
      const sessionData = sessionStorage.getItem(SESSION_KEY);
      if (!sessionData) {
        return false;
      }

      // 解析会话数据
      const data = JSON.parse(sessionData);

      // 检查会话标记是否有效
      return data.authed === true;
    } catch (e) {
      console.error('[access-gate] 会话数据解析失败:', e);
      return false;
    }
  }

  /**
   * 设置认证会话
   * @private
   */
  function setAuthed() {
    try {
      const sessionData = {
        authed: true,
        timestamp: Date.now()
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    } catch (e) {
      console.error('[access-gate] 会话数据写入失败:', e);
    }
  }

  /**
   * 清除认证会话
   * @private
   */
  function clearAuthed() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {
      console.error('[access-gate] 会话数据清除失败:', e);
    }
  }

  /**
   * 主页守卫：未通过认证则跳转到密码页
   */
  function requireAuth() {
    if (!isAuthed()) {
      // 保存当前页面路径（用于认证后跳回）
      const returnUrl = window.location.pathname + window.location.search + window.location.hash;
      if (returnUrl !== '/password.html') {
        sessionStorage.setItem('countdown_return_url', returnUrl);
      }

      // 跳转到密码页
      window.location.href = '/password.html';
    }
  }

  /**
   * 密码页专用：处理密码表单提交
   * @param {string} password - 用户输入的密码
   * @returns {Object} 结果对象 { success: boolean, message: string }
   */
  function handlePasswordSubmit(password) {
    // 边界处理：空输入
    if (!password || !password.trim()) {
      return {
        success: false,
        message: '请输入密码'
      };
    }

    // 验证密码
    if (verify(password)) {
      // 写入会话标记
      setAuthed();

      return {
        success: true,
        message: '验证成功'
      };
    } else {
      return {
        success: false,
        message: '密码错误，请重试'
      };
    }
  }

  /**
   * 密码页专用：获取认证后的返回URL
   * @returns {string} 返回URL，默认为首页
   */
  function getReturnUrl() {
    try {
      const returnUrl = sessionStorage.getItem('countdown_return_url');
      sessionStorage.removeItem('countdown_return_url'); // 清除一次性使用的返回URL
      return returnUrl || '/index.html';
    } catch (e) {
      return '/index.html';
    }
  }

  // 导出公共 API
  window.AccessGate = {
    verify: verify,
    isAuthed: isAuthed,
    requireAuth: requireAuth,
    handlePasswordSubmit: handlePasswordSubmit,
    getReturnUrl: getReturnUrl,
    clearAuthed: clearAuthed
  };

})(window);
