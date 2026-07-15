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
   * 规则：可解析的置顶项无论过去或未来都固定第一行；其余仅从未来事件中按日期升序补足。
   * @param {Array} cards - EventStore.getSortedCards() 结果
   * @returns {Array<{card:Object, isPinned:boolean}>} 至多三行
   */
  function getHeroMoments(cards) {
    var visible = getRenderableCards(cards);
    var now = new Date();
    var pinnedEntry = null;
    var upcoming = [];

    visible.forEach(function (card) {
      var target;
      try {
        target = window.TimeCalc.resolveTargetDate(card);
      } catch (e) {
        return;
      }

      var entry = { card: card, target: target };
      var t = window.TimeCalc.diff(now, target);
      if (card.pinned === true && pinnedEntry === null) {
        pinnedEntry = entry;
      }
      if (!t.isPast && card.pinned !== true) {
        upcoming.push(entry);
      }
    });

    upcoming.sort(function (a, b) { return a.target - b.target; });

    var result = [];
    if (pinnedEntry) {
      result.push({ card: pinnedEntry.card, isPinned: true });
    }
    for (var i = 0; i < upcoming.length && result.length < 3; i++) {
      result.push({ card: upcoming[i].card, isPinned: false });
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
      if (t.days > 0) {
        return { number: String(t.days), label: '天前' };
      }
      if (t.hours > 0) {
        return { number: String(t.hours), label: '小时前' };
      }
      if (t.minutes > 0) {
        return { number: String(t.minutes), label: '分钟前' };
      }
      return { number: '刚刚', label: '' };
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

  /**
   * 构建单行 hero 时间轴 DOM（只读，无操作按钮）
   * @param {Object} card
   * @param {boolean} isPinned
   * @returns {HTMLElement}
   */
  function buildMomentRow(card, isPinned) {
    var target;
    try {
      target = window.TimeCalc.resolveTargetDate(card);
    } catch (e) {
      target = null;
    }
    var cd = formatMomentCountdown(card);
    var dateParts = target ? formatMomentDateParts(card, target) : { year: '', md: '', week: '', lunar: '' };
    var name = card.note || card.title || card.name || '未命名';

    var row = document.createElement('div');
    row.className = 'moment-row' + (isPinned ? ' pinned' : '');
    row.setAttribute('data-id', card.id);

    // 左：天数/倒计时
    var daysBox = document.createElement('div');
    daysBox.className = 'days-box';
    var num = document.createElement('span');
    num.className = 'days-number';
    num.textContent = cd.number;
    var lab = document.createElement('span');
    lab.className = 'days-label';
    lab.textContent = cd.label;
    daysBox.appendChild(num);
    daysBox.appendChild(lab);
    row.appendChild(daysBox);

    // 中：名称 + 目标日期
    var copy = document.createElement('div');
    copy.className = 'moment-copy';

    var nameEl = document.createElement('div');
    nameEl.className = 'moment-name';
    nameEl.setAttribute('title', name); // 悬停显示完整名称
    nameEl.textContent = name;
    if (isPinned) {
      var chip = document.createElement('span');
      chip.className = 'pin-chip';
      chip.textContent = '置顶';
      nameEl.appendChild(chip);
    }
    copy.appendChild(nameEl);

    var dateEl = document.createElement('div');
    dateEl.className = 'moment-date';
    if (dateParts.lunar) {
      var l = document.createElement('span');
      l.className = 'md-lunar';
      l.textContent = dateParts.lunar;
      dateEl.appendChild(l);
    } else {
      var y = document.createElement('span');
      y.className = 'md-year';
      y.textContent = dateParts.year;
      dateEl.appendChild(y);
      var md = document.createElement('span');
      md.className = 'md-md';
      md.textContent = dateParts.md;
      dateEl.appendChild(md);
      var w = document.createElement('span');
      w.className = 'md-week';
      w.textContent = dateParts.week;
      dateEl.appendChild(w);
    }
    if (isPinned) {
      var pin = document.createElement('span');
      pin.className = 'md-pin';
      pin.textContent = ' · 置顶';
      dateEl.appendChild(pin);
    }
    copy.appendChild(dateEl);
    row.appendChild(copy);

    // 右：色条
    var mark = document.createElement('span');
    mark.className = 'type-mark';
    mark.setAttribute('aria-hidden', 'true');
    if (!isPinned) {
      // 非置顶行按 type 取 mint/sky/plum；置顶行由 CSS .pinned .type-mark 渐变覆盖，不设内联
      var colorName = HERO_MARK_MAP[card.type] || 'mint';
      mark.style.background = 'var(--' + colorName + ')';
    }
    row.appendChild(mark);

    return row;
  }

  /**
   * 渲染 hero 右侧「重要时间」三行（整块构建）
   * @param {Array} cards - EventStore.getSortedCards() 结果
   */
  function renderHeroTimeline(cards) {
    var container = document.getElementById('hero-moments');
    if (!container) return;
    var moments = getHeroMoments(cards);
    container.innerHTML = '';

    if (!moments.length) {
      var empty = document.createElement('p');
      empty.className = 'timeline-empty';
      empty.textContent = '还没有重要日子';
      container.appendChild(empty);
      return;
    }

    moments.forEach(function (item) {
      container.appendChild(buildMomentRow(item.card, item.isPinned));
    });
  }

  /**
   * 每秒刷新 hero 右侧行内天数/倒计时文本，避免整块重建闪烁
   * 若事件集合（id 顺序）变化（如跨零点、置顶到达），回退为 renderHeroTimeline 全量重建。
   * @param {Array} cards
   */
  function refreshHeroMoments(cards) {
    var container = document.getElementById('hero-moments');
    if (!container) return;
    var moments = getHeroMoments(cards);
    var existingRows = container.querySelectorAll('.moment-row');
    var existingIds = Array.prototype.map.call(existingRows, function (el) {
      return el.getAttribute('data-id');
    });
    var newIds = moments.map(function (m) { return m.card.id; });

    var sameSet = existingIds.length === newIds.length &&
      newIds.every(function (id, i) { return existingIds[i] === id; });

    if (!sameSet) {
      renderHeroTimeline(cards);
      return;
    }

    // 集合稳定：仅更新行内天数/倒计时文本
    moments.forEach(function (item) {
      var row = container.querySelector('.moment-row[data-id="' + item.card.id + '"]');
      if (!row) return;
      var cd = formatMomentCountdown(item.card);
      var num = row.querySelector('.days-number');
      var lab = row.querySelector('.days-label');
      if (num) num.textContent = cd.number;
      if (lab) lab.textContent = cd.label;
    });
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
   * 渲染固定卡片区（首屏 hero 右侧时间轴）
   * @param {Array} cards - 全部卡片（已排序）
   */
  function renderFixed(cards) {
    renderHeroTimeline(cards);
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
    refreshHeroMoments(cards);
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
    getHeroMoments: getHeroMoments,
    renderHeroTimeline: renderHeroTimeline,
    refreshHeroMoments: refreshHeroMoments,
    formatMomentCountdown: formatMomentCountdown,
    getPinnedCard: getPinnedCard,
    getRenderableCards: getRenderableCards,
    refreshRunningTimes: refreshRunningTimes,
    startLiveTimer: startLiveTimer,
    stopLiveTimer: stopLiveTimer
  };
})(window);
