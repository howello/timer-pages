# 置顶首屏与移动端适配修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 让所有可解析的置顶事件始终显示在首屏第一行，并在不改变桌面端的前提下修复手机密码页、浮动标题栏、登出文字和卡片操作区。

**Architecture:** 保持 EventStore、D1 和后端不变，在 CardRender 的首屏选择器中把“选择置顶项”提前到未来候选过滤之前，并为过去项增加对称时间文案。移动端只修改现有 max-width: 680px 断点；自动化使用 Node 内置 node:test + vm，不引入依赖。

**Tech Stack:** 原生 JavaScript（IIFE + window 全局）、HTML、单文件 CSS、Node.js 22 内置测试、Cloudflare Wrangler、本地浏览器验证。

## Global Constraints

- 电脑端布局与 hover 行为不变；所有响应式样式修改必须限制在 max-width: 680px。
- 不修改 src/worker.js、D1 schema、API、EventStore 排序/持久化或单一置顶约束。
- 未置顶的过去事件继续不进入首屏“重要时间”。
- 过去文案为“N 天前 / N 小时前 / N 分钟前 / 刚刚”；未来文案保持现状。
- 节假日继续只读，只允许置顶和排序。
- 前端继续采用 IIFE + 'use strict'，不引入模块系统、构建步骤或第三方测试依赖。
- 生产代码必须在对应失败测试出现后才能修改。
- 浏览器不保证无用户手势时弹出软键盘；实现标准 autofocus + 现有 focus() 后备，不加入模拟点击或循环聚焦。

## File Structure

| 文件 | 职责 | 动作 |
|---|---|---|
| test/card-render.test.js | 在固定时钟下验证首屏选择与时间方向文案 | 新建 |
| test/mobile-ui-contract.test.js | 验证密码输入和 max-width: 680px 最终 CSS 契约 | 新建 |
| public/js/card-render.js | 首屏候选选择、过去/未来文案 | 修改 |
| public/password.html | 标准自动聚焦提示 | 修改 |
| public/css/fluffy.css | 手机密码页、标题栏、登出和卡片操作覆盖 | 修改 |

---

### Task 1: 手机端密码页、标题栏与卡片操作区

**Files:**
- Create: test/mobile-ui-contract.test.js
- Modify: public/password.html:35-42
- Modify: public/css/fluffy.css:1175-1291
- Test: test/mobile-ui-contract.test.js

**Interfaces:**
- Consumes: password.html 的 #password-input、index.html 的 .floating-header/.header-actions/.logout-label、CardRender 生成的 .card-actions
- Produces: max-width: 680px 下的最终 CSS 属性；桌面基础规则保持不变

- [ ] **Step 1: 写入失败的移动端契约测试**

创建 test/mobile-ui-contract.test.js，完整内容如下：

~~~javascript
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'public/css/fluffy.css'), 'utf8');
const passwordHtml = fs.readFileSync(path.join(ROOT, 'public/password.html'), 'utf8');
const passwordJs = fs.readFileSync(path.join(ROOT, 'public/js/password-init.js'), 'utf8');

function extractMedia(source, query) {
  const marker = '@media (' + query + ')';
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, '缺少媒体查询：' + query);
  const openIndex = source.indexOf('{', markerIndex);
  let depth = 0;

  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(openIndex + 1, i);
    }
  }

  throw new Error('媒体查询未闭合：' + query);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
}

function getFinalProperty(source, selector, property) {
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  let finalValue;

  while ((match = rulePattern.exec(source))) {
    const selectors = match[1].split(',').map(function (item) { return item.trim(); });
    if (selectors.indexOf(selector) === -1) continue;

    const propertyPattern = new RegExp(
      '(?:^|;)\\s*' + escapeRegExp(property) + '\\s*:\\s*([^;]+)',
      'g'
    );
    let propertyMatch;
    while ((propertyMatch = propertyPattern.exec(match[2]))) {
      finalValue = propertyMatch[1].trim();
    }
  }

  return finalValue;
}

const mobileCss = extractMedia(css, 'max-width: 680px');

test('密码输入使用 autofocus 并保留 JS focus 后备', function () {
  const inputTag = passwordHtml.match(/<input\b(?=[^>]*\bid="password-input")[^>]*>/i);
  assert.ok(inputTag, '缺少 #password-input');
  assert.match(inputTag[0], /\bautofocus\b/i);
  assert.match(passwordJs, /passwordInput\.focus\(\)/);
});

