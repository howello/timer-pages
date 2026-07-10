---
change: workers-d1-responsive-logout
design-doc: docs/superpowers/specs/2026-07-10-workers-d1-responsive-logout-design.md
base-ref: ea983ac3d69129586660b598c9239c971022ace8
---

# Workers + D1 迁移与响应式登出 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将项目从 Cloudflare Pages Functions + 阿里云 OSS 迁移为标准 Cloudflare Workers + D1，首页改造为响应式多列布局并接入登出入口。

**Architecture:** 单一 Worker 入口 `src/worker.js` 统一处理 `/api/*` 与静态资源（`env.ASSETS.fetch`）；D1 库 `common` 的 `app_config` 单行 JSON 快照替代 OSS 整存整取；前端通过媒体查询实现桌面多列、移动单列，header 增加登出按钮。

**Tech Stack:** Cloudflare Workers (module syntax, `export default { fetch }`)、D1 (SQLite)、Static Assets binding、Web Crypto API (HMAC-SHA256)、原生 HTML/CSS/JS（无构建）。

## Global Constraints

- 兼容性日期：`compatibility_date: "2026-07-10"`，`compatibility_flags: ["nodejs_compat"]`
- D1 binding 名固定为 `DB`，库名 `common`，库 id `d7e31a71-e897-4e17-92fb-394b4c73ae3f`
- 静态资源目录固定为 `./public`（非 `.`），binding 名 `ASSETS`
- 会话 cookie 名固定为 `cd_session`，属性 `HttpOnly; Secure; SameSite=Strict; Path=/`，登录 `Max-Age=86400`，登出 `Max-Age=0`
- 静态配置 `holidayFreeNames` 固定值 `["春节","清明节","劳动节","国庆节"]`
- 节假日上游固定 `https://api.jiejiariapi.com/v1/holidays/:year`，Cache-Control 固定 `public, max-age=3600, s-maxage=3600`
- 配置 JSON 结构固定 `{ version: 1, events: [...], holidayMeta: {...} }`，空库默认值 `{ version: 1, events: [], holidayMeta: {} }`
- 源码中不得出现 `OSS`、`aliyuncs`、`aliyun_v4` 任何匹配（最终验证项）
- 前端 `APIClient` 的 `GET/PUT /api/data` 契约不变，D1 迁移对前端透明
- 提交规范：每个任务独立 commit，信息使用 `feat:`/`chore:`/`refactor:` 前缀
- 无单元测试框架：本项目为纯静态 + Worker，无 `package.json` 测试脚本。验证方式为 `wrangler dev` 端到端手动验证（集中在 Task 9）。因此 Task 1–8 的「测试」步骤为「本地语法/逻辑自检 + 提交」，不写自动化测试代码。

---

## 文件结构

### 新建
- `schema.sql` — D1 建表 SQL，单文件，定义 `app_config` 表
- `src/worker.js` — 唯一 Worker 入口，整合路由 + 会话工具 + 全部 6 端点 + 鉴权守卫（单文件，与原 `functions/api/_utils.js` + 6 个 handler + `_middleware.js` 合并）

### 重写
- `wrangler.jsonc` — 配置 `main`/`assets`/`d1_databases`/`compatibility_flags`/`observability`
- `README.md` — 改为 Workers + D1 部署说明，删除 OSS/build.sh 描述

### 修改（前端）
- `public/index.html` — header `.header-actions` 增加登出按钮
- `public/css/fluffy.css` — 放宽 `.cream-canvas` max-width、桌面固定卡片 3 列、`.revealed-list` 居中、登出按钮样式
- `public/js/home.js` — `bindHeaderActions` 绑定登出点击
- `public/js/card-render.js` — `renderFixed` 固定卡片标题 `h3` → `h2`
- `public/js/store.js` — 注释 OSS 措辞改 D1/后端，逻辑不变
- `public/js/api-client.js` — 文件头注释去 OSS 化，逻辑不变

### 删除
- `functions/` 整个目录（`_middleware.js`、`api/_utils.js`、`api/config.js`、`api/data.js`、`api/holidays/[year].js`、`api/login.js`、`api/logout.js`、`api/session.js`）

---

## Task 1: 新建 D1 schema.sql

**Files:**
- Create: `schema.sql`

**Interfaces:**
- Produces: `app_config` 表（列 `id INTEGER PRIMARY KEY DEFAULT 1`、`data TEXT NOT NULL`、`updated_at TEXT`），供 Task 4 的 Worker 与 Task 9 的用户建表命令使用

- [ ] **Step 1: 新建 schema.sql**

```sql
CREATE TABLE IF NOT EXISTS app_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  data TEXT NOT NULL,
  updated_at TEXT
);
```

