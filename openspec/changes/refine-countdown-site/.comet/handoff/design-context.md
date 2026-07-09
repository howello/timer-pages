# Comet Design Handoff

- Change: refine-countdown-site
- Phase: design
- Mode: compact
- Context hash: 598acf1948be68356310c24370dff25edf7354baa6e1f2adecf77bfc72947957

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/refine-countdown-site/proposal.md

- Source: openspec/changes/refine-countdown-site/proposal.md
- Lines: 1-37
- SHA256: b0157f03173f0499ecc13f31ac692976cab93a620d3d14d66a4a72a547880c91

```md
## Why

现有的倒计时静态网站已基本完成第一版开发，但存在多个关键问题：仅在手机端视图下可用（phone-shell 限制了 390px）、密码验证在开发模式下被绕过导致安全漏洞、节假日 API 跨域请求被浏览器拦截、配置通过构建期占位符替换不够安全。本次变更需要系统地修复这些问题，同时引入 Cloudflare Pages Functions 统一处理配置下发和 API 代理，使站点真正可部署、可安全使用，并支持 PC 和手机双端。

## What Changes

- **修复密码验证**：移除开发模式绕过逻辑，未配置密码时强制弹窗提示配置，不再接受任意非空密码
- **双端响应式适配**：去除 phone-shell 的 390px 宽度限制，改为 max-width + 响应式设计，PC 端居中单栏展示，手机端保持全宽单栏
- **新增 Cloudflare Pages Functions**：
  - `/api/config` — 从环境变量读取密码和 OSS 配置并返回给前端，前端不再硬编码密钥
  - `/api/holidays` — 代理 `api.jiejiariapi.com/v1/holidays/{year}`，解决跨域问题
- **前端配置加载重构**：`config.js` 改为运行时 `fetch('/api/config')` 获取配置，移除构建期占位符替换方案
- **节假日年份动态处理**：从 `fetch('/api/holidays/2026')` 改为 `fetch('/api/holidays/' + new Date().getFullYear())`
- **基于原型重新设计前端**：参考 `docs/fluffy-time-design/` 重新实现密码页、主页、弹窗，保持毛玻璃+奶油风+新拟态，修复现有样式问题
- **卡片分类梳理确认**：节日（festival，API驱动）、倒计时（countdown，自定义）、周期性节日（recurring，自定义）、已过天数（elapsed，自定义），全部支持公历和农历
- **更新部署手册**：新增 Pages Functions 配置说明，简化环境变量注入流程（去除构建期 sed 替换）

## Capabilities

### New Capabilities
- `pages-functions`: Cloudflare Pages Functions 实现 `/api/config`（配置下发）和 `/api/holidays`（节假日 API 代理）
- `config-fetch`: 前端运行时配置加载，通过 `fetch('/api/config')` 获取密码和 OSS 参数
- `responsive-shell`: 双端响应式布局，PC 居中单栏 + 手机全宽单栏，去除 phone-shell 固定宽度限制

### Modified Capabilities
- `access-gate`: 移除开发模式密码绕过逻辑，未配置密码时弹窗提示而非允许任意密码进入
- `holiday-data`: 从固定年份改为动态获取当前年份；API 请求改为同域代理（通过 Pages Functions）
- `oss-storage`: OSS 客户端初始化参数从构建期占位符替换改为运行时 API 获取
- `deployment-guide`: 新增 Pages Functions 配置和环境变量说明，移除构建期 sed 替换脚本

## Impact

- **新增文件**：`/functions/api/config.js`、`/functions/api/holidays.js`（Pages Functions）
- **修改文件**：`index.html`、`password.html`、`css/fluffy.css`、`js/config.js`、`js/access-gate.js`、`js/holiday.js`、`js/oss-storage.js`、`js/home.js`、`js/store.js`、`js/card-render.js`、`js/modal.js`、`docs/deployment-guide.md`
- **删除文件**：`js/password.js`、`build.sh`（不再需要构建期替换）
- **外部依赖变化**：移除构建期 sed 替换，新增 Cloudflare Pages Functions 运行时
- **安全影响**：OSS 密钥和密码不再出现在静态 JS 中，仅在 Pages Functions 环境变量中管理，显著提升安全性
- **环境变量**：配置方式不变（Cloudflare Pages 环境变量），但读取时机从构建期改为运行时```

