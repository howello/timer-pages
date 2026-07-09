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
- **THEN** 文件中不应包含 `__PASSWORD__`、`__OSS_AK__` 等占位符或真实密钥