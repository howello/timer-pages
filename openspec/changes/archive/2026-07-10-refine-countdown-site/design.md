## Context

现有的 `time-countdown-site`（archive 中）已经上线一版：纯静态 + Cloudflare Pages，前端通过 aliyun-oss-sdk 直接读写 OSS，节假日走 `api.jiejiariapi.com`，密码/OSS 凭证通过构建期占位符替换（`sed` 注入到 `js/config.js`）。上线后暴露出四个必须修的问题：

1. **仅手机端** — 页面被 `phone-shell` 容器锁定 390px 宽，PC 端体验被压扁
2. **密码验证被绕过** — `access-gate.verify()` 在 `password === '__PASSWORD__'` 时直接 `return true`，占位符未替换的情形（如 sed 失败、忘配环境变量）导致任意密码放行
3. **节假日 API CORS 失败** — `api.jiejiariapi.com` 不允许跨域，前端 `fetch` 直接被浏览器拦截
4. **凭证暴露** — 密码和 OSS AK/SK 通过 `sed` 被塞进前端 `config.js`，源码里能看到，前端任意用户 F12 即可读取

用户明确要求：所有敏感配置（密码、OSS）与外部 API 全部通过 **Cloudflare Pages Functions** 提供，前端只面对同域 `/api/*`，不再有构建期占位符。已归档 change 的 6 个 capability spec（`access-gate`/`event-cards`/`holiday-data`/`oss-storage`/`home-experience`/`deployment-guide`）继续复用，本次通过 delta 修改行为契约。

## Goals / Non-Goals

**Goals:**
- 引入 Cloudflare Pages Functions 层，把 **密码验证、OSS 读写、节假日代理** 全部移到服务端
- 前端不再持有任何长期凭证：密码验证走服务端 cookie/session；OSS 走服务端签名或直读；节假日走服务端代理
- 双端适配：PC 端使用居中单栏但更宽的画布（去掉 390px phone-shell 硬约束），手机端保持单栏可触控
- 视觉基于 `docs/fluffy-time-design/` 原型重新组织，保留毛玻璃+奶油+新拟态语言
- 密码严格模式：任何情况下（含开发/占位符未替换）都不得放行任意输入
- 节假日年份按 `new Date().getFullYear()` 动态取值，跨年自动滚动
- 弹窗视觉在原型基础上优化（更贴合"新拟态奶油"、字段分组清晰、错误态友好）
- 输出更新后的完整部署手册，反映 Functions + 环境变量的新拓扑

**Non-Goals:**
- 不做多用户/账号体系（仍是单密码）
- 不做后端数据库（数据仍存 OSS 上的一个 JSON）
- 不做实时同步/多设备冲突合并
- 不做 STS 临时令牌服务（服务端直接持 AK/SK，权限仍靠 RAM 子账号最小化）
- 不切换到 npm 打包构建；HTML/CSS/JS 保持源码即产物（Functions 目录除外）

## Decisions

### 1. Cloudflare Pages Functions 作为服务端边界

新增 `functions/` 目录，Cloudflare Pages 自动把该目录挂在 `/api/*`：

```
functions/
├── api/
│   ├── login.js          POST 校验密码 → 下发 HttpOnly cookie
│   ├── logout.js         POST 清 cookie
│   ├── session.js        GET  查询当前会话是否有效
│   ├── holidays/[year].js  GET  代理 api.jiejiariapi.com/v1/holidays/{year}
│   ├── config.js         GET  返回前端安全的运行时配置（不含密钥）
│   └── data.js           GET/PUT 读/写 OSS 上的事件配置 JSON
└── _middleware.js        统一鉴权：除 login/logout/session 外，其他 /api/* 校验 cookie
```

**理由：**
- Pages Functions 内置在同一部署内，同域访问天然无 CORS
- 环境变量在服务端读取，前端永远看不到密钥
- 不需要独立的 Workers 项目和额外域名

**备选：**
- Cloudflare Workers 独立部署 → 否决，多一个部署单元、多一个域名，反而更复杂
- CORS 代理服务（corsproxy.io）→ 否决，第三方不可控且节假日 API 一样跨域没解决凭证暴露

### 2. 密码验证：服务端校验 + HttpOnly Cookie 会话

```
密码页                     Pages Functions           前端
  │                            │                     │
  │  POST /api/login           │                     │
  │  { password }              │                     │
  ├───────────────────────────>│                     │
  │                            │ env.PASSWORD 比对    │
  │                            │ (constant-time)      │
  │  Set-Cookie:               │                     │
  │  cd_session=<sig>;         │                     │
  │  HttpOnly; Secure;         │                     │
  │  SameSite=Strict           │                     │
  │<───────────────────────────┤                     │
  │                            │                     │
  │  访问 index.html            │                     │
  │  fetch /api/session        │                     │
  ├───────────────────────────>│                     │
  │  { authed: true }          │                     │
  │<───────────────────────────┤                     │
  │                            │                     │
```

