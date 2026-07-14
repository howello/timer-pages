---
change: home-hero-timeline
design-doc: docs/superpowers/specs/2026-07-14-home-hero-timeline-design.md
base-ref: 2b707d9efb14a956a15dfa2993c948aeac832140
---

# 首页首屏「现在 + 重要时间」双面板 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把首页 hero 区从「品牌大标题 + 单圆盘倒计时」重构为左侧「现在」走动时钟面板 + 右侧「重要时间」三行只读时间轴，沿用 Fluffy 毛玻璃风格。

**Architecture:** 纯静态前端改动（Cloudflare Workers/D1 后端不动）。HTML 重写 `.hero-stage` 内部为两个 `.fluffy-surface`；CSS 新增双面板与三行卡片样式并清理无引用旧规则；`card-render.js` 新增 `getHeroMoments`/`renderHeroTimeline`/`refreshHeroMoments`/`formatMomentCountdown`，`renderFixed` 改为调用新渲染，退役 `renderSpotlight`；`home.js` 的 `updateCurrentTime` 适配分层时钟锚点 `#now-clock-hm`/`#now-clock-sec`。

**Tech Stack:** 原生 JS（IIFE + `'use strict'`，挂 `window` 命名空间，无模块系统/无构建）、lunar-javascript@1.6.12（农历换算）、Cloudflare Workers Static Assets 托管 `public/`。

## Global Constraints

- **不改 `time-calc.js` 公共函数签名**：复用 `TimeCalc.formatClockParts`/`diff`/`resolveTargetDate`/`formatLunarLabel`，不新增/改其导出函数签名。时钟分层在 `home.js` 局部 `split(':')` 完成。
- **编码风格**：前端全部 IIFE + `'use strict'`，挂 `window`；中文注释 + JSDoc；命名与既有模块一致。
- **无测试框架**：仓库无 lint/test 脚本。每个任务的"测试周期"= `node --check <file>` 语法校验 + `wrangler dev` 浏览器手动验证（spec 第 11 节）。**不要**引入 jest/vitest 或新建测试目录。
- **写操作防抖**：首屏不产生写操作、不触发 `runExclusive`、不改置顶/排序状态。弹窗一律用 `UIAlert`（本计划不涉及弹窗）。
- **单一置顶约束**：`EventStore.normalizeSinglePinned` 保证全局最多一个 `pinned:true`，本计划只读不改。
- **样式约定**：所有新增 CSS 进 `public/css/fluffy.css`；用 `:root` 变量（`--cream`/`--paper`/`--ink`/`--muted`/`--coral`/`--butter`/`--mint`/`--sky`/`--plum`/`--radius`/`--shadow-small`/`--inner`）；不引暗色模式、不引构建步骤、不引循环位移动画（首屏信息本身不用循环动画）。
- **删除而非隐藏**：旧节点（`.time-instrument`/`.dial-*`/`#spotlight-*`/`.hero-copy`/`#hero-title`/`.hero-lede`/`.hero-metrics`/`.fixed-card-stage`/`.feature-card`）在 HTML 与 CSS 中**删除**，不是 `display:none`。删 CSS 前先 Grep 确认无引用。
- **base-ref**：从 `2b707d9`（当前 master HEAD）起步，不新建分支除非执行阶段另选 worktree。

## File Structure

| 文件 | 职责 | 本计划动作 |
|------|------|-----------|
| `public/index.html` | 静态骨架 | 重写 `.hero-stage` 内部；移除旧节点与注释行 |
| `public/css/fluffy.css` | 全部样式 | 新增双面板/三行卡片样式 + 响应式断点；清理无引用旧规则与动画 |
| `public/js/card-render.js` | 数据→DOM 渲染 | 新增 4 个 hero 渲染函数 + 2 个内联辅助；`renderFixed` 改写；`refreshRunningTimes` 适配；退役 `renderSpotlight`；更新导出 |
| `public/js/home.js` | 主页装配 | `updateCurrentTime` 分层时钟；滚动揭示阈值复核；移除旧节点引用 |
| `public/js/time-calc.js` | 时间纯函数 | **不改**（只复用） |

设计原图（class 命名/配色/尺寸直接参考）：`.superpowers/brainstorm/codex-20260714-1/content/hero-visual-design.html`（含桌面 + 移动两套变体）。

---

### Task 1: HTML 骨架替换

**Files:**
- Modify: `public/index.html:28-57`（整个 `<section class="hero-stage">` 内容）
- Remove: `public/index.html:59`（注释掉的 `.fixed-card-stage` 行）

**Interfaces:**
- Produces: 新 DOM 锚点 `#now-clock-hm`（时分主号）、`#now-clock-sec`（秒次号）、`#now-date`（含 `.nd-year`/`.nd-md` 子 span）、`#now-weekday`、`#now-lunar`、`#hero-moments`（三行容器）、`#now-title`/`#timeline-title`（a11y 标题）。供 Task 7、Task 8 填充。

- [x] **Step 1: 替换 `.hero-stage` 整段**

把 `public/index.html` 第 28–57 行（从 `<section class="hero-stage" aria-labelledby="hero-title">` 到其闭合 `</section>`）整体替换为：

```html
    <section class="hero-stage">
      <section class="fluffy-surface now-surface" aria-labelledby="now-title">
        <div class="now-top">
          <div class="rainbow-rail" aria-hidden="true"></div>
          <h2 class="section-kicker" id="now-title">NOW · 现在</h2>
          <div class="clock-line">
            <span class="clock-hm" id="now-clock-hm">--:--</span>
            <span class="clock-sec" id="now-clock-sec">:--</span>
          </div>
        </div>
        <div class="date-group">
          <span class="solar-date">
            <span id="now-date"><span class="nd-year">----</span><span class="nd-md">--月--日</span></span>
            <span id="now-weekday" class="now-weekday"></span>
          </span>
          <span class="lunar-date" id="now-lunar"></span>
        </div>
      </section>

      <section class="fluffy-surface timeline-surface" aria-labelledby="timeline-title">
        <div class="timeline-head">
          <div>
            <span class="section-kicker">IMPORTANT MOMENTS</span>
            <h2 class="timeline-title" id="timeline-title">重要时间</h2>
          </div>
          <span class="timeline-hint">置顶 + 最近两项</span>
        </div>
        <div class="moment-list" id="hero-moments"></div>
      </section>
    </section>
```