test('手机密码页只显示居中的密码卡', function () {
  assert.equal(getFinalProperty(mobileCss, '.password-intro', 'display'), 'none');
  assert.equal(getFinalProperty(mobileCss, '.password-artboard', 'align-items'), 'center');
  assert.equal(getFinalProperty(mobileCss, '.password-artboard', 'padding'), '16px 0');
});

test('手机浮动标题栏保持单行紧凑布局', function () {
  assert.equal(getFinalProperty(mobileCss, '.floating-header', 'flex-direction'), 'row');
  assert.equal(getFinalProperty(mobileCss, '.floating-header', 'align-items'), 'center');
  assert.equal(getFinalProperty(mobileCss, '.floating-header .eyebrow', 'display'), 'none');
  assert.equal(getFinalProperty(mobileCss, '.floating-header h1', 'white-space'), 'nowrap');
  assert.equal(getFinalProperty(mobileCss, '.header-actions', 'width'), 'auto');
  assert.equal(getFinalProperty(mobileCss, '.header-actions', 'flex-wrap'), 'nowrap');
});

test('手机登出按钮显示真实文字', function () {
  assert.equal(getFinalProperty(mobileCss, '.logout-button .logout-label', 'display'), 'inline');
  assert.equal(getFinalProperty(mobileCss, '.logout-button::before', 'content'), 'none');
});

test('手机卡片操作按钮默认可见且为标签预留空间', function () {
  assert.equal(getFinalProperty(mobileCss, '.card-actions', 'opacity'), '1');
  assert.equal(getFinalProperty(mobileCss, '.card-actions', 'transform'), 'translateY(0)');
  assert.equal(getFinalProperty(mobileCss, '.card-actions', 'pointer-events'), 'auto');
  assert.equal(
    getFinalProperty(mobileCss, '.list-card .tag-row', 'max-width'),
    'calc(100% - 116px)'
  );
});
~~~

- [ ] **Step 2: 运行测试并确认按预期失败**

Run:

~~~powershell
node --test test/mobile-ui-contract.test.js
~~~

Expected: 退出码 1，五个测试均失败；失败值分别反映缺少 autofocus、介绍区未隐藏、标题栏为 column、登出文字为 none、操作区无手机覆盖。

- [ ] **Step 3: 给密码输入框增加标准自动聚焦**

将 public/password.html 的密码输入框改为：

~~~html
            <input
              type="password"
              id="password-input"
              name="password"
              required
              autofocus
              placeholder="请输入访问密码"
              autocomplete="off"
            >
~~~

- [ ] **Step 4: 增加手机密码页覆盖**

在 public/css/fluffy.css 的 max-width: 680px 媒体查询内，紧跟 .cream-canvas/.password-artboard 宽度规则后加入：

~~~css
  .password-artboard {
    min-height: 100dvh;
    align-items: center;
    padding: 16px 0;
  }

  .password-intro {
    display: none;
  }
~~~

- [ ] **Step 5: 替换手机标题栏、操作区和登出规则**

在同一媒体查询内，将原有 .floating-header/.list-toolbar/.modal-head、.header-actions 和登出相关规则整理为以下完整规则；.category-tabs、.wide-field、弹窗规则保持原位：

~~~css
  .list-toolbar,
  .modal-head {
    align-items: flex-start;
  }

  .list-toolbar {
    flex-direction: column;
  }

  .floating-header {
    align-items: center;
    flex-direction: row;
    gap: 8px;
    padding: 10px 12px;
  }

  .floating-header .eyebrow {
    display: none;
  }

  .floating-header h1 {
    font-size: 1.1rem;
    white-space: nowrap;
  }

  .list-card {
    min-height: 206px;
  }

  .header-actions {
    width: auto;
    flex-wrap: nowrap;
    flex-shrink: 0;
    gap: 6px;
    margin-left: auto;
  }

  .card-actions {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }

  .list-card .tag-row {
    max-width: calc(100% - 116px);
  }

  .logout-button {
    padding: 0 8px;
  }

  .logout-button .logout-label {
    display: inline;
  }

  .logout-button::before {
    content: none;
  }
~~~