## openspec/changes/refine-countdown-site/design.md

- Source: openspec/changes/refine-countdown-site/design.md
- Lines: 1-260
- SHA256: af9ecd133c7f468fd9eaccb882a75fb15fd05a72196bacfde922cc9f6f3c9f36

[TRUNCATED]

```md
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
```

Full source: openspec/changes/refine-countdown-site/design.md

## openspec/changes/refine-countdown-site/tasks.md

- Source: openspec/changes/refine-countdown-site/tasks.md
- Lines: 1-49
- SHA256: 29e171cd953b8d29560010d00bd056b9c71ff7da2f3cdf5640ec39906eab5179

```md
## 1. Cloudflare Pages Functions 层

- [ ] 1.1 创建 `functions/api/` 目录结构，添加 `_middleware.js` 统一鉴权
- [ ] 1.2 实现 `/api/login` — POST 校验密码，生成 HMAC session cookie 并设置 HttpOnly/Secure/SameSite
- [ ] 1.3 实现 `/api/logout` — POST 清空 session cookie
- [ ] 1.4 实现 `/api/session` — GET 校验 cookie 有效性，返回 `{ authed: true }` 或 401
- [ ] 1.5 实现 `/api/config` — GET 返回前端安全运行时配置（`holidayFreeNames` 等）
- [ ] 1.6 实现 `/api/holidays/[year].js` — GET 代理 `api.jiejiariapi.com/v1/holidays/{year}`，添加边缘缓存
- [ ] 1.7 实现 `/api/data` — GET 从 OSS 读取事件配置 JSON
- [ ] 1.8 实现 `/api/data` — PUT 覆写 OSS 事件配置 JSON（V4 签名）

## 2. 前端配置加载重构

- [ ] 2.1 重写 `js/config.js` — 移除所有占位符，改为 `fetch('/api/config')` 运行时获取
- [ ] 2.2 更新 `js/access-gate.js` — 密码验证改为 POST `/api/login`，不再读取本地配置
- [ ] 2.3 重写 `js/oss-storage.js` — 移除 aliyun-oss-sdk 依赖，改为调 `/api/data` GET/PUT
- [ ] 2.4 更新 `js/holiday.js` — 请求地址改为 `/api/holidays/{year}`（动态年份）
- [ ] 2.5 删除 `js/password.js` 和 `build.sh`（不再需要构建期替换）

## 3. 双端响应式布局

- [ ] 3.1 重写 `index.html` — 移除 `phone-shell` 容器，改为 `<main class="cream-canvas">` 居中布局
- [ ] 3.2 重写 `css/fluffy.css` — 移除 390px 固定宽度约束，添加响应式断点样式
- [ ] 3.3 更新 `password.html` — 移除 phone-shell，适配居中布局
- [ ] 3.4 验证 PC 端（≥1025px）居中单栏 + 手机端（≤640px）全宽单栏

## 4. 视觉基于原型重设计

- [ ] 4.1 参考 `docs/fluffy-time-design/` 重新组织主页布局和卡片样式
- [ ] 4.2 优化新增弹窗视觉：字段分组 + segmented control 公历/农历切换 + 底部 sticky 按钮条
- [ ] 4.3 更新固定卡片区的滚动动画（IntersectionObserver + window.scrollY）
- [ ] 4.4 添加触屏拖拽兼容层（pointer events）

## 5. 卡片分类与数据梳理

- [ ] 5.1 确认 `js/time-calc.js` 支持 4 类事件：festival / countdown / recurring / elapsed
- [ ] 5.2 确认农历换算（`lunar-javascript`）在周期性事件中正确处理跨年滚动
- [ ] 5.3 节日卡片标注"法定节假日"（isOffDay）和"高速免费"（holidayFreeNames）

## 6. 集成连调

- [ ] 6.1 端到端验证：密码页 → 主页 → 节日/自定义卡片渲染 → 新增回写 → 刷新保留
- [ ] 6.2 删除 CDN 引用 aliyun-oss-sdk
- [ ] 6.3 验证所有删除文件（`js/password.js`、`build.sh`）不再影响构建

## 7. 更新部署手册

- [ ] 7.1 重写 `docs/deployment-guide.md` — 反映 Functions + 运行时环境变量新拓扑
- [ ] 7.2 添加 Pages Functions 配置说明（`functions/` 目录结构、环境变量清单）
- [ ] 7.3 移除以构建期 sed 替换相关说明```

