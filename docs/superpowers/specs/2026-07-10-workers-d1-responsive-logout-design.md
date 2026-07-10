---
comet_change: workers-d1-responsive-logout
role: technical-design
canonical_spec: openspec
---

# Design Doc: Workers + D1 迁移与响应式登出

## 1. 背景与目标

当前项目为 Cloudflare Pages（`functions/` 文件式路由）+ 阿里云 OSS（V4 签名代理读写单个 JSON）。首页仅手机端布局（根因：`.cream-canvas { max-width: 720px }` 限宽）。登出后端已有但前端无入口。

**目标**：
1. 迁移为标准 Cloudflare Workers + Static Assets
2. 配置存取改 D1（库 `common`，单表单行 JSON 快照），删除全部 OSS
3. 首页响应式（桌面多列网格）
4. 接入登出入口

**非目标**：不改 store.js 整存整取语义、不引入搜索/筛选、不改节假日来源、不改农历/时间计算逻辑。

## 2. 架构

```
┌──────────────────────────────────────────────┐
│ Cloudflare Worker (src/worker.js)            │
│  fetch(req, env, ctx):                       │
│    /api/*  → handleApi(req, env)  内部路由    │
│    其余    → env.ASSETS.fetch(req)  静态资源 │
└─────────────┬────────────────────────────────┘
              │
   ┌──────────┴───────────┬─────────────────┐
   │                      │                 │
   ▼                      ▼                 ▼
D1 (DB binding)     secrets            ASSETS binding
common 库            PASSWORD          ./public 目录
app_config 表        SESSION_SECRET    index.html/css/js
```

## 3. 后端设计

### 3.1 Worker 入口与路由
单 `src/worker.js`，`export default { fetch }`。`handleApi` 用 `URL.pathname` 匹配：

| 方法 | 路径 | 鉴权 | 处理 |
|------|------|------|------|
| POST | /api/login | 公开 | 常量时间比较 PASSWORD → 签发 cookie |
| POST | /api/logout | 公开 | 清 cookie (Max-Age=0) |
| GET | /api/session | 公开 | 校验 cookie |
| GET | /api/config | 公开 | 静态 holidayFreeNames |
| GET | /api/data | 需要 | D1 读 id=1 |
| PUT | /api/data | 需要 | D1 UPSERT id=1 |
| GET | /api/holidays/:year | 需要 | 代理 jiejiariapi |

### 3.2 会话机制（原样迁移）
从 `functions/api/_utils.js` 迁移：`parseCookie`、`base64urlEncode/Decode`、`createSession`、`verifySession`。HMAC-SHA256 签名 base64url payload `{exp, v}`。cookie 名 `cd_session`，属性 HttpOnly/Secure/SameSite=Strict/Path=//Max-Age=86400。鉴权守卫在受保护端点入口校验，无效返 401，SECRET 缺失返 500。

### 3.3 D1 存储层
- **schema.sql**：`CREATE TABLE IF NOT EXISTS app_config (id INTEGER PRIMARY KEY DEFAULT 1, data TEXT NOT NULL, updated_at TEXT)`
- **GET /api/data**：`SELECT data FROM app_config WHERE id=1`；无行 → 返回默认 `{version:1,events:[],holidayMeta:{}}`（不自动 INSERT）
- **PUT /api/data**：`INSERT INTO app_config (id, data, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`；`updated_at` 用 `new Date().toISOString()`；成功返 `{ok:true}`
- 整存整取，data 列存完整 JSON 字符串，前端无感知

### 3.4 节假日代理
`GET /api/holidays/:year`：年份非 4 位数字 → 用当前年份；`fetch('https://api.jiejiariapi.com/v1/holidays/'+year)`；透传 body + status；Cache-Control `public, max-age=3600, s-maxage=3600`；fetch 异常返 502 `{error:"上游服务不可用"}`。

## 4. 前端设计