- [ ] **Step 6: 运行移动端契约测试**

Run:

~~~powershell
node --test test/mobile-ui-contract.test.js
~~~

Expected: 移动端 5 个测试全部通过。

- [ ] **Step 7: 运行相关语法校验**

Run:

~~~powershell
node --check public/js/card-render.js
node --check public/js/password-init.js
node --check public/js/home.js
~~~

Expected: 三条命令均退出码 0 且无输出。

- [ ] **Step 8: 提交手机适配**

~~~powershell
git add -- test/mobile-ui-contract.test.js public/password.html public/css/fluffy.css
git commit -m "fix: 收紧手机布局并显示卡片操作"
~~~

---

### Task 2: 首屏置顶选择与过去时间文案

**Files:**
- Create: test/card-render.test.js
- Modify: public/js/card-render.js:97-170
- Test: test/card-render.test.js

**Interfaces:**
- Consumes: window.TimeCalc.resolveTargetDate(card) -> Date、window.TimeCalc.diff(now, target) -> {days,hours,minutes,seconds,isPast}
- Produces: CardRender.getHeroMoments(cards) -> Array<{card,isPinned}>；CardRender.formatMomentCountdown(card) -> {number,label}

- [ ] **Step 1: 写入失败回归测试**

创建 test/card-render.test.js，完整内容如下：

~~~javascript
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE_PATH = path.resolve(__dirname, '../public/js/card-render.js');
const SOURCE = fs.readFileSync(SOURCE_PATH, 'utf8');
const NOW = '2026-07-15T12:00:00.000Z';

function loadCardRender(nowIso) {
  const fixedNow = nowIso || NOW;

  class FixedDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [fixedNow]));
    }

    static now() {
      return new Date(fixedNow).getTime();
    }
  }

  const timeCalc = {
    shouldHideCard: function () { return false; },
    shouldShowDayCount: function () { return true; },
    resolveTargetDate: function (card) {
      return new FixedDate(card.target);
    },
    diff: function (now, target) {
      const diffMs = target - now;
      const absDiffMs = Math.abs(diffMs);
      return {
        days: Math.floor(absDiffMs / 86400000),
        hours: Math.floor((absDiffMs / 3600000) % 24),
        minutes: Math.floor((absDiffMs / 60000) % 60),
        seconds: Math.floor((absDiffMs / 1000) % 60),
        isPast: diffMs < 0
      };
    }
  };

  const context = {
    window: null,
    Date: FixedDate,
    console: console,
    setInterval: setInterval,
    clearInterval: clearInterval
  };
  context.window = context;
  context.TimeCalc = timeCalc;

  vm.runInNewContext(SOURCE, context, { filename: SOURCE_PATH });
  return context.CardRender;
}

test('过去的已过天数置顶项固定为首屏第一行', function () {
  const cardRender = loadCardRender();
  const moments = cardRender.getHeroMoments([
    { id: 'future', type: 'countdown', target: '2026-07-20T12:00:00.000Z' },
    { id: 'elapsed-pinned', type: 'elapsed', target: '2026-07-10T12:00:00.000Z', pinned: true }
  ]);

  assert.deepEqual(Array.from(moments, function (item) { return item.card.id; }), [
    'elapsed-pinned',
    'future'
  ]);
  assert.equal(moments[0].isPinned, true);
});

test('已到期倒计时置顶项固定为首屏第一行', function () {
  const cardRender = loadCardRender();
  const moments = cardRender.getHeroMoments([
    { id: 'expired-pinned', type: 'countdown', target: '2026-07-14T12:00:00.000Z', pinned: true },
    { id: 'future', type: 'countdown', target: '2026-07-16T12:00:00.000Z' }
  ]);

  assert.equal(moments[0].card.id, 'expired-pinned');
  assert.equal(moments[0].isPinned, true);
});

test('未来置顶项仍优先于日期更近的普通事件', function () {
  const cardRender = loadCardRender();
  const moments = cardRender.getHeroMoments([
    { id: 'near', type: 'countdown', target: '2026-07-16T12:00:00.000Z' },
    { id: 'pinned-later', type: 'countdown', target: '2026-08-01T12:00:00.000Z', pinned: true }
  ]);

  assert.deepEqual(Array.from(moments, function (item) { return item.card.id; }), [
    'pinned-later',
    'near'
  ]);
});

