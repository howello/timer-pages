# AGENTS.md

本文件为在此仓库工作的 Codex / AI 助手提供项目上下文与约定。

## 项目概述

时光倒计时：基于 Cloudflare Workers + D1 的倒计时应用，采用 Fluffy 毛玻璃新拟态设计风格。无构建步骤，纯静态前端 + 单 Worker 后端。

## 架构

- **后端**：`src/worker.js` 单入口，统一处理 API 路由、会话鉴权与静态资源分发。
- **存储**：D1 `app_config` 表，整份配置以单行 JSON 快照（id=1）存取，不做字段级拆分。
- **前端**：`public/` 下纯静态资源，通过 Workers Static Assets binding 提供，无打包。脚本按依赖顺序在 `index.html` 中顺序引入，全部挂载到 `window` 命名空间。
- **鉴权**：单密码登录，HMAC-SHA256 签名的 HttpOnly cookie 会话（24h）。

## 前端模块（public/js/）

按加载顺序，模块间通过全局对象通信，无模块系统：

| 文件 | 全局对象 | 职责 |
|------|----------|------|
| `config.js` | `loadAppConfig` | 拉取静态配置 |
| `alert.js` | `UIAlert` | 自建 confirm/alert 弹窗、loading 遮罩、`runExclusive` 互斥防抖 |
| `access-gate.js` | `AccessGate` | 会话校验、登出 |
| `lunar.js` | `LunarHelper` | 农历↔公历换算（包裹 lunar-javascript） |
| `time-calc.js` | `TimeCalc` | 时间差计算、日期解析、农历/时钟格式化（纯函数） |
| `holiday.js` | — | 节假日数据获取 |
| `api-client.js` | `APIClient` | 后端 read/write |
| `store.js` | `EventStore` | 数据中心：合并自定义事件 + 节假日，增删改查、置顶、排序、持久化 |
| `card-render.js` | `CardRender` | 卡片 DOM 渲染、圆盘 spotlight、每秒走动定时器 |
| `modal.js` | `Modal` | 新增/编辑弹窗，公历/农历分段切换 |
| `home.js` | — | 主页装配：初始化、滚动揭示、拖拽、事件绑定 |

## 关键约定

- **单一置顶**：全局最多一个置顶项，`store.js` 的 `normalizeSinglePinned()` 强制约束。
- **节假日只读**：`festival:` 前缀的卡片来自 API，不可编辑/删除，只能置顶/排序。
- **防抖**：所有写操作（新增/更新/删除/置顶/排序）经 `UIAlert.runExclusive()` 包裹，操作中屏蔽重复触发并显示 loading。
- **弹窗**：一律使用自建 `UIAlert.confirm/alert`，不使用浏览器原生 `confirm/alert`。
- **样式**：单一 `public/css/fluffy.css`，CSS 变量集中在 `:root`，卡片主题走 `theme-*` class。

## 开发

```bash
wrangler dev          # 本地开发
wrangler deploy       # 部署
```

无 lint/test 脚本；JS 语法校验可用 `node --check <file>`。

## 编码风格

- 前端全部 IIFE + `'use strict'`，挂载到 `window`，兼容无模块环境。
- 中文注释，函数带 JSDoc。
- 修改后保持与既有模块一致的命名与结构。
