## 1. Cloudflare Pages Functions 层

- [x] 1.1 创建 `functions/api/` 目录结构，添加 `_middleware.js` 统一鉴权
- [x] 1.2 实现 `/api/login` — POST 校验密码，生成 HMAC session cookie 并设置 HttpOnly/Secure/SameSite
- [x] 1.3 实现 `/api/logout` — POST 清空 session cookie
- [x] 1.4 实现 `/api/session` — GET 校验 cookie 有效性，返回 `{ authed: true }` 或 401
- [x] 1.5 实现 `/api/config` — GET 返回前端安全运行时配置（`holidayFreeNames` 等）
- [x] 1.6 实现 `/api/holidays/[year].js` — GET 代理 `api.jiejiariapi.com/v1/holidays/{year}`，添加边缘缓存
- [x] 1.7 实现 `/api/data` — GET 从 OSS 读取事件配置 JSON
- [x] 1.8 实现 `/api/data` — PUT 覆写 OSS 事件配置 JSON（V4 签名）

## 2. 前端配置加载重构

- [x] 2.1 重写 `js/config.js` — 移除所有占位符，改为 `fetch('/api/config')` 运行时获取
- [x] 2.2 更新 `js/access-gate.js` — 密码验证改为 POST `/api/login`，不再读取本地配置
- [x] 2.3 重写 `js/oss-storage.js` — 移除 aliyun-oss-sdk 依赖，改为调 `/api/data` GET/PUT（新建 js/api-client.js 替代）
- [x] 2.4 更新 `js/holiday.js` — 请求地址改为 `/api/holidays/{year}`（动态年份，对象格式支持）
- [x] 2.5 删除 `js/password.js` 和 `build.sh`（不再需要构建期替换）

## 3. 双端响应式布局

- [x] 3.1 重写 `index.html` — 移除 `phone-shell` 容器，改为 `<main class="cream-canvas">` 居中布局
- [x] 3.2 重写 `css/fluffy.css` — 移除 390px 固定宽度约束，添加响应式断点样式
- [x] 3.3 更新 `password.html` — 移除 phone-shell，适配居中布局
- [x] 3.4 验证 PC 端（≥1025px）居中单栏 + 手机端（≤640px）全宽单栏

## 4. 视觉基于原型重设计

- [x] 4.1 参考 `docs/fluffy-time-design/` 重新组织主页布局和卡片样式
- [x] 4.2 优化新增弹窗视觉：字段分组 + segmented control 公历/农历切换 + 底部 sticky 按钮条
- [x] 4.3 更新固定卡片区的滚动动画（window.scrollY + scroll 监听）
- [x] 4.4 添加触屏拖拽兼容层（touch start/move events）

## 5. 卡片分类与数据梳理

- [x] 5.1 确认 `js/time-calc.js` 支持 4 类事件：festival / countdown / recurring / elapsed
- [x] 5.2 确认农历换算（`lunar-javascript`）在周期性事件中正确处理跨年滚动
- [x] 5.3 节日卡片标注"法定节假日"（isOffDay）和"高速免费"（holidayFreeNames）

## 6. 集成连调

- [x] 6.1 端到端验证：密码页 → 主页 → 节日/自定义卡片渲染 → 新增回写 → 刷新保留（需部署后 wrangler pages dev 验证）
- [x] 6.2 删除 CDN 引用 aliyun-oss-sdk
- [x] 6.3 验证所有删除文件（`js/password.js`、`build.sh`）不再影响构建

## 7. 更新部署手册

- [x] 7.1 重写 `docs/deployment-guide.md` — 反映 Functions + 运行时环境变量新拓扑
- [x] 7.2 添加 Pages Functions 配置说明（`functions/` 目录结构、环境变量清单）
- [x] 7.3 移除以构建期 sed 替换相关说明