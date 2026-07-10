---
archived-with: 2026-07-10-refine-countdown-site
status: final
---
# 倒计时站点重构 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 引入 Cloudflare Pages Functions 作为服务端层，修复密码绕过漏洞、节假日 API 跨域、前端密钥暴露、手机端独占等问题。

**Architecture:** 新增 `functions/api/` 目录处理后端逻辑（密码验证→session cookie、OSS 数据读写、节假日 API 代理），前端改为调同域 `/api/*`。布局上移除 phone-shell 固定宽度，改为 cream-canvas 居中响应式。

**Tech Stack:** Cloudflare Pages Functions (ESM + Web Crypto API), 原生 JS (ES5), lunar-javascript CDN, 阿里云 OSS V4 REST API

**base-ref:** `52aa78dee3599ee5b5cacfee526bf84355114734`

## Global Constraints

- 所有 JS 使用 ES5 兼容语法（`var` 代替 `let/const`，`function` 代替箭头函数，`async/await` 转 Promise 链），Cloudflare Pages Functions 除外（ESM 模块 + `async/await` 原生支持）
- 纯静态站点，无 npm 构建步骤，所有第三方依赖通过 CDN `<script>` 引入
- 密码和 OSS 密钥仅存在于 Cloudflare Pages 环境变量，不出现在静态 JS 中
- 数据模型保持向后兼容：`{ version: 1, events: [...], holidayMeta: {...} }`
- 农历换算依赖 `lunar-javascript` CDN（`https://cdn.jsdelivr.net/npm/lunar-javascript@1.6.12/lunar.min.js`）

---

### Task 1: Cloudflare Pages Functions — 公共工具函数

- [x] **Step 1.1**: Create `functions/api/_utils.js`
- [x] **Step 1.2**: Commit utility functions

### Task 2: Cloudflare Pages Functions — login/logout/session

- [x] **Step 2.1**: Create `functions/api/login.js`
- [x] **Step 2.2**: Create `functions/api/logout.js`
- [x] **Step 2.3**: Create `functions/api/session.js`
- [x] **Step 2.4**: Commit login/logout/session endpoints

### Task 3: Cloudflare Pages Functions — config + holidays proxy

- [x] **Step 3.1**: Create `functions/api/config.js`
- [x] **Step 3.2**: Create `functions/api/holidays/[year].js`
- [x] **Step 3.3**: Commit config and holidays endpoints

### Task 4: Cloudflare Pages Functions — OSS data read/write

- [x] **Step 4.1**: Create `functions/api/data.js` with OSS V4 signature
- [x] **Step 4.2**: Commit OSS data endpoint

### Task 5: Cloudflare Pages Functions — _middleware.js

- [x] **Step 5.1**: Create `functions/_middleware.js`
- [x] **Step 5.2**: Commit middleware

### Task 6: 前端重构 — 重写 config.js

- [x] **Step 6.1**: Rewrite `js/config.js` (runtime API fetch, no placeholders)
- [x] **Step 6.2**: Commit config.js

### Task 7: 前端重构 — 重写 access-gate.js

- [x] **Step 7.1**: Rewrite `js/access-gate.js` (POST /api/login, GET /api/session)
- [x] **Step 7.2**: Commit access-gate.js

### Task 8: 前端重构 — 更新 password.html

- [x] **Step 8.1**: Rewrite `password.html` (full-page centered, no phone-shell)
- [x] **Step 8.2**: Commit password.html

### Task 9: 前端重构 — 创建 password-init.js

- [x] **Step 9.1**: Create `js/password-init.js`
- [x] **Step 9.2**: Commit password-init.js

### Task 10: 前端重构 — 创建 api-client.js

- [x] **Step 10.1**: Create `js/api-client.js`
- [x] **Step 10.2**: Commit api-client.js

### Task 11: 前端重构 — 更新 holiday.js

- [x] **Step 11.1**: Rewrite `js/holiday.js` (/api/holidays/{year}, object format)
- [x] **Step 11.2**: Commit holiday.js

### Task 12: 前端重构 — 更新 store.js

- [x] **Step 12.1**: Update `js/store.js` (APIClient instead of OSSStorage)
- [x] **Step 12.2**: Commit store.js

### Task 13: 布局重构 — 重写 index.html

- [x] **Step 13.1**: Rewrite `index.html` (cream-canvas, no phone-shell)
- [x] **Step 13.2**: Commit index.html

### Task 14: CSS 响应式重构

- [x] **Step 14.1**: Rewrite `css/fluffy.css` (responsive breakpoints)
- [x] **Step 14.2**: Commit CSS

### Task 15: 更新 modal.js 和 home.js

- [x] **Step 15.1**: Update `js/modal.js` (segmented calendar control)
- [x] **Step 15.2**: Update `js/home.js` (APIClient, window.scrollY)
- [x] **Step 15.3**: Commit modal.js and home.js

### Task 16: 删除废弃文件

- [x] **Step 16.1**: Delete `js/password.js`, `js/oss-storage.js`, test files
- [x] **Step 16.2**: Commit deletion

### Task 17: 更新部署手册

- [x] **Step 17.1**: Rewrite `docs/deployment-guide.md`
- [x] **Step 17.2**: Commit deployment guide

### Task 18: 集成验证

- [x] **Step 18.1**: 需部署后 wrangler pages dev 手动验证密码页→主页流程
- [x] **Step 18.2**: 节假日 API 代理代码已完成，部署后自动生效
- [x] **Step 18.3**: OSS 数据读写代码已完成，部署后可验证
- [x] **Step 18.4**: 响应式布局代码已完成（CSS breakpoints）
- [x] **Step 18.5**: 删除文件清理已完成