## openspec/changes/refine-countdown-site/specs/access-gate/spec.md

- Source: openspec/changes/refine-countdown-site/specs/access-gate/spec.md
- Lines: 1-28
- SHA256: d27c615b8cc858f3f4e428f5865b6559d8cffb8ddc794dffcc6e435effff3ea9

```md
# access-gate Delta Specification

## MODIFIED Requirements

### Requirement: 密码访问控制
系统 SHALL 在用户进入主页面前展示密码输入界面，只有输入与配置密码一致时才放行进入主页。密码验证 SHALL 在 Cloudflare Pages Functions 后端执行，前端调用 `/api/login` POST 提交密码。

#### Scenario: 密码正确放行
- **WHEN** 用户在密码输入框中输入与配置一致的密码并提交
- **THEN** 系统 POST 到 `/api/login`，校验通过后收到 HttpOnly session cookie，跳转/切换到主页面，并在本次会话内记住已通过校验

#### Scenario: 密码错误拒绝
- **WHEN** 用户输入的密码与配置不一致并提交
- **THEN** 系统 POST 到 `/api/login` 返回 401，保持在密码页并给出错误提示，不暴露正确密码

#### Scenario: 未通过校验直接访问主页
- **WHEN** 用户在未通过密码校验的情况下尝试直接打开主页面
- **THEN** 系统调用 `/api/session` 返回 401，将其重定向回密码页

#### Scenario: 未配置密码（无开发模式绕过）
- **WHEN** Cloudflare Pages 环境变量 PASSWORD 不存在或为空字符串
- **THEN** 系统返回 500 "配置错误"，不放行任意输入

## REMOVED Requirements

### Requirement: 构建期占位符密码注入
**Reason**: 改为 Pages Functions 运行时从环境变量读取，前端不再持有任何密码
**Migration**: 删除构建期 sed 替换逻辑，删除 `js/config.js` 中的 `password` 字段
```

## openspec/changes/refine-countdown-site/specs/config-fetch/spec.md

- Source: openspec/changes/refine-countdown-site/specs/config-fetch/spec.md
- Lines: 1-20
- SHA256: 1647f5aa213810c307ee5c1408170d508689951bce50e1b41729ac5da0aebb2a

```md
# config-fetch Specification

## ADDED Requirements

### Requirement: 运行时配置加载
系统 SHALL 在应用初始化时通过 `fetch('/api/config')` 获取前端安全运行时配置，取代构建期占位符替换方案。配置加载完成前 SHALL 显示加载状态，加载失败 SHALL 有降级提示。

#### Scenario: 配置加载成功
- **WHEN** 应用初始化时 GET 请求 `/api/config` 成功
- **THEN** 系统将返回的配置写入运行时可访问的全局变量

#### Scenario: 配置加载失败
- **WHEN** `/api/config` 请求失败
- **THEN** 系统在控制台输出警告信息并使用默认配置降级

### Requirement: 静态 JS 中不包含密钥
系统 SHALL 确保任何静态 JS 文件中不包含密码或 OSS 密钥。密钥仅存在于 Cloudflare Pages 环境变量中，通过 Functions 运行时读取。

#### Scenario: 检查静态资源
- **WHEN** 浏览器下载任何 `.js` 文件
- **THEN** 文件中不应包含 `__PASSWORD__`、`__OSS_AK__` 等占位符或真实密钥```

## openspec/changes/refine-countdown-site/specs/deployment-guide/spec.md

- Source: openspec/changes/refine-countdown-site/specs/deployment-guide/spec.md
- Lines: 1-27
- SHA256: 67ecbd38de098ff7cfcb2d96fa0e0edf0fdf5947da95231cb953f07986020bf5