- **Session token 格式**：`base64url(payload).base64url(hmac_sha256(payload, env.SESSION_SECRET))`
- **payload**：`{ exp: <unix_ts>, v: 1 }`；有效期 24 小时
- **Cookie 标志**：`HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`
- **严格模式**：`env.PASSWORD` 不存在或为空字符串时，`/api/login` 直接返回 500 "配置错误"，绝不放行；不再有"占位符 → 开发模式绕过"分支
- 前端 `sessionStorage` 只做 UI 层的"已登录"标记（避免每次跳转都调 `/api/session`），实际鉴权靠 cookie

**为什么用 HMAC 而不是 JWT 库**：Cloudflare Workers 环境天然支持 `crypto.subtle`，几行代码搞定 HMAC-SHA256，不需要引入第三方库。

### 3. OSS 数据读写：服务端签名 + 前端只调 /api/data

前端不再引 `aliyun-oss-sdk`。改为：

```
前端                          /api/data (Functions)          OSS
  │                               │                            │
  │ GET /api/data                 │                            │
  ├──────────────────────────────>│  RAM AK/SK 从 env 读取      │
  │                               │  生成 OSS 签名 URL 或          │
  │                               │  直接用 fetch + 签名头 请求    │
  │                               ├──────────────────────────>│
  │                               │      countdown-data.json  │
  │                               │<──────────────────────────┤
  │ { events, holidayMeta }       │                            │
  │<──────────────────────────────┤                            │
  │                               │                            │
  │ PUT /api/data                 │                            │
  │ { events, holidayMeta }       │                            │
  ├──────────────────────────────>│                            │
  │                               ├──────────────────────────>│
  │                               │       PUT (with sig)      │
  │                               │<──────────────────────────┤
  │ { ok: true }                  │                            │
  │<──────────────────────────────┤                            │
```

- 服务端使用 **Aliyun OSS V4 签名 REST API**（无需 SDK，`fetch` + HMAC-SHA256 手搓即可，Workers 环境原生支持）
- RAM 子账号权限保持"仅 `oss:GetObject`/`oss:PutObject` 单文件"，破坏面最小
- 前端调 `/api/data` 会自动带上 session cookie，未登录直接 401

**备选：**
- 前端继续用 aliyun-oss-sdk + STS → 否决，还是要一个签发 STS 的服务端，不如直接用服务端代理
- 用 aliyun-oss-sdk 在 Workers 里跑 → 否决，SDK 体积大、依赖 Node polyfill，不适合 Workers

### 4. 节假日 API 代理

`/api/holidays/[year].js` 简单转发：

```js
export async function onRequestGet({ params }) {
  const year = /^\d{4}$/.test(params.year) ? params.year : new Date().getFullYear();
  const upstream = await fetch(`https://api.jiejiariapi.com/v1/holidays/${year}`);
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600'  // 边缘缓存 1 小时
    }
  });
}
```

- 年份从 URL path 拿，前端用 `new Date().getFullYear()` 动态构造
- 边缘缓存 1 小时降低外部 API 调用频次
- 上游失败时 pass-through 状态码，前端沿用现有降级逻辑（空数组不阻塞）

### 5. 前端配置获取（`/api/config`）

用户明确要求"配置也用 Functions 获取"，但配置内容必须是**前端安全**的（不含密钥）。当前唯一需要前端知道的运行时配置是：

- `holidayFreeNames`: 高速免费节日名单（`["春节","清明节","劳动节","国庆节"]`），从 env 读取以便运维调整
- 密码、OSS 参数、session secret 全部**不进 `/api/config` 响应**

前端启动流程：

```
1. AccessGate: fetch /api/session
   ├─ 200 { authed: true } → 继续
   └─ 401 → 跳 password.html
2. Store: fetch /api/config → 拿到 holidayFreeNames 等
3. Store: fetch /api/data + /api/holidays/{year} → 渲染
```

### 6. 视觉与布局重构：告别 phone-shell

现有 `index.html` 用 `<div class="phone-shell">` 把内容锁死在 390px。本次移除该容器：

```
新版布局（原型 docs/fluffy-time-design/ 风格）：

┌────────────────────────────────────────────────────┐
│  <body>  背景层（奶油 + 网格纹）                        │
│  ┌──────────────────────────────────────────────┐  │
│  │  <main class="cream-canvas">                 │  │
│  │  居中容器 max-width: 960px; margin: auto     │  │
│  │  ┌────────────────────────────────────────┐  │  │
│  │  │  floating-header  (滚动前隐藏)           │  │  │
│  │  │  时光倒计时  [+ 新增] [☁ 同步]            │  │  │
│  │  ├────────────────────────────────────────┤  │  │
│  │  │  fixed-card-stage (初始视图)            │  │  │
│  │  │  ┌──────────┐  ┌──────────┐             │  │  │
│  │  │  │ 特色卡 A  │  │ 特色卡 B │             │  │  │
│  │  │  └──────────┘  └──────────┘             │  │  │
│  │  ├────────────────────────────────────────┤  │  │
│  │  │  revealed-list (滚动后浮现)              │  │  │
│  │  │  ┌────────────────────────────────┐    │  │  │
│  │  │  │ 春节  法定 高速免费  T-45d      │    │  │  │
│  │  │  ├────────────────────────────────┤    │  │  │
│  │  │  │ 结婚纪念日  周期  T-120d       │    │  │  │
│  │  │  └────────────────────────────────┘    │  │  │
│  │  └────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘

响应式断点：
  ≤ 640px  单栏，卡片满宽减 padding
  641-1024 单栏居中，max-width: 640px
  ≥ 1025   单栏居中，max-width: 720px，特色卡片区可 2 列
```

保留 `docs/fluffy-time-design/css/fluffy.css` 的核心 token（毛玻璃、奶油背景、新拟态阴影），去掉 phone-shell 特有约束。

### 7. 滚动交互 & 拖拽排序：沿用现有实现方案

- **滚动浮现**：`IntersectionObserver` + `scroll` 监听，把 `home-scroll` 换成 `<body>` / `<main>` 上的 `window.scrollY`
- **拖拽排序**：沿用现有 HTML5 drag & drop（`draggable="true"` + `dragover`），触屏端使用 pointerdown/pointermove 兼容层
- **置顶**：`pinned` 字段，排序时优先靠前，节日卡片通过 `holidayMeta[festival:<name>]` 记录

### 8. 弹窗视觉优化

保持结构不变，视觉层调整：

- **分组更清晰**：基础信息 / 日期设置 / 显示设置 分为 3 个视觉块，块间留白 20px
- **公历/农历切换**：从 checkbox 换成 segmented control（左右两个 pill 按钮）
- **日期字段**：公历用 `<input type="date">`，农历用三个 select（年 / 月 / 日）+ 闰月 checkbox
- **保存按钮**：从右下角单按钮变为底部固定 sticky 条（取消 + 保存）
- **错误态**：字段下方红色 helper text，不用 alert

### 9. 保留数据模型

OSS 上的 `countdown-data.json` 结构不变：

```json
{
  "version": 1,
  "events": [
    { "id": "...", "type": "countdown|recurring|elapsed", "title": "...",
      "calendar": "solar|lunar", "date": "...", "time": "...",
      "lunarYear": 2046, "lunarMonth": 7, "lunarDay": 1, "isLeapMonth": false,
      "note": "", "pinned": false, "order": 0 }
  ],
  "holidayMeta": {
    "festival:春节": { "pinned": true, "order": -1 }
  }
}
```

## Risks / Trade-offs

- **[Pages Functions 冷启动]** 首次请求可能有 100~300ms 延迟 → 影响可接受；`/api/session` 和 `/api/data` 是并行调用，用户不会感知
- **[OSS V4 签名手搓]** 手写签名有出错风险 → 添加单元测试覆盖签名算法；用 curl 对比阿里云控制台生成的签名做校准
- **[Cookie 跨子域]** SameSite=Strict 若部署到子域会失败 → 部署手册明确单域部署；如需多域再放宽
- **[Session Secret 轮换]** 更换 `SESSION_SECRET` 会让全部现有 session 失效 → 部署手册说明"轮换需通知用户重新登录"
- **[节假日缓存穿透]** 边缘缓存 1h 内数据变化会延迟感知 → 数据本就是年度级更新，不敏感
- **[Functions 免费额度]** Cloudflare Pages Functions 免费 100K 请求/天 → 私人站点用量远低于此，无压力
- **[弃用 aliyun-oss-sdk CDN]** 前端体积略降，但需要重写 OSS 交互层 → 复用感很低，`js/oss-storage.js` 会大改（换成 `js/api-client.js` 调 Functions）

## Migration Plan

1. **新建 `functions/` 目录** — 上线新代码但暂不切前端
2. **前端切到 `/api/*`** — 修改 `access-gate.js` / `home.js` / 数据层，删除对 aliyun-oss-sdk 的 CDN 引用
3. **验证阶段** — 本地用 `wrangler pages dev` 起同域环境；生产用 Preview 分支部署验证
4. **一次性发布** — 主分支合入，Cloudflare Pages 自动构建，前后端一起切换
5. **旧配置清理** — 在 Cloudflare Pages 设置中删除已不需要的构建期环境变量（`__PASSWORD__` 等占位符对应变量），仅保留服务端变量：`PASSWORD` / `SESSION_SECRET` / `OSS_REGION` / `OSS_BUCKET` / `OSS_AK` / `OSS_SK` / `OSS_OBJECT_KEY` / `HOLIDAY_FREE_NAMES`

**回滚**：Cloudflare Pages 支持一键回滚到上一次部署，服务端环境变量不受影响。

## Open Questions

- 无（关键决策已在需求澄清阶段与用户确认：Pages Functions 代理 + 严格密码 + 动态年份 + 居中单栏 + 原型重设计）
