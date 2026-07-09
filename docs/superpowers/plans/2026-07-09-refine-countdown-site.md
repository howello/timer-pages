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

**Files:**
- Create: `E:\howe\倒计时\functions\api\_utils.js`

**Interfaces:**
- Produces: `parseCookie(cookieHeader)` → `{ key: value }`, `base64urlEncode(buf)`, `base64urlDecode(str)`, `arrayBufferToHex(buf)`, `createSession(payload, secret)`, `verifySession(token, secret)` → `payload|null`

**Step 1: Create `functions/api/_utils.js`**

```js
/**
 * Cloudflare Pages Functions — 公共工具函数
 */

/**
 * Parse Cookie header into key-value object
 */
export function parseCookie(cookieHeader) {
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
export function base64urlEncode(buf) {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Base64url decode
 */
export function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binaryStr = atob(str);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  return bytes;
}

/**
 * Convert ArrayBuffer to hex string
 */
export function arrayBufferToHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create signed session token
 * payload: { exp: number, v: number }
 * Returns: "base64url(payload).base64url(hmac)"
 */
export async function createSession(payload, secret) {
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
export async function verifySession(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, sigB64] = parts;

  // Verify signature
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const expectedSig = base64urlDecode(sigB64);
  const valid = await crypto.subtle.verify('HMAC', key, expectedSig, new TextEncoder().encode(payloadB64));
  if (!valid) return null;

  // Decode payload
  try {
    const decoded = base64urlDecode(payloadB64);
    const payloadStr = new TextDecoder().decode(decoded);
    const payload = JSON.parse(payloadStr);

    // Check expiry
    if (payload.exp && Date.now() > payload.exp) return null;

    return payload;
  } catch (e) {
    return null;
  }
}
```

- [ ] **Step 1.1**: Create `functions/api/_utils.js` with the above content
- [ ] **Step 1.2**: Commit: `git add functions/api/_utils.js && git commit -m "feat: add Cloudflare Pages Functions utility functions (session HMAC, base64url, cookie parsing)"`

---

### Task 2: Cloudflare Pages Functions — login/logout/session

**Files:**
- Create: `E:\howe\倒计时\functions\api\login.js`
- Create: `E:\howe\倒计时\functions\api\logout.js`
- Create: `E:\howe\倒计时\functions\api\session.js`

**Interfaces:**
- Consumes: `_utils.js` — `createSession`, `verifySession`, `parseCookie`
- Produces: POST `/api/login` → 200 + Set-Cookie, 401, 500; POST `/api/logout` → 200 + Clear-Cookie; GET `/api/session` → 200 `{authed: true}` | 401

**Step 2.1: Create `functions/api/login.js`**

```js
import { createSession } from './_utils.js';

export async function onRequestPost({ request, env }) {
  // Check if password is configured
  if (!env.PASSWORD || env.PASSWORD === '') {
    return new Response(JSON.stringify({ ok: false, error: '配置错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Parse request body
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: '请求格式错误' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const input = body.password || '';

  // Constant-time comparison
  const encoder = new TextEncoder();
  const inputBuf = encoder.encode(input);
  const passBuf = encoder.encode(env.PASSWORD);

  if (inputBuf.byteLength !== passBuf.byteLength) {
    return new Response(JSON.stringify({ ok: false, error: '密码错误' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let equal = 0;
  for (let i = 0; i < inputBuf.byteLength; i++) {
    equal |= inputBuf[i] ^ passBuf[i];
  }

  if (equal !== 0) {
    return new Response(JSON.stringify({ ok: false, error: '密码错误' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Create session
  const sessionSecret = env.SESSION_SECRET || 'fallback-secret-do-not-use-in-production';
  const payload = { exp: Date.now() + 86400000, v: 1 };
  const token = await createSession(payload, sessionSecret);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `cd_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`
    }
  });
}
```

**Step 2.2: Create `functions/api/logout.js`**

```js
export async function onRequestPost() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'cd_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'
    }
  });
}
```

**Step 2.3: Create `functions/api/session.js`**

