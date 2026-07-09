/**
 * 卡片渲染模块
 * 负责固定卡片区与列表的 DOM 渲染，每秒刷新走动时间
 */
(function (window) {
  'use strict';

  var TYPE_LABELS = {
    festival: '节日',
    countdown: '倒计时',
    recurring: '周期性',
    elapsed: '已过天数'
  };

  var COLOR_MAP = {
    festival: 'coral',
    countdown: 'mint',
    recurring: 'sky',
    elapsed: 'rose'
  };

  var timerId = null;

  /**
   * 格式化时间差显示
   * @param {Object} t - {days, hours, minutes, seconds, isPast}
   * @returns {string}
   */
  function formatTime(t) {
    if (!t) return '--';
    var prefix = t.isPast ? '已过去' : '还有';
    return prefix + ' ' + t.days + ' 天 ' +
      String(t.hours).padStart(2, '0') + ':' +
      String(t.minutes).padStart(2, '0') + ':' +
      String(t.seconds).padStart(2, '0');
  }

  /**
   * 创建卡片 DOM
   * @param {Object} card - 卡片数据对象
   * @param {Object} opts - { isFixed: boolean, onPin: fn, onEdit: fn, onDelete: fn }
   * @returns {HTMLElement}
   */
  function createCard(card, opts) {
    opts = opts || {};
    var isFixed = opts.isFixed || false;
    var isFestival = card.id && card.id.startsWith('festival:');

    var article = document.createElement('article');
    article.className = 'list-card glass-fluff' + (card.pinned ? ' pinned' : '');
    article.setAttribute('data-id', card.id);
    article.setAttribute('draggable', 'true');

    // 拖拽句柄
    var handle = document.createElement('button');
    handle.className = 'drag-handle';
    handle.type = 'button';
    handle.setAttribute('aria-label', '拖动排序');
    handle.textContent = '⋮⋮';
    handle.draggable = false;
    article.appendChild(handle);

    // 信息区域
    var info = document.createElement('div');
    info.className = 'card-info';

    var title = document.createElement('h3');
    title.textContent = card.title || card.name || '未命名';
    info.appendChild(title);

    // 标签：类型 + 日期体系 + 法定节假日 + 高速免费
    var meta = document.createElement('p');
    var tags = [];
    tags.push(TYPE_LABELS[card.type] || card.type);
    if (card.calendar === 'lunar') {
      tags.push('农历');
    } else {
      tags.push('公历');
    }
    if (card.isOffDay) {
      tags.push('法定节假日');
    }
    if (card.highwayFree) {
      tags.push('高速免费');
    }
    meta.textContent = tags.join(' · ');
    info.appendChild(meta);

    // 走动时间显示
    var timeDiv = document.createElement('div');
    timeDiv.className = 'running-time';
    timeDiv.textContent = '-- 天 --:--:--';
    info.appendChild(timeDiv);

    // 备注
    if (card.note) {
      var note = document.createElement('p');
      note.className = 'card-note';
      note.textContent = card.note;
      info.appendChild(note);
    }

    article.appendChild(info);

    // 置顶按钮
    var pinBtn = document.createElement('button');
    pinBtn.className = 'pin-button' + (card.pinned ? ' active' : '');
    pinBtn.type = 'button';
    pinBtn.textContent = card.pinned ? '已置顶' : '置顶';
    pinBtn.setAttribute('aria-label', card.pinned ? '取消置顶' : '置顶');
    pinBtn.addEventListener('click', function () {
      if (opts.onPin) opts.onPin(card.id);
    });
    article.appendChild(pinBtn);

    // 编辑按钮（仅自定义事件）
    if (!isFestival && opts.onEdit) {
      var editBtn = document.createElement('button');
      editBtn.className = 'soft-icon-button';
      editBtn.type = 'button';
      editBtn.textContent = '✎';
      editBtn.setAttribute('aria-label', '编辑');
      editBtn.addEventListener('click', function () {
        opts.onEdit(card);
      });
      article.appendChild(editBtn);
    }

    // 删除按钮（仅自定义事件）
    if (!isFestival && opts.onDelete) {
      var delBtn = document.createElement('button');
      delBtn.className = 'soft-icon-button';
      delBtn.type = 'button';
      delBtn.textContent = '×';
      delBtn.setAttribute('aria-label', '删除');
      delBtn.style.color = '#e74c3c';
      delBtn.addEventListener('click', function () {
        opts.onDelete(card.id);
      });
      article.appendChild(delBtn);
    }

    return article;
  }

  /**
   * 渲染固定卡片区
   * @param {Array} cards - 全部卡片（已排序）
   */
  function renderFixed(cards) {
    var container = document.querySelector('.fixed-card-stage');
    if (!container) return;
    container.innerHTML = '';

    var fixedCards = cards.filter(function (c) { return c.pinned === true; });
    if (fixedCards.length === 0) {
      // 没有 pinned，取前 2 张
      fixedCards = cards.slice(0, 2);
    }

    fixedCards.forEach(function (card) {
      // 固定卡片使用简化版 DOM，不包含拖拽/编辑/删除按钮
      var article = document.createElement('article');
      article.className = 'feature-card glass-fluff ' + (COLOR_MAP[card.type] || 'mint');
      article.setAttribute('data-id', card.id);

      var info = document.createElement('div');
      info.className = 'card-info';

      var title = document.createElement('h3');
      title.textContent = card.title || card.name || '未命名';
      info.appendChild(title);

      // 标签：类型 + 日期体系 + 法定节假日 + 高速免费
      var meta = document.createElement('p');
      var tags = [];
      tags.push(TYPE_LABELS[card.type] || card.type);
      if (card.calendar === 'lunar') {
        tags.push('农历');
      } else {
        tags.push('公历');
      }
      if (card.isOffDay) {
        tags.push('法定节假日');
      }
      if (card.highwayFree) {
        tags.push('高速免费');
      }
      meta.textContent = tags.join(' · ');
      info.appendChild(meta);

      // 走动时间显示
      var timeDiv = document.createElement('div');
      timeDiv.className = 'running-time';
      timeDiv.textContent = '-- 天 --:--:--';
      info.appendChild(timeDiv);

      // 备注
      if (card.note) {
        var note = document.createElement('p');
        note.className = 'card-note';
        note.textContent = card.note;
        info.appendChild(note);
      }

      article.appendChild(info);
      container.appendChild(article);
    });
  }

  /**
   * 渲染列表
   * @param {Array} cards - 全部卡片（已排序）
   * @param {Object} opts - { onPin: fn, onEdit: fn, onDelete: fn }
   */
  function renderList(cards, opts) {
    opts = opts || {};
    var container = document.getElementById('event-list');
    if (!container) return;
    container.innerHTML = '';

    cards.forEach(function (card) {
      var article = createCard(card, opts);
      container.appendChild(article);
    });
  }

  /**
   * 刷新所有走动时间
   * @param {Array} cards - 全部卡片
   */
  function refreshRunningTimes(cards) {
    var now = new Date();
    cards.forEach(function (card) {
      var target;
      try {
        target = window.TimeCalc.resolveTargetDate(card);
      } catch (e) {
        return;
      }
      var t = window.TimeCalc.diff(now, target);
      var display = formatTime(t);

      // 更新所有该卡片的 running-time 元素
      var els = document.querySelectorAll('[data-id="' + card.id + '"] .running-time');
      els.forEach(function (el) {
        el.textContent = display;
      });
    });
  }

  /**
   * 启动每秒定时器刷新走动时间
   * @param {Function} getCards - 返回当前卡片数组的函数
   */
  function startLiveTimer(getCards) {
    stopLiveTimer();
    refreshRunningTimes(getCards());
    timerId = setInterval(function () {
      refreshRunningTimes(getCards());
    }, 1000);
  }

  function stopLiveTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  // 导出到全局
  window.CardRender = {
    createCard: createCard,
    renderFixed: renderFixed,
    renderList: renderList,
    refreshRunningTimes: refreshRunningTimes,
    startLiveTimer: startLiveTimer,
    stopLiveTimer: stopLiveTimer
  };
})(window);