### 4.1 响应式（CSS 调整为主）
**根因**：`.cream-canvas { max-width: 720px }` 把整页限宽。修改：
- `.cream-canvas` 桌面端放宽（`max-width` 提至 ~1200px，移动端保持窄）
- `@media (min-width: 1025px)` 固定卡片改 `repeat(3, minmax(260px, 1fr))`（现 2 列）
- `.revealed-list` 加 `max-width` 居中
- 已有 `auto-fit` 网格、640px 移动断点无需重写

### 4.2 登出入口
- `index.html` header `.header-actions` 加 `<button id="logout-btn" class="ghost-fluff">登出</button>`
- `home.js` `bindHeaderActions` 绑定 click → `AccessGate.logout()` → `window.location.href = '/password.html'`
- 桌面显示文字「登出」、移动端 CSS 隐藏文字显示图标（用 `::before` 或 media query 切换）
- `access-gate.js` 已有 `logout()`，无需修改

### 4.3 顺手修 bug
`card-render.js` `renderFixed` 内固定卡片标题 `<h3>` → `<h2>`，使 CSS `.feature-card h2 { font-size: clamp(28px,5vw,48px) }` 大字号生效。

### 4.4 去 OSS 化
`store.js`、`api-client.js` 注释中 OSS 措辞改为 D1/后端，逻辑不变。

## 5. 配置

### 5.1 wrangler.jsonc
```jsonc
{
  "name": "timer",
  "main": "src/worker.js",
  "compatibility_date": "2026-07-10",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "directory": "./public", "binding": "ASSETS" },
  "d1_databases": [{ "binding": "DB", "database_name": "common", "database_id": "d7e31a71-e897-4e17-92fb-394b4c73ae3f" }],
  "observability": { "enabled": true }
}
```
assets 目录 `.` → `./public`，避免 ASSETS 暴露 `src/`、`openspec/`。HTML 引用 `css/...`、`js/...` 路径不变（ASSETS 从 public 根提供）。

### 5.2 Secrets
保留 `PASSWORD`、`SESSION_SECRET`；移除全部 `OSS_*`。

## 6. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 静态资源路径变化 | 已确认 HTML 引用 css/js 相对路径，ASSETS 从 ./public 根提供，不变 |
| D1 首次空库 | GET 无行返默认空配置，不自动 INSERT，写入时 UPSERT |
| OSS 数据不迁移 | 个人应用数据量小，用户手动导入或重新录入；不提供自动迁移 |
| OSS secrets 残留 | tasks 明确提示移除，README 重写 |
| nodejs_compat 冗余 | crypto/HMAC 原生可用，保留 flag 无副作用，降低后续摩擦 |

## 7. 测试策略

**部署前**（用户执行）：
- `wrangler d1 execute common --remote --file=schema.sql` 建表
- 设置 secrets：`wrangler secret put PASSWORD`、`wrangler secret put SESSION_SECRET`

**本地验证**（`wrangler dev`）：
1. 未登录访问 `/` → 跳 `/password.html`
2. 输入密码登录 → cookie 写入 → 跳回 `/` → 卡片渲染（桌面 3 列 / 手机单列）
3. 新增/编辑/删除事件 → D1 持久化（重载后数据保留）
4. 点击登出 → 清 cookie → 跳 `/password.html` → 直接访问 `/` 被拦截
5. 源码检索 `OSS`/`aliyuncs`/`aliyun_v4` 无匹配

## 8. 迁移步骤

1. 新建 `schema.sql`
2. 新建 `src/worker.js`（整合 utils + 全部 handler）
3. 重写 `wrangler.jsonc`
4. 删除 `functions/` 目录
5. 修改 `public/index.html`（header 加登出按钮）
6. 修改 `public/css/fluffy.css`（放宽容器、3 列、清单居中、登出按钮样式）
7. 修改 `public/js/home.js`（登出绑定）、`card-render.js`（h3→h2）、`store.js`/`api-client.js`（去 OSS 措辞）
8. 重写 `README.md`
9. 用户执行建表 + `wrangler dev` 验证

**回滚**：保留 git 提交点，迁移失败可 `git revert` 回 Pages 模型。
