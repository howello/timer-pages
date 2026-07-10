# oss-storage Delta Specification

## MODIFIED Requirements

### Requirement: OSS 数据读取
系统 SHALL 通过 Pages Functions `/api/data` GET 接口读取阿里云 OSS 上的事件配置 JSON。前端不再直接引用 aliyun-oss-sdk，也不持有 OSS 密钥。

#### Scenario: 成功读取配置
- **WHEN** 应用初始化且已登录
- **THEN** 系统从 `/api/data` 拉取事件配置 JSON 并渲染卡片

#### Scenario: 读取失败降级
- **WHEN** OSS 读取失败或文件不存在
- **THEN** 系统以空事件列表初始化，不崩溃并给出提示

### Requirement: OSS 数据写回
系统 SHALL 在用户新增、修改、排序或置顶事件后，通过 `/api/data` PUT 接口将完整事件配置写回 OSS。

#### Scenario: 新增事件后写回
- **WHEN** 用户在新增弹窗保存一个新事件
- **THEN** 系统将更新后的完整事件配置通过 `/api/data` PUT 写回，刷新页面后数据保留

#### Scenario: 排序/置顶后写回
- **WHEN** 用户调整卡片排序或置顶状态
- **THEN** 系统将新的顺序与置顶状态通过 `/api/data` PUT 写回

#### Scenario: 节假日卡片排序/置顶状态存储
- **WHEN** 用户对来自 API 的节假日卡片进行置顶或排序
- **THEN** 系统仅将该节假日卡片的置顶/排序状态以稳定合成 ID（如 `festival:春节`）为键存入配置的 `holidayMeta` 字段，不存储节假日数据本身；下次加载时用 API 最新数据生成节假日卡片后，再用 `holidayMeta` 覆盖其置顶/排序状态

#### Scenario: 编辑/删除事件后写回
- **WHEN** 用户编辑或删除一个自定义事件
- **THEN** 系统将更新后的完整事件配置通过 `/api/data` PUT 写回，刷新页面后变更保留

### Requirement: 前端不持有 OSS 密钥
系统 SHALL 确保前端静态 JS 中不包含任何 OSS 密钥。OSS 凭证仅存在于 Cloudflare Pages Functions 环境变量中，由后端函数在生成签名或调用 OSS API 时使用。

#### Scenario: 检查静态资源
- **WHEN** 浏览器下载任何 `.js` 文件
- **THEN** 文件中不应包含 `__OSS_AK__`、`__OSS_SK__`、`__OSS_REGION__` 等占位符或真实密钥
