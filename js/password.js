/**
 * 密码页交互逻辑
 */

(function() {
  'use strict';

  // 错误计数器（用于连续错误处理）
  let errorCount = 0;
  const MAX_ERRORS = 5;

  // DOM 元素
  const form = document.getElementById('password-form');
  const passwordInput = document.getElementById('password-input');
  const toggleButton = document.getElementById('toggle-password');
  const statusMessage = document.getElementById('status-message');

  /**
   * 显示状态消息
   * @param {string} message - 消息内容
   * @param {string} type - 消息类型：'error' | 'success' | 'info'
   */
  function showStatus(message, type = 'info') {
    statusMessage.textContent = message;
    statusMessage.style.display = 'block';

    // 根据类型设置样式类
    statusMessage.className = 'soft-status';
    if (type === 'error') {
      statusMessage.classList.add('status-error');
    } else if (type === 'success') {
      statusMessage.classList.add('status-success');
    }

    // 3秒后自动隐藏（除非是错误消息）
    if (type !== 'error') {
      setTimeout(() => {
        statusMessage.style.display = 'none';
      }, 3000);
    }
  }

  /**
   * 隐藏状态消息
   */
  function hideStatus() {
    statusMessage.style.display = 'none';
  }

  /**
   * 处理表单提交
   */
  function handleSubmit(e) {
    e.preventDefault();

    const password = passwordInput.value;

    // 隐藏之前的状态消息
    hideStatus();

    // 边界处理：空输入
    if (!password || !password.trim()) {
      showStatus('请输入密码', 'error');
      passwordInput.focus();
      return;
    }

    // 调用 AccessGate 验证
    const result = window.AccessGate.handlePasswordSubmit(password);

    if (result.success) {
      // 验证成功
      errorCount = 0;
      showStatus('验证成功，正在跳转...', 'success');

      // 延迟跳转，让用户看到成功消息
      setTimeout(() => {
        const returnUrl = window.AccessGate.getReturnUrl();
        window.location.href = returnUrl;
      }, 500);
    } else {
      // 验证失败
      errorCount++;

      // 清空输入框
      passwordInput.value = '';
      passwordInput.focus();

      // 连续错误处理
      if (errorCount >= MAX_ERRORS) {
        showStatus(`密码错误次数过多（${errorCount}次），请稍后再试`, 'error');
        // 禁用表单 10 秒
        form.querySelector('button[type="submit"]').disabled = true;
        passwordInput.disabled = true;

        setTimeout(() => {
          form.querySelector('button[type="submit"]').disabled = false;
          passwordInput.disabled = false;
          errorCount = 0;
          hideStatus();
        }, 10000);
      } else {
        showStatus(`${result.message}（${errorCount}/${MAX_ERRORS}）`, 'error');
      }
    }
  }

  /**
   * 切换密码显示/隐藏
   */
  function togglePasswordVisibility() {
    if (passwordInput.type === 'password') {
      passwordInput.type = 'text';
      toggleButton.textContent = '🙈';
      toggleButton.setAttribute('aria-label', '隐藏密码');
    } else {
      passwordInput.type = 'password';
      toggleButton.textContent = '👁';
      toggleButton.setAttribute('aria-label', '显示密码');
    }
  }

  /**
   * 初始化页面
   */
  function init() {
    // 如果已经认证，直接跳转到首页
    if (window.AccessGate.isAuthed()) {
      window.location.href = '/index.html';
      return;
    }

    // 绑定表单提交事件
    form.addEventListener('submit', handleSubmit);

    // 绑定密码显示/隐藏按钮
    toggleButton.addEventListener('click', togglePasswordVisibility);

    // 自动聚焦到密码输入框
    passwordInput.focus();

    // 监听输入框输入事件，有输入时隐藏错误消息
    passwordInput.addEventListener('input', () => {
      if (passwordInput.value && statusMessage.classList.contains('status-error')) {
        hideStatus();
      }
    });
  }

  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
