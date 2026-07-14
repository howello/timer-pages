# 时光倒计时

一个基于 Cloudflare Workers + D1 的倒计时应用，采用 Fluffy 毛玻璃新拟态设计风格。

## 技术特性

- **Cloudflare Workers**：单 Worker 入口统一处理 API 与静态资源
- **D1 存储**：事件配置以单行 JSON 快照存于 D1 `app_config` 表
- **静态资源**：通过 Workers Static Assets binding 从 `./public` 提供，无构建打包
- **密码保护**：单密码访问，HMAC-SHA256 签名的 HttpOnly cookie 会话
- **农历支持**：使用 lunar-javascript 库支持农历日期转换，公历/农历事件均计算天数
- **响应式设计**：桌面多列网格、移动单栏
- **自建交互组件**：统一风格的 confirm/alert 弹窗，操作互斥防抖 + loading 遮罩
- **拖拽排序**：整卡拖拽（支持触屏），操作按钮悬停显示

## 项目结构

```
├── public/             # 静态资源根目录（由 ASSETS binding 提供）
│   ├── index.html
│   ├── password.html
│   ├── css/fluffy.css
│   └── js/             # 前端模块（无构建，按序在 index.html 引入）
│       ├── config.js       # 运行时配置加载
│       ├── access-gate.js  # 会话校验 / 登出
│       ├── lunar.js         # 农历 ↔ 公历换算（包裹 lunar-javascript）
│       ├── time-calc.js     # 时间差计算、日期归约、时钟+农历格式化
│       ├── holiday.js       # 节假日数据获取
│       ├── api-client.js    # 后端 D1 读写
│       ├── store.js         # 事件数据中心（合并自定义事件与节假日）
│       ├── alert.js         # 自建 confirm/alert/loading 与操作防抖
│       ├── card-render.js   # 首页圆盘与列表卡片渲染
│       ├── modal.js         # 新增/编辑弹窗
│       └── home.js          # 主页装配：滚动揭示、置顶、拖拽、增删改
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
