# 时间倒计时网站 — 部署手册

> 部署目标：Cloudflare Workers + Static Assets + D1（库 `common`）

---

## 一、项目结构

```
/                           根目录
├── public/                 静态资源根（由 Workers Static Assets 提供）
│   ├── index.html           主页（响应式：桌面 3 列 / 移动单栏）
│   ├── password.html        密码进入页
│   ├── css/fluffy.css       毛玻璃/奶油/新拟态设计系统
│   └── js/
│       ├── config.js          运行时从 /api/config 拉取配置
│       ├── access-gate.js     密码验证（POST /api/login）+ 登出
│       ├── password-init.js   密码页交互
│       ├── lunar.js           农历换算（包裹 lunar-javascript）
│       ├── time-calc.js       时间计算核心（纯函数）
│       ├── holiday.js         节假日数据接入（调 /api/holidays/:year）
│       ├── api-client.js      API 客户端（调 /api/data GET/PUT）
│       ├── store.js           事件数据中心
│       ├── card-render.js     卡片渲染
│       ├── modal.js           新增/编辑弹窗
│       └── home.js            主页装配（含登出按钮绑定）
├── src/
│   └── worker.js           Workers 入口：路由 + 会话 + 全部端点 + 鉴权守卫
├── schema.sql              D1 建表 SQL（app_config 单行 JSON 快照）
├── wrangler.jsonc          Workers 配置（main / assets / d1_databases）
└── docs/
    └── deployment-guide.md 本文件
```

---

## 二、架构概览

```
┌──────────────────────────────────────────────┐
│ Cloudflare Worker (src/worker.js)            │
│  fetch(req, env, ctx):                       │
│    /api/*  → handleApi  内部路由             │
│    其余    → env.ASSETS.fetch  静态资源       │
└─────────────┬────────────────────────────────┘
              │
   ┌──────────┴───────────┬─────────────────┐
   ▼                      ▼                 ▼
D1 (DB binding)       secrets          ASSETS binding
common 库              PASSWORD         ./public 目录
app_config 表         SESSION_SECRET
```

- **单 Worker** 统一处理 API 与静态资源，无 Pages Functions 文件式路由
- **D1** 存储：事件配置以单行 JSON 快照存于 `app_config` 表（id=1），整存整取
- **会话**：HMAC-SHA256 签名的 `cd_session` cookie，HttpOnly/Secure/SameSite=Strict

---

## 三、API 端点

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | /api/login | 公开 | 常量时间密码比较，签发 24h 会话 cookie |
| POST | /api/logout | 公开 | 清除会话 cookie（Max-Age=0） |
| GET | /api/session | 公开 | 校验会话有效性 |
| GET | /api/config | 公开 | 静态配置（holidayFreeNames） |
| GET | /api/data | 需会话 | 读取 D1 中 id=1 的整份配置 JSON |
| PUT | /api/data | 需会话 | UPSERT id=1 的整份配置 JSON |
| GET | /api/holidays/:year | 需会话 | 代理 jiejiariapi，透传响应 |

受保护端点统一经 `requireSession` 守卫：cookie 无效/过期返 401，`SESSION_SECRET` 缺失返 500。

---

## 四、部署步骤

### 4.1 创建 D1 数据库（如尚未创建）

```bash
wrangler d1 create common
```

将返回的 `database_id` 填入 `wrangler.jsonc`（当前已配置为 `d7e31a71-e897-4e17-92fb-394b4c73ae3f`）。

### 4.2 应用 schema（远程）

```bash
wrangler d1 execute common --remote --file=schema.sql
```

预期：`CREATE TABLE` 执行成功，生成 `app_config` 表。

### 4.3 配置 Secrets

```bash
wrangler secret put PASSWORD
wrangler secret put SESSION_SECRET
```

| 变量名 | 用途 | 示例 |
|--------|------|------|
| `PASSWORD` | 网站访问密码 | `mysecret123` |
| `SESSION_SECRET` | Session 签名密钥（建议 32 字节随机串） | `a1b2c3d4e5f6...` |

> **安全提示**：密钥仅作为 Workers secrets 存在于服务端，前端静态 JS 中不可见。无需任何第三方对象存储密钥。

### 4.4 部署

```bash
wrangler deploy
```

---

