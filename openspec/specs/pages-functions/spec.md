# pages-functions Specification

## Purpose
TBD - created by archiving change refine-countdown-site. Update Purpose after archive.
## Requirements
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
- **THEN** 系统返回 401 状态码