说明：
- 外层 `.hero-stage` 移除 `aria-labelledby="hero-title"`（`#hero-title` 已删；内层两个 `<section>` 各自 `aria-labelledby` 自带标签）。
- `.now-top` 包裹彩虹条/kicker/时钟，`.date-group` 在下方，复刻视觉稿桌面端结构。
- `#now-date` 内部拆 `.nd-year`/`.nd-md` 两个子 span，供移动端 CSS 隐藏年份。
- `#hero-moments` = `.moment-list` 容器，由 `renderHeroTimeline` 填充。

- [x] **Step 2: 删除注释掉的 `.fixed-card-stage` 行**

删除 `public/index.html` 中这一整行（第 59 行，含前导注释符）：

```html
<!--    <section class="fixed-card-stage" id="fixed-card-stage" aria-label="置顶倒计时"></section>-->
```

- [x] **Step 3: 验证 HTML 结构**

启动本地服务并打开浏览器（后续 Task 会重复此命令）：

Run: `npx wrangler dev`
Expected: 服务在 `http://localhost:8787`（或提示端口）启动，无报错。

浏览器打开首页，打开 DevTools → Elements，确认：
- `.hero-stage` 下只有 `.now-surface` 与 `.timeline-surface` 两个 `.fluffy-surface`。
- 不存在 `#hero-title`、`.hero-lede`、`.hero-metrics`、`.now-panel`(旧)、`.time-instrument`、`.dial-*`、`#spotlight-*`、`.fixed-card-stage`、`.feature-card`。
- `#hero-moments` 当前为空（Task 6 才填充）。

- [x] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat: 首屏双面板 HTML 骨架（现在 + 重要时间）"
```

---

### Task 2: CSS 双面板与三行卡片样式（桌面基线）

**Files:**
- Modify: `public/css/fluffy.css`（在旧 `.hero-stage` 规则区域附近追加新规则；Task 4 会删旧规则）

**Interfaces:**
- Produces: `.hero-stage`(改写为双列 grid)、`.now-surface`/`.timeline-surface`、`.rainbow-rail`、`.section-kicker`、`.clock-line`/`.clock-hm`/`.clock-sec`、`.date-group`/`.solar-date`/`.lunar-date`/`.nd-year`/`.nd-md`/`.now-weekday`、`.timeline-head`/`.timeline-title`/`.timeline-hint`、`.moment-list`/`.moment-row`(含 `.pinned`)/`.days-box`/`.days-number`/`.days-label`/`.moment-copy`/`.moment-name`/`.moment-date`/`.md-year`/`.md-md`/`.md-week`/`.md-lunar`/`.md-pin`/`.type-mark`/`.pin-chip`/`.timeline-empty` 的桌面基线样式。

- [x] **Step 1: 改写 `.hero-stage` 为双列 grid**

在 `public/css/fluffy.css` 中，找到现有 `.hero-stage { ... }` 规则（约第 172–179 行），将其整块替换为：

```css
.hero-stage {
  display: grid;
  grid-template-columns: minmax(0, 0.78fr) minmax(0, 1.22fr);
  align-items: stretch;
  gap: 20px;
  padding: 54px 8px 24px;
}
```

说明：去掉旧的 `min-height:520px` 与 `align-items:center`；`0.78/1.22` 对齐视觉稿 39/61。响应式断点在 Task 3 处理。

- [x] **Step 2: 新增双面板外壳与「现在」面板样式**

在 `.hero-stage` 规则之后追加：

```css
/* —— 首屏双面板 —— */
.fluffy-surface {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.76);
  border-radius: var(--radius);
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.26)),
    var(--paper);
  box-shadow: var(--shadow);
}

.fluffy-surface::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(118deg, transparent 20%, rgba(255, 255, 255, 0.32) 42%, transparent 62%);
  transform: translateX(-62%);
}

.now-surface {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 18px;
  padding: 28px;
}

.rainbow-rail {
  width: 82px;
  height: 6px;
  border-radius: 8px;
  background: linear-gradient(90deg, var(--coral), var(--butter), var(--mint), var(--sky), var(--plum));
  box-shadow: var(--shadow-small);
}

.section-kicker {
  display: block;
  margin-top: 18px;
  color: #916a35;
  font-size: 0.67rem;
  font-weight: 500;
  letter-spacing: 0.09em;
}

.clock-line {
  display: flex;
  align-items: baseline;
  margin-top: 10px;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.055em;
}

.clock-hm {
  font-size: 3.55rem;
  font-weight: 500;
  line-height: 0.96;
}

.clock-sec {
  margin-left: 5px;
  color: #916a35;
  font-size: 1.15rem;
  font-weight: 500;
}

.date-group {
  display: grid;
  gap: 4px;
  margin-top: 4px;
}