- [ ] **Step 2: 自检 SQL 语义**

确认：`id` 默认 1、`data` 非空、`updated_at` 允许空、`IF NOT EXISTS` 可重复执行。与 event-storage spec 的「表结构」scenario 一致。

- [ ] **Step 3: 提交**

```bash
git add schema.sql
git commit -m "feat: 新增 D1 app_config 表 schema.sql"
```

---

## Task 2: 新建 src/worker.js — 会话工具与路由骨架

**Files:**
- Create: `src/worker.js`

**Interfaces:**
- Consumes: Task 1 的 `app_config` 表结构（本任务尚未使用，Task 4 用）
- Produces: `export default { fetch }` 入口；内部函数 `parseCookie`、`base64urlEncode`、`base64urlDecode`、`createSession`、`verifySession`（从原 `functions/api/_utils.js` 原样迁移）；`handleApi(request, env)` 路由分发器；`jsonResponse(body, status, extraHeaders)` 工具函数。后续 Task 3、4、5 在此文件内追加 handler。

- [ ] **Step 1: 新建 src/worker.js 文件头与工具函数**

创建 `src/worker.js`，写入会话工具函数（从 `functions/api/_utils.js` 原样迁移，无逻辑改动）：

```javascript
/**
 * Cloudflare Workers 入口 — 统一处理 /api/* 与静态资源
 */

/**
 * Parse Cookie header into key-value object
 */
function parseCookie(cookieHeader) {
  const obj = {};
  if (!cookieHeader) return obj;
  cookieHeader.split(';').forEach(pair => {
    const parts = pair.trim().split('=');
    if (parts.length >= 2) {
      obj[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
  });
  return obj;
}

/**
 * Base64url encode (URL-safe, no padding)
 */
function base64urlEncode(buf) {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Base64url decode
 */
function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binaryStr = atob(str);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  return bytes;
}

/**
 * Create signed session token
 * payload: { exp: number, v: number }
 * Returns: "base64url(payload).base64url(hmac)"
 */
async function createSession(payload, secret) {
  const payloadStr = JSON.stringify(payload);
  const payloadBytes = new TextEncoder().encode(payloadStr);
  const payloadB64 = base64urlEncode(payloadBytes);

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  const sigB64 = base64urlEncode(sig);

  return payloadB64 + '.' + sigB64;
}

/**
 * Verify and decode session token
 * Returns: payload object | null
 */
async function verifySession(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, sigB64] = parts;

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const expectedSig = base64urlDecode(sigB64);
  const valid = await crypto.subtle.verify('HMAC', key, expectedSig, new TextEncoder().encode(payloadB64));
  if (!valid) return null;

  try {
    const decoded = base64urlDecode(payloadB64);
    const payloadStr = new TextDecoder().decode(decoded);
    const payload = JSON.parse(payloadStr);

    if (payload.exp && Date.now() > payload.exp) return null;

    return payload;
  } catch (e) {
    return null;
  }
}

/**
 * 统一 JSON 响应工具
 */
function jsonResponse(body, status, extraHeaders) {
  const headers = { 'Content-Type': 'application/json' };
  if (extraHeaders) Object.assign(headers, extraHeaders);
  return new Response(JSON.stringify(body), { status, headers });
}
```

- [ ] **Step 2: 追加 fetch 入口与 handleApi 路由骨架**

在文件末尾追加：

```javascript
const SESSION_COOKIE_ATTRS = 'HttpOnly; Secure; SameSite=Strict; Path=/';

// 受保护端点：除以下公开路径外，均需会话校验
const PUBLIC_API_PATHS = ['/api/login', '/api/logout', '/api/session', '/api/config'];

/**
 * 会话鉴权守卫：受保护端点校验 cd_session
 * 返回 { payload } 通过；返回 { response } 拒绝（401/500）
 */
async function requireSession(request, env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET === '') {
    return { response: jsonResponse({ error: 'configuration error' }, 500) };
  }
  const cookie = parseCookie(request.headers.get('Cookie') || '');
  const token = cookie.cd_session;
  const payload = await verifySession(token, env.SESSION_SECRET);
  if (!payload) {
    return { response: jsonResponse({ error: 'unauthorized' }, 401) };
  }
  return { payload };
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method;

  // 公开端点：仅 login/logout/session/config，其余 /api/ 均需会话
  const isPublic = PUBLIC_API_PATHS.some(
    p => pathname === p || pathname.startsWith(p + '/')
  );

  // 公开端点直接路由
  if (isPublic) {
    if (pathname === '/api/login' && method === 'POST') return handleLogin(request, env);
    if (pathname === '/api/logout' && method === 'POST') return handleLogout();
    if (pathname === '/api/session' && method === 'GET') return handleSession(request, env);
    if (pathname === '/api/config' && method === 'GET') return handleConfig();
    return jsonResponse({ error: 'not found' }, 404);
  }

  // 受保护端点统一校验
  const guard = await requireSession(request, env);
  if (guard.response) return guard.response;

  // /api/holidays/:year —— 受保护，需会话后匹配
  const holidaysMatch = pathname.match(/^\/api\/holidays\/([^/]+)$/);
  if (holidaysMatch && method === 'GET') return handleHolidays(holidaysMatch[1]);
  if (pathname === '/api/data' && method === 'GET') return handleGetData(env);
  if (pathname === '/api/data' && method === 'PUT') return handlePutData(request, env);

  return jsonResponse({ error: 'not found' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env);
    }
    return env.ASSETS.fetch(request);
  }
};
```

