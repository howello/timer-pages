---
comet_change: refine-countdown-site
role: technical-design
canonical_spec: openspec
archived-with: 2026-07-10-refine-countdown-site
status: final
---

# 倒计时站点重构 — 技术设计文档

## 概述

对现有倒计时静态站点进行重构，引入 Cloudflare Pages Functions 作为服务端层，统一处理密码验证、OSS 数据读写和节假日 API 代理，解决密码绕过漏洞、节假日 API 跨域、前端密钥暴露、手机端独占等问题。

## 架构总览

```
┌───────────────────────────────────────────────────────┐
│  Browser                                              │
│  ┌─────────────────────────────────────────────────┐  │
│  │  password.html → POST /api/login → cookie       │  │
│  │  index.html → fetch /api/session (auth guard)   │  │
│  │            → fetch /api/config (安全配置)         │  │
│  │            → fetch /api/holidays/{year} (节日)   │  │
│  │            → fetch /api/data (GET/PUT OSS 数据)  │  │
│  └─────────────────────────────────────────────────┘  │
│                          │ 同域，无 CORS                │
└──────────────────────────┼────────────────────────────┘
                           │
┌──────────────────────────┼────────────────────────────┐
│  Cloudflare Pages Functions  │                        │
│  ┌────────────────────────────────────────────────┐  │
│  │  _middleware.js (统一鉴权)                      │  │
│  │  /api/login        POST 校验密码 → 签发 cookie  │  │
│  │  /api/logout       POST 清 cookie              │  │
│  │  /api/session      GET  校验 cookie → 200/401  │  │
│  │  /api/config       GET  返回前端安全配置         │  │
│  │  /api/holidays/{y} GET  代理节假日 API          │  │
│  │  /api/data         GET  从 OSS 读取             │  │
│  │  /api/data         PUT  覆写 OSS               │  │
│  └────────────────────────────────────────────────┘  │
│                         │ 环境变量读取                  │
│                         │ PASSWORD OSS_AK OSS_SK ...  │
└─────────────────────────┼────────────────────────────┘
                          │
┌─────────────────────────┼────────────────────────────┐
│  External Services      │                             │
│  ┌──────────────┐  ┌──────────────────────────────┐  │
│  │ 阿里云 OSS   │  │ api.jiejiariapi.com          │  │
│  │ (countdown-  │  │ (节假日数据)                  │  │
│  │  data.json)  │  │                              │  │
│  └──────────────┘  └──────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

## Functions 详细设计

### 1. Session Cookie 方案

```
Session token 格式: base64url(payload).base64url(hmac)

payload = { exp: <unix_ms + 86400000>, v: 1 }
hmac = HMAC-SHA256(payload, env.SESSION_SECRET)

Cookie 属性:
  cd_session=<token>;
  HttpOnly; Secure; SameSite=Strict;
  Path=/; Max-Age=86400
```

- 使用 Web Crypto API (`crypto.subtle`) 在 Workers 运行时计算 HMAC
- 不需要导入任何 JWT 库
- `SESSION_SECRET` 环境变量用于签名，轮换时所有现有 session 失效

### 2. `/api/login` (POST)

```
Request:  { password: string }
Response:
  200 → Set-Cookie cd_session, { ok: true }
  401 → { ok: false, error: "密码错误" }
  500 → { ok: false, error: "配置错误" }  // env.PASSWORD 为空
