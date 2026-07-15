---
comet_change: home-hero-timeline
role: technical-design
canonical_spec: openspec
archived-with: 2026-07-14-home-hero-timeline
status: final
---

# 首页首屏「现在 + 重要时间」双面板技术设计

- 日期：2026-07-14
- 状态：已确认
- 范围：首页首屏主体的左、右两块(整块 `hero-stage` 内部重构)

> 规范事实源(canonical spec)为 OpenSpec delta spec `openspec/changes/home-hero-timeline/specs/home-hero-timeline/spec.md`。本文档为技术实现设计,不重复需求 spec,只补充实现层决策与边界。

## 1. 目标

让用户打开首页后,第一眼就能回答两个问题:

1. 现在是什么时间?
2. 最近在等的重要日子有哪些?

首屏从「宣传文案 + 单个圆盘倒计时」调整为「现在 + 重要时间」的信息型布局,沿用 Fluffy 奶油色毛玻璃风格。

## 2. 范围与非目标

### 本次修改
- 重构 `public/index.html` 的 `hero-stage` 内部为双面板骨架。
- `public/css/fluffy.css` 新增双面板与三行卡片样式,清理无引用旧规则与动画。
- `public/js/card-render.js` 新增 `getHeroMoments`/`renderHeroTimeline`/`refreshHeroMoments`,`renderFixed` 改为调用新渲染;退役 `renderSpotlight`。
- `public/js/home.js` 的 `updateCurrentTime` 适配新时钟锚点,滚动揭示阈值复核。

### 明确不修改
- 顶部浮动栏及新增/同步/登出操作。
- 下方事件列表、分类筛选、拖拽排序与卡片操作。
- 新增/编辑弹窗、password 页。
- 后端 `src/worker.js`、D1 schema、鉴权、节假日数据源。
- 单一置顶约束、节假日只读、写操作 `runExclusive` 防抖。
- 不改 `:root` 调色板语义,不引暗色模式,不引构建步骤/模块系统。

## 3. 信息架构

首屏保留左右两栏,但重新分配信息职责。

### 左侧:现在

左侧只负责呈现当前时间,不再承载宣传标题和说明文案。

展示顺序:
1. 彩虹短轨作为首屏视觉锚点。
2. `NOW · 现在` 小标题。
3. 实时时钟,每秒更新。
4. 公历日期与星期。
5. 农历日期。

小时和分钟(`HH:MM`)作为主号大字,秒(`:SS`)为次号小字暖色强调,使时间持续走动但不过度抢眼。

### 右侧:重要时间

右侧由圆盘改为三行纵向时间轴,每行展示:
- 相差天数 / 当天小时倒计时。
- `天后` / `N 小时后` / `即将` 状态。
- 事件名称(超长省略,`title` 放全名)。
- 目标日期(农历事件显农历原文,公历事件显公历 + 星期)。
- 置顶文字标记,仅用于置顶行。

事件行只读,不响应点击,不展开详情,不提供编辑/删除/拖拽/置顶入口。

## 4. 数据选择规则

右侧至多展示三行,规则:

1. 若存在置顶事件且目标**未到**,第一行固定展示该置顶事件。
2. 从未到事件中,按目标日期升序补足,置顶已用则 `id` 去重不重复出现。
3. 若无置顶(或置顶已到/已过),直接取最近三个未到事件。
4. 已到/已过事件不出现在右侧面板(与「天后」语义一致,天数恒为正)。
5. 候选不足三行时按实际数量渲染,不补占位行。
6. 完全没有可展示事件时,右侧显示空状态「还没有重要日子」。

> 与早期产品稿差异(已迭代):早期稿允许置顶已过仍保留第一行显示「已过 N 天」。经澄清迭代,确定「已过不进面板」——置顶已过则回退为最近三个未到事件,避免「明明置顶却没在第一行」的困惑,且与「天后」正数语义统一。

未来候选项覆盖自定义事件、周期事件与节假日,复用 `EventStore.getSortedCards()` 合并数据与 `TimeCalc.resolveTargetDate/diff`,不新增后端请求。