说明：`handleLogin`/`handleLogout`/`handleSession`/`handleConfig`/`handleHolidays`/`handleGetData`/`handlePutData` 将在 Task 3、4 实现。本步骤先不引用未定义函数会导致运行时报错，但本任务结束时这些 handler 会全部补齐；为保持文件可加载，本任务的 Step 2 先写入上述骨架，紧接着在 Task 3/4 补齐 handler。**此任务暂不验证启动，仅保证语法正确。**

- [ ] **Step 3: 语法自检**

用 node 检查语法（不执行）：

```bash
node --check src/worker.js
```

预期：无输出、退出码 0。若报 `handleLogin is not defined` 属运行期错误而非语法错误，`--check` 不触发。语法层面必须通过。

- [ ] **Step 4: 提交**

```bash
git add src/worker.js
git commit -m "feat: 新建 src/worker.js 会话工具与路由骨架"
```

---

## Task 3: 实现 src/worker.js 端点（login/logout/session/config 公开 + holidays 受保护）

**Files:**
- Modify: `src/worker.js`（在 `export default` 之前追加 5 个 handler）

**Interfaces:**
- Consumes: Task 2 的 `parseCookie`、`verifySession`、`createSession`、`jsonResponse`、`SESSION_COOKIE_ATTRS`
- Produces: `handleLogin(request, env)`、`handleLogout()`、`handleSession(request, env)`、`handleConfig()`、`handleHolidays(yearParam)`，行为与原 `functions/api/login.js`、`logout.js`、`session.js`、`config.js`、`holidays/[year].js` 逐字等价

- [ ] **Step 1: 追加 login handler**

在 `src/worker.js` 的 `SESSION_COOKIE_ATTRS` 常量之后、`requireSession` 之前追加：

```javascript
async function handleLogin(request, env) {
  if (!env.PASSWORD || env.PASSWORD === '') {
    return jsonResponse({ ok: false, error: '配置错误' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ ok: false, error: '请求格式错误' }, 400);
  }

  const input = body.password || '';

  // 常量时间比较
  const encoder = new TextEncoder();
  const inputBuf = encoder.encode(input);
  const passBuf = encoder.encode(env.PASSWORD);

  if (inputBuf.byteLength !== passBuf.byteLength) {
    return jsonResponse({ ok: false, error: '密码错误' }, 401);
  }

  let equal = 0;
  for (let i = 0; i < inputBuf.byteLength; i++) {
    equal |= inputBuf[i] ^ passBuf[i];
  }

  if (equal !== 0) {
    return jsonResponse({ ok: false, error: '密码错误' }, 401);
  }

  if (!env.SESSION_SECRET || env.SESSION_SECRET === '') {
    return jsonResponse({ ok: false, error: '配置错误' }, 500);
  }

  const payload = { exp: Date.now() + 86400000, v: 1 };
  const token = await createSession(payload, env.SESSION_SECRET);

  return jsonResponse({ ok: true }, 200, {
    'Set-Cookie': `cd_session=${token}; ${SESSION_COOKIE_ATTRS}; Max-Age=86400`
  });
}
```

- [ ] **Step 2: 追加 logout handler**

```javascript
function handleLogout() {
  return jsonResponse({ ok: true }, 200, {
    'Set-Cookie': `cd_session=; ${SESSION_COOKIE_ATTRS}; Max-Age=0`
  });
}
```

- [ ] **Step 3: 追加 session handler**

```javascript
async function handleSession(request, env) {
  const guard = await requireSession(request, env);
  if (guard.response) return guard.response;
  return jsonResponse({ authed: true }, 200);
}
```

注意：`requireSession` 复用同一鉴权逻辑，但 spec 要求 `/api/session` 无效时返回 401 `{ error: "unauthorized" }` 且 SECRET 缺失返回 500，与 `requireSession` 行为完全一致，故直接复用。`/api/session` 已在 `PUBLIC_API_PATHS`，守卫由 handler 自身调用。

