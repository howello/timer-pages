# deployment-guide Specification

## Purpose
TBD - created by archiving change build-time-countdown-site. Update Purpose after archive.
## Requirements
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