test('未置顶的过去事件仍不进入首屏候选', function () {
  const cardRender = loadCardRender();
  const moments = cardRender.getHeroMoments([
    { id: 'past', type: 'elapsed', target: '2026-07-10T12:00:00.000Z' },
    { id: 'future', type: 'countdown', target: '2026-07-16T12:00:00.000Z' }
  ]);

  assert.deepEqual(Array.from(moments, function (item) { return item.card.id; }), ['future']);
});

test('过去置顶项按天、小时、分钟和刚刚显示', function () {
  const cardRender = loadCardRender();
  const cases = [
    ['2026-07-13T12:00:00.000Z', '2', '天前'],
    ['2026-07-15T10:00:00.000Z', '2', '小时前'],
    ['2026-07-15T11:55:00.000Z', '5', '分钟前'],
    ['2026-07-15T11:59:30.000Z', '刚刚', '']
  ];

  cases.forEach(function (item) {
    const result = cardRender.formatMomentCountdown({
      id: 'past',
      type: 'countdown',
      target: item[0],
      pinned: true
    });
    assert.equal(result.number, item[1]);
    assert.equal(result.label, item[2]);
  });
});

test('未来文案保持天后语义', function () {
  const cardRender = loadCardRender();
  const result = cardRender.formatMomentCountdown({
    id: 'future',
    type: 'countdown',
    target: '2026-07-17T12:00:00.000Z'
  });

  assert.equal(result.number, '2');
  assert.equal(result.label, '天后');
});
~~~

- [ ] **Step 2: 运行测试并确认按预期失败**

Run:

~~~powershell
node --test test/card-render.test.js
~~~

Expected: 退出码 1；“过去的已过天数置顶项”“已到期倒计时置顶项”“过去置顶项按天、小时、分钟和刚刚显示”失败；其余三个保护性测试通过。

- [ ] **Step 3: 最小修改 getHeroMoments**

将 public/js/card-render.js 中 getHeroMoments 的注释和函数整体替换为：