- [ ] **Step 4: 追加 config handler**

```javascript
function handleConfig() {
  const config = {
    holidayFreeNames: ['春节', '清明节', '劳动节', '国庆节']
  };
  return jsonResponse(config, 200, {
    'Cache-Control': 'public, max-age=3600, s-maxage=3600'
  });
}
```

- [ ] **Step 5: 追加 holidays handler**

```javascript
async function handleHolidays(yearParam) {
  const year = /^\d{4}$/.test(yearParam) ? yearParam : String(new Date().getFullYear());
  const upstreamUrl = `https://api.jiejiariapi.com/v1/holidays/${year}`;

  let upstream;
  try {
    upstream = await fetch(upstreamUrl);
  } catch (e) {
    return jsonResponse({ error: '上游服务不可用' }, 502);
  }

  const body = await upstream.text();

  return new Response(body, {
    status: upstream.status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600'
    }
  });
}
```

- [ ] **Step 6: 语法自检**

```bash
node --check src/worker.js
```

预期：退出码 0，无输出。

- [ ] **Step 7: 提交**

```bash
git add src/worker.js
git commit -m "feat: 实现 login/logout/session/config/holidays 端点"
```

---

## Task 4: 实现 src/worker.js D1 数据端点（GET/PUT /api/data）

**Files:**
- Modify: `src/worker.js`（在 `handleHolidays` 之后、`export default` 之前追加 `handleGetData`、`handlePutData`）

**Interfaces:**
- Consumes: Task 2 的 `requireSession`、`jsonResponse`；Task 1 的 `app_config` 表（`id`、`data`、`updated_at`）；D1 binding `env.DB`
- Produces: `handleGetData(env)` 返回存储 JSON 或默认空配置；`handlePutData(request, env)` UPSERT id=1 返回 `{ ok: true }`

- [ ] **Step 1: 追加 handleGetData**

在 `src/worker.js` 的 `handleHolidays` 函数之后追加：

```javascript
const DEFAULT_CONFIG = { version: 1, events: [], holidayMeta: {} };

