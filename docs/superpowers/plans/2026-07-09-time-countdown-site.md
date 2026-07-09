---
change: build-time-countdown-site
design-doc: docs/superpowers/specs/2026-07-09-time-countdown-site-design.md
base-ref: 6334824b61dc1291e0f1768a135c38fda7f4090f
archived-with: 2026-07-09-build-time-countdown-site
---

# 时间倒计时静态网站 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建纯静态、无构建打包的时间倒计时网站，部署到 Cloudflare Pages，支持密码访问、OSS 持久化、节假日 API 接入、4 类事件（节日/倒计时/周期性/已过天数）、公历+农历、置顶/拖拽/编辑等交互

**Architecture:** HTML/CSS/JS 分离，第三方库 CDN 引入，密码守卫 + OSS 存储 + 节假日 API + 模块化 JS（config/access-gate/lunar/time-calc/holiday/oss-storage/store/card-render/modal/home），毛玻璃+奶油+新拟态设计系统

**Tech Stack:** 
- HTML5 + CSS3（毛玻璃/奶油/新拟态设计系统）
- Vanilla JavaScript（模块化，无构建）
- lunar-javascript（农历换算）
- aliyun-oss-sdk-6.18.0（OSS 读写）
- 节假日 API：api.jiejiariapi.com/v1/holidays/{year}
- Cloudflare Pages（部署 + 环境变量注入）

## Global Constraints

- **纯静态、无构建打包**：第三方库全部 CDN 引入，源码即产物
- **HTML/CSS/JS 分离**：HTML 放根目录，CSS 放 `css/`，JS 放 `js/`
- **无后端**：不引入 Workers/D1/Node/Python，不做 STS 令牌服务
- **单密码访问**：密码与 OSS 参数经 Cloudflare Pages 环境变量在构建期注入
- **模块职责单一**：每个 JS 模块只负责一个明确的功能边界
- **OSS 凭证最小权限**：RAM 子账号仅授予指定 JSON 文件读写权限
- **响应式适配**：PC/手机端同时适配
- **节假日置顶/排序方案**：节假日用稳定合成 ID（`festival:<name>`），只存 `holidayMeta` 覆盖状态

archived-with: 2026-07-09-build-time-countdown-site
---

### Task 1: 项目骨架与基础设施

**Files:**
- Create: `index.html`（主页）
- Create: `password.html`（密码页）
- Create: `css/fluffy.css`（设计系统样式）
- Create: `js/config.js`（运行时配置占位符）
- Create: `README.md`（项目说明）

**Interfaces:**
- Consumes: 原型文件 `docs/fluffy-time-design/css/fluffy.css`（抽取基础样式）
- Produces: 
  - `window.APP_CONFIG = { password: string, oss: {region, bucket, accessKeyId, accessKeySecret, objectKey} }`（config.js 导出）
  - 目录结构：`css/`、`js/`、根目录 HTML

- [x] **Step 1.1: 创建目录结构**

```bash
mkdir -p css js
```

- [x] **Step 1.2: 创建 index.html 骨架**

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>时间绒面 - 主页</title>
  <link rel="stylesheet" href="css/fluffy.css">
</head>
<body class="fluffy-page home-page">
  <main id="app"></main>
  <script src="https://cdn.jsdelivr.net/npm/lunar-javascript@1.6.12/dist/lunar.min.js"></script>
  <script src="https://gosspublic.alicdn.com/aliyun-oss-sdk-6.18.0.min.js"></script>
  <script src="js/config.js"></script>
  <script src="js/access-gate.js"></script>
  <script src="js/home.js"></script>
</body>
</html>
```

- [x] **Step 1.3: 提交骨架**

```bash
git add index.html password.html css/fluffy.css js/config.js README.md
git commit -m "feat: add project skeleton

- directory structure
- HTML skeletons with CDN引入
- fluffy.css design system
- config.js placeholder
- README.md"
```

archived-with: 2026-07-09-build-time-countdown-site
---

### Task 2: 密码访问控制（access-gate）

**Files:**
- Create: `js/access-gate.js`

**Interfaces:**
- Consumes: `window.APP_CONFIG.password`
- Produces: `verify(input)`, `isAuthed()`, `requireAuth()`

**实现要点：** 密码校验、sessionStorage 会话、主页守卫、密码页逻辑

- [x] **提交**

```bash
git add js/access-gate.js
git commit -m "feat: implement password access control"
```

archived-with: 2026-07-09-build-time-countdown-site
---

### Task 3: 时间计算核心（time-calc + lunar）

**Files:**
- Create: `js/time-calc.js`, `js/lunar.js`

**Interfaces:**
- Produces: `resolveTargetDate(event)`, `diff(now, target)`, `nextSolarOfLunar(month, day)`

**实现要点：** 4 类事件归约为目标 Date，农历↔公历换算，跨年滚动

- [x] **提交**

```bash
git add js/time-calc.js js/lunar.js
git commit -m "feat: implement time calculation and lunar conversion"
```

archived-with: 2026-07-09-build-time-countdown-site
---

### Task 4: 节假日数据接入（holiday）

**Files:**
- Create: `js/holiday.js`

**Interfaces:**
- Produces: `fetchHolidays(year)`, `groupByName(raw)`, `isHighwayFree(name)`

**实现要点：** API 调用、按 name 分组取最早日、高速免费标注、降级处理

- [x] **提交**

```bash
git add js/holiday.js
git commit -m "feat: implement holiday API integration"
```

archived-with: 2026-07-09-build-time-countdown-site
---

### Task 5: OSS 存储读写（oss-storage）

**Files:**
- Create: `js/oss-storage.js`

**Interfaces:**
- Produces: `read()`, `write(config)`

**实现要点：** OSS client 初始化、读 JSON、覆盖写、降级

- [x] **提交**

```bash
git add js/oss-storage.js
git commit -m "feat: implement OSS storage read/write"
```

archived-with: 2026-07-09-build-time-countdown-site
---

### Task 6: 事件数据中心（store）

**Files:**
- Create: `js/store.js`

**Interfaces:**
- Produces: `load()`, `getSortedCards()`, `add/update/remove`, `togglePin`, `reorder`

**实现要点：** 合并自定义事件+节假日、holidayMeta 覆盖、统一排序、写回 OSS

- [x] **提交**

```bash
git add js/store.js
git commit -m "feat: implement event data store"
```

archived-with: 2026-07-09-build-time-countdown-site
---

### Task 7: 卡片渲染与主页交互（card-render + modal + home）

**Files:**
- Create: `js/card-render.js`, `js/modal.js`, `js/home.js`

**Interfaces:**
- Produces: DOM 渲染 + 交互绑定（滚动动画、拖拽、置顶、编辑、删除、新增）

**实现要点：** 固定卡片区、列表、走动时间刷新、弹窗、响应式

- [x] **提交**

```bash
git add js/card-render.js js/modal.js js/home.js
git commit -m "feat: implement card rendering and home interactions"
```

archived-with: 2026-07-09-build-time-countdown-site
---

### Task 8: 部署手册

**Files:**
- Create: `docs/deployment-guide.md`

**内容：** Cloudflare Pages 部署、环境变量、OSS RAM 子账号、初始 JSON、验证清单

- [x] **提交**

```bash
git add docs/deployment-guide.md
git commit -m "docs: add deployment guide"
```

archived-with: 2026-07-09-build-time-countdown-site
---

## 执行说明

按 Task 1-8 顺序执行。每个 Task 完成后立即提交。所有 Task 完成后运行项目验证命令确认构建通过。