## 五、首次数据初始化

D1 首次读取空库时，`GET /api/data` 自动返回默认空配置：

```json
{ "version": 1, "events": [], "holidayMeta": {} }
```

无需预置初始 JSON。登录后通过主页「新增事件」即可写入，首次写入触发 UPSERT 创建 id=1 行。

如需手动预置初始数据，可执行：

```bash
wrangler d1 execute common --remote --command="INSERT INTO app_config (id, data, updated_at) VALUES (1, '{\"version\":1,\"events\":[],\"holidayMeta\":{}}', datetime('now'));"
```

---

## 六、上线验证清单

### 密码访问
- [ ] 访问网站 → 看到密码页
- [ ] 输入正确密码 → 进入主页
- [ ] 输入错误密码 → 显示错误提示
- [ ] 直接访问 index.html → 未认证时跳转密码页
- [ ] 刷新主页 → 仍保持登录态（HttpOnly Cookie）
- [ ] 关闭浏览器 → Cookie 过期，重新访问需输入密码
- [ ] 点击主页 header「登出」→ 清除 Cookie，跳回密码页
- [ ] 登出后直接访问主页 → 被拦截回密码页

### 主页功能
- [ ] 初始只展示固定卡片（pinned 项）
- [ ] 向下滚动 → 标题栏按钮与列表动画浮现
- [ ] 卡片显示走动时间（每秒刷新）
- [ ] 点击新增按钮 → 弹窗出现，可填表单
- [ ] 分段控件（公历/农历）切换正常
- [ ] 保存事件 → 卡片刷新，数据写回 D1
- [ ] 点击置顶 → 卡片置顶，状态写回 D1
- [ ] 拖拽排序 → 顺序变化，状态写回 D1
- [ ] 编辑自定义事件 → 弹窗预填数据
- [ ] 删除自定义事件 → 二次确认后删除
- [ ] 节日卡片不提供删除入口

### 降级场景
- [ ] 节假日 API 失败 → 不阻塞其他卡片展示
- [ ] D1 读取失败 → 空列表降级，不崩溃（Worker 记录 console.warn）
- [ ] D1 写入失败 → 提示错误，不阻塞页面
- [ ] 密码错误连续 5 次 → 表单锁定 10 秒

### 响应式
- [ ] 电脑端（≥1025px）：固定卡片 3 列网格，清单区居中限宽
- [ ] 中屏：固定卡片 2 列
- [ ] 手机端（≤640px）：全宽单栏，header 登出按钮显示图标
- [ ] `prefers-reduced-motion`：动画弱化

### 农历计算
- [ ] 农历周期事件 → 正确换算公历日期
- [ ] 跨年滚动 → 今年已过自动用明年

---

## 七、本地开发

```bash
# 本地 D1 建表（首次）
wrangler d1 execute common --local --file=schema.sql

# 本地 secrets（写入 .dev.vars，已 gitignore）
# .dev.vars 内容：
#   PASSWORD=test123
#   SESSION_SECRET=dev-secret-123

wrangler dev
```

浏览器打开 `http://localhost:8787`，密码输入 `test123` 即可进入主页。

---

## 八、常见问题

**Q: 节假日 API 返回空数据？**
A: `api.jiejiariapi.com` 可能限制某些年份数据。模块已实现降级，空数据不阻塞。注意 `/api/holidays/:year` 需会话，未登录会返 401。

**Q: 密码输入正确但无法进入？**
A: 检查 `PASSWORD` 和 `SESSION_SECRET` secrets 是否已配置。`SESSION_SECRET` 缺失时 Worker 返回 500 配置错误，不会签发会话 Cookie。本地开发检查 `.dev.vars`，部署后用 `wrangler secret list` 确认。

**Q: 数据丢失 / 读取到空列表？**
A: 检查：
1. schema 是否已应用（远程：`wrangler d1 execute common --remote --file=schema.sql`；本地：`--local`）
2. `wrangler.jsonc` 的 `d1_databases` binding 是否为 `DB`、`database_name` 是否为 `common`
3. Workers 控制台 Logs（已启用 observability），观察 `[data] 读取 D1 失败` 警告

**Q: 如何查看 D1 中的数据？**
A:
```bash
wrangler d1 execute common --remote --command="SELECT * FROM app_config;"
```