async function handleGetData(env) {
  try {
    const result = await env.DB.prepare('SELECT data FROM app_config WHERE id = 1').first();
    if (!result) {
      return jsonResponse(DEFAULT_CONFIG, 200);
    }
    return new Response(result.data, {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    // 表不存在等异常：降级返回默认空配置
    return jsonResponse(DEFAULT_CONFIG, 200);
  }
}
```

说明：`result.data` 是 D1 行的 `data` 列原文（已是 JSON 字符串），直接作为 Response body 返回，避免二次 `JSON.parse/stringify`。空库（无 id=1 行）返回默认空配置，符合 event-storage spec「首次读取空库」scenario。异常降级也返回默认配置，保持前端可用。

- [ ] **Step 2: 追加 handlePutData**

```javascript
async function handlePutData(request, env) {
  const body = await request.text();
  const updatedAt = new Date().toISOString();

  try {
    await env.DB.prepare(
      'INSERT INTO app_config (id, data, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
    ).bind(body, updatedAt).run();
    return jsonResponse({ ok: true }, 200);
  } catch (e) {
    return jsonResponse({ ok: false, error: '写入失败' }, 500);
  }
}
```

说明：`body` 为请求体原文字符串直接存入 `data` 列（整存整取，前端无感知）。UPSERT 语义保证单行。`updated_at` 用 ISO 8601 UTC。`/api/data` 的鉴权已在 Task 2 的 `handleApi` 中由 `requireSession` 统一完成，handler 内不再重复校验。

- [ ] **Step 3: 语法自检**

```bash
node --check src/worker.js
```

预期：退出码 0。

- [ ] **Step 4: 提交**

```bash
git add src/worker.js
git commit -m "feat: 实现 GET/PUT /api/data D1 读写端点"
```

---

## Task 5: 重写 wrangler.jsonc

**Files:**
- Modify: `wrangler.jsonc`

**Interfaces:**
- Consumes: Task 2 的 `src/worker.js`（`main`）、`./public` 静态目录（`assets`）、D1 库信息
- Produces: 可被 `wrangler dev`/`wrangler deploy` 加载的有效配置，binding `ASSETS`、`DB` 可用

- [ ] **Step 1: 重写 wrangler.jsonc 全文**

将 `wrangler.jsonc` 内容整体替换为：

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "timer",
  "main": "src/worker.js",
  "compatibility_date": "2026-07-10",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "./public",
    "binding": "ASSETS"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "common",
      "database_id": "d7e31a71-e897-4e17-92fb-394b4c73ae3f"
    }
  ],
  "observability": {
    "enabled": true
  }
}
```

- [ ] **Step 2: 配置自检**

逐项核对：`main` 指向 `src/worker.js`；`assets.directory` 为 `./public`（非 `.`，避免暴露 `src/`、`openspec/`）；`assets.binding` 为 `ASSETS`；`d1_databases[0].binding` 为 `DB`、`database_name` 为 `common`、`database_id` 为 `d7e31a71-e897-4e17-92fb-394b4c73ae3f`；`compatibility_flags` 含 `nodejs_compat`；`observability.enabled` 为 true。

- [ ] **Step 3: 提交**

```bash
git add wrangler.jsonc
git commit -m "feat: 重写 wrangler.jsonc 为 Workers + Static Assets + D1 配置"
```

---

## Task 6: 删除 functions/ 目录

**Files:**
- Delete: `functions/`（整个目录：`_middleware.js`、`api/_utils.js`、`api/config.js`、`api/data.js`、`api/holidays/[year].js`、`api/login.js`、`api/logout.js`、`api/session.js`）

**Interfaces:**
- Produces: 源码树中不再有 Pages Functions 路由，`wrangler dev` 路由全部由 `src/worker.js` 接管

- [ ] **Step 1: 删除 functions 目录**

```bash
git rm -r functions
```

预期输出：列出被删除的文件（`functions/_middleware.js`、`functions/api/_utils.js` 等）。

- [ ] **Step 2: 确认无残留**

```bash
ls functions 2>/dev/null || echo "functions 目录已删除"
```

预期：`functions 目录已删除`。

- [ ] **Step 3: 提交**

```bash
git commit -m "refactor: 删除 Pages Functions 目录，路由统一由 Worker 接管"
```

---

## Task 7: 前端响应式与登出入口（HTML + CSS + JS）

**Files:**
- Modify: `public/index.html`（header `.header-actions` 加登出按钮）
- Modify: `public/css/fluffy.css`（`.cream-canvas` max-width、桌面 3 列、`.revealed-list` 居中、登出按钮样式）
- Modify: `public/js/home.js`（`bindHeaderActions` 绑定登出）
- Modify: `public/js/card-render.js`（`renderFixed` 标题 `h3` → `h2`）

**Interfaces:**
- Consumes: `AccessGate.logout()`（已存在于 `public/js/access-gate.js`，无需修改）
- Produces: `#logout-btn` 元素与点击行为；桌面端固定卡片 3 列网格；固定卡片标题使用 `<h2>` 以命中 `.feature-card h2 { font-size: clamp(28px,5vw,48px) }`

- [ ] **Step 1: index.html header 加登出按钮**

在 `public/index.html` 的 `.header-actions` 内、`sync-btn` 之后追加登出按钮。将：

```html
      <div class="header-actions">
        <button class="soft-icon-button" id="add-event-btn" aria-label="添加事件">+</button>
        <button class="soft-icon-button" id="sync-btn" aria-label="同步" title="同步到云端">☁</button>
      </div>
```

替换为：

```html
      <div class="header-actions">
        <button class="soft-icon-button" id="add-event-btn" aria-label="添加事件">+</button>
        <button class="soft-icon-button" id="sync-btn" aria-label="同步" title="同步到云端">☁</button>
        <button class="logout-button" id="logout-btn" type="button" aria-label="登出" title="登出">
          <span class="logout-label">登出</span>
        </button>
      </div>
```

- [ ] **Step 2: fluffy.css 放宽 .cream-canvas max-width**

将 `.cream-canvas` 的 `max-width: 720px;` 改为桌面放宽。找到：

```css
.cream-canvas {
  position: relative;
  z-index: 1;
  max-width: 720px;
  min-height: 100vh;
  margin: 0 auto;
  padding: 16px;
}
```

替换为：

```css
.cream-canvas {
  position: relative;
  z-index: 1;
  max-width: 1200px;
  min-height: 100vh;
  margin: 0 auto;
  padding: 16px;
}
```

- [ ] **Step 3: fluffy.css 桌面固定卡片改 3 列**

找到现有的桌面媒体查询：

```css
@media (min-width: 1025px) {
  .fixed-card-stage {
    grid-template-columns: repeat(2, minmax(260px, 1fr));
  }
}
```

替换为：

```css
@media (min-width: 1025px) {
  .fixed-card-stage {
    grid-template-columns: repeat(3, minmax(260px, 1fr));
  }
}
```

- [ ] **Step 4: fluffy.css 清单区居中限宽**

找到清单区样式（约第 318 行）：

```css
.revealed-list { display: grid; gap: 12px; padding-bottom: 24px; }
```

替换为：

```css
.revealed-list { display: grid; gap: 12px; padding-bottom: 24px; max-width: 960px; margin: 0 auto; }
```

- [ ] **Step 5: fluffy.css 登出按钮样式**

在 `.ghost-fluff { padding: 0 14px; }` 这一行之后追加登出按钮样式：

```css
.logout-button {
  display: grid;
  place-items: center;
  padding: 0 14px;
  border: none;
  border-radius: var(--radius);
  background: transparent;
  color: #936c31;
  font-weight: 900;
  cursor: pointer;
  transition: transform 0.18s ease;
}

.logout-button:hover { transform: translateY(-2px); }
```

并在 `@media (max-width: 640px)` 块内追加（移动端隐藏文字、显示图标）。先找到该媒体块内已有的 `.header-actions { width: 100%; }` 这一行，在其后追加：

```css
  .logout-button .logout-label { display: none; }
  .logout-button::before { content: "⏻"; font-size: 18px; }
```

说明：`⏻`（电源符号 U+23FB）作为移动端登出图标；桌面端显示「登出」文字。如果该媒体块中 `.header-actions { width: 100%; }` 之后紧跟 `.primary-fluff { min-width: 0; }`，则插入位置在两者之间。

- [ ] **Step 6: card-render.js renderFixed 标题 h3 → h2**

在 `public/js/card-render.js` 的 `renderFixed` 函数内，将固定卡片标题元素从 `h3` 改为 `h2`。找到（约第 170 行）：

```javascript
      var title = document.createElement('h3');
      title.textContent = card.title || card.name || '未命名';
      info.appendChild(title);
```

替换为：

```javascript
      var title = document.createElement('h2');
      title.textContent = card.title || card.name || '未命名';
      info.appendChild(title);
```

注意：只改 `renderFixed` 内的这一处。`createCard`（列表卡片）内的 `h3` 保持不变（设计文档只要求固定卡片大字号生效）。

- [ ] **Step 7: home.js bindHeaderActions 绑定登出**

在 `public/js/home.js` 的 `bindHeaderActions` 函数内，`syncBtn` 绑定之后追加登出绑定。找到：

```javascript
    var syncBtn = document.getElementById('sync-btn');
    if (syncBtn) {
      syncBtn.addEventListener('click', function () {
        loadAndRender();
        showToast('已重新同步');
      });
    }
  }
```

替换为：

```javascript
    var syncBtn = document.getElementById('sync-btn');
    if (syncBtn) {
      syncBtn.addEventListener('click', function () {
        loadAndRender();
        showToast('已重新同步');
      });
    }

    var logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        if (window.AccessGate && window.AccessGate.logout) {
          window.AccessGate.logout().finally(function () {
            window.location.href = '/password.html';
          });
        } else {
          window.location.href = '/password.html';
        }
      });
    }
  }
```

说明：用 `.finally` 确保无论 `/api/logout` 成功或失败都跳转。`AccessGate.logout` 已清 cookie 与本地 sessionStorage 标记。

- [ ] **Step 8: 自检改动**

```bash
node --check public/js/home.js
node --check public/js/card-render.js
```

预期：均退出码 0（这些是浏览器脚本，`node --check` 仅校验语法）。

- [ ] **Step 9: 提交**

```bash
git add public/index.html public/css/fluffy.css public/js/home.js public/js/card-render.js
git commit -m "feat: 响应式首页桌面 3 列与登出入口"
```

---

## Task 8: 去 OSS 化（store.js / api-client.js 注释）+ 重写 README.md

**Files:**
- Modify: `public/js/store.js`（注释 OSS → D1/后端，逻辑不变）
- Modify: `public/js/api-client.js`（文件头注释去 OSS）
- Modify: `README.md`（全文重写为 Workers + D1）

**Interfaces:**
- Produces: 源码中无 `OSS`/`aliyuncs`/`aliyun_v4` 字样（Task 9 最终 grep 验证）；README 反映新架构

- [ ] **Step 1: store.js 注释去 OSS 化**

`public/js/store.js` 中多处注释提到 OSS。逐一修改（逻辑代码不动）：

a) 第 11 行注释 `let customEvents = []; // 自定义事件（来自 OSS）` 改为：
```javascript
  let customEvents = []; // 自定义事件（来自后端 D1）
```

b) 第 22 行注释 `// 1. 从 OSS 读取自定义事件和节假日元数据` 改为：
```javascript
      // 1. 从后端 D1 读取自定义事件和节假日元数据
```

