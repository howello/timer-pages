/**
 * 密码页交互逻辑
 * 调用 AccessGate 的异步验证 API
 */

(function() {
  'use strict';

  var errorCount = 0;
  var MAX_ERRORS = 5;

  var form = document.getElementById('password-form');
  var passwordInput = document.getElementById('password-input');
  var toggleButton = document.getElementById('toggle-password');
  var statusMessage = document.getElementById('status-message');

  function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.style.display = 'block';
    statusMessage.className = 'soft-status';
    if (type === 'error') statusMessage.classList.add('status-error');
    else if (type === 'success') statusMessage.classList.add('status-success');
    if (type !== 'error') {
      setTimeout(function () { statusMessage.style.display = 'none'; }, 3000);
    }
  }

  function hideStatus() {
    statusMessage.style.display = 'none';
  }

  function handleSubmit(e) {
    e.preventDefault();
    hideStatus();

    var password = passwordInput.value;
    if (!password || !password.trim()) {
      showStatus('请输入密码', 'error');
      passwordInput.focus();
      return;
    }

    var submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    window.AccessGate.verifyPassword(password).then(function (result) {
      submitBtn.disabled = false;

      if (result.success) {
        errorCount = 0;
        showStatus('验证成功，正在跳转...', 'success');
        setTimeout(function () {
          window.location.href = window.AccessGate.getReturnUrl();
        }, 500);
      } else {
        errorCount++;
        passwordInput.value = '';
        passwordInput.focus();

        if (errorCount >= MAX_ERRORS) {
          showStatus('密码错误次数过多（' + errorCount + '次），请稍后再试', 'error');
          submitBtn.disabled = true;
          passwordInput.disabled = true;
          setTimeout(function () {
            submitBtn.disabled = false;
            passwordInput.disabled = false;
            errorCount = 0;
            hideStatus();
          }, 10000);
        } else {
          showStatus(result.message + '（' + errorCount + '/' + MAX_ERRORS + '）', 'error');
        }
      }
    });
  }

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

  function init() {
    if (window.AccessGate.isAuthed()) {
      window.location.href = '/index.html';
      return;
    }

    form.addEventListener('submit', handleSubmit);
    toggleButton.addEventListener('click', togglePasswordVisibility);
    passwordInput.focus();

    passwordInput.addEventListener('input', function () {
      if (passwordInput.value && statusMessage.classList.contains('status-error')) {
        hideStatus();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();