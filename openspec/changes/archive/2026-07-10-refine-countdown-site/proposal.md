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
- **环境变量**：配置方式不变（Cloudflare Pages 环境变量），但读取时机从构建期改为运行时