c) 三处 `// 写回 OSS` 注释（`add`/`update`/`remove`/`togglePin`/`reorder` 内各一处，共 5 处）改为 `// 写回后端 D1`。

d) `persistToOSS` 函数名及注释块。找到：

```javascript
  /**
   * 持久化到 OSS（内部辅助函数）
   * @returns {Promise<void>}
   */
  async function persistToOSS() {
```

改为：

```javascript
  /**
   * 持久化到后端 D1（内部辅助函数）
   * @returns {Promise<void>}
   */
  async function persistToDB() {
```

并在 5 处调用点 `await persistToOSS();` 改为 `await persistToDB();`（`add`、`update`、`remove`、`togglePin`、`reorder` 各一处）。

说明：函数改名是安全的——它是模块内部闭包函数，未通过 `window.EventStore` 导出，外部无引用。逻辑完全不变。

- [ ] **Step 2: api-client.js 文件头注释去 OSS 化**

`public/js/api-client.js` 第 1–5 行文件头注释：

```javascript
/**
 * API 客户端模块
 * 通过 Cloudflare Pages Functions 代理 OSS 数据读写
 * 替代旧的 aliyun-oss-sdk 直接调用方式
 */
```

改为：

```javascript
/**
 * API 客户端模块
 * 通过 Cloudflare Workers 端点读写 D1 存储的事件配置
 */
```