.solar-date {
  font-size: 0.86rem;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.now-weekday {
  color: var(--muted);
}

.lunar-date {
  color: var(--muted);
  font-size: 0.7rem;
  min-height: 1em;
}
```

说明：`.fluffy-surface` 在本仓库原来没有统一基类（原 `.glass-fluff` 用于 header/list），此处新增给 hero 两个面板；不破坏已有 `.glass-fluff`。`::after` 是低强度玻璃高光，非循环动画。

- [x] **Step 3: 新增「重要时间」面板与三行卡片样式**

紧接 Step 2 之后追加：

```css
.timeline-surface {
  padding: 26px;
}

.timeline-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.timeline-head .section-kicker {
  margin-top: 0;
}

.timeline-title {
  margin: 4px 0 0;
  font-size: 1.22rem;
  font-weight: 500;
}

.timeline-hint {
  color: var(--muted);
  font-size: 0.64rem;
}

.moment-list {
  display: grid;
  gap: 8px;
}

.moment-row {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 70px;
  padding: 10px 12px;
  border: 1px solid rgba(121, 103, 72, 0.12);
  border-radius: var(--radius);
  background: rgba(255, 255, 255, 0.34);
  box-shadow: var(--inner);
}

.moment-row.pinned {
  border-color: rgba(232, 118, 112, 0.24);
  background:
    linear-gradient(100deg, rgba(232, 118, 112, 0.12), rgba(239, 200, 91, 0.08)),
    rgba(255, 255, 255, 0.34);
}

.days-box {
  display: grid;
  justify-items: center;
  line-height: 1;
}

.days-number {
  font-size: 1.34rem;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.days-label {
  margin-top: 4px;
  color: var(--muted);
  font-size: 0.57rem;
}

.days-label:empty {
  display: none;
}

.moment-copy {
  min-width: 0;
}

.moment-name {
  overflow: hidden;
  font-size: 0.84rem;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.moment-date {
  margin-top: 4px;
  color: var(--muted);
  font-size: 0.64rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.md-year,
.md-md,
.md-week,
.md-lunar,
.md-pin {
  display: inline;
}

.type-mark {
  width: 8px;
  height: 34px;
  border-radius: 8px;
  background: var(--mint);
}

.moment-row.pinned .type-mark {
  background: linear-gradient(180deg, var(--coral), var(--butter));
}

.pin-chip {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  margin-left: 5px;
  padding: 2px 5px;
  border-radius: 999px;
  color: #7b4c2d;
  background: rgba(239, 200, 91, 0.22);
  font-size: 0.55rem;
  vertical-align: 1px;
}

.md-pin {
  display: none; /* 桌面默认隐藏，移动端 ≤680 置顶行显示 */
}

.timeline-empty {
  margin: 8px 0;
  color: var(--muted);
  font-size: 0.8rem;
  text-align: center;
}
```

说明：
- `.moment-row` 三列 grid：天数盒 / 名称+日期 / 色条。
- `.days-label:empty{display:none}` 让「即将」态（label 为空）不占二行。
- `.md-pin` 桌面默认 `display:none`，移动端置顶行由 Task 3 媒体查询显示。
- `.type-mark` 非置顶默认 `--mint`；JS 会按 type 内联覆盖为 `--mint/--sky/--plum`；置顶行由 `.pinned .type-mark` 渐变覆盖（CSS 类优先级高于内联 `style` 需注意——Task 6 Step 3 对置顶行不设内联背景，故不冲突）。

- [x] **Step 4: 验证桌面样式渲染**

Run: `npx wrangler dev`（如已运行可跳过）
浏览器打开首页。当前 `#hero-moments` 仍空（Task 6 才填），但应能看到：
- 左右两个毛玻璃面板并列，左侧约 39%、右侧约 61% 宽。
- 左侧彩虹条、`NOW · 现在` kicker、`--:--` 时分 + `:--` 秒占位、`----`/`--月--日` 日期占位。
- 右侧 `IMPORTANT MOMENTS` kicker + `重要时间` 标题 + `置顶 + 最近两项` hint，下方空白。
- 无水平溢出、无旧圆盘/标题残留。

- [x] **Step 5: Commit**

```bash
git add public/css/fluffy.css
git commit -m "style: 首屏双面板与三行时间轴桌面样式"
```

---

### Task 3: CSS 响应式断点

**Files:**
- Modify: `public/css/fluffy.css`（媒体查询区域，约第 1228 行起）

**Interfaces:**
- Produces: `>980/≤980/≤680/≤420` 四档断点的新规则，覆盖 hero 双面板。

- [x] **Step 1: 改写 `≤980px` 断点中的 hero 规则**

找到 `@media (max-width: 980px) { ... }`（约第 1228–1246 行）。把其中与 hero 相关的旧规则（`.hero-copy h1`、`.time-instrument`）整块删除，并在该媒体查询块内新增：

```css
  .hero-stage {
    grid-template-columns: 1fr;
  }
```

（保留该断点里原有的 `.sortable-list` 双列规则与 `.password-artboard` 规则不动。）

说明：≤980 两面板上下堆叠，「现在」在上、「重要时间」在下。

- [x] **Step 2: 改写 `≤680px` 断点中的 hero 规则**

找到 `@media (max-width: 680px) { ... }`（约第 1248–1340 行）。删除其中与 hero 旧节点相关的规则：`.hero-stage`(旧 min-height/padding)、`.hero-copy h1`、`.hero-lede`、`.time-instrument`、`.fixed-card-stage`、`.feature-card`、`.feature-card h2`。在该媒体查询块内新增：

```css
  .hero-stage {
    padding: 34px 0 20px;
    gap: 12px;
  }

  .now-surface {
    padding: 20px;
  }

  .clock-hm {
    font-size: 2.72rem;
  }

  .nd-year {
    display: none; /* 移动端公历日期省略年份 */
  }

  .timeline-surface {
    padding: 18px;
  }

  .moment-row {
    grid-template-columns: 45px minmax(0, 1fr) auto;
    gap: 9px;
    min-height: 62px;
    padding: 9px;
  }

  .timeline-hint {
    display: none; /* 移动端去掉 hint */
  }

  .pin-chip {
    display: none; /* 移动端置顶不显独立 chip */
  }

  .moment-row.pinned .md-pin {
    display: inline; /* 移动端置顶：日期尾部追加「· 置顶」 */
  }

  .moment-row.pinned .md-week {
    display: none; /* 移动端置顶行不显星期，由「· 置顶」替代 */
  }
```

说明：非置顶行移动端仍显星期（`.md-week` 默认 inline，仅 `.pinned .md-week` 隐藏）；置顶行移动端显 `.md-pin`、隐 `.pin-chip`。

- [x] **Step 3: 改写 `≤420px` 断点中的 hero 规则**

找到 `@media (max-width: 420px) { ... }`（约第 1342–1368 行）。删除其中旧 hero 规则（`.hero-copy h1`、`.hero-metrics`、`.now-panel`、`.now-clock`）。在该媒体查询块内新增：

```css
  .clock-hm {
    font-size: 2.35rem;
  }

  .clock-sec {
    font-size: 0.96rem;
  }

  .now-surface,
  .timeline-surface {
    padding: 16px;
  }

  .moment-row {
    grid-template-columns: 40px minmax(0, 1fr) auto;
    gap: 8px;
    min-height: 56px;
    padding: 8px;
  }

  .days-number {
    font-size: 1.12rem;
  }

  .moment-name,
  .moment-date {
    font-size: 0.76rem;
  }
```

说明：超窄屏进一步缩号，但天数、事件名称、置顶状态保持可见（无 `display:none`）。

- [x] **Step 4: 验证四档断点布局**

Run: `npx wrangler dev`
浏览器打开 DevTools → Toggle device toolbar，依次验证宽度 1240 / 980 / 680 / 420 / 320 px：
- 1240：左右双栏。
- 980：上下单栏，先现在后重要时间。
- 680：单栏，时钟缩号、padding 收窄、`timeline-hint` 消失。
- 420/320：进一步缩号，无水平溢出、无文本裁切。

（`#hero-moments` 仍空，仅看面板外壳布局。）

- [x] **Step 5: Commit**

```bash
git add public/css/fluffy.css
git commit -m "style: 首屏双面板响应式断点（980/680/420）"
```

---

### Task 4: CSS 清理无引用旧规则与动画

**Files:**
- Modify: `public/css/fluffy.css`（删除确认无引用的旧规则与 keyframes）

**Interfaces:**
- Consumes: Task 1（HTML 已移除旧节点）+ Task 2/3（新规则已就位）。
- Produces: 精简后的 `fluffy.css`，无 `.hero-copy`/`.dial-*`/`.spotlight-*`/`.time-instrument`/`.feature-card`/`.fixed-card-stage`/`titleGlow`/`instrumentFloat`/`rainbowFlow` 等死规则。

- [x] **Step 1: Grep 确认每条待删规则无引用**

在仓库根运行（用 Grep 工具，`output_mode: content`）确认下列 class/keyframe 在 `public/index.html` 与 `public/js/*.js` 中**除 CSS 自身定义外**无引用：

- `.hero-copy`、`.hero-lede`、`.hero-metrics`、`.hero-title`
- `.now-panel`、`.now-head`、`.now-label`、`.now-date`(旧 wrapper)、`.now-clock`、`.now-lunar`
- `.time-instrument`、`.dial-lines`、`.dial-face`、`.spotlight-count`、`.spotlight-date`、`.spotlight-tags`、`.spotlight-note`、`.spotlight-title`、`.spotlight-days`、`.spotlight-unit`
- `.fixed-card-stage`、`.feature-card`
- `@keyframes titleGlow`、`@keyframes instrumentFloat`、`@keyframes rainbowFlow`

Expected: 上述每个 class 在 `public/index.html` 与 `public/js/*.js` 中 0 命中（CSS 文件内的命中不算）。若某 class 在 JS/HTML 仍有命中，**不删**该条，在 commit 信息中注明保留原因。

> 注意：Task 1 的新 HTML 使用了 `.now-weekday`、`.solar-date`、`.lunar-date`、`.date-group` 等与新 `.now-surface` 体系同名的 class，这些是**新规则**（Task 2 已加），不要误删。只删上面列出的**旧** class。

- [x] **Step 2: 删除旧 hero/spotlight/dial 规则块**

在 `public/css/fluffy.css` 中删除以下整块规则（约第 181–386 行区间，按实际行号定位，逐块删）：

- `.hero-copy { ... }` 与 `.hero-copy::before { ... }`
- `@keyframes rainbowFlow { ... }`
- `.hero-copy h1 { ... }`
- `.hero-lede { ... }`
- `.hero-metrics { ... }`
- `.now-panel { ... }`
- `.now-head { ... }`
- `.now-label { ... }`
- `.now-date { ... }`（旧 wrapper 规则；Task 2 新增的 `.solar-date`/`.nd-*` 不动）
- `.now-weekday { ... }`（旧规则；Task 2 已新增同名 `.now-weekday`——若旧规则与新规则重名，删除旧的即可，新规则在 Task 2 已定义）
- `.now-clock { ... }`
- `.now-lunar { ... }`
- `.time-instrument { ... }`
- `.dial-lines { ... }`
- `.dial-face { ... }` 及 `.dial-face span`、`.dial-face h2`、`.dial-face p`
- `.spotlight-count { ... }` 及 `.spotlight-count strong`、`.spotlight-count strong.text-mode`、`.spotlight-count span`
- `.spotlight-date { ... }`
- `.spotlight-tags { ... }`
- `.spotlight-note { ... }`
- `.fixed-card-stage { ... }`
- `.feature-card { ... }` 及 `.feature-card::before`/`::after`/`h2`/`p`/`.coral`/`.rose`/`.mint`/`.sky` 与 `.feature-card:hover`
- `@keyframes titleGlow { ... }`
- `@keyframes instrumentFloat { ... }`

> 实操建议：用 Edit 工具按每个 selector 精确定位删除，不要一次性大段替换，避免误伤。`fluffSheen` keyframe 被 `.feature-card::before`、`.add-event-modal::before`、`.password-card::before` 共用——删 `.feature-card::before` 后 `fluffSheen` 仍被 modal/password 用，**保留 `fluffSheen`**。

- [x] **Step 3: 删除响应式断点中残留的旧 hero 规则**

检查 `@media` 断点内是否还有 Step 1 列出的旧 class 残留（Task 3 已改写部分，但可能漏删）。逐个删除 `≤980/≤680/≤420` 媒体查询里残留的 `.hero-copy h1`、`.hero-lede`、`.hero-metrics`、`.time-instrument`、`.fixed-card-stage`、`.feature-card`、`.now-panel`、`.now-clock` 等行。

- [x] **Step 4: 语法/视觉回归验证**

Run: `npx wrangler dev`
浏览器打开首页桌面 + 680 + 420 三档：
- 页面无样式塌陷（列表卡片、header、modal 样式不受影响）。
- hero 双面板样式正常（Task 2/3 的效果保持）。
- DevTools Console 无 404、无 `Uncaught`。

- [x] **Step 5: Commit**

```bash
git add public/css/fluffy.css
git commit -m "chore: 清理首屏旧圆盘/标题/spotlight 无引用 CSS 与动画"
```

---

### Task 5: card-render.js 数据层（getHeroMoments + formatMomentCountdown + 日期/色条辅助）

**Files:**
- Modify: `public/js/card-render.js`（在 IIFE 内、`createCard` 之前合适位置新增函数；更新导出）

**Interfaces:**
- Consumes: `window.TimeCalc.resolveTargetDate(card)`、`window.TimeCalc.diff(now, target)` → `{days, hours, minutes, seconds, isPast}`、`window.TimeCalc.formatLunarLabel(date)`；本模块已有 `getRenderableCards(cards)`、`COLOR_MAP`。
- Produces:
  - `getHeroMoments(cards)` → `Array<{card:Object, isPinned:boolean}>`（至多 3 行）
  - `formatMomentCountdown(card)` → `{number:string, label:string}`
  - `formatMomentDateParts(card, target)` → `{year:string, md:string, week:string, lunar:string}`（模块内私有，供 Task 6 用）
  - `HERO_MARK_MAP`（模块内私有）、`WEEKDAY_LABELS`（模块内私有，用于日期星期）

- [x] **Step 1: 新增模块级常量**

在 `public/js/card-render.js` 顶部现有 `var COLOR_MAP = { ... };` 之后追加：

```js
  // hero 时间轴色条映射（非置顶行用 mint/sky/plum，置顶行走 coral→butter 渐变）
  var HERO_MARK_MAP = {
    festival: 'mint',
    countdown: 'sky',
    recurring: 'plum',
    elapsed: 'plum'
  };

  // 星期中文（用于 hero 行目标日期显示）
  var WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
```

- [x] **Step 2: 新增 `getHeroMoments(cards)`**

在 `getPinnedCard` 函数之后追加：

```js
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
```

说明：
- `getRenderableCards` 先过滤掉 `shouldHideCard` 的过期 festival，满足"节假日过期不进面板"。
- `t.isPast` 判定已过；今天内未到（`diff.days===0` 且 target>now）`isPast=false`，仍进面板，由 `formatMomentCountdown` 转小时倒计时。
- 置顶已过 → 被 `isPast` 过滤 → `pinnedEntry` 为 null → 回退为最近三个未到。

- [x] **Step 3: 新增 `formatMomentCountdown(card)`**

紧接 `getHeroMoments` 之后追加：

```js
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
```

- [x] **Step 4: 新增 `formatMomentDateParts(card, target)`**

紧接 `formatMomentCountdown` 之后追加：

```js
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
```

说明：`formatLunarLabel` 内部已 catch 异常返回 `''`，外层再 try-catch 双保险；失败时显示占位"农历日期"，时钟与公历照常。

- [x] **Step 5: 语法校验**

Run: `node --check public/js/card-render.js`
Expected: 无输出（退出码 0），表示语法通过。

- [x] **Step 6: Commit**

```bash
git add public/js/card-render.js
git commit -m "feat: hero 面板数据层（getHeroMoments/formatMomentCountdown/formatMomentDateParts）"
```

---

### Task 6: card-render.js renderHeroTimeline + buildMomentRow

**Files:**
- Modify: `public/js/card-render.js`（新增 DOM 构建函数；暂不接线到 `renderFixed`，Task 7 接线）

**Interfaces:**
- Consumes: Task 5 的 `getHeroMoments`、`formatMomentCountdown`、`formatMomentDateParts`、`HERO_MARK_MAP`。
- Produces:
  - `renderHeroTimeline(cards)` — 构建右侧三行 DOM 并挂到 `#hero-moments`
  - `buildMomentRow(card, isPinned)` → `HTMLElement`（模块内私有）

- [x] **Step 1: 新增 `buildMomentRow(card, isPinned)`**

在 `public/js/card-render.js` 的 `formatMomentDateParts` 之后追加：

```js
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
```

说明：
- 行只读：不挂任何 click/drag 监听，无按钮，`draggable` 不设。
- 名称超长由 CSS `text-overflow:ellipsis` 截断，`title` 放全名。
- 置顶行不设内联 `style.background`，让 CSS `.pinned .type-mark` 渐变生效（避免内联优先级冲突）。
- 农历行只渲染 `.md-lunar`，不渲染 year/md/week；置顶农历行尾部追加 `.md-pin`（移动端显「· 置顶」）。

- [x] **Step 2: 新增 `renderHeroTimeline(cards)`**

紧接 `buildMomentRow` 之后追加：

```js
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
```

- [x] **Step 3: 临时接线以便验证（Task 7 会正式接线）**

为在浏览器里看到效果，临时在 `renderFixed` 函数体最前面加一行调用（Task 7 会重写整个 `renderFixed`，此处临时接线不冲突）：

找到 `function renderFixed(cards) {`（约第 244 行），在其函数体第一行（`var spotlight = getPinnedCard(cards);` 之前）插入：

```js
    renderHeroTimeline(cards);
```

- [x] **Step 4: 语法校验**

Run: `node --check public/js/card-render.js`
Expected: 无输出（退出码 0）。

- [x] **Step 5: 浏览器验证三行渲染**

Run: `npx wrangler dev`
浏览器打开首页。根据当前数据状态观察右侧 `#hero-moments`：
- 有置顶且未到：第一行带珊瑚渐变色条 + 「置顶」chip + `pinned` 底纹；后两行按 type 取 mint/sky/plum 色条。
- 无置顶：三行均为最近未到事件，无 chip。
- 置顶已到：回退为最近三个未到事件（置顶项不在第一行）。
- 不足三行：按实际数量渲染，无空行。
- 完全无事件：显示「还没有重要日子」。
- 当天到达事件：显示「N 小时后」/「N 分钟后」/「即将」而非「0 天后」。
- 公历行日期形如「2026年8月19日 · 星期三」；农历行形如「农历七月初七」。
- 名称过长单行省略，悬停显示全名。
- 点击/悬停行无任何操作按钮、不触发编辑/删除/拖拽/置顶。

若数据状态不易复现，可在 DevTools Console 临时构造：
```js
// 临时注入测试数据（验证后刷新页面恢复）
EventStore.load = async () => {}; // 屏蔽网络
window.CardRender.renderFixed([{id:'t1',type:'countdown',calendar:'solar',date:'2026-11-19',pinned:true,title:'结婚纪念日'},{id:'t2',type:'countdown',calendar:'solar',date:'2026-07-26',title:'旅行出发'},{id:'t3',type:'recurring',calendar:'lunar',lunarMonth:7,lunarDay:7,title:'七夕'}]);
```

- [x] **Step 6: Commit**

```bash
git add public/js/card-render.js
git commit -m "feat: hero 右侧三行时间轴 DOM 渲染（renderHeroTimeline/buildMomentRow）"
```

---

### Task 7: card-render.js refreshHeroMoments + renderFixed 重写 + refreshRunningTimes 适配 + 退役 renderSpotlight

**Files:**
- Modify: `public/js/card-render.js`（新增 `refreshHeroMoments`；重写 `renderFixed`；改 `refreshRunningTimes`；删 `renderSpotlight`；更新 `window.CardRender` 导出）

**Interfaces:**
- Consumes: Task 5 的 `getHeroMoments`/`formatMomentCountdown`；Task 6 的 `renderHeroTimeline`。
- Produces:
  - `refreshHeroMoments(cards)` — 每秒只更新行内文本，集合变化时全量重建
  - `renderFixed(cards)` — 重写为薄包装调用 `renderHeroTimeline`
  - `refreshRunningTimes(cards)` — 改为先 `refreshHeroMoments` 再刷列表卡片
  - 导出表：移除 `renderSpotlight`，新增 `getHeroMoments`/`renderHeroTimeline`/`refreshHeroMoments`/`formatMomentCountdown`

- [x] **Step 1: 新增 `refreshHeroMoments(cards)`**

在 `public/js/card-render.js` 的 `renderHeroTimeline` 之后追加：

```js
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
```

说明：`festival:xxx` 这类 id 含 `:`，在属性选择器 `[data-id="festival:xxx"]` 中 `:` 不需转义（仅在无引号时才需），双引号包裹安全。

- [x] **Step 2: 重写 `renderFixed(cards)`**

找到现有 `function renderFixed(cards) { ... }`（约第 244–291 行，含旧的 `getPinnedCard`/`renderSpotlight` 调用与 `.fixed-card-stage` DOM 构建），将其整个函数体替换为：

```js
  /**
   * 渲染固定卡片区（首屏 hero 右侧时间轴）
   * @param {Array} cards - 全部卡片（已排序）
   */
  function renderFixed(cards) {
    renderHeroTimeline(cards);
  }
```

说明：删除旧的 spotlight 调用与 `.feature-card` DOM 构建逻辑（Task 4 已删对应 CSS）。`renderFixed` 名字保留，因 `home.js` 仍调用此名。

- [x] **Step 3: 改写 `refreshRunningTimes(cards)`**

找到 `function refreshRunningTimes(cards) { ... }`（约第 314–334 行）。把第一行 `renderSpotlight(getPinnedCard(cards));` 替换为 `refreshHeroMoments(cards);`。完整函数应为：

```js
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
```

说明：列表卡片的 `.running-time` 更新逻辑不变，只把 hero 部分从 `renderSpotlight` 换成 `refreshHeroMoments`。`startLiveTimer` 不改（仍每秒调 `refreshRunningTimes`）。

- [x] **Step 4: 删除 `renderSpotlight` 函数**

找到 `function renderSpotlight(card) { ... }`（约第 108–151 行），整块删除。

- [x] **Step 5: 更新 `window.CardRender` 导出**

找到文件末尾的 `window.CardRender = { ... };`（约第 356–365 行），替换为：

```js
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
```

说明：移除 `renderSpotlight` 导出；保留 `getPinnedCard`（设计 D2 要求作纯数据函数保留复用，即便本计划不再调用）。新增 4 个 hero 函数导出。

- [x] **Step 6: 语法校验**

Run: `node --check public/js/card-render.js`
Expected: 无输出（退出码 0）。

- [x] **Step 7: Grep 确认 `renderSpotlight` 全仓无残留**

用 Grep 工具在 `public/` 搜索 `renderSpotlight`，Expected: 0 命中（JS + HTML + CSS）。
再用 Grep 搜索 `spotlight-`（旧 DOM id），Expected: 0 命中（Task 1 已删 HTML，Task 4 已删 CSS）。

- [x] **Step 8: 浏览器验证每秒刷新无闪烁**

Run: `npx wrangler dev`
浏览器打开首页，观察右侧三行：
- 秒针每秒变化时，左侧时钟 `:SS` 更新，右侧三行的天数数字与「天后/小时后」标签应同步更新但**不重排、不闪烁**（DOM 行不重建）。
- 悬停某行：不出现按钮、不触发拖拽。
- DevTools Elements 面板观察 `.moment-row` 节点：每秒只有 `.days-number`/`.days-label` 的文本子节点变化，`<div class="moment-row">` 本身不被替换。

- [x] **Step 9: Commit**

```bash
git add public/js/card-render.js
git commit -m "refactor: hero 面板每秒行内刷新，renderFixed 改写，退役 renderSpotlight"
```

---

### Task 8: home.js updateCurrentTime 分层时钟 + 滚动揭示阈值复核 + 清理旧引用

**Files:**
- Modify: `public/js/home.js:269-289`（`updateCurrentTime`）、`public/js/home.js:71-88`（`bindScrollReveal` 阈值，必要时微调）

**Interfaces:**
- Consumes: Task 1 的新锚点 `#now-clock-hm`/`#now-clock-sec`/`#now-date`(含 `.nd-year`/`.nd-md`)/`#now-weekday`/`#now-lunar`；`TimeCalc.formatClockParts(now)` → `{date, weekday, time, lunar}`。
- Produces: `updateCurrentTime` 适配分层时钟；无旧 `#now-clock`/`spotlight-*` 残留引用。

- [x] **Step 1: 重写 `updateCurrentTime`**

找到 `function updateCurrentTime() { ... }`（约第 269–289 行），整块替换为：

```js
  function updateCurrentTime() {
    var hmEl = document.getElementById('now-clock-hm');
    if (!hmEl) return;
    var now = new Date();

    if (window.TimeCalc && window.TimeCalc.formatClockParts) {
      var parts = window.TimeCalc.formatClockParts(now);
      // time 形如 "HH:MM:SS"，局部拆为时分主号与秒次号，不扩展 time-calc.js 公共签名
      var timeParts = parts.time.split(':');
      hmEl.textContent = timeParts[0] + ':' + timeParts[1];
      var secEl = document.getElementById('now-clock-sec');
      if (secEl) secEl.textContent = ':' + timeParts[2];

      // 公历日期：直接从 now 构建中文形（移动端 .nd-year 由 CSS 隐藏）
      var yearEl = document.querySelector('#now-date .nd-year');
      var mdEl = document.querySelector('#now-date .nd-md');
      if (yearEl) yearEl.textContent = now.getFullYear() + '年';
      if (mdEl) mdEl.textContent = (now.getMonth() + 1) + '月' + now.getDate() + '日';

      var weekdayEl = document.getElementById('now-weekday');
      if (weekdayEl) weekdayEl.textContent = ' · ' + parts.weekday; // parts.weekday 形如 "星期二"

      var lunarEl = document.getElementById('now-lunar');
      if (lunarEl) lunarEl.textContent = parts.lunar; // formatLunarLabel 失败返回 ''，留白不报错
      return;
    }

    // 降级：无 TimeCalc 时直接拼（极小概率，保留兜底）
    var pad = function (n) { return String(n).padStart(2, '0'); };
    hmEl.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes());
    var secEl2 = document.getElementById('now-clock-sec');
    if (secEl2) secEl2.textContent = ':' + pad(now.getSeconds());
  }
```

说明：
- 不改 `time-calc.js`；`split(':')` 在本函数局部完成分层。
- `parts.date`（ISO `2026-07-14`）不再用于显示，改用 `now` 直接拼中文「2026年7月14日」，对齐视觉稿。
- 移动端省略年份由 CSS `.nd-year { display:none }`（Task 3）控制，JS 不分支。
- `parts.lunar` 失败为 `''`，`#now-lunar` 留白，时钟与公历照常。

- [x] **Step 2: 清理 home.js 旧节点引用**

用 Grep 工具在 `public/js/home.js` 搜索：`now-clock`（旧单 id）、`spotlight`、`fixed-card-stage`、`time-instrument`、`hero-title`。
Expected: 只命中 `now-clock-hm`/`now-clock-sec`（新 id），无旧 `getElementById('now-clock')` 或 `spotlight-*` 残留。若有旧残留调用，删除该行。

- [x] **Step 3: 复核 `bindScrollReveal` 滚动揭示阈值**

找到 `bindScrollReveal`（约第 71–88 行），其 `update()` 用 `y > 260` 显示 `revealed-list`、`y < 160` 隐藏。hero 原高 520px，新 hero 桌面约 340px、移动更矮。

Run: `npx wrangler dev`，浏览器桌面端打开首页，观察：
- 首屏加载时 `revealed-list`（时间清单）不可见（`is-visible` 未加）。
- 下滑约一屏后 `revealed-list` 平滑揭示。
- 上滑回到顶部附近时 `revealed-list` 隐藏。

若 hero 变矮导致 `revealed-list` 在首屏就部分可见或揭示时机错位（下滑量很小就触发），执行下面修改；否则跳过此 Step 的编辑：

将 `public/js/home.js` 中：
```js
        if (y > 260) revealed.classList.add('is-visible');
        else if (y < 160) revealed.classList.remove('is-visible');
```
改为：
```js
        if (y > 180) revealed.classList.add('is-visible');
        else if (y < 100) revealed.classList.remove('is-visible');
```

并在该 `if` 上方注释更新为：
```js
      // hero 改矮（桌面约 340px）：下调阈值，下滑越过 180 显示，上滑回落到 100 以下隐藏。
```

- [x] **Step 4: 语法校验**

Run: `node --check public/js/home.js`
Expected: 无输出（退出码 0）。
Run: `node --check public/js/time-calc.js`
Expected: 无输出（退出码 0，确认未误改）。

- [x] **Step 5: 浏览器验证时钟走动 + 跨日刷新**

Run: `npx wrangler dev`
浏览器打开首页桌面端：
- 左侧 `#now-clock-hm`（`HH:MM`）每秒更新，`#now-clock-sec`（`:SS`）每秒更新；秒位变化时时分位不重排（观察 DOM：`#now-clock-hm` 文本节点变化，元素不被替换）。
- 公历日期「2026年7月14日 · 星期二」、农历「农历六月初一」（当日实际值）显示正确。
- DevTools 切到 680px：日期变为「7月14日 · 星期二」（年份隐藏），农历照常。
- 若时间接近 00:00:00，观察跨零点时日期、星期、农历、三行天数同步刷新（`updateCurrentTime` 每秒重算 `formatClockParts`，`refreshHeroMoments` 每秒重算；跨零点后某事件由未到变已到时，集合变化触发 `renderHeroTimeline` 全量重建，行数减少）。

- [x] **Step 6: Commit**

```bash
git add public/js/home.js
git commit -m "feat: 左侧现在面板分层时钟，滚动揭示阈值复核"
```

---

### Task 9: 验证（语法 + 浏览器矩阵 + 数据态 + 只读）

**Files:**
- 无文件改动；仅运行校验与浏览器验证。

**Interfaces:**
- Consumes: Task 1–8 全部产物。

- [x] **Step 1: 三个 JS 文件语法校验**

Run:
```bash
node --check public/js/card-render.js
node --check public/js/home.js
node --check public/js/time-calc.js
```
Expected: 三条命令均无输出（退出码 0）。

- [x] **Step 2: 本地起服务 + 浏览器断点矩阵**

Run: `npx wrangler dev`
浏览器（DevTools device toolbar）依次验证宽度 **1240 / 980 / 680 / 420 / 320 px**：
- 无水平溢出（`overflow-x` 不触发横向滚动条）。
- 无文本裁切（事件名称省略号正常，日期不截断）。
- 1240：左右双栏；980：上下单栏（现在→重要时间）；680：移动变体（无 hint、置顶合并进日期行、日期省略年份）；420/320：进一步缩号但天数/名称/置顶状态可见。
- 移动端不折叠、不轮播三行（三行始终可见）。

- [x] **Step 3: 五种数据态验证**

用 DevTools Console 临时注入数据（每条验证后刷新页面恢复真实数据）：

```js
// (a) 有置顶且未到 + 另两个未到
window.__testCards = function(){
  window.CardRender.renderFixed([
    {id:'a',type:'countdown',calendar:'solar',date:'2026-11-19',pinned:true,title:'结婚纪念日'},
    {id:'b',type:'countdown',calendar:'solar',date:'2026-07-26',title:'旅行出发'},
    {id:'c',type:'recurring',calendar:'lunar',lunarMonth:7,lunarDay:7,title:'七夕'}
  ]);
}; window.__testCards();
```
Expected: 第一行 `结婚纪念日` 带 `pinned` 底纹 + 珊瑚渐变色条 + 「置顶」chip；后两行按 mint/sky/plum 色条；行顺序固定。

```js
// (b) 无置顶，三个未到
window.CardRender.renderFixed([
  {id:'b',type:'countdown',calendar:'solar',date:'2026-07-26',title:'旅行出发'},
  {id:'c',type:'recurring',calendar:'lunar',lunarMonth:7,lunarDay:7,title:'七夕'},
  {id:'d',type:'countdown',calendar:'solar',date:'2026-09-01',title:'开学'}
]);
```
Expected: 三行无 chip、无 `pinned` 底纹，按目标日期升序（7/26 → 8/19 七夕 → 9/1）。

```js
// (c) 置顶已到则回退
window.CardRender.renderFixed([
  {id:'p',type:'countdown',calendar:'solar',date:'2024-01-01',pinned:true,title:'已到置顶'},
  {id:'b',type:'countdown',calendar:'solar',date:'2026-07-26',title:'旅行出发'},
  {id:'c',type:'recurring',calendar:'lunar',lunarMonth:7,lunarDay:7,title:'七夕'}
]);
```
Expected: `已到置顶` 不出现在面板；三行为最近未到事件，无 chip。

```js
// (d) 未到不足三行
window.CardRender.renderFixed([
  {id:'b',type:'countdown',calendar:'solar',date:'2026-07-26',title:'旅行出发'}
]);
```
Expected: 只渲染 1 行，无空占位行。

```js
// (e) 当天到达转小时倒计时（构造今天内某时刻为目标）
//   示例：把目标设为今天 23:59
var later = new Date(); later.setHours(23,59,0,0);
window.CardRender.renderFixed([
  {id:'today',type:'countdown',calendar:'solar',
    date: later.getFullYear()+'-'+String(later.getMonth()+1).padStart(2,'0')+'-'+String(later.getDate()).padStart(2,'0'),
    time:'23:59', title:'今晚'}
]);
```
Expected: 该行显示「N 小时后」（若当前时刻离 23:59 超过 1 小时）；若构造为近几分钟可观察「N 分钟后」/「即将」，而非「0 天后」。

> 注意：农历事件当天到达同理（`diff.days===0` 走小时分支）。七夕若在当月内未到，显示「N 天后」+ 日期「农历七月初七」。

- [x] **Step 4: 只读性验证**

在浏览器右侧面板任意一行点击、右键、悬停：
- 不出现编辑/删除/置顶按钮。
- 不触发拖拽（`draggable` 未设）。
- 不弹出操作菜单。
- DevTools 检查 `.moment-row` 无 `onclick`/`onmousedown` 等内联事件，无 `<button>` 子元素。

- [x] **Step 5: a11y 抽查**

DevTools Elements：
- `.now-surface` 是 `<section aria-labelledby="now-title">`，`#now-title` 为 `<h2>`。
- `.timeline-surface` 是 `<section aria-labelledby="timeline-title">`，`#timeline-title` 为 `<h2>`。
- `.moment-list` 是 `<div>`，三行是 `<div>`（只读，不用 `<button>`/`<a>`，屏幕阅读器不识别为可操作控件）。
- 实时时钟无 `aria-live`（不每秒朗读）。
- 置顶状态既有「置顶」文字也有颜色（桌面 chip / 移动 `.md-pin`）。

- [x] **Step 6: 最终提交（如有验证中发现的小修）**

若 Step 2–5 发现任何缺陷并修复，单独提交：
```bash
git add -A
git commit -m "fix: 首屏双面板验证修复"
```
若全部通过无修改，跳过本步。

---

## Self-Review 记录

- **Spec 覆盖**：
  - 双面板结构 + 不残留旧节点（HTML Requirement）→ Task 1 + Task 4。
  - 左侧分层走动时钟 + 农历降级 + 移动精简 → Task 1（锚点）+ Task 2/3（样式）+ Task 8（JS）。
  - 右侧数据选取规则（置顶优先/回退/不足三行/节假日过期）→ Task 5 `getHeroMoments`。
  - 三行只读展示 + 长名截断 + 当天转小时 + 目标日期按类型分显 → Task 5 `formatMomentCountdown`/`formatMomentDateParts` + Task 6 `buildMomentRow`。
  - 移动「重要时间」变体（去 hint、置顶合并进日期、省年份）→ Task 1（HTML 含 `.md-pin`/`.nd-year`）+ Task 3（CSS）。
  - 每秒刷新避免闪烁 + 跨零点同步 → Task 7 `refreshHeroMoments` + Task 8 `updateCurrentTime`。
  - 删除而非隐藏旧节点 + 清理无引用 CSS/动画 → Task 1 + Task 4。
  - 验证标准（node --check + 断点矩阵 + 数据态 + 只读 + a11y）→ Task 9。

- **类型/签名一致性**：`getHeroMoments(cards)→[{card,isPinned}]`、`formatMomentCountdown(card)→{number,label}`、`formatMomentDateParts(card,target)→{year,md,week,lunar}`、`renderHeroTimeline(cards)`、`refreshHeroMoments(cards)`、`renderFixed(cards)`、`buildMomentRow(card,isPinned)→HTMLElement`——Task 5/6/7 引用一致；导出表与调用方一致。

- **无占位符**：所有 Step 含完整代码或确切命令；无 TBD/TODO/"add error handling"。