### 天数 / 倒计时文案规则
- 未来(明天及以后):`diff.days > 0` → `N 天后`。
- 今天内到达:`diff.days === 0` → `diff.hours > 0` 显 `N 小时后`;`hours === 0` 且 `minutes > 0` 显 `N 分钟后`;都为 0 显 `即将`。
- 已过:不进面板(无文案)。

## 5. 技术决策

### D1: 左侧「现在」面板时钟分层

复用 `home.js` 每秒定时器与 `TimeCalc.formatClockParts`(返回 `{date, weekday, time, lunar}`,`time` 为 `HH:MM:SS`)。DOM 锚点由单行 `#now-clock` 改为 `#now-clock-hm`(HH:MM 主号)+ `#now-clock-sec`(:SS 次号)。在 `updateCurrentTime` 局部 `split(':')` 拆分填充,**不扩展 `time-calc.js` 公共函数签名**,保持纯函数模块稳定。

### D2: 右侧面板渲染并入 `card-render.js`

新增:
- `getHeroMoments(cards)` — 纯数据函数:输入 `getSortedCards()` 结果,经 `getRenderableCards` 过滤,按目标日期升序选「置顶优先 + 最近未到」至多三行,置顶已到则回退;返回 `[{card, isPinned}]`。
- `renderHeroTimeline(cards)` — 构建右侧三行 DOM 并挂到 `#hero-moments`。
- `refreshHeroMoments(cards)` — 每秒只更新行内天数/倒计时文本,不重建整块(用 `data-id` 定位行),避免闪烁。
- `formatMomentCountdown(card)` — 面板专用天数/小时文案(0 天转小时),与列表卡片 `formatTime`(纯天数)分离,不污染列表。

`renderFixed(cards)` 改为调用 `renderHeroTimeline`;退役 `renderSpotlight`(圆盘单置顶渲染)。`getPinnedCard`/`getRenderableCards` 作纯数据函数保留复用。

**为什么不新建独立模块**:hero 渲染与卡片渲染同属「把 EventStore 数据变成 DOM」,且都依赖 `TimeCalc.diff/resolveTargetDate`,放 `card-render.js` 保持单一数据→DOM 边界,符合 CLAUDE.md 模块表。

### D3: 每秒刷新避免闪烁

`startLiveTimer` 每秒既刷列表卡片走动时间(`refreshRunningTimes`),也刷 hero 右侧面板(`refreshHeroMoments`)。`refreshHeroMoments` 用 `data-id` 定位每行,只改 `.days-number` 与状态标签文本,事件集合与 DOM 结构稳定,无整块重建,无闪烁。

### D4: 目标日期按事件类型分显

- 公历事件:日期行显 `2026年8月19日 · 星期三`(移动端省略年份 → `8月19日 · 星期三`)。
- 农历事件:显 `农历七月初七`(移动端同样省略对应公历年份,保留农历原文)。

复用 `card-render.js` 现有 `describeCardDate` 思路,但产出精简版(去「目标/对应」前缀),内联在 `renderHeroTimeline` 内。

### D5: 当天到达转小时倒计时

`diff.days === 0` 时走 `formatMomentCountdown`:`hours>0` → `N 小时后`;`hours===0 && minutes>0` → `N 分钟后`;都为 0 → `即将`。行数与「未到」判定不变(今天内未到仍算未到,进面板)。

### D6: 删除而非隐藏旧节点

`.time-instrument` / `.dial-*` / `#spotlight-*` / `.hero-copy` / `#hero-title` / `.hero-lede` 在 HTML 与 CSS 中**删除**,不是 `display:none`。无引用 CSS 规则(`.dial-lines`、`.dial-face`、`.spotlight-*`、`.hero-copy h1`、`.hero-lede`、`.hero-metrics`、`titleGlow`/`instrumentFloat` 动画)一并清理。`.now-*` 类名保留复用给新面板。改前用 Grep 确认每条待删规则引用,只删无引用的。

### D7: `hero-stage` 仍作外层 grid 容器

保留 `.hero-stage` 作桌面双列 grid(`minmax(0, 0.78fr) minmax(0, 1.22fr)` 对齐视觉稿 39/61),内部直接放「现在」面板与「重要时间」面板两个 `.fluffy-surface`。≤980px 改单列。