说明：`read`/`write` 函数逻辑不变，仍调用 `GET/PUT /api/data`。

- [ ] **Step 3: 重写 README.md 全文**

将 `README.md` 整体替换为：

```markdown
# 时光倒计时

一个基于 Cloudflare Workers + D1 的倒计时应用，采用 Fluffy 毛玻璃新拟态设计风格。

## 技术特性

- **Cloudflare Workers**：单 Worker 入口统一处理 API 与静态资源
- **D1 存储**：事件配置以单行 JSON 快照存于 D1 `app_config` 表
- **静态资源**：通过 Workers Static Assets binding 从 `./public` 提供，无构建打包
- **密码保护**：单密码访问，HMAC-SHA256 签名的 HttpOnly cookie 会话
- **农历支持**：使用 lunar-javascript 库支持农历日期转换
- **响应式设计**：桌面多列网格、移动单栏

## 项目结构

```
├── public/             # 静态资源根目录（由 ASSETS binding 提供）
│   ├── index.html
│   ├── password.html
│   ├── css/fluffy.css
│   └── js/            # 前端模块
├── src/
│   └── worker.js      # Workers 入口：路由 + 会话 + 全部端点
├── schema.sql          # D1 建表 SQL
├── wrangler.jsonc      # Workers 配置
├── docs/              # 文档与设计原型
└── openspec/          # OpenSpec 规格文档
```

## API 端点

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | /api/login | 公开 | 常量时间密码比较，签发 24h 会话 cookie |
| POST | /api/logout | 公开 | 清除会话 cookie |
| GET | /api/session | 公开 | 校验会话有效性 |
| GET | /api/config | 公开 | 静态配置（holidayFreeNames） |
| GET | /api/data | 需会话 | 读取 D1 中 id=1 的整份配置 JSON |
| PUT | /api/data | 需会话 | UPSERT id=1 的整份配置 JSON |
| GET | /api/holidays/:year | 需会话 | 代理 jiejiariapi，透传响应 |

## 部署配置

### 1. 创建 D1 数据库（如尚未创建）

```bash
wrangler d1 create common
```

将返回的 `database_id` 填入 `wrangler.jsonc`（当前已配置为 `d7e31a71-e897-4e17-92fb-394b4c73ae3f`）。

### 2. 应用 schema

```bash
wrangler d1 execute common --remote --file=schema.sql
```

### 3. 配置 Secrets

```bash
wrangler secret put PASSWORD
wrangler secret put SESSION_SECRET
```

- `PASSWORD`：访问密码
- `SESSION_SECRET`：会话签名密钥（任意随机长字符串）

### 4. 部署

```bash
wrangler deploy
```

## 本地开发

```bash
wrangler dev
```

首次需对本地 D1 应用 schema：

```bash
wrangler d1 execute common --local --file=schema.sql
```

## CDN 依赖

- **lunar-javascript** v1.6.12：农历日期转换（CDN 引入，无构建）

## 许可证

MIT
```

- [ ] **Step 4: 源码 OSS 残留自检**

```bash
grep -rn -i "OSS\|aliyuncs\|aliyun_v4\|aliyun-oss" public src schema.sql wrangler.jsonc README.md
```

预期：无任何匹配输出（退出码 1）。若仍有匹配，回到 Step 1/2 修正。

- [ ] **Step 5: 语法自检**

```bash
node --check public/js/store.js
node --check public/js/api-client.js
```

预期：均退出码 0。

- [ ] **Step 6: 提交**

```bash
git add public/js/store.js public/js/api-client.js README.md
git commit -m "refactor: 去 OSS 化注释与 README，迁移描述为 Workers+D1"
```

