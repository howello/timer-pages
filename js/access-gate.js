/**
 * 密码访问控制模块
 * 密码验证通过 POST /api/login 在服务端完成
 * 会话状态通过 HttpOnly cookie 管理
 */

(function(window) {
  'use strict';

  var SESSION_KEY = 'countdown_session';

  /**
   * 验证密码（通过后端 API）
   * @param {string} input - 用户输入的密码
   * @returns {Promise<{success: boolean, message: string}>}
   */
  function verifyPassword(input) {
    if (!input || typeof input !== 'string' || !input.trim()) {
      return Promise.resolve({ success: false, message: '请输入密码' });
    }

    return fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: input })
    }).then(function (resp) {
      if (resp.ok) {
        setAuthed();
        return { success: true, message: '验证成功' };
      }
      if (resp.status === 500) {
        return { success: false, message: '系统配置错误，请联系管理员' };
      }
      return { success: false, message: '密码错误，请重试' };
    }).catch(function () {
      return { success: false, message: '网络错误，请稍后再试' };
    });
  }

  /**
   * 检查会话是否有效（通过后端 API）
   * @returns {Promise<boolean>}
   */
  function checkSession() {
    return fetch('/api/session').then(function (resp) {
      return resp.ok;
    }).catch(function () {
      return false;
    });
  }

  /**
   * 检查本地会话标记（快速 UI 判断）
   * @returns {boolean}
   */
  function isAuthed() {
    try {
      var data = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}');
      return data.authed === true;
    } catch (e) {
      return false;
    }
  }

  /**
   * 设置本地会话标记
   */
  function setAuthed() {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ authed: true, timestamp: Date.now() }));
    } catch (e) {
      console.error('[access-gate] 会话数据写入失败:', e);
    }
  }

  /**
   * 清除本地会话标记
   */
  function clearAuthed() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }

  /**
   * 登出（清除服务端 cookie + 本地标记）
   * @returns {Promise}
   */
  function logout() {
    return fetch('/api/logout', { method: 'POST' }).then(function () {
      clearAuthed();
    }).catch(function () {
      clearAuthed();
    });
  }

  /**
   * 主页守卫：必须通过服务端会话校验才放行
   * @returns {Promise<boolean>} 会话是否有效
   */
  function requireAuth() {
    return checkSession().then(function(valid) {
      if (!valid) {
        clearAuthed();
        var returnUrl = window.location.pathname + window.location.search + window.location.hash;
        if (returnUrl !== '/password.html') {
          sessionStorage.setItem('countdown_return_url', returnUrl);
        }
        window.location.href = '/password.html';
        return false;
      }
      setAuthed();
      return true;
    });
  }

  /**
   * 获取认证后的返回 URL
   * @returns {string}
   */
  function getReturnUrl() {
    try {
      var url = sessionStorage.getItem('countdown_return_url');
      sessionStorage.removeItem('countdown_return_url');
      return url || '/index.html';
    } catch (e) {
      return '/index.html';
    }
  }

  // 导出公共 API
  window.AccessGate = {
    verifyPassword: verifyPassword,
    checkSession: checkSession,
    isAuthed: isAuthed,
    requireAuth: requireAuth,
    getReturnUrl: getReturnUrl,
    clearAuthed: clearAuthed,
    logout: logout
  };

})(window);