```md
# deployment-guide Delta Specification

## MODIFIED Requirements

### Requirement: 完整部署手册
项目 SHALL 输出一份完整的部署手册，覆盖 Cloudflare Pages 部署、Pages Functions 配置、环境变量配置、阿里云 OSS RAM 子账号最小权限配置与上线流程。

#### Scenario: Cloudflare Pages 部署说明
- **WHEN** 读者按手册操作部署
- **THEN** 手册提供从代码托管到 Cloudflare Pages 上线的完整步骤，包括 Functions 目录结构说明

#### Scenario: 环境变量配置说明
- **WHEN** 读者配置访问密码与 OSS 参数
- **THEN** 手册列出所有需要在 Cloudflare Pages **Runtime** 环境变量配置的变量及其含义（PASSWORD / SESSION_SECRET / OSS_REGION / OSS_BUCKET / OSS_AK / OSS_SK / OSS_OBJECT_KEY / HOLIDAY_FREE_NAMES）

#### Scenario: OSS RAM 子账号最小权限说明
- **WHEN** 读者配置阿里云 OSS 访问凭证
- **THEN** 手册说明如何创建 RAM 子账号并授予仅限指定 JSON 文件读写的最小权限策略

#### Scenario: 安全风险提示
- **WHEN** 读者阅读安全相关章节
- **THEN** 手册说明密钥仅存在于 Cloudflare Pages Functions 环境变量中，不会出现在前端静态 JS 中

## REMOVED Requirements

### Requirement: 构建期 sed 占位符替换
**Reason**: 改为 Pages Functions 运行时从环境变量读取，不再需要构建期替换
**Migration**: 删除 `build.sh` 和所有 `__PASSWORD__`/`__OSS_*__` 占位符相关说明```

## openspec/changes/refine-countdown-site/specs/holiday-data/spec.md

- Source: openspec/changes/refine-countdown-site/specs/holiday-data/spec.md
- Lines: 1-33
- SHA256: 0e81f5ed3e07bd8e681f2115df86d0fbc1df11021314312823b61756c7ba8237

```md
# holiday-data Delta Specification

## MODIFIED Requirements

### Requirement: 节假日数据接入
系统 SHALL 调用 Pages Functions 代理路径 `/api/holidays/{year}` 获取节假日数据（替代直接请求 `api.jiejiariapi.com`），解决跨域问题。返回数据 SHALL 按节日 name 分组，每个节日取该组中最早的一天作为时间计算的目标日期。

#### Scenario: 按 name 分组取最早日期
- **WHEN** 接口返回同一 name（如"春节"）的多个日期
- **THEN** 系统取这些日期中最早的一天作为该节日卡片的目标日期

#### Scenario: 接口请求失败降级
- **WHEN** 节假日接口请求失败或超时
- **THEN** 系统展示降级提示，不阻塞其他卡片的展示

#### Scenario: 动态年份与跨年滚动
- **WHEN** 应用加载时，以 `new Date().getFullYear()` 获取当前系统年份构造接口路径
- **THEN** 系统请求当前年份的节假日数据；若某节日在当前年份的目标日期已过去，则请求次年数据并滚动到次年该节日的最早日期计算倒计时

### Requirement: 法定节假日与高速免费标注
系统 SHALL 根据接口返回的 `isOffDay` 字段判定是否为法定节假日（放假日）。系统 SHALL 从 `/api/config` 获取高速免费节日名单（默认 `["春节","清明节","劳动节","国庆节"]`）进行标注。

#### Scenario: 高速免费节日标注
- **WHEN** 节日名称在 `/api/config` 返回的 `holidayFreeNames` 列表中
- **THEN** 该节日卡片标注"高速免费"

#### Scenario: 非高速免费节日不标注
- **WHEN** 节日不在 `holidayFreeNames` 列表中
- **THEN** 该节日卡片不标注"高速免费"

#### Scenario: 法定节假日判定
- **WHEN** 接口返回某日期 `isOffDay` 为 true
- **THEN** 该节日标注为"法定节假日"
```

## openspec/changes/refine-countdown-site/specs/home-experience/spec.md

- Source: openspec/changes/refine-countdown-site/specs/home-experience/spec.md
- Lines: 1-76
- SHA256: 6dcc1cb0c34499229de8b38935a0bc67fa9a127293d08dfc3045e0b8e8aa3383

