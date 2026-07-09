# oss-storage Specification

## Purpose
TBD - created by archiving change build-time-countdown-site. Update Purpose after archive.
## Requirements
### Requirement: OSS 配置读取
系统 SHALL 通过 aliyun-oss-sdk 从阿里云 OSS 读取存储事件配置的 JSON 文件。OSS 连接参数（region、bucket、accessKeyId、accessKeySecret 等）SHALL 来源于 Cloudflare Pages 环境变量，在构建期注入前端。

#### Scenario: 成功读取配置
- **WHEN** 应用初始化且 OSS 参数有效
- **THEN** 系统从 OSS 拉取事件配置 JSON 并渲染卡片

#### Scenario: 读取失败降级
- **WHEN** OSS 读取失败或文件不存在
- **THEN** 系统以空事件列表初始化，不崩溃并给出提示

### Requirement: OSS 配置写回
系统 SHALL 在用户新增、修改、排序或置顶事件后，将完整事件配置以 JSON 格式覆盖写回 OSS 上的同一文件（参考 `docs/alioss/upload.html` 的 put 用法）。

#### Scenario: 新增事件后写回
- **WHEN** 用户在新增弹窗保存一个新事件
- **THEN** 系统将更新后的完整事件配置覆盖写回 OSS，刷新页面后数据保留

#### Scenario: 排序/置顶后写回
- **WHEN** 用户调整卡片排序或置顶状态
- **THEN** 系统将新的顺序与置顶状态覆盖写回 OSS

#### Scenario: 节假日卡片排序/置顶状态存储
- **WHEN** 用户对来自 API 的节假日卡片进行置顶或排序
- **THEN** 系统仅将该节假日卡片的置顶/排序状态以稳定合成 ID（如 `festival:春节`）为键存入配置的 `holidayMeta` 字段，不存储节假日数据本身；下次加载时用 API 最新数据生成节假日卡片后，再用 `holidayMeta` 覆盖其置顶/排序状态

#### Scenario: 编辑/删除事件后写回
- **WHEN** 用户编辑或删除一个自定义事件
- **THEN** 系统将更新后的完整事件配置覆盖写回 OSS，刷新页面后变更保留

### Requirement: OSS 凭证最小权限
系统的 OSS 凭证 SHALL 使用 RAM 子账号，且该子账号权限 SHALL 限制为仅对指定的配置 JSON 文件读写，以控制凭证在前端暴露后的破坏面。

#### Scenario: 部署手册说明最小权限配置
- **WHEN** 用户按部署手册配置 OSS
- **THEN** 手册明确指导创建 RAM 子账号并授予仅限该 JSON 文件的最小读写权限