```

- 使用 `crypto.timingSafeEqual` 进行常量时间比较（防时序攻击）
- `env.PASSWORD` 为空字符串时直接返回 500

### 3. `_middleware.js` — 统一鉴权

```js
export async function onRequest({ request, next, env }) {
  const url = new URL(request.url);
  const publicPaths = ['/api/login', '/api/logout', '/api/session', '/api/config'];

  if (publicPaths.some(p => url.pathname.startsWith(p))) {
    return next();
  }

  const cookie = parseCookie(request.headers.get('Cookie') || '');
  const token = cookie.cd_session;
  if (!token || !(await verifySession(token, env))) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  return next();
}
```

### 4. `/api/holidays/[year]` — 节假日代理

```js
export async function onRequestGet({ params, env }) {
  const year = /^\d{4}$/.test(params.year) ? params.year : String(new Date().getFullYear());
  const upstream = await fetch(`https://api.jiejiariapi.com/v1/holidays/${year}`);
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

### 5. `/api/data` — OSS 数据读写

**GET**: 读取 OSS 上的 `countdown-data.json` 并返回

```js
export async function onRequestGet({ env }) {
  const url = buildOSSURL(env);
  const sig = signOSSRequest('GET', url, env);
  const resp = await fetch(url, { headers: { Authorization: sig } });
  const body = await resp.text();
  return new Response(body, { status: resp.status, headers: { 'Content-Type': 'application/json' } });
}
```

**PUT**: 将前端提交的 JSON 覆写回 OSS

```js
export async function onRequestPut({ request, env }) {
  const body = await request.text();
  const url = buildOSSURL(env);
  const sig = signOSSRequest('PUT', url, env, body);
  const resp = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: sig, 'Content-Type': 'application/json' },
    body
  });
  return new Response(JSON.stringify({ ok: resp.ok }), { status: resp.status });
}
```

**OSS V4 签名算法**：参考阿里云 OSS V4 签名文档，使用 `crypto.subtle` 计算 HMAC-SHA256。

### 6. `/api/config` — 前端安全配置

```js
export async function onRequestGet({ env }) {
  return new Response(JSON.stringify({
    holidayFreeNames: ['春节', '清明节', '劳动节', '国庆节']
  }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' }
  });
}
```

## 前端重构

### 配置加载流程（新 `js/config.js`）

```js
// 不再有占位符，不再有密码/密钥
window.APP_CONFIG = null;

async function loadConfig() {
  try {
    const resp = await fetch('/api/config');
    window.APP_CONFIG = await resp.json();
  } catch (e) {
    console.warn('[config] 加载失败，使用默认配置', e);
    window.APP_CONFIG = { holidayFreeNames: ['春节', '清明节', '劳动节', '国庆节'] };
  }
}
```

### 密码验证（新 `js/access-gate.js`）

```js
async function verifyPassword(input) {
  const resp = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: input })
  });
  if (resp.ok) {
    setAuthed(); // sessionStorage 标记
    return { success: true };
  }
  const data = await resp.json();
  return { success: false, message: data.error || '密码错误' };
}

async function checkSession() {
  try {
    const resp = await fetch('/api/session');
    return resp.ok;
  } catch { return false; }
}
```

### OSS 数据读写（新 `js/api-client.js` 替代 `js/oss-storage.js`）

```js
const API = {
  async read() {
    const resp = await fetch('/api/data');
    return resp.ok ? resp.json() : { version: 1, events: [], holidayMeta: {} };
  },
  async write(config) {
    const resp = await fetch('/api/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    return resp.ok;
  }
};
```

### 布局重构

移除 `phone-shell` 容器，改为：

```html
<body>
  <main class="cream-canvas">
    <!-- 固定卡片区 -->
    <section class="fixed-card-stage">
      <!-- 动态渲染 -->
    </section>
    <!-- 下方列表（滚动后浮现） -->
    <section class="revealed-list">
      ...
    </section>
  </main>
</body>
```

CSS 关键变化：

```css
.cream-canvas {
  max-width: 720px;
  margin: 0 auto;
  padding: 16px;
}

@media (max-width: 640px) {
  .cream-canvas {
    padding: 12px;
  }
}
```

- 背景层 (`<body>`) 保留奶油渐变 + 网格纹
- 滚动浮现逻辑从 `mock-screen.scrollTop` 改为 `window.scrollY`
- 弹窗使用 `position: fixed` 而非 `position: absolute`

## 文件变更清单

### 新增文件
- `functions/api/login.js`
- `functions/api/logout.js`
- `functions/api/session.js`
- `functions/api/config.js`
- `functions/api/holidays/[year].js`
- `functions/api/data.js`
- `functions/_middleware.js`

### 重写文件
- `index.html` — 移除 phone-shell，改为 cream-canvas 居中布局
- `password.html` — 移除 phone-shell，改为居中布局
- `css/fluffy.css` — 移除 390px 固定宽度，添加响应式断点
- `js/config.js` — 移除占位符，改为运行时 API 加载
- `js/access-gate.js` — 密码验证改为 POST /api/login
- `js/oss-storage.js` → `js/api-client.js` — 移除 aliyun-oss-sdk，改为调 /api/data
- `js/holiday.js` — 请求地址改为 /api/holidays/{year}
- `js/home.js` — 更新数据加载链路
- `docs/deployment-guide.md` — 反映新架构

### 删除文件
- `js/password.js`（功能合并到 access-gate.js）
- `build.sh`（不再需要构建期替换）
- CDN 引用 `aliyun-oss-sdk-6.18.0.min.js`（从 index.html 移除）

## 环境变量清单

| 变量 | 用途 | 示例 |
|------|------|------|
| `PASSWORD` | 网站访问密码 | `mysecret123` |
| `SESSION_SECRET` | Session 签名密钥 | 随机 32 字节 hex |
| `OSS_REGION` | OSS Bucket 区域 | `oss-cn-hangzhou` |
| `OSS_BUCKET` | OSS Bucket 名称 | `howe-file` |
| `OSS_AK` | RAM 子账号 AccessKey ID | `LTAI...` |
| `OSS_SK` | RAM 子账号 AccessKey Secret | `xxxx` |
| `OSS_OBJECT_KEY` | 事件配置 JSON 文件名 | `countdown-data.json` |

## 上线步骤

1. 部署 Functions 代码到分支
2. 在 Cloudflare Pages → 项目 → 设置 → 环境变量中添加以上运行时变量
3. 使用 Preview 分支验证联调
4. 合并到主分支发布
5. 删除旧的环境变量（`__PASSWORD__` 等构建期变量）

## 回滚

Cloudflare Pages 支持一键回滚到上一部署版本。回滚后 Functions 环境变量不受影响，旧版前端仍可正常调 `/api/*`。