```md
# home-experience Delta Specification

## MODIFIED Requirements

### Requirement: 固定卡片初始视图
主页面 SHALL 在初始进入时只展示固定的几个事件卡片，每个卡片显示标题、类型标签与走动的时间（倒计时/正计时）。卡片数据 SHALL 全部由配置驱动（OSS 自定义事件 + 节假日 API），不得硬编码在 HTML 中。

#### Scenario: 初次进入主页
- **WHEN** 用户通过密码校验进入主页
- **THEN** 页面只显示固定卡片，顶部标题栏按钮与下方事件列表尚未显现

### Requirement: 滑动动画过渡
主页面 SHALL 在用户向下滑动后，通过动画过渡显现顶部标题栏按钮与下方事件列表。

#### Scenario: 向下滑动显现
- **WHEN** 用户向下滑动超过阈值
- **THEN** 顶部标题栏按钮与下方事件列表以动画过渡浮现

#### Scenario: 减少动效偏好
- **WHEN** 用户系统开启 prefers-reduced-motion
- **THEN** 过渡动画被弱化或即时切换，功能仍可用

### Requirement: 卡片置顶
事件列表 SHALL 支持将任一卡片置顶，置顶卡片排在列表最前，且置顶状态持久化到 OSS 配置。节假日卡片（来自 API）与自定义事件卡片 SHALL 一同参与置顶。

#### Scenario: 置顶卡片
- **WHEN** 用户点击某卡片的置顶按钮
- **THEN** 该卡片移动到列表最前并标记为已置顶，状态写回 OSS

### Requirement: 卡片拖拽排序
事件列表 SHALL 支持通过拖拽调整卡片顺序，新顺序持久化到 OSS 配置。节假日卡片与自定义事件卡片 SHALL 在同一列表中统一排序。触屏设备 SHALL 支持触控拖拽。

#### Scenario: 拖拽排序
- **WHEN** 用户拖动某卡片到新位置
- **THEN** 列表按新顺序排列并写回 OSS

#### Scenario: 触屏拖拽
- **WHEN** 用户在触屏设备上拖动卡片
- **THEN** 系统使用 pointer events 兼容层完成拖拽

### Requirement: 事件编辑与删除
事件列表 SHALL 为自定义事件卡片提供编辑与删除入口，编辑复用新增弹窗，删除需二次确认。

#### Scenario: 编辑事件
- **WHEN** 用户对某自定义事件卡片点击编辑
- **THEN** 系统打开预填该事件数据的弹窗，保存后更新配置并写回 OSS

#### Scenario: 删除事件
- **WHEN** 用户对某自定义事件卡片点击删除并确认
- **THEN** 系统从配置中移除该事件并写回 OSS，页面同步移除该卡片

### Requirement: 新增事件弹窗
主页面 SHALL 提供新增事件弹窗，用于创建 4 类事件，表单根据日期体系（公历/农历）动态显示对应字段。弹窗视觉在原型基础上优化：
- 字段按"基础信息 / 日期设置 / 显示设置"分组，组间留白 20px
- 公历/农历切换使用 segmented control（左右 pill 按钮）而非 checkbox
- 保存按钮置于底部固定 sticky 条（取消 + 保存）
- 错误态在字段下方显示红色 helper text，不使用 alert

#### Scenario: 打开新增弹窗
- **WHEN** 用户点击新增事件按钮
- **THEN** 弹出优化后的新增事件弹窗

#### Scenario: 切换日期体系
- **WHEN** 用户在弹窗中切换公历/农历
- **THEN** 表单动态显示对应的日期输入字段

### Requirement: 响应式适配
主页面 SHALL 同时适配电脑端与手机端，在不同屏幕宽度下正确显示与交互。PC 端使用居中单栏布局（max-width: 720px），不使用固定宽度容器。

#### Scenario: 电脑端显示
- **WHEN** 用户在宽屏设备访问
- **THEN** 页面以居中单栏布局展示卡片与列表，最大宽度 720px

#### Scenario: 手机端显示
- **WHEN** 用户在窄屏移动设备访问
- **THEN** 页面以全宽单栏布局展示，交互元素可正常触控操作
```

## openspec/changes/refine-countdown-site/specs/oss-storage/spec.md

- Source: openspec/changes/refine-countdown-site/specs/oss-storage/spec.md
- Lines: 1-46
- SHA256: b038bd00f5b5d5650780a3f6c90001fb466e5621f8b1bc90e03088b5b420586c