## 6. 视觉设计

沿用 `public/css/fluffy.css` 现有设计变量:
- 奶油底色 `--cream`、`--cream-2`。
- 玻璃纸面 `--paper` 与现有毛玻璃渐变。
- 文字色 `--ink`、`--muted`。
- 珊瑚/奶油黄/薄荷绿/天空蓝/梅紫强调色。
- 统一 8px 圆角 `--radius`。
- 现有外阴影、内阴影、玻璃描边。

桌面端约 `0.78fr / 1.22fr` 左右比例,让右侧三行时间轴获更稳定横向空间。置顶行用珊瑚→奶油黄暖色底纹并显示「置顶」文字(不只靠颜色);其余行用薄荷绿/天空蓝短色条区分层级,不为每项加独立主题卡片。移除右侧圆盘、刻度线与漂浮动画;保留背景柔光与低强度玻璃高光,首屏信息本身不使用循环位移动画。

## 7. 响应式布局

- > 980px:左右双栏,左「现在」右「重要时间」。
- ≤ 980px:上下单栏,顺序固定「现在 → 重要时间」。
- ≤ 680px:缩减面板内边距与字号;右侧去掉 hint;日期省略年份;置顶标记合并进日期行(`11月19日 · 置顶`);事件行单行名称、省略过长文本,无横向滚动。
- ≤ 420px:秒数、日期、事件日期进一步收敛,但天数、事件名称与置顶状态必须保持可见。

移动端不折叠、不轮播三条重要时间,避免隐藏核心信息。

## 8. 交互与数据流

数据流单向:
1. `home.js` 从 `EventStore` 取合并后的卡片集合。
2. `CardRender.getHeroMoments` 按置顶 + 未到规则选至多三行。
3. `CardRender.renderHeroTimeline` 渲染右侧三行;`renderFixed` 同时挂载。
4. 每秒定时器:`updateCurrentTime` 更新左侧时钟;`refreshHeroMoments` 更新右侧天数/倒计时;跨零点时日期/农历/事件天数同步刷新。

首屏不产生写操作,不触发 `runExclusive`,不改置顶或排序状态。

## 9. 可访问性

- 左右区域使用有含义的 `section` 与标题关联。
- 重要时间使用有序列表语义,不用按钮或链接语义。
- 实时时钟不通过 `aria-live` 每秒朗读;为辅助技术提供稳定的完整时间文本。
- 置顶状态同时用文字和颜色。
- 文字与玻璃背景保持足够对比度。
- 尊重 `prefers-reduced-motion`,不引入必须播放的动画。

## 10. 异常与边界

- 置顶项已到/已过:不进面板,回退为最近三个未到事件。
- 置顶项也是最近未到项:`id` 去重,后续只补其他事件。
- 事件不足三行:按实际数量渲染,不生成空行。
- 无置顶项:展示最近三个未到事件。
- 无任何未到项且无置顶项:空状态「还没有重要日子」。
- 事件名称过长:单行省略,`title` 放完整名称。
- 今天内到达:`days===0` 转小时/分钟倒计时。
- 时间跨零点:日期、星期、农历、三行事件天数同步刷新。
- 农历换算失败:`formatLunarLabel` 返回空,留白不报错,时钟与公历日期照常。
- 数据加载失败:沿用首页现有错误处理,不在首屏新增独立错误弹窗。

## 11. 验证标准

实现完成后至少验证:
- 有未到置顶、无置顶、置顶已过回退、未到不足三行、当天到达(d=0 转小时)五种数据状态。
- 置顶项不在最近事件中重复。
- 自定义事件、周期事件、节假日、当天到达的文案正确。
- 时钟每秒更新,秒位变化不重排时分;跨日后所有日期相关信息刷新。
- 1240/980/680/420/320px 宽度下无重叠、裁切、横向滚动。
- 键盘与屏幕阅读器不把只读事件行误识别为可操作控件。
- 右侧面板只读:点击/悬停不触发编辑/删除/拖拽/置顶。
- `node --check public/js/card-render.js`、`node --check public/js/home.js`、`node --check public/js/time-calc.js` 通过。
