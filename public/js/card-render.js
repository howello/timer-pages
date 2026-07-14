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

  // hero 时间轴色条映射（非置顶行用 mint/sky/plum，置顶行走 coral→butter 渐变）
  var HERO_MARK_MAP = {
    festival: 'mint',
    countdown: 'sky',
    recurring: 'plum',
    elapsed: 'plum'
  };

  // 星期中文（用于 hero 行目标日期显示）
  var WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

  var CARD_THEMES = ['theme-sunrise', 'theme-mint', 'theme-sky', 'theme-plum', 'theme-citrus'];

  var timerId = null;

  /**
   * 格式化时间差显示
   * @param {Object} t - {days, hours, minutes, seconds, isPast}
   * @returns {string}
   */
  function formatTime(card, t) {
    if (!t) return '--';
    if (window.TimeCalc && window.TimeCalc.shouldShowDayCount && !window.TimeCalc.shouldShowDayCount(card)) {
      return '';
    }
    // 只显示天数，不带「已过去/还有」前缀
    return t.days + ' 天';
  }

  function getCardTheme(card) {
    var source = String((card && card.id) || (card && card.title) || (card && card.name) || '');
    var total = 0;
    for (var i = 0; i < source.length; i++) {
      total += source.charCodeAt(i);
    }
    return CARD_THEMES[total % CARD_THEMES.length];
  }

  function isHiddenCard(card) {
    return window.TimeCalc && window.TimeCalc.shouldHideCard && window.TimeCalc.shouldHideCard(card);
  }

  function getRenderableCards(cards) {
    return (cards || []).filter(function (card) {
      return !isHiddenCard(card);
    });
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
    var visibleCards = getRenderableCards(cards);
    var pinned = visibleCards.filter(function (card) { return card.pinned === true; });
    return pinned[0] || visibleCards[0] || null;
  }

  /**
   * 选取 hero 右侧「重要时间」面板至多三行事件
   * 规则：已到/已过不进面板；置顶且未到固定第一行；其余按目标日期升序补足；置顶已到则回退为最近三个未到事件。
   * @param {Array} cards - EventStore.getSortedCards() 结果
   * @returns {Array<{card:Object, isPinned:boolean}>} 至多三行
   */
  function getHeroMoments(cards) {
    var visible = getRenderableCards(cards);
    var now = new Date();
    var upcoming = [];

    visible.forEach(function (card) {
      var target;
      try {
        target = window.TimeCalc.resolveTargetDate(card);
      } catch (e) {
        return; // 无法解析目标的不进面板
      }
      var t = window.TimeCalc.diff(now, target);
      if (t.isPast) return; // 已到/已过不进面板
      upcoming.push({ card: card, target: target });
    });

    // 按目标公历日期升序
    upcoming.sort(function (a, b) { return a.target - b.target; });

    // 找未到的置顶项（已过的置顶已被上面过滤，自动回退）
    var pinnedEntry = null;
    for (var i = 0; i < upcoming.length; i++) {
      if (upcoming[i].card.pinned === true) { pinnedEntry = upcoming[i]; break; }
    }

    var result = [];
    if (pinnedEntry) {
      result.push({ card: pinnedEntry.card, isPinned: true });
    }
    for (var j = 0; j < upcoming.length && result.length < 3; j++) {
      if (upcoming[j] === pinnedEntry) continue; // 置顶已占第一行，去重
      result.push({ card: upcoming[j].card, isPinned: false });
    }
    return result;
  }

  /**
   * hero 面板专用倒计时文案：0 天转小时/分钟/即将
   * @param {Object} card
   * @returns {{number:string, label:string}} 数字与单位，分别填 .days-number / .days-label
   */
  function formatMomentCountdown(card) {
    var target;
    try {
      target = window.TimeCalc.resolveTargetDate(card);
    } catch (e) {
      return { number: '--', label: '' };
    }
    var t = window.TimeCalc.diff(new Date(), target);
    if (t.isPast) {
      return { number: '0', label: '天后' }; // 防御性：理论不进面板
    }
    if (t.days > 0) {
      return { number: String(t.days), label: '天后' };
    }
    if (t.hours > 0) {
      return { number: String(t.hours), label: '小时后' };
    }
    if (t.minutes > 0) {
      return { number: String(t.minutes), label: '分钟后' };
    }
    return { number: '即将', label: '' };
  }

  /**
   * hero 行目标日期精简显示（去「目标/对应」前缀）
   * 公历：2026年 / 8月19日 /  · 星期三
   * 农历：农历七月初七（不重复对应公历）
   * @param {Object} card
   * @param {Date} target
   * @returns {{year:string, md:string, week:string, lunar:string}}
   */
  function formatMomentDateParts(card, target) {
    if (card.calendar === 'lunar') {
      var lunarText = '';
      try {
        lunarText = window.TimeCalc.formatLunarLabel(target) || '';
      } catch (e) {
        lunarText = '';
      }
      return { year: '', md: '', week: '', lunar: lunarText || '农历日期' };
    }
    return {
      year: target.getFullYear() + '年',
      md: (target.getMonth() + 1) + '月' + target.getDate() + '日',
      week: ' · 星期' + WEEKDAY_LABELS[target.getDay()],
      lunar: ''
    };
  }

  function describeCardDate(card, target) {
    if (!card) return '';

    if (card.calendar === 'lunar') {
      var parts = [];
      if (card.lunarYear) parts.push(card.lunarYear + '年');
      if (card.lunarMonth) parts.push((card.isLeapMonth ? '闰' : '') + card.lunarMonth + '月');
      if (card.lunarDay) parts.push(card.lunarDay + '日');
      var lunarText = parts.length ? '农历 ' + parts.join('') : '农历日期';
      if (target && window.TimeCalc && window.TimeCalc.formatDateOnly) {
        lunarText += ' · 对应 ' + window.TimeCalc.formatDateOnly(target);
      }
      return lunarText;
    }

    if (target && window.TimeCalc && window.TimeCalc.formatDateOnly) {
      return '目标 ' + window.TimeCalc.formatDateOnly(target);
    }

    return card.date ? '目标 ' + card.date : '';
  }

  function renderSpotlight(card) {
    var daysEl = document.getElementById('spotlight-days');
    var unitEl = document.getElementById('spotlight-unit');
    var titleEl = document.getElementById('spotlight-title');
    var tagsEl = document.getElementById('spotlight-tags');
    var dateEl = document.getElementById('spotlight-date');
    if (!daysEl || !titleEl) return;

    if (!card) {
      daysEl.textContent = '--';
      daysEl.classList.remove('text-mode');
      if (unitEl) unitEl.textContent = '天';
      titleEl.textContent = '等待置顶';
      if (tagsEl) tagsEl.innerHTML = '';
      if (dateEl) dateEl.textContent = '';
      return;
    }

    // 顶部标题：优先显示备注，没有备注再显示事件名称
    titleEl.textContent = card.note || card.title || card.name || '未命名';
    try {
      var target = window.TimeCalc.resolveTargetDate(card);
      var t = window.TimeCalc.diff(new Date(), target);
      daysEl.textContent = String(t.days);
      daysEl.classList.remove('text-mode');
      if (unitEl) unitEl.textContent = t.isPast ? '天前' : '天';
      if (dateEl) dateEl.textContent = describeCardDate(card, target);
    } catch (e) {
      daysEl.textContent = '--';
      daysEl.classList.remove('text-mode');
      if (unitEl) unitEl.textContent = '天';
      if (dateEl) dateEl.textContent = '';
    }

    if (tagsEl) {
      tagsEl.innerHTML = '';
      buildTags(card).forEach(function (tag) {
        var el = document.createElement('span');
        el.className = 'tag tag-' + tag.tone;
        el.textContent = tag.label;
        tagsEl.appendChild(el);
      });
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
    article.className = 'list-card glass-fluff ' + getCardTheme(card) + (card.pinned ? ' pinned' : '');
    article.setAttribute('data-id', card.id);
    article.setAttribute('draggable', 'true');

    // 左上角标题：优先显示备注，没有备注再显示事件名称
    var title = document.createElement('h3');
    title.className = 'card-title';
    title.textContent = card.note || card.title || card.name || '未命名';
    article.appendChild(title);

    // 中间天数
    var timeDiv = document.createElement('div');
    timeDiv.className = 'running-time';
    if (window.TimeCalc && window.TimeCalc.shouldShowDayCount && !window.TimeCalc.shouldShowDayCount(card)) {
      timeDiv.classList.add('is-hidden');
      timeDiv.textContent = '';
    } else {
      timeDiv.textContent = '--';
    }
    article.appendChild(timeDiv);

    // 左下角 tag
    appendTags(article, card);

    // 右下角操作按钮（图标，悬停显示）
    var actions = document.createElement('div');
    actions.className = 'card-actions';

    // 置顶按钮
    var pinBtn = document.createElement('button');
    pinBtn.className = 'icon-action' + (card.pinned ? ' active' : '');
    pinBtn.type = 'button';
    pinBtn.textContent = card.pinned ? '★' : '☆';
    pinBtn.setAttribute('aria-label', card.pinned ? '取消置顶' : '置顶');
    pinBtn.setAttribute('title', card.pinned ? '取消置顶' : '置顶');
    pinBtn.draggable = false;
    pinBtn.addEventListener('click', function () {
      if (opts.onPin) opts.onPin(card.id);
    });
    actions.appendChild(pinBtn);

    // 编辑按钮（仅自定义事件）
    if (!isFestival && opts.onEdit) {
      var editBtn = document.createElement('button');
      editBtn.className = 'icon-action';
      editBtn.type = 'button';
      editBtn.textContent = '✎';
      editBtn.setAttribute('aria-label', '编辑');
      editBtn.setAttribute('title', '编辑');
      editBtn.draggable = false;
      editBtn.addEventListener('click', function () {
        opts.onEdit(card);
      });
      actions.appendChild(editBtn);
    }

    // 删除按钮（仅自定义事件）
    if (!isFestival && opts.onDelete) {
      var delBtn = document.createElement('button');
      delBtn.className = 'icon-action is-danger';
      delBtn.type = 'button';
      delBtn.textContent = '🗑';
      delBtn.setAttribute('aria-label', '删除');
      delBtn.setAttribute('title', '删除');
      delBtn.draggable = false;
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
    var spotlight = getPinnedCard(cards);
    renderSpotlight(spotlight);

    var container = document.querySelector('.fixed-card-stage');
    if (!container) return;
    container.innerHTML = '';

    var fixedCards = spotlight ? [spotlight] : [];

    fixedCards.forEach(function (card) {
      // 固定卡片使用简化版 DOM，不包含拖拽/编辑/删除按钮
      var article = document.createElement('article');
      article.className = 'feature-card glass-fluff ' + (COLOR_MAP[card.type] || 'mint') + ' ' + getCardTheme(card);
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
      if (window.TimeCalc && window.TimeCalc.shouldShowDayCount && !window.TimeCalc.shouldShowDayCount(card)) {
        timeDiv.classList.add('is-hidden');
        timeDiv.textContent = '';
      } else {
        timeDiv.textContent = '-- 天 --:--:--';
      }
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

    getRenderableCards(cards).forEach(function (card) {
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
    getRenderableCards(cards).forEach(function (card) {
      var target;
      try {
        target = window.TimeCalc.resolveTargetDate(card);
      } catch (e) {
        return;
      }
      var t = window.TimeCalc.diff(now, target);
      var display = formatTime(card, t);

      // 更新所有该卡片的 running-time 元素
      var els = document.querySelectorAll('[data-id="' + card.id + '"] .running-time');
      els.forEach(function (el) {
        el.textContent = display;
        el.classList.toggle('is-hidden', display === '');
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
    getRenderableCards: getRenderableCards,
    refreshRunningTimes: refreshRunningTimes,
    startLiveTimer: startLiveTimer,
    stopLiveTimer: stopLiveTimer
  };
})(window);
