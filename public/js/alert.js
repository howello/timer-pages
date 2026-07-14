/**
 * 轻量 UI 反馈模块
 * 提供自建的 confirm / alert 弹窗，以及 loading 遮罩与操作互斥（防抖）能力
 * 替代浏览器原生 confirm/alert，风格与页面统一
 */
(function (window) {
  'use strict';

  var busy = false;
  var loadingEl = null;
  var loadingTimer = null;

  function buildBackdrop(className) {
    var backdrop = document.createElement('div');
    backdrop.className = 'ui-dialog-backdrop ' + className;
    return backdrop;
  }

  /**
   * 自建确认框
   * @param {string} message
   * @param {Object} [opts] - { title, confirmText, cancelText, danger }
   * @returns {Promise<boolean>}
   */
  function confirm(message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var backdrop = buildBackdrop('ui-confirm-backdrop');

      var box = document.createElement('div');
      box.className = 'ui-dialog glass-fluff';

      var title = document.createElement('h3');
      title.className = 'ui-dialog-title';
      title.textContent = opts.title || '请确认';

      var msg = document.createElement('p');
      msg.className = 'ui-dialog-message';
      msg.textContent = message || '';

      var actions = document.createElement('div');
      actions.className = 'ui-dialog-actions';

      var cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'ghost-fluff';
      cancelBtn.textContent = opts.cancelText || '取消';

      var okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.className = 'primary-fluff' + (opts.danger ? ' is-danger' : '');
      okBtn.textContent = opts.confirmText || '确认';

      actions.appendChild(cancelBtn);
      actions.appendChild(okBtn);
      box.appendChild(title);
      box.appendChild(msg);
      box.appendChild(actions);
      backdrop.appendChild(box);
      document.body.appendChild(backdrop);

      requestAnimationFrame(function () { backdrop.classList.add('is-open'); });

      function cleanup(result) {
        backdrop.classList.remove('is-open');
        setTimeout(function () { backdrop.remove(); }, 200);
        document.removeEventListener('keydown', onKey);
        resolve(result);
      }

      function onKey(e) {
        if (e.key === 'Escape') cleanup(false);
        if (e.key === 'Enter') cleanup(true);
      }

      cancelBtn.addEventListener('click', function () { cleanup(false); });
      okBtn.addEventListener('click', function () { cleanup(true); });
      backdrop.addEventListener('click', function (e) {
        if (e.target === backdrop) cleanup(false);
      });
      document.addEventListener('keydown', onKey);
      okBtn.focus();
    });
  }

  /**
   * 自建提示框
   * @param {string} message
   * @param {Object} [opts] - { title, confirmText }
   * @returns {Promise<void>}
   */
  function alert(message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var backdrop = buildBackdrop('ui-alert-backdrop');

      var box = document.createElement('div');
      box.className = 'ui-dialog glass-fluff';

      var title = document.createElement('h3');
      title.className = 'ui-dialog-title';
      title.textContent = opts.title || '提示';

      var msg = document.createElement('p');
      msg.className = 'ui-dialog-message';
      msg.textContent = message || '';

      var actions = document.createElement('div');
      actions.className = 'ui-dialog-actions';

      var okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.className = 'primary-fluff';
      okBtn.textContent = opts.confirmText || '知道了';

      actions.appendChild(okBtn);
      box.appendChild(title);
      box.appendChild(msg);
      box.appendChild(actions);
      backdrop.appendChild(box);
      document.body.appendChild(backdrop);

      requestAnimationFrame(function () { backdrop.classList.add('is-open'); });

      function cleanup() {
        backdrop.classList.remove('is-open');
        setTimeout(function () { backdrop.remove(); }, 200);
        document.removeEventListener('keydown', onKey);
        resolve();
      }

      function onKey(e) {
        if (e.key === 'Escape' || e.key === 'Enter') cleanup();
      }

      okBtn.addEventListener('click', cleanup);
      document.addEventListener('keydown', onKey);
      okBtn.focus();
    });
  }

  function showLoading(text) {
    if (loadingEl) {
      var t = loadingEl.querySelector('.ui-loading-text');
      if (t) t.textContent = text || '处理中…';
      return;
    }
    loadingEl = buildBackdrop('ui-loading-backdrop');
    var box = document.createElement('div');
    box.className = 'ui-loading glass-fluff';

    var spinner = document.createElement('span');
    spinner.className = 'ui-spinner';

    var label = document.createElement('span');
    label.className = 'ui-loading-text';
    label.textContent = text || '处理中…';

    box.appendChild(spinner);
    box.appendChild(label);
    loadingEl.appendChild(box);
    document.body.appendChild(loadingEl);
    // 延迟显示，避免极快的操作出现闪烁
    loadingTimer = setTimeout(function () {
      if (loadingEl) loadingEl.classList.add('is-open');
    }, 120);
  }

  function hideLoading() {
    if (loadingTimer) {
      clearTimeout(loadingTimer);
      loadingTimer = null;
    }
    if (!loadingEl) return;
    var el = loadingEl;
    loadingEl = null;
    el.classList.remove('is-open');
    setTimeout(function () { el.remove(); }, 200);
  }

  /**
   * 互斥执行：操作进行中忽略重复触发，并显示 loading（防抖）
   * @param {Function} fn - 返回 Promise 的异步操作
   * @param {string} [text] - loading 文案
   * @returns {Promise<void>}
   */
  function runExclusive(fn, text) {
    if (busy) return Promise.resolve();
    busy = true;
    showLoading(text);
    return Promise.resolve()
      .then(fn)
      .catch(function (err) {
        console.error(err);
        busy = false;
        hideLoading();
        return alert((err && err.message) || '操作失败', { title: '出错了' });
      })
      .finally(function () {
        busy = false;
        hideLoading();
      });
  }

  window.UIAlert = {
    confirm: confirm,
    alert: alert,
    showLoading: showLoading,
    hideLoading: hideLoading,
    runExclusive: runExclusive,
    isBusy: function () { return busy; }
  };
})(window);
