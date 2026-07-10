# access-gate Specification

## Purpose
TBD - created by archiving change build-time-countdown-site. Update Purpose after archive.
## Requirements
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

### Requirement: 会话记忆
系统 SHALL 在用户通过密码校验后，于当前浏览器会话内保持登录态，避免同一会话内重复输入密码。

#### Scenario: 会话内免重复输入
- **WHEN** 用户已通过密码校验，在同一会话内刷新或再次打开主页
- **THEN** 系统直接放行进入主页，无需重新输入密码

#### Scenario: 会话结束需重新校验
- **WHEN** 浏览器会话结束（关闭标签/会话存储清除）后用户再次访问
- **THEN** 系统要求重新输入密码