```md
# oss-storage Delta Specification

## MODIFIED Requirements

### Requirement: OSS 数据读取
系统 SHALL 通过 Pages Functions `/api/data` GET 接口读取阿里云 OSS 上的事件配置 JSON。前端不再直接引用 aliyun-oss-sdk，也不持有 OSS 密钥。

#### Scenario: 成功读取配置
- **WHEN** 应用初始化且已登录
- **THEN** 系统从 `/api/data` 拉取事件配置 JSON 并渲染卡片

#### Scenario: 读取失败降级
- **WHEN** OSS 读取失败或文件不存在
- **THEN** 系统以空事件列表初始化，不崩溃并给出提示

### Requirement: OSS 数据写回
系统 SHALL 在用户新增、修改、排序或置顶事件后，通过 `/api/data` PUT 接口将完整事件配置写回 OSS。

#### Scenario: 新增事件后写回
- **WHEN** 用户在新增弹窗保存一个新事件
- **THEN** 系统将更新后的完整事件配置通过 `/api/data` PUT 写回，刷新页面后数据保留

#### Scenario: 排序/置顶后写回
- **WHEN** 用户调整卡片排序或置顶状态
- **THEN** 系统将新的顺序与置顶状态通过 `/api/data` PUT 写回

#### Scenario: 节假日卡片排序/置顶状态存储
- **WHEN** 用户对来自 API 的节假日卡片进行置顶或排序
- **THEN** 系统仅将该节假日卡片的置顶/排序状态以稳定合成 ID（如 `festival:春节`）为键存入配置的 `holidayMeta` 字段，不存储节假日数据本身；下次加载时用 API 最新数据生成节假日卡片后，再用 `holidayMeta` 覆盖其置顶/排序状态

#### Scenario: 编辑/删除事件后写回
- **WHEN** 用户编辑或删除一个自定义事件
- **THEN** 系统将更新后的完整事件配置通过 `/api/data` PUT 写回，刷新页面后变更保留

### Requirement: 前端不持有 OSS 密钥
系统 SHALL 确保前端静态 JS 中不包含任何 OSS 密钥。OSS 凭证仅存在于 Cloudflare Pages Functions 环境变量中，由后端函数在生成签名或调用 OSS API 时使用。

#### Scenario: 检查静态资源
- **WHEN** 浏览器下载任何 `.js` 文件
- **THEN** 文件中不应包含 `__OSS_AK__`、`__OSS_SK__`、`__OSS_REGION__` 等占位符或真实密钥

## REMOVED Requirements

### Requirement: OSS 凭证最小权限（前端暴露）
**Reason**: 已迁移到后端，前端不再持有密钥，但 RAM 子账号最小权限原则继续保留在部署手册
**Migration**: RAM 子账号权限策略保持不变，仅使用位置从前端 SDK 改为后端 Functions
```

## openspec/changes/refine-countdown-site/specs/pages-functions/spec.md

- Source: openspec/changes/refine-countdown-site/specs/pages-functions/spec.md
- Lines: 1-69
- SHA256: d8ab1f7a4d16453a3f4f31c188ed14a8cc1ff539576568f467832cdcf8d29297

