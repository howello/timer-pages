# Brainstorm Summary

- Change: refine-countdown-site
- Date: 2026-07-09

## 确认的技术方案

1. **Cloudflare Pages Functions 层**：`functions/api/` 目录，包含 login/logout/session/config/holidays/data 六个端点，统一通过 `_middleware.js` 鉴权（除 login/logout/session 外需有效 cookie）
2. **密码验证**：POST `/api/login` 后端校验 `env.PASSWORD`，HMAC-SHA256 签名生成 HttpOnly cookie（24h 过期），`env.PASSWORD` 为空时返回 500 绝不放行
3. **OSS 数据读写**：前端调 `/api/data` GET/PUT，后端持 AK/SK 签 V4 签名直接请求 OSS REST API，前端不再引 aliyun-oss-sdk
4. **节假日代理**：`/api/holidays/[year]` 转发到 `api.jiejiariapi.com`，边缘缓存 1h
5. **前端配置**：`/api/config` 返回 `holidayFreeNames` 等安全配置，`config.js` 改为运行时 fetch
6. **双端布局**：移除 phone-shell 390px 固定宽度，PC 居中单栏 max-width:720px，手机全宽单栏。参考 `docs/fluffy-time-design/` 的 desktop+phone 双 artboard 设计语言
7. **删除**：`js/password.js`、`build.sh`、aliyun-oss-sdk CDN 引用

## 关键取舍与风险

- Functions 冷启动 100-300ms → 私人站点可接受
- OSS V4 签名手搓有出错风险 → 部署前 curl 比对阿里云签名校准
- 弃用 aliyun-oss-sdk 需要重写 OSS 交互层（`js/api-client.js` 替代 `js/oss-storage.js`）

## 测试策略

- `wrangler pages dev` 本地同域模拟联调
- 密码验证：正确、错误、空配置三种场景
- OSS 读写：GET 空文件/正常文件、PUT 后 GET 验证一致性

## Spec Patch

- pages-functions: 新增 spec（新 capability）
- config-fetch: 新增 spec
- responsive-shell: 新增 spec
- access-gate: delta — 密码验证从本地改为后端
- holiday-data: delta — 请求地址改为 `/api/holidays/{year}`
- oss-storage: delta — 从 aliyun-oss-sdk 改为 `/api/data`，移除前端密钥
- home-experience: delta — 响应式约束更新
- deployment-guide: delta — 移除构建期 sed 替换说明