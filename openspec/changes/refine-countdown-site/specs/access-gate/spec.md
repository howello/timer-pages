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