```js
import { verifySession, parseCookie } from './_utils.js';

export async function onRequestGet({ request, env }) {
  const cookie = parseCookie(request.headers.get('Cookie') || '');
  const token = cookie.cd_session;
  const sessionSecret = env.SESSION_SECRET || 'fallback-secret-do-not-use-in-production';

  const payload = await verifySession(token, sessionSecret);
  if (!payload) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  return new Response(JSON.stringify({ authed: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

- [ ] **Step 2.1**: Create `functions/api/login.js`
- [ ] **Step 2.2**: Create `functions/api/logout.js`
- [ ] **Step 2.3**: Create `functions/api/session.js`
- [ ] **Step 2.4**: Commit: `git add functions/api/login.js functions/api/logout.js functions/api/session.js && git commit -m "feat: add login/logout/session Functions endpoints"`

---

### Task 3: Cloudflare Pages Functions — config + holidays proxy

**Files:**
- Create: `E:\howe\倒计时\functions\api\config.js`
- Create: `E:\howe\倒计时\functions\api\holidays\[year].js`

**Step 3.1: Create `functions/api/config.js`**

```js
export async function onRequestGet() {
  const config = {
    holidayFreeNames: ['春节', '清明节', '劳动节', '国庆节']
  };
  return new Response(JSON.stringify(config), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600'
    }
  });
}
```

**Step 3.2: Create `functions/api/holidays/[year].js`**

```js
export async function onRequestGet({ params }) {
  const year = /^\d{4}$/.test(params.year) ? params.year : String(new Date().getFullYear());
  const upstreamUrl = `https://api.jiejiariapi.com/v1/holidays/${year}`;

  let upstream;
  try {
    upstream = await fetch(upstreamUrl);
  } catch (e) {
    return new Response(JSON.stringify({ error: '上游服务不可用' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
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

- [ ] **Step 3.1**: Create `functions/api/config.js`
- [ ] **Step 3.2**: Create `functions/api/holidays/[year].js`
- [ ] **Step 3.3**: Commit: `git add functions/api/config.js "functions/api/holidays/[year].js" && git commit -m "feat: add config and holidays proxy Functions endpoints"`

---

### Task 4: Cloudflare Pages Functions — OSS data read/write

**Files:**
- Create: `E:\howe\倒计时\functions\api\data.js`

**Interfaces:**
- Consumes: `_utils.js` — `parseCookie`, `verifySession`, `arrayBufferToHex`
- Produces: GET `/api/data` → file JSON | empty config; PUT `/api/data` → `{ ok: true }`

**Step 4.1: Create `functions/api/data.js`**

```js
/**
 * OSS data read/write via Cloudflare Pages Functions
 * Uses Aliyun OSS V4 signature for REST API calls
 */

/**
 * Build OSS URL for the data file
 */
function buildOSSURL(env) {
  const region = env.OSS_REGION || 'oss-cn-hangzhou';
  const bucket = env.OSS_BUCKET || 'howe-file';
  const objectKey = env.OSS_OBJECT_KEY || 'countdown-data.json';
  return `https://${bucket}.${region}.aliyuncs.com/${objectKey}`;
}

/**
 * Calculate OSS V4 signature
 * Simplified implementation for GET and PUT requests
 */
async function signOSSRequest(method, url, env, body) {
  const accessKeyId = env.OSS_AK;
  const accessKeySecret = env.OSS_SK;
  const region = env.OSS_REGION || 'oss-cn-hangzhou';
  const bucket = env.OSS_BUCKET || 'howe-file';

  // Parse URL
  const urlObj = new URL(url);
  const objectKey = urlObj.pathname.substring(1); // Remove leading /

  // Date and time
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:-]/g, '').split('.')[0] + 'Z';
  const dateStrShort = dateStr.substring(0, 8); // YYYYMMDD

  // Headers
  const headers = {
    'host': urlObj.host,
    'x-oss-date': dateStr,
    'x-oss-content-sha256': 'UNSIGNED-PAYLOAD'
  };

  if (body) {
    headers['content-type'] = 'application/json';
  }

  // Canonical request
  const canonicalHeaders = Object.keys(headers).sort().map(k => `${k.toLowerCase()}:${headers[k]}\n`).join('');
  const signedHeaders = Object.keys(headers).sort().map(k => k.toLowerCase()).join(';');

  const canonicalRequest = [
    method,
    '/' + objectKey,
    '',
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD'
  ].join('\n');

  // String to sign
  const credentialScope = `${dateStrShort}/${region}/oss/aliyun_v4_request`;
  const stringToSign = [
    'OSS4-HMAC-SHA256',
    dateStr,
    credentialScope,
    await sha256Hex(canonicalRequest)
  ].join('\n');

  // Signing key
  const signingKey = await getSigningKey(accessKeySecret, dateStrShort, region);

  // Signature
  const signature = await hmacSha256Hex(signingKey, stringToSign);

  // Authorization header
  const auth = `OSS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope},SignedHeaders=${signedHeaders},Signature=${signature}`;

  return { auth, dateStr, headers };
}

/**
 * SHA-256 hex digest
 */
async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * HMAC-SHA256 hex digest
 */
async function hmacSha256Hex(key, str) {
  const keyBuf = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const impKey = await crypto.subtle.importKey('raw', keyBuf, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', impKey, new TextEncoder().encode(str));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Derive OSS V4 signing key
 */
async function getSigningKey(secret, dateStr, region) {
  const kDate = await hmacSha256('OSS4-HMAC-SHA256' + secret, dateStr);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, 'oss');
  return await hmacSha256(kService, 'aliyun_v4_request');
}

async function hmacSha256(key, str) {
  const keyBuf = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const impKey = await crypto.subtle.importKey('raw', keyBuf, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return await crypto.subtle.sign('HMAC', impKey, new TextEncoder().encode(str));
}

export async function onRequestGet({ request, env }) {
  // Check auth
  const { parseCookie, verifySession } = await import('./_utils.js');
  const cookie = parseCookie(request.headers.get('Cookie') || '');
  const token = cookie.cd_session;
  const sessionSecret = env.SESSION_SECRET || 'fallback-secret-do-not-use-in-production';
  const session = await verifySession(token, sessionSecret);
  if (!session) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  // Read from OSS
  const url = buildOSSURL(env);
  const sig = await signOSSRequest('GET', url, env);
  const headers = { Authorization: sig.auth, 'x-oss-date': sig.dateStr, 'x-oss-content-sha256': 'UNSIGNED-PAYLOAD' };

  try {
    const resp = await fetch(url, { headers });
    const body = await resp.text();
    return new Response(body, {
      status: resp.status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ version: 1, events: [], holidayMeta: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestPut({ request, env }) {
  // Check auth
  const { parseCookie, verifySession } = await import('./_utils.js');
  const cookie = parseCookie(request.headers.get('Cookie') || '');
  const token = cookie.cd_session;
  const sessionSecret = env.SESSION_SECRET || 'fallback-secret-do-not-use-in-production';
  const session = await verifySession(token, sessionSecret);
  if (!session) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  // Read body
  const body = await request.text();

  // Write to OSS
  const url = buildOSSURL(env);
  const sig = await signOSSRequest('PUT', url, env, body);
  const headers = {
    Authorization: sig.auth,
    'x-oss-date': sig.dateStr,
    'x-oss-content-sha256': 'UNSIGNED-PAYLOAD',
    'Content-Type': 'application/json'
  };

  try {
    const resp = await fetch(url, { method: 'PUT', headers, body });
    return new Response(JSON.stringify({ ok: resp.ok }), {
      status: resp.ok ? 200 : 502,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: '写入OSS失败' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
```

- [ ] **Step 4.1**: Create `functions/api/data.js` with the above content
- [ ] **Step 4.2**: Commit: `git add functions/api/data.js && git commit -m "feat: add OSS data read/write Functions endpoint with V4 signature"`

---

### Task 5: Cloudflare Pages Functions — _middleware.js (统一鉴权)

**Files:**
- Create: `E:\howe\倒计时\functions\_middleware.js`

**Step 5.1: Create `functions/_middleware.js`**

```js
import { parseCookie, verifySession } from './api/_utils.js';

const PUBLIC_PATHS = ['/api/login', '/api/logout', '/api/session', '/api/config'];

export async function onRequest({ request, next, env }) {
  const url = new URL(request.url);

  // Allow public paths without auth
  if (PUBLIC_PATHS.some(p => url.pathname === p || url.pathname.startsWith(p + '/'))) {
    return next();
  }

  // Check session cookie
  const cookie = parseCookie(request.headers.get('Cookie') || '');
  const token = cookie.cd_session;
  const sessionSecret = env.SESSION_SECRET || 'fallback-secret-do-not-use-in-production';

  if (!token || !(await verifySession(token, sessionSecret))) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return next();
}
```

- [ ] **Step 5.1**: Create `functions/_middleware.js`
- [ ] **Step 5.2**: Commit: `git add functions/_middleware.js && git commit -m "feat: add unified auth middleware for /api/*"`

---

### Task 6: 前端重构 — 重写 config.js

**Files:**
- Modify: `E:\howe\倒计时\js\config.js`

**Step 6.1: Rewrite `js/config.js`**

```js
/**
 * 配置文件 — 运行时从 API 获取
 * 不再包含占位符和密钥
 */

window.APP_CONFIG = null;

/**
 * 加载运行时配置
 * @returns {Promise<Object>}
 */
function loadAppConfig() {
  return fetch('/api/config').then(function (resp) {
    if (!resp.ok) throw new Error('Config fetch failed: ' + resp.status);
    return resp.json();
  }).then(function (config) {
    window.APP_CONFIG = config;
    return config;
  }).catch(function (err) {
    console.warn('[config] 加载失败，使用默认配置', err);
    window.APP_CONFIG = { holidayFreeNames: ['春节', '清明节', '劳动节', '国庆节'] };
    return window.APP_CONFIG;
  });
}
```

- [ ] **Step 6.1**: Rewrite `js/config.js` (remove all placeholders, add `loadAppConfig()` function)
- [ ] **Step 6.2**: Commit: `git add js/config.js && git commit -m "refactor: rewrite config.js to fetch from /api/config at runtime"`

---

### Task 7: 前端重构 — 重写 access-gate.js

**Files:**
- Modify: `E:\howe\倒计时\js\access-gate.js`

**Step 7.1: Rewrite `js/access-gate.js`**

```js
/**
 * 密码访问控制模块
 * 密码验证通过 POST /api/login 在服务端完成
 * 会话状态通过 HttpOnly cookie 管理
 */

(function(window) {
  'use strict';

  var SESSION_KEY = 'countdown_session';

  /**
   * 验证密码（通过后端 API）
   * @param {string} input - 用户输入的密码
   * @returns {Promise<{success: boolean, message: string}>}
   */
  function verifyPassword(input) {
    if (!input || typeof input !== 'string' || !input.trim()) {
      return Promise.resolve({ success: false, message: '请输入密码' });
    }

    return fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: input })
    }).then(function (resp) {
      if (resp.ok) {
        setAuthed();
        return { success: true, message: '验证成功' };
      }
      if (resp.status === 500) {
        return { success: false, message: '系统配置错误，请联系管理员' };
      }
      return { success: false, message: '密码错误，请重试' };
    }).catch(function () {
      return { success: false, message: '网络错误，请稍后再试' };
    });
  }

  /**
   * 检查会话是否有效（通过后端 API）
   * @returns {Promise<boolean>}
   */
  function checkSession() {
    return fetch('/api/session').then(function (resp) {
      return resp.ok;
    }).catch(function () {
      return false;
    });
  }

  /**
   * 检查本地会话标记（快速 UI 判断）
   * @returns {boolean}
   */
  function isAuthed() {
    try {
      var data = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}');
      return data.authed === true;
    } catch (e) {
      return false;
    }
  }

  /**
   * 设置本地会话标记
   */
  function setAuthed() {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ authed: true, timestamp: Date.now() }));
    } catch (e) {
      console.error('[access-gate] 会话数据写入失败:', e);
    }
  }

  /**
   * 清除本地会话标记
   */
  function clearAuthed() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }

  /**
   * 登出（清除服务端 cookie + 本地标记）
   * @returns {Promise}
   */
  function logout() {
    return fetch('/api/logout', { method: 'POST' }).then(function () {
      clearAuthed();
    }).catch(function () {
      clearAuthed();
    });
  }

  /**
   * 主页守卫：未通过认证则跳转到密码页
   */
  function requireAuth() {
    if (!isAuthed()) {
      var returnUrl = window.location.pathname + window.location.search + window.location.hash;
      if (returnUrl !== '/password.html') {
        sessionStorage.setItem('countdown_return_url', returnUrl);
      }
      window.location.href = '/password.html';
    }
  }

  /**
   * 获取认证后的返回 URL
   * @returns {string}
   */
  function getReturnUrl() {
    try {
      var url = sessionStorage.getItem('countdown_return_url');
      sessionStorage.removeItem('countdown_return_url');
      return url || '/index.html';
    } catch (e) {
      return '/index.html';
    }
  }

  // 导出公共 API
  window.AccessGate = {
    verifyPassword: verifyPassword,
    checkSession: checkSession,
    isAuthed: isAuthed,
    requireAuth: requireAuth,
    getReturnUrl: getReturnUrl,
    clearAuthed: clearAuthed,
    logout: logout
  };

})(window);
```

- [ ] **Step 7.1**: Rewrite `js/access-gate.js` (password verification via POST /api/login, session check via GET /api/session)
- [ ] **Step 7.2**: Commit: `git add js/access-gate.js && git commit -m "refactor: rewrite access-gate.js to use backend API for password verification"`

---

### Task 8: 前端重构 — 更新 password.html

**Files:**
- Modify: `E:\howe\倒计时\password.html`

**Step 8.1: Rewrite `password.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>访问验证 - 时光倒计时</title>
  <link rel="stylesheet" href="css/fluffy.css">
</head>
<body class="fluffy-page password-page">
  <main class="password-artboard">
    <div class="fluff-haze" aria-hidden="true"></div>

    <div class="password-card glass-fluff">
      <div>
        <p class="eyebrow">TIME COUNTDOWN</p>
        <h1>时光倒计时</h1>
      </div>

      <form class="password-form" id="password-form">
        <label>
          <span>访问密码</span>
          <div class="password-input-wrap">
            <input
              type="password"
              id="password-input"
              name="password"
              required
              placeholder="请输入访问密码"
              autocomplete="off"
            >
            <button type="button" class="soft-icon-button" id="toggle-password" aria-label="显示/隐藏密码">👁</button>
          </div>
        </label>

        <button type="submit" class="primary-fluff">进入</button>
      </form>

      <div class="soft-status" id="status-message" style="display: none;">
        准备就绪
      </div>
    </div>
  </main>

  <script src="js/config.js"></script>
  <script src="js/access-gate.js"></script>
  <script src="js/password-init.js"></script>
</body>
</html>
```

- [ ] **Step 8.1**: Rewrite `password.html` (remove phone-shell, use full-page centered layout)
- [ ] **Step 8.2**: Commit: `git add password.html && git commit -m "refactor: rewrite password.html with full-page centered layout, remove phone-shell"`

---

### Task 9: 前端重构 — 创建 password-init.js

**Files:**
- Create: `E:\howe\倒计时\js\password-init.js` (替代 `js/password.js`)

**Step 9.1: Create `js/password-init.js`**

```js
/**
 * 密码页交互逻辑
 * 调用 AccessGate 的异步验证 API
 */

(function() {
  'use strict';

  var errorCount = 0;
  var MAX_ERRORS = 5;

  var form = document.getElementById('password-form');
  var passwordInput = document.getElementById('password-input');
  var toggleButton = document.getElementById('toggle-password');
  var statusMessage = document.getElementById('status-message');

  function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.style.display = 'block';
    statusMessage.className = 'soft-status';
    if (type === 'error') statusMessage.classList.add('status-error');
    else if (type === 'success') statusMessage.classList.add('status-success');
    if (type !== 'error') {
      setTimeout(function () { statusMessage.style.display = 'none'; }, 3000);
    }
  }

  function hideStatus() {
    statusMessage.style.display = 'none';
  }

  function handleSubmit(e) {
    e.preventDefault();
    hideStatus();

    var password = passwordInput.value;
    if (!password || !password.trim()) {
      showStatus('请输入密码', 'error');
      passwordInput.focus();
      return;
    }

    // 禁用按钮防止重复提交
    var submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    window.AccessGate.verifyPassword(password).then(function (result) {
      submitBtn.disabled = false;

      if (result.success) {
        errorCount = 0;
        showStatus('验证成功，正在跳转...', 'success');
        setTimeout(function () {
          window.location.href = window.AccessGate.getReturnUrl();
        }, 500);
      } else {
        errorCount++;
        passwordInput.value = '';
        passwordInput.focus();

        if (errorCount >= MAX_ERRORS) {
          showStatus('密码错误次数过多（' + errorCount + '次），请稍后再试', 'error');
          submitBtn.disabled = true;
          passwordInput.disabled = true;
          setTimeout(function () {
            submitBtn.disabled = false;
            passwordInput.disabled = false;
            errorCount = 0;
            hideStatus();
          }, 10000);
        } else {
          showStatus(result.message + '（' + errorCount + '/' + MAX_ERRORS + '）', 'error');
        }
      }
    });
  }

  function togglePasswordVisibility() {
    if (passwordInput.type === 'password') {
      passwordInput.type = 'text';
      toggleButton.textContent = '🙈';
      toggleButton.setAttribute('aria-label', '隐藏密码');
    } else {
      passwordInput.type = 'password';
      toggleButton.textContent = '👁';
      toggleButton.setAttribute('aria-label', '显示密码');
    }
  }

  function init() {
    if (window.AccessGate.isAuthed()) {
      window.location.href = '/index.html';
      return;
    }

    form.addEventListener('submit', handleSubmit);
    toggleButton.addEventListener('click', togglePasswordVisibility);
    passwordInput.focus();

    passwordInput.addEventListener('input', function () {
      if (passwordInput.value && statusMessage.classList.contains('status-error')) {
        hideStatus();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

- [ ] **Step 9.1**: Create `js/password-init.js`
- [ ] **Step 9.2**: Commit: `git add js/password-init.js && git commit -m "feat: add password-init.js with async password verification"`

---

### Task 10: 前端重构 — 创建 api-client.js

**Files:**
- Create: `E:\howe\倒计时\js\api-client.js` (替代 `js/oss-storage.js`)

**Step 10.1: Create `js/api-client.js`**

```js
/**
 * API 客户端模块
 * 通过 Cloudflare Pages Functions 代理 OSS 数据读写
 * 替代旧的 aliyun-oss-sdk 直接调用方式
 */

(function(window) {
  'use strict';

  var EMPTY_CONFIG = {
    version: 1,
    events: [],
    holidayMeta: {}
  };

  /**
   * 从 /api/data 读取事件配置
   * @returns {Promise<Object>}
   */
  function read() {
    return fetch('/api/data').then(function (resp) {
      if (!resp.ok) {
        console.warn('[api-client] 读取数据失败: ' + resp.status);
        return EMPTY_CONFIG;
      }
      return resp.json();
    }).catch(function (err) {
      console.warn('[api-client] 读取数据异常，返回空配置:', err);
      return EMPTY_CONFIG;
    });
  }

  /**
   * 写入事件配置到 /api/data
   * @param {Object} config - 事件配置对象
   * @returns {Promise<boolean>}
   */
  function write(config) {
    return fetch('/api/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    }).then(function (resp) {
      if (!resp.ok) {
        console.warn('[api-client] 写入数据失败: ' + resp.status);
        return false;
      }
      return true;
    }).catch(function (err) {
      console.warn('[api-client] 写入数据异常:', err);
      return false;
    });
  }

  // 导出 API
  window.APIClient = {
    read: read,
    write: write
  };

})(window);
```

- [ ] **Step 10.1**: Create `js/api-client.js`
- [ ] **Step 10.2**: Commit: `git add js/api-client.js && git commit -m "feat: add api-client.js for OSS data read/write via Functions"`

---

### Task 11: 前端重构 — 更新 holiday.js

**Files:**
- Modify: `E:\howe\倒计时\js\holiday.js`

**Step 11.1: Rewrite `js/holiday.js`**

```js
/**
 * 节假日数据接入模块
 * 通过 /api/holidays/{year} 代理获取数据
 */

/**
 * 从 API 获取指定年份的节假日数据
 * @param {number} year - 年份
 * @returns {Promise<Array>} 节假日数据数组，失败时返回空数组
 */
function fetchHolidays(year) {
  var targetYear = year || new Date().getFullYear();
  return fetch('/api/holidays/' + targetYear).then(function (response) {
    if (!response.ok) {
      console.warn('[holiday] API 请求失败: ' + response.status);
      return [];
    }
    return response.json();
  }).then(function (data) {
    // 将对象格式（如 {"2026-01-01": {...}}）转为数组
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      var arr = [];
      for (var dateKey in data) {
        if (data.hasOwnProperty(dateKey)) {
          arr.push({ date: dateKey, name: data[dateKey].name, isOffDay: data[dateKey].isOffDay });
        }
      }
      return arr;
    }
    return Array.isArray(data) ? data : [];
  }).catch(function (error) {
    console.warn('[holiday] API 调用异常:', error);
    return [];
  });
}

/**
 * 按节假日名称分组，取每个节假日的最早日期
 * @param {Array} raw - 原始节假日数据数组
 * @returns {Map<string, string>} Map<name, earliestDate>
 */
function groupByName(raw) {
  var grouped = new Map();

  for (var i = 0; i < raw.length; i++) {
    var holiday = raw[i];
    var name = holiday.name;
    var date = holiday.date;
    if (!name || !date) continue;

    if (!grouped.has(name) || date < grouped.get(name)) {
      grouped.set(name, date);
    }
  }

  return grouped;
}

/**
 * 判断指定节假日是否高速免费
 * @param {string} name - 节假日名称
 * @param {Array} freeNames - 高速免费节日名称列表
 * @returns {boolean}
 */
function isHighwayFree(name, freeNames) {
  var list = freeNames || (window.APP_CONFIG && window.APP_CONFIG.holidayFreeNames) || ['春节', '清明节', '劳动节', '国庆节'];
  return list.indexOf(name) !== -1;
}

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { fetchHolidays: fetchHolidays, groupByName: groupByName, isHighwayFree: isHighwayFree };
}
```

- [ ] **Step 11.1**: Rewrite `js/holiday.js` (fetch from `/api/holidays/{year}`, handle object format response, dynamic year)
- [ ] **Step 11.2**: Commit: `git add js/holiday.js && git commit -m "refactor: update holiday.js to use /api/holidays proxy and dynamic year"`

---

### Task 12: 前端重构 — 更新 store.js

**Files:**
- Modify: `E:\howe\倒计时\js\store.js`

**Step 12.1: Update `js/store.js`**

Change `window.OSSStorage.read()` to `window.APIClient.read()` and `window.OSSStorage.write()` to `window.APIClient.write()`.

Key changes in the file:
- Line 22: `const config = await window.OSSStorage.read()` → `const config = await window.APIClient.read()`
- Line 289: `await window.OSSStorage.write(config)` → `await window.APIClient.write(config)`
- Also update holiday.js call: `fetchHolidays(currentYear)` now uses dynamic year (already the case)

- [ ] **Step 12.1**: Update `js/store.js` — replace `OSSStorage` references with `APIClient`
- [ ] **Step 12.2**: Commit: `git add js/store.js && git commit -m "refactor: update store.js to use APIClient instead of OSSStorage"`

---

### Task 13: 布局重构 — 重写 index.html 和 CSS

**Files:**
- Modify: `E:\howe\倒计时\index.html`
- Modify: `E:\howe\倒计时\css\fluffy.css`

**Step 13.1: Rewrite `index.html`**

Remove phone-shell container, use cream-canvas centered layout with responsive design. Reference `docs/fluffy-time-design/home.html` for visual design language.

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>时光倒计时</title>
  <link rel="stylesheet" href="css/fluffy.css">
</head>
<body>
  <div class="fluff-haze" aria-hidden="true"></div>

  <main class="cream-canvas">
    <!-- 浮动头部（滚动后浮现） -->
    <header class="floating-header glass-fluff scroll-reveal" id="floating-header">
      <div>
        <p class="eyebrow">TIME COUNTDOWN</p>
        <h1>时光倒计时</h1>
      </div>
      <div class="header-actions">
        <button class="soft-icon-button" id="add-event-btn" aria-label="添加事件">+</button>
        <button class="soft-icon-button" id="sync-btn" aria-label="同步" title="同步到云端">☁</button>
      </div>
    </header>

    <!-- 固定卡片区域 -->
    <section class="fixed-card-stage" id="fixed-card-stage">
      <!-- 卡片由 JS 动态渲染 -->
    </section>

    <!-- 下方列表（滚动后浮现） -->
    <section class="revealed-list" id="revealed-list">
      <div class="list-toolbar glass-fluff">
        <div>
          <p class="eyebrow">EVENT LIST</p>
          <h2>时间清单</h2>
        </div>
        <span class="soft-status">拖动排序 · 置顶优先</span>
      </div>

      <div class="sortable-list" id="event-list">
        <!-- 事件列表由 JS 动态渲染 -->
      </div>
    </section>
  </main>

  <!-- 新增事件弹窗 -->
  <div class="modal-backdrop" id="modal-backdrop" style="display: none;">
    <form class="add-event-modal glass-fluff" id="event-form">
      <div class="modal-head">
        <div>
          <p class="eyebrow">NEW EVENT</p>
          <h2 id="modal-title">新增事件</h2>
        </div>
        <button class="soft-icon-button" type="button" id="close-modal-btn" aria-label="关闭">×</button>
      </div>

      <div class="modal-grid">
        <label class="wide-field">
          <span>事件名称</span>
          <input type="text" name="title" required maxlength="50" placeholder="例如：春节、退休">
        </label>

        <label>
          <span>事件类型</span>
          <select name="type">
            <option value="countdown">倒计时</option>
            <option value="recurring">周期性节日</option>
            <option value="elapsed">已过天数</option>
          </select>
        </label>

        <label>
          <span>日期体系</span>
          <div class="segmented-control" id="calendar-switch">
            <button type="button" class="seg-option active" data-value="solar">公历</button>
            <button type="button" class="seg-option" data-value="lunar">农历</button>
          </div>
        </label>

        <label class="solar-field">
          <span>目标日期</span>
          <input type="date" name="targetDate">
        </label>

        <label class="solar-field">
          <span>目标时间</span>
          <input type="time" name="targetTime" value="00:00">
        </label>

        <label class="lunar-field wide-field" style="display:none;">
          <span>农历年份</span>
          <input type="number" name="lunarYear" placeholder="例如：2026">
        </label>

        <label class="lunar-field" style="display:none;">
          <span>农历月份</span>
          <input type="number" name="lunarMonth" min="1" max="12" placeholder="1-12">
        </label>

        <label class="lunar-field" style="display:none;">
          <span>农历日期</span>
          <input type="number" name="lunarDay" min="1" max="30" placeholder="1-30">
        </label>

        <label class="lunar-field" style="display:none;">
          <span>是否闰月</span>
          <select name="isLeapMonth">
            <option value="false">否</option>
            <option value="true">是</option>
          </select>
        </label>

        <label class="wide-field">
          <span>备注</span>
          <textarea name="note" maxlength="200" placeholder="给这个时间点留一句话"></textarea>
        </label>
      </div>

      <div class="modal-actions wide-field">
        <button type="button" class="ghost-fluff" id="cancel-btn">取消</button>
        <button type="submit" class="primary-fluff" id="submit-btn">保存</button>
      </div>
    </form>
  </div>

  <!-- CDN 依赖 -->
  <script src="https://cdn.jsdelivr.net/npm/lunar-javascript@1.6.12/lunar.min.js"></script>

  <!-- 应用脚本 -->
  <script src="js/config.js"></script>
  <script src="js/access-gate.js"></script>
  <script>
    // 主页守卫：未认证用户跳转到密码页
    window.AccessGate.requireAuth();
  </script>
  <script src="js/lunar.js"></script>
  <script src="js/time-calc.js"></script>
  <script src="js/holiday.js"></script>
  <script src="js/api-client.js"></script>
  <script src="js/store.js"></script>
  <script src="js/card-render.js"></script>
  <script src="js/modal.js"></script>
  <script src="js/home.js"></script>
</body>
</html>
```

- [ ] **Step 13.1**: Rewrite `index.html` (remove phone-shell, cream-canvas centered layout, no aliyun-oss-sdk CDN)
- [ ] **Step 13.2**: Commit: `git add index.html && git commit -m "refactor: rewrite index.html with cream-canvas centered layout, remove phone-shell"`

---

### Task 14: CSS 响应式重构

**Files:**
- Modify: `E:\howe\倒计时\css\fluffy.css`

**Step 14.1: Rewrite `css/fluffy.css`**

Key changes:
1. Remove `.phone-shell` fixed 390px width constraint
2. Add `.cream-canvas` centered container with `max-width: 720px`
3. Add responsive breakpoints (≤640px full-width, 641-1024px tablet, ≥1025px desktop)
4. Add segmented control styles for the solar/lunar toggle
5. Keep all existing glass-fluff, neumorphic-fluff, feature-card, list-card, modal styles
6. Keep the fluff-haze, cream background, and grid patterns
7. Update scroll reveal to work with `window.scrollY` instead of inner scroll

- [ ] **Step 14.1**: Rewrite `css/fluffy.css` (see detailed changes above)
- [ ] **Step 14.2**: Commit: `git add css/fluffy.css && git commit -m "refactor: rewrite CSS for responsive layout, remove phone-shell fixed width"`

---

### Task 15: 更新 modal.js 和 home.js

**Files:**
- Modify: `E:\howe\倒计时\js\modal.js`
- Modify: `E:\howe\倒计时\js\home.js`

**Step 15.1: Update `js/modal.js`**

Add segmented control for solar/lunar toggle (replacing checkbox). Update the field visibility logic.

**Step 15.2: Update `js/home.js`**

Change `window.OSSStorage` to `window.APIClient`. Update scroll reveal to work with `window.scrollY` instead of shell scroll.

- [ ] **Step 15.1**: Update `js/modal.js` (segmented control, field grouping)
- [ ] **Step 15.2**: Update `js/home.js` (APIClient instead of OSSStorage, window.scrollY)
- [ ] **Step 15.3**: Commit: `git add js/modal.js js/home.js && git commit -m "refactor: update modal.js and home.js for new API and layout"`

---

### Task 16: 删除废弃文件

**Files:**
- Delete: `E:\howe\倒计时\js\password.js`
- Delete: `E:\howe\倒计时\js\oss-storage.js`
- Delete: `E:\howe\倒计时\build.sh`

- [ ] **Step 16.1**: Delete `js/password.js`, `js/oss-storage.js`, `build.sh`
- [ ] **Step 16.2**: Commit: `git rm js/password.js js/oss-storage.js build.sh && git commit -m "chore: remove deprecated files (password.js, oss-storage.js, build.sh)"`

---

### Task 17: 更新部署手册

**Files:**
- Modify: `E:\howe\倒计时\docs\deployment-guide.md`

**Step 17.1: Rewrite `docs/deployment-guide.md`**

Reflect the new architecture:
- Pages Functions 目录结构说明
- 运行时环境变量清单（PASSWORD, SESSION_SECRET, OSS_REGION, OSS_BUCKET, OSS_AK, OSS_SK, OSS_OBJECT_KEY）
- 删除构建期 sed 替换说明
- 增加 Functions 调试方式（wrangler pages dev）

- [ ] **Step 17.1**: Rewrite `docs/deployment-guide.md`
- [ ] **Step 17.2**: Commit: `git add docs/deployment-guide.md && git commit -m "docs: update deployment guide for Functions architecture"`

---

### Task 18: 集成验证

- [ ] **Step 18.1**: 本地用 `wrangler pages dev` 启动开发服务器，验证密码页→主页完整流程
- [ ] **Step 18.2**: 验证节假日 API 代理正常工作（无跨域错误）
- [ ] **Step 18.3**: 验证 OSS 数据读写（新增事件→保存→刷新→数据保留）
- [ ] **Step 18.4**: 验证 PC 端居中布局（≥1025px）和手机端全宽布局（≤640px）
- [ ] **Step 18.5**: 验证所有删除文件不再影响构建