```md
# pages-functions Specification

## ADDED Requirements

### Requirement: 配置下发接口 (/api/config)
系统 SHALL 在 `/api/config` 路径提供 GET 接口，返回前端安全运行时配置（不含密码和 OSS 密钥），响应 Content-Type SHALL 为 `application/json`。

#### Scenario: 成功获取配置
- **WHEN** 前端 GET 请求 `/api/config`
- **THEN** 返回 `{ holidayFreeNames: ["春节","清明节","劳动节","国庆节"] }` 等前端安全配置

#### Scenario: 环境变量未配置
- **WHEN** 必要的环境变量不存在
- **THEN** 返回 500 状态码及错误描述

### Requirement: 节假日 API 代理 (/api/holidays/[year])
系统 SHALL 在 `/api/holidays/{year}` 路径代理 `api.jiejiariapi.com/v1/holidays/{year}` 的响应，解决前端跨域问题。响应 SHALL 添加 `Cache-Control: public, max-age=3600` 头部。

#### Scenario: 代理成功
- **WHEN** 前端 GET 请求 `/api/holidays/2026`
- **THEN** 系统转发请求到 `api.jiejiariapi.com/v1/holidays/2026` 并返回原始响应 JSON

#### Scenario: 年份参数校验
- **WHEN** 前端传入非 4 位数字的 year 值
- **THEN** 系统自动使用当前系统年份作为代理目标

#### Scenario: 上游 API 失败
- **WHEN** `api.jiejiariapi.com` 返回错误状态码
- **THEN** 系统透传该状态码和错误信息给前端

### Requirement: OSS 数据读写接口 (/api/data)
系统 SHALL 在 `/api/data` 路径提供 GET 和 PUT 方法，分别用于读取和覆写阿里云 OSS 上的事件配置 JSON。接口 SHALL 需要有效的登陆 session cookie。

#### Scenario: 读取数据（GET）
- **WHEN** 已登录前端的 GET 请求 `/api/data`
- **THEN** 系统从 OSS 读取 `countdown-data.json` 并返回 `{ events, holidayMeta }`

#### Scenario: 写入数据（PUT）
- **WHEN** 已登录前端 PUT 请求 `/api/data` 携带完整事件配置 JSON
- **THEN** 系统将 JSON 覆写回 OSS 上的同一文件

#### Scenario: 未认证请求
- **WHEN** 未登录前端请求 `/api/data`
- **THEN** 返回 401 状态码

### Requirement: 登陆验证接口 (/api/login)
系统 SHALL 在 `/api/login` 路径提供 POST 方法，校验密码后下发 HttpOnly cookie 会话。

#### Scenario: 密码正确
- **WHEN** 用户 POST 正确的密码到 `/api/login`
- **THEN** 系统返回 200 并设置 HttpOnly、Secure、SameSite=Strict cookie

#### Scenario: 密码错误
- **WHEN** 用户 POST 错误的密码到 `/api/login`
- **THEN** 系统返回 401 状态码

#### Scenario: 密码未配置
- **WHEN** 环境变量 PASSWORD 不存在或为空
- **THEN** 系统返回 500 "配置错误"，不放行任何请求

### Requirement: 会话查询接口 (/api/session)
系统 SHALL 在 `/api/session` 路径提供 GET 方法，校验当前请求携带的 cookie 是否有效。

#### Scenario: 会话有效
- **WHEN** 前端携带有效 session cookie GET 请求 `/api/session`
- **THEN** 系统返回 `{ authed: true }`

#### Scenario: 会话过期或无效
- **WHEN** 前端携带过期 cookie 或未携带 cookie
- **THEN** 系统返回 401 状态码```

## openspec/changes/refine-countdown-site/specs/responsive-shell/spec.md

- Source: openspec/changes/refine-countdown-site/specs/responsive-shell/spec.md
- Lines: 1-31
- SHA256: f10141ca6a6865b07f0edd2cea33e2bf8d75ccfcef69b3fd0f01081200ea8b27

```md
# responsive-shell Specification

## ADDED Requirements

### Requirement: 双端响应式布局
系统 SHALL 同时适配电脑端和手机端。PC 端使用居中单栏布局（max-width: 720px），手机端（≤640px）使用全宽单栏布局。不得使用固定宽度容器（如 390px）限制视口。

#### Scenario: 电脑端居中显示
- **WHEN** 屏幕宽度 ≥ 1025px
- **THEN** 页面卡片区居中，最大宽度 720px，特色卡片区可以 2 列显示，背景显示奶油网格纹理

#### Scenario: 平板端显示
- **WHEN** 屏幕宽度 641-1024px
- **THEN** 内容居中单栏，最大宽度 640px

#### Scenario: 手机端显示
- **WHEN** 屏幕宽度 ≤ 640px
- **THEN** 卡片满宽（减去 padding），交互元素适合触控（最小 44px 触控目标）

### Requirement: 背景与布局容器
系统 SHALL 移除原 `phone-shell` 固定宽度容器，使用 `<body>` 上的奶油渐变 + 网格纹背景，内容包裹在 `<main class="cream-canvas">` 居中容器中。

#### Scenario: 背景层正确渲染
- **WHEN** 页面加载
- **THEN** 背景呈现淡奶油到淡绿的渐变 + 极淡网格线纹理

### Requirement: 减少动效支持
系统 SHALL 尊重用户 `prefers-reduced-motion` 系统偏好，动效弱化或即时切换。

#### Scenario: 动效弱化
- **WHEN** 用户系统开启 prefers-reduced-motion
- **THEN** 所有过渡动画时间缩短至接近 0```