---

## Task 9: 用户验证（建表 + wrangler dev 端到端）

**Files:**
- 无文件改动（本任务为手动验证，对应 tasks.md 第 5 节）

**Interfaces:**
- Consumes: Task 1–8 全部产物

**前置说明：** 本任务由用户在本地执行。Agent 完成后向用户给出以下操作清单并等待确认。验证项对应 OpenSpec delta specs 的全部 scenario。

- [ ] **Step 1: 用户执行远程建表**

提示用户运行：

```bash
wrangler d1 execute common --remote --file=schema.sql
```

预期：输出 `CREATE TABLE` 执行成功。验证 event-storage spec「表结构」scenario。

- [ ] **Step 2: 用户配置 Secrets（如尚未配置）**

```bash
wrangler secret put PASSWORD
wrangler secret put SESSION_SECRET
```

- [ ] **Step 3: 用户启动 wrangler dev**

```bash
wrangler dev
```

预期：Worker 本地启动，输出本地 URL（如 `http://localhost:8787`）。

- [ ] **Step 4: 验证未登录跳转（countdown-ui「未登录访问主页」scenario）**

浏览器访问 `http://localhost:8787/`。

预期：跳转至 `/password.html`。

- [ ] **Step 5: 验证登录流程（countdown-api「正确密码登录」scenario）**

在 `/password.html` 输入正确密码登录。

预期：cookie `cd_session` 写入（DevTools 可见，HttpOnly），跳回 `/`，卡片渲染。桌面端固定卡片区显示 3 列网格，移动端单列。

- [ ] **Step 6: 验证数据持久化（event-storage「写入配置」「读取已有配置」scenario）**

新增 → 编辑 → 删除一个事件，每次操作后刷新页面。

预期：数据保留（D1 持久化成功）。

- [ ] **Step 7: 验证登出（countdown-ui「登出操作」「登出后无法直接访问主页」scenario）**

点击 header「登出」按钮。

预期：跳转 `/password.html`；直接访问 `http://localhost:8787/` 被拦截回 `/password.html`。

- [ ] **Step 8: 验证无 OSS 残留（event-storage「代码库无 OSS 残留」scenario）**

```bash
grep -rn -i "OSS\|aliyuncs\|aliyun_v4\|aliyun-oss" public src schema.sql wrangler.jsonc README.md
```

预期：无任何匹配。

- [ ] **Step 9: 全部验证通过后提交验证记录说明**

本步骤无代码改动。若前面 Task 1–8 均已提交，此处无需额外 commit。向用户确认「验证全部通过」后，本计划实施完成。

---

## Self-Review 结论

**1. Spec coverage 核查：**
- countdown-api 全部 7 个 Requirement（Workers 单入口路由、API 会话鉴权、登录、登出、会话校验、静态配置、节假日代理）→ Task 2/3/4 + Task 6（删 functions）+ Task 5（wrangler）。覆盖。
- countdown-ui 全部 4 个 Requirement（响应式布局、登出入口、会话守卫、数据兼容）→ Task 7（响应式 + 登出 + h2）、Task 8（数据兼容性注释不改逻辑）。会话守卫由现有 `access-gate.js requireAuth` 实现，设计文档明确不改，无需新任务。覆盖。
- event-storage 全部 4 个 Requirement（单表 JSON 快照、配置读取、配置写入、无 OSS 依赖）→ Task 1（schema）、Task 4（GET/PUT）、Task 6（删 OSS data.js）、Task 8（去 OSS 注释 + grep 验证）。覆盖。
- tasks.md 1–5 节全部对应 Task 1–9。覆盖。

**2. Placeholder 扫描：** 无 TBD/TODO/「适当处理」，所有代码步骤含完整代码，所有命令含预期输出。

**3. 类型/命名一致性：**
- `SESSION_COOKIE_ATTRS` 在 Task 2 定义、Task 3 login/logout 使用，一致。
- `requireSession` 在 Task 2 定义、Task 3 session handler 与 Task 4 之前的 `handleApi`（Task 2 已写）调用，签名一致（返回 `{ payload }` 或 `{ response }`）。
- `handleLogin`/`handleLogout`/`handleSession`/`handleConfig`/`handleHolidays`/`handleGetData`/`handlePutData` 在 Task 2 的 `handleApi` 中被引用，Task 3/4 定义，命名完全一致。
- `DEFAULT_CONFIG` 在 Task 4 定义并使用，一致。
- 前端 `persistToOSS` → `persistToDB` 改名后 5 处调用点同步更新，一致。
- `#logout-btn` id 在 HTML（Task 7 Step 1）与 home.js（Task 7 Step 7）一致。

计划已就绪。
