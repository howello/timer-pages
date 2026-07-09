# 时间倒计时网站 — 部署手册

> 部署目标：Cloudflare Pages（含 Functions）+ 阿里云 OSS

---

## 一、项目结构

```
/                           根目录
├── index.html              主页（Cream-Canvas 居中布局）
├── password.html           密码进入页
├── css/fluffy.css          毛玻璃/奶油/新拟态设计系统
├── functions/              Cloudflare Pages Functions 后端
│   ├── _middleware.js       统一鉴权
│   └── api/
│       ├── _utils.js        公共工具（Session HMAC、Cookie 解析）
│       ├── login.js         POST 密码校验 → 签发 Cookie
│       ├── logout.js        POST 清 Cookie
│       ├── session.js       GET 查询当前会话状态
│       ├── config.js        GET 返回前端安全运行时配置
│       ├── data.js          GET/PUT OSS 上事件配置 JSON（V4 签名）
│       └── holidays/
│           └── [year].js    GET 代理节假日 API
├── js/
│   ├── config.js            运行时从 /api/config 拉取配置
│   ├── access-gate.js       密码验证（POST /api/login）
│   ├── password-init.js     密码页交互
│   ├── lunar.js             农历换算（包裹 lunar-javascript）
│   ├── time-calc.js         时间计算核心（纯函数）
│   ├── holiday.js           节假日数据接入（调 /api/holidays/{year}）
│   ├── api-client.js        API 客户端（调 /api/data GET/PUT）
│   ├── store.js             事件数据中心
│   ├── card-render.js       卡片渲染
│   ├── modal.js             新增/编辑弹窗
│   └── home.js              主页装配
└── docs/
    └── deployment-guide.md  本文件
```

---

## 二、Cloudflare Pages 部署

### 2.1 连接仓库

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Workers & Pages → **Pages** → **Connect to Git**
3. 选择 Git 仓库（GitHub/GitLab），授权访问
4. 选择部署分支（默认 `master` 或 `main`）

### 2.2 构建设置

| 配置项 | 值 |
|--------|-----|
| Framework preset | **No framework** |
| Build command | **留空**（无需构建步骤） |
| Build output directory | `/` |

> 项目源码即产物：无需 npm 构建或 sed 替换。

---

## 三、环境变量配置

在 Cloudflare Pages → **Settings** → **Environment variables** → **Production** 中添加：

| 变量名 | 用途 | 示例 |
|--------|------|------|
| `PASSWORD` | 网站访问密码 | `mysecret123` |
| `SESSION_SECRET` | Session 签名密钥（建议 32 字节随机 hex） | `a1b2c3d4e5f6...` |
| `OSS_REGION` | OSS Bucket 所在区域 | `oss-cn-hangzhou` |
| `OSS_BUCKET` | OSS Bucket 名称 | `howe-file` |
| `OSS_AK` | RAM 子账号 AccessKey ID | `LTAI...` |
| `OSS_SK` | RAM 子账号 AccessKey Secret | `xxxx` |
| `OSS_OBJECT_KEY` | OSS 中存储事件数据的 JSON 文件名 | `countdown-data.json` |

> **安全提示**：所有密钥仅存在于 Cloudflare Pages Functions 环境变量中，在前端静态 JS 中 **不可见**。

---

## 四、阿里云 OSS 配置

### 4.1 创建 Bucket

1. 登录 [阿里云 OSS 控制台](https://oss.console.aliyun.com)
2. 创建 Bucket：
   - 名称：`howe-file`（全局唯一）
   - 地域：选择离用户近的区域（如 `oss-cn-hangzhou`）
   - 存储类型：标准存储
   - **访问权限**：**公共读**（需读取 JSON，后续也可改为私有+签名访问）
3. 如使用私有 Bucket，Functions 端已实现 V4 签名，无需额外配置

### 4.2 RAM 子账号（最小权限）

1. 进入 [RAM 控制台](https://ram.console.aliyun.com)
2. 创建用户：
   - 名称：`countdown-pages-function`
   - 访问方式：OpenAPI 调用访问（勾选 **程序访问**）
   - 获取 AccessKey ID 和 Secret（**保存好，后续不再显示**）
3. 创建自定义策略：

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["oss:GetObject", "oss:PutObject"],
      "Resource": ["acs:oss:*:*:howe-file/countdown-data.json"]
    }
  ]
}
```

4. 授权：将策略绑定到该 RAM 用户

### 4.3 安全风险提示

- 密钥仅存在于 Cloudflare Pages 环境变量中，通过 Pages Functions 服务端读取
- 前端静态 JS 中 **不包含** 任何密码或 OSS 密钥
- 最小权限策略将破坏面限制到 **一个 JSON 文件**

---

## 五、初始 OSS JSON 文件

首次部署前，在 OSS 控制台上传初始 JSON：

```json
{
  "version": 1,
  "events": [
    {
      "id": "evt_ab12cd",
      "type": "countdown",
      "title": "退休",
      "calendar": "solar",
      "date": "2046-07-01",
      "time": "09:00",
      "note": "距离新的生活节奏",
      "pinned": true,
      "order": 0
    }
  ],
  "holidayMeta": {}
}
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

### 主页功能
- [ ] 初始只展示固定卡片（pinned 项）
- [ ] 向下滚动 → 标题栏按钮与列表动画浮现
- [ ] 卡片显示走动时间（每秒刷新）
- [ ] 点击新增按钮 → 弹窗出现，可填表单
- [ ] 分段控件（公历/农历）切换正常
- [ ] 保存事件 → 卡片刷新，数据写回 OSS
- [ ] 点击置顶 → 卡片置顶，状态写回 OSS
- [ ] 拖拽排序 → 顺序变化，状态写回 OSS
- [ ] 编辑自定义事件 → 弹窗预填数据
- [ ] 删除自定义事件 → 二次确认后删除
- [ ] 节日卡片不提供删除入口

### 降级场景
- [ ] 节假日 API 失败 → 不阻塞其他卡片展示
- [ ] OSS 读取失败 → 空列表初始化，不崩溃
- [ ] OSS 写入失败 → 提示错误，不阻塞页面
- [ ] 密码错误连续 5 次 → 表单锁定 10 秒

### 响应式
- [ ] 电脑端（≥1025px）：居中单栏，卡片可 2 列
- [ ] 手机端（≤640px）：全宽单栏，可触控操作
- [ ] `prefers-reduced-motion`：动画弱化

### 农历计算
- [ ] 农历周期事件 → 正确换算公历日期
- [ ] 跨年滚动 → 今年已过自动用明年

---

## 七、本地开发

使用 Cloudflare Wrangler 在本地调试 Functions：

```bash
npm install -g wrangler
wrangler pages dev . --binding PASSWORD=test123 --binding SESSION_SECRET=dev-secret-123
```

浏览器打开 `http://localhost:8788`，密码输入 `test123` 即可进入主页。

---

## 八、常见问题

**Q: 节假日 API 返回空数据？**
A: `api.jiejiariapi.com` 可能限制某些年份数据。模块已实现降级，空数据不阻塞。

**Q: 密码输入正确但无法进入？**
A: 检查 `PASSWORD` 和 `SESSION_SECRET` 环境变量是否已配置。`SESSION_SECRET` 缺失时系统会返回配置错误，不会签发会话 Cookie。

**Q: OSS 写入失败？**
A: 检查：
1. `OSS_REGION` / `OSS_BUCKET` / `OSS_OBJECT_KEY` 是否正确
2. RAM 子账号是否有该文件的读写权限
3. OSS Bucket CORS 配置（如果用公共读则无需 CORS）