~~~javascript
  /**
   * 选取 hero 右侧“重要时间”面板至多三行事件
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
~~~

- [ ] **Step 4: 最小修改 formatMomentCountdown**

将函数中的过去分支：

~~~javascript
    if (t.isPast) {
      return { number: '0', label: '天后' };
    }
~~~

替换为：

~~~javascript
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
~~~

- [ ] **Step 5: 运行测试和语法校验**

Run:

~~~powershell
node --test test/card-render.test.js
node --check public/js/card-render.js
~~~

Expected: 6 个测试全部通过；语法校验退出码 0 且无输出。

- [ ] **Step 6: 提交首屏修复**

~~~powershell
git add -- test/card-render.test.js public/js/card-render.js
git commit -m "fix: 让过去置顶项显示在首屏"
~~~

---

### Task 3: 浏览器矩阵与最终验证

**Files:**
- Verify: public/password.html
- Verify: public/index.html
- Verify: public/css/fluffy.css
- Verify: public/js/card-render.js
- Test: test/card-render.test.js
- Test: test/mobile-ui-contract.test.js

**Interfaces:**
- Consumes: Task 1 和 Task 2 的全部产物
- Produces: 可复核的自动化、语法、移动端视觉和桌面回归证据

- [ ] **Step 1: 运行完整自动化和静态校验**

Run:

~~~powershell
node --test test/card-render.test.js test/mobile-ui-contract.test.js
node --check public/js/card-render.js
node --check public/js/store.js
node --check public/js/password-init.js
node --check public/js/home.js
git diff --check HEAD~2
~~~

Expected: 11 个测试全部通过；四个语法校验无输出；git diff --check 无输出。

- [ ] **Step 2: 启动本地 Worker**

先按 wrangler skill 核对命令，再运行：

~~~powershell
wrangler dev --local --port 8787 --var PASSWORD:test --var SESSION_SECRET:test-session-secret
~~~

Expected: 本地服务监听 http://127.0.0.1:8787，无启动错误。保持进程运行供后续浏览器步骤使用。

- [ ] **Step 3: 验证手机密码页**

使用 in-app Browser 打开 http://127.0.0.1:8787/password.html，依次设置 390×844、420×844、680×900，并检查：

~~~javascript
({
  introDisplay: getComputedStyle(document.querySelector('.password-intro')).display,
  activeId: document.activeElement && document.activeElement.id,
  overflow: document.documentElement.scrollWidth > window.innerWidth,
  cardRect: document.querySelector('.password-card').getBoundingClientRect().toJSON()
})
~~~

Expected: 三个宽度下 introDisplay 为 none、activeId 为 password-input、overflow 为 false，密码卡完整位于视口内。桌面浏览器只能验证聚焦；真机系统是否弹出软键盘由浏览器策略决定。

- [ ] **Step 4: 登录并构造主页验证数据**

在密码页输入 test 并提交。进入主页后执行：

~~~javascript
document.getElementById('floating-header').classList.add('is-visible');
document.getElementById('revealed-list').classList.add('is-visible');
window.CardRender.renderFixed([
  {
    id: 'elapsed-demo',
    type: 'elapsed',
    calendar: 'solar',
    date: '2020-01-01',
    pinned: true,
    title: '已过天数置顶'
  },
  {
    id: 'future-demo',
    type: 'countdown',
    calendar: 'solar',
    date: '2099-01-01',
    title: '未来倒计时'
  }
]);
window.CardRender.renderList([
  {
    id: 'elapsed-demo',
    type: 'elapsed',
    calendar: 'solar',
    date: '2020-01-01',
    pinned: true,
    title: '已过天数置顶'
  }
], {
  onPin: function () {},
  onEdit: function () {},
  onDelete: function () {}
});
~~~

Expected: #hero-moments 第一行 data-id 为 elapsed-demo，带 pinned 类并显示正数“天前”；列表卡生成置顶、编辑、删除三个按钮。

- [ ] **Step 5: 验证手机主页矩阵**

依次设置 390×844、420×844、680×900，滚动到列表区域，并检查：

~~~javascript
({
  headerDirection: getComputedStyle(document.getElementById('floating-header')).flexDirection,
  headerHeight: document.getElementById('floating-header').getBoundingClientRect().height,
  logoutText: document.querySelector('.logout-label').textContent.trim(),
  logoutDisplay: getComputedStyle(document.querySelector('.logout-label')).display,
  actionOpacity: getComputedStyle(document.querySelector('.card-actions')).opacity,
  actionPointerEvents: getComputedStyle(document.querySelector('.card-actions')).pointerEvents,
  actionCount: document.querySelectorAll('.card-actions .icon-action').length,
  overflow: document.documentElement.scrollWidth > window.innerWidth
})
~~~

Expected: headerDirection 为 row；headerHeight 不超过 64px；logoutText 为“登出”且 logoutDisplay 不是 none；actionOpacity 为 1；actionPointerEvents 为 auto；actionCount 为 3；overflow 为 false。

- [ ] **Step 6: 验证 1240px 桌面端未变化**

将主页和密码页宽度设为 1240px，并检查：

- 密码页 .password-intro 可见，仍为双区布局。
- 浮动标题栏英文 eyebrow 可见，标题和操作区保持桌面基础样式。
- 未 hover/focus 时 .card-actions 的 opacity 为 0、pointer-events 为 none；hover 卡片后 opacity 为 1。
- 页面无横向溢出。

- [ ] **Step 7: 最终仓库状态与需求核对**

Run:

~~~powershell
git status --short
git log -4 --oneline
~~~

Expected: 工作树为空；最近提交包含设计文档、实施计划、手机适配和首屏修复。若浏览器验证发现问题，返回对应 Task，先补失败测试再修改，不做未覆盖的临时补丁。

---

## Self-Review 记录

- **Spec coverage:** Task 1 覆盖密码卡、自动聚焦、手机单行标题栏、真实登出文字、默认操作按钮以及桌面隔离；Task 2 覆盖过去/未来置顶选择、未置顶过去项过滤和方向文案；Task 3 覆盖浏览器矩阵和最终验证。
- **Placeholder scan:** 计划没有占位标记或含糊的后续实现描述；每个代码修改均给出完整片段和精确命令。
- **Type consistency:** getHeroMoments 与 formatMomentCountdown 的输入输出沿用现有 CardRender 导出；测试桩的 TimeCalc.diff 返回字段与生产接口一致；CSS 契约选择器与现有 HTML/CardRender DOM 一致。
