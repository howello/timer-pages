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
    return prefix + ' ' + t.days + ' 天';
  }

  function buildTags(card) {
    var tags = [];
    tags.push({ label: TYPE_LABELS[card.type] || card.type || '事件', tone: card.type || 'default' });
    tags.push({ label: card.calendar === 'lunar' ? '农历' : '公历', tone: 'calendar' });
    if (card.isOffDay) tags.push({ label: '法定节假日', tone: 'statutory' });
    if (card.highwayFree) tags.push({ label: '高速免费', tone: 'freeway' });
    return tags;
  }

  function appendTags(parent, card) {
    var tagWrap = document.createElement('div');
    tagWrap.className = 'tag-row';
    buildTags(card).forEach(function (tag) {
      var el = document.createElement('span');
      el.className = 'tag tag-' + tag.tone;
      el.textContent = tag.label;
      tagWrap.appendChild(el);
    });
    parent.appendChild(tagWrap);
  }

  function getPinnedCard(cards) {
    var pinned = cards.filter(function (card) { return card.pinned === true; });
    return pinned[0] || cards[0] || null;
  }

  function renderSpotlight(card) {
    var typeEl = document.getElementById('spotlight-type');
    var daysEl = document.getElementById('spotlight-days');
    var titleEl = document.getElementById('spotlight-title');
    if (!typeEl || !daysEl || !titleEl) return;

    if (!card) {
      typeEl.textContent = 'PINNED';
      daysEl.textContent = '--';
      titleEl.textContent = '等待置顶';
      return;
    }

    typeEl.textContent = TYPE_LABELS[card.type] || '事件';
    titleEl.textContent = card.title || card.name || '未命名';
    try {
      var target = window.TimeCalc.resolveTargetDate(card);
      var t = window.TimeCalc.diff(new Date(), target);
      daysEl.textContent = String(t.days);
    } catch (e) {
      daysEl.textContent = '--';
    }
  }

  /**
   * 创建卡片 DOM
   * @param {Object} card - 卡片数据对象
   * @param {Object} opts - { isFixed: boolean, onPin: fn, onEdit: fn, onDelete: fn }
   * @returns {HTMLElement}
   */
  function createCard(card, opts) {
    opts = opts || {};
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

    appendTags(info, card);

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

    var actions = document.createElement('div');
    actions.className = 'card-actions';

    // 置顶按钮
    var pinBtn = document.createElement('button');
    pinBtn.className = 'pin-button' + (card.pinned ? ' active' : '');
    pinBtn.type = 'button';
    pinBtn.textContent = card.pinned ? '已置顶' : '置顶';
    pinBtn.setAttribute('aria-label', card.pinned ? '取消置顶' : '置顶');
    pinBtn.addEventListener('click', function () {
      if (opts.onPin) opts.onPin(card.id);
    });
    actions.appendChild(pinBtn);

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
      actions.appendChild(editBtn);
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
      actions.appendChild(delBtn);
    }

    article.appendChild(actions);

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

    var spotlight = getPinnedCard(cards);
    renderSpotlight(spotlight);

    var fixedCards = spotlight ? [spotlight] : [];

    fixedCards.forEach(function (card) {
      // 固定卡片使用简化版 DOM，不包含拖拽/编辑/删除按钮
      var article = document.createElement('article');
      article.className = 'feature-card glass-fluff ' + (COLOR_MAP[card.type] || 'mint');
      article.setAttribute('data-id', card.id);

      var info = document.createElement('div');
      info.className = 'card-info';

      var title = document.createElement('h2');
      title.textContent = card.title || card.name || '未命名';
      info.appendChild(title);

      appendTags(info, card);

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
    renderSpotlight(getPinnedCard(cards));
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
    renderSpotlight: renderSpotlight,
    refreshRunningTimes: refreshRunningTimes,
    startLiveTimer: startLiveTimer,
    stopLiveTimer: stopLiveTimer
  };
})(window);
