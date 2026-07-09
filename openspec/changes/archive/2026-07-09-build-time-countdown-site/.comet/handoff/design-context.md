# Comet Design Handoff

- Change: build-time-countdown-site
- Phase: design
- Mode: compact
- Context hash: b9e1a08c8a26b159055924614c81f7468364fcf76b8b3053a37aeb12f5dd9b68

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/build-time-countdown-site/proposal.md

- Source: openspec/changes/build-time-countdown-site/proposal.md
- Lines: 1-37
- SHA256: 14979e53f2f44e3567e1b9d7571b4bc863857824581353b1d897cee5f3b3c233

```md
## Why

用户需要一个私人的时间事件管理网站，用来集中记录和展示各类重要日期的倒计时/正计时（节日、目标日、纪念日、起始日）。现有 `docs/` 下已有毛玻璃+奶油风+新拟态的静态原型，但卡片数据全部写死在 HTML 中、无法配置、无数据持久化、无农历支持、无真实节假日数据。本次需要把原型落地为一个可配置、数据可持久化的纯静态站点，部署到 Cloudflare Pages。

## What Changes

- 新建纯静态网站（HTML/CSS/JS 分离到各自目录，HTML 放根目录），部署到 Cloudflare Pages
- **密码访问页**：进入前需输入密码，密码通过 Cloudflare Pages 环境变量配置
- **主页面**：初始只展示固定卡片（标题、类型、走动时间）；向下滑动后顶部标题栏按钮与下方事件列表通过动画过渡浮现；列表卡片支持置顶与拖拽排序
- **新增事件弹窗**：在原型基础上优化外观，用于创建各类事件
- **4 类事件卡片**：①节日 ②倒计时 ③周期性节日 ④已过天数；全部支持公历与农历（`lunar-javascript` CDN 引入）
- **节假日数据**：调用 `api.jiejiariapi.com/v1/holidays/2026` 接口，按 name 分组取最早一天计算时间，区分是否法定节假日，并标注高速免费（仅春节、清明、劳动节、国庆节）
- **数据持久化**：自定义事件配置以 JSON 保存在阿里云 OSS 上；前端通过 aliyun-oss-sdk 读取与覆盖写回（参考 `docs/alioss/`）
- **所有卡片均由配置驱动**，不写死在页面中
- 输出完整部署手册（Cloudflare Pages 环境变量、OSS RAM 子账号最小权限配置、上线步骤）

## Capabilities

### New Capabilities
- `access-gate`: 密码访问控制页，校验用户输入的密码（来源于构建期注入的环境变量）后放行进入主页
- `event-cards`: 4 类事件卡片的数据模型、时间计算（倒计时/正计时/周期循环）与公历/农历换算
- `holiday-data`: 节假日 API 接入，按 name 分组取最早日期、法定节假日判定与高速免费标注
- `oss-storage`: 阿里云 OSS 上的 JSON 配置读取与覆盖写回，OSS 参数来源于 Cloudflare Pages 环境变量
- `home-experience`: 主页面交互——固定卡片初始视图、滑动动画过渡、列表置顶与拖拽排序、新增事件弹窗
- `deployment-guide`: 完整部署手册（Cloudflare Pages 配置、OSS RAM 子账号最小权限、上线流程）

### Modified Capabilities
<!-- 无既有 spec，全部为新建能力 -->

## Impact

- **新增代码**：根目录 HTML 页面、`css/`、`js/` 目录下的样式与脚本
- **外部依赖（均 CDN 引入）**：`lunar-javascript`（农历换算）、`aliyun-oss-sdk-6.18.0`（OSS 读写）
- **外部接口**：`api.jiejiariapi.com/v1/holidays/{year}`（节假日数据）
- **外部服务**：阿里云 OSS（存储事件配置 JSON）；Cloudflare Pages（托管 + 环境变量）
- **安全影响**：OSS 凭证在纯静态站点会暴露在前端，采用 RAM 子账号 + 最小权限 + 仅限指定 JSON 文件读写来控制泄露破坏面
- **参考资产**：`docs/fluffy-time-design/`（视觉与交互原型）、`docs/alioss/`（OSS SDK 用法示例）
```

## openspec/changes/build-time-countdown-site/design.md

- Source: openspec/changes/build-time-countdown-site/design.md
- Lines: 1-80
- SHA256: 8ed0cfa28951934d60afe43799d7b24d9adff3aab45f1d75a282fd9df1bd73ed

```md
## Context

用户需要把 `docs/fluffy-time-design/` 下的静态原型（毛玻璃+奶油风+新拟态）落地为一个可配置、数据可持久化的纯静态网站，部署到 Cloudflare Pages。原型当前的卡片数据全部写死在 HTML 中，没有农历支持、没有真实节假日数据、没有持久化。

约束：
- **纯静态**：不引入任何后端服务（无 Workers/D1/Node/Python）
- **无构建步骤**：全部依赖通过 CDN 引入，源码即产物
- **HTML/CSS/JS 分离**：HTML 放根目录，CSS 放 `css/`，JS 放 `js/`
- **单密码访问**：不做多用户体系
- 部署平台为 Cloudflare Pages，密码与 OSS 参数通过其环境变量注入

参考资产：`docs/fluffy-time-design/`（视觉与交互原型 CSS/JS/HTML）、`docs/alioss/`（aliyun-oss-sdk 用法示例）。

## Goals / Non-Goals

**Goals:**
- 三个界面：密码页 → 主页 → 新增事件弹窗，保持原型的视觉与交互语言
- 4 类事件卡片（节日 / 倒计时 / 周期性节日 / 已过天数）全部由配置驱动，支持公历与农历
- 节假日数据从 `api.jiejiariapi.com` 拉取，按 name 分组取最早日期，标注法定节假日与高速免费
- 自定义事件配置以 JSON 存储在阿里云 OSS，前端读取并可覆盖写回
- 主页初始只显固定卡片，滑动后标题栏与列表动画浮现；列表支持置顶与拖拽排序
- 输出完整部署手册

**Non-Goals:**
- 不做服务端渲染、后端 API、数据库
- 不做 npm 打包构建流程
- 不做多用户、账号、权限体系
- 不实现 STS 临时令牌服务（改用 RAM 子账号最小权限方案）

## Decisions

### 1. 纯静态 + CDN 依赖
所有第三方库通过 CDN `<script>` 引入：`lunar-javascript`（农历换算）、`aliyun-oss-sdk-6.18.0`（OSS 读写）。理由：用户明确要求无构建步骤，CDN 引入即可直接部署，源码即产物。
- 备选：npm 打包 → 否决，增加构建复杂度，与"纯静态"目标冲突。

### 2. 环境变量注入方式
Cloudflare Pages 对纯静态站点没有运行时环境变量。采用**构建期占位符替换**：仓库中放置 `js/config.js` 模板（含 `__PASSWORD__` 等占位符），在 Pages 构建命令中用 shell 脚本替换为真实环境变量值。
- 备选：直接把密钥写死在 JS → 否决，无法配置且泄露到 git。
- 备选：Cloudflare Functions 提供运行时变量 → 否决，引入后端，违反 Non-Goals。

### 3. OSS 凭证安全（已与用户确认）
采用 **RAM 子账号 + 最小权限 + 只写指定 JSON 文件**。子账号策略仅授予对单个 JSON 对象的 `GetObject`/`PutObject` 权限。即使前端密钥泄露，破坏面被限制在这一个文件。
- 备选：STS 临时令牌 → 需要后端，违反 Non-Goals。
- 备选：AK/SK 明文 + 全 Bucket 权限 → 安全风险过高。
- 权衡：密钥仍会暴露在前端，但破坏面最小化。这是"纯静态可写回"约束下的合理折中。

### 4. 数据模型（OSS 上的 events.json）
单个 JSON 文件保存所有自定义事件，结构为事件数组。每个事件含：`id`、`title`、`type`（四类之一）、`calendar`（solar/lunar）、日期字段、`pinned`、`order`、类型专属标志（如 `highwayFree`、`recurring`）。节假日卡片不存 OSS，运行时从 API 动态生成。

### 5. 时间计算策略
- 倒计时：目标日 - 今天
- 已过天数：今天 - 起始日
- 周期性节日：计算今年/明年最近一次的公历日期后倒计时
- 农历事件：用 lunar-javascript 把农历日期转为当年对应公历日期再计算，跨年时滚动到下一年

### 6. 主页交互与动画
沿用原型的 IntersectionObserver + scroll 监听方案：初始只显 `fixed-card-stage`，滚动超过阈值后 `floating-header` 与 `revealed-list` 通过 CSS transition 浮现。列表拖拽复用原型的 draggable + dragover 逻辑，置顶状态与排序结果持久化回 OSS。

## Risks / Trade-offs

- **[OSS 密钥前端暴露]** → RAM 子账号最小权限 + 仅限单文件读写，破坏面限制到一个 JSON
- **[并发写覆盖]** 多设备同时编辑会互相覆盖 → 单用户私人站点场景可接受；写回前可先拉取最新再合并（后续优化）
- **[节假日 API 不可用]** → 降级：请求失败时节日卡片显示占位/提示，不阻塞其他卡片
- **[农历换算边界]** 闰月、跨年 → 依赖 lunar-javascript 处理，需在验证阶段覆盖测试
- **[环境变量占位符替换失败]** 构建脚本出错会导致密钥占位符残留 → 部署手册明确构建命令，并在页面对空配置做防御性提示

## Migration Plan

全新项目，无存量迁移。上线步骤（详见部署手册）：
1. 创建 OSS Bucket 与初始 `events.json`
2. 创建 RAM 子账号并绑定最小权限策略
3. 在 Cloudflare Pages 配置环境变量（密码、OSS region/bucket/AK/SK/objectKey）
4. 配置构建命令执行占位符替换
5. 部署并验证

回滚：Cloudflare Pages 支持一键回滚到上一次部署。

## Open Questions

- 无（关键决策已在需求澄清阶段与用户确认）
```

## openspec/changes/build-time-countdown-site/tasks.md

- Source: openspec/changes/build-time-countdown-site/tasks.md
- Lines: 1-58
- SHA256: a4ed041ae0881599603b6d4375ea0c4b59435035a2f0e4a964dc1c57efe6e227

```md
## 1. 项目骨架与基础设施

- [ ] 1.1 创建目录结构：根目录 HTML 页面、`css/`、`js/`、`js/lib/`（本地兜底可选）
- [ ] 1.2 建立 CDN 引入清单（`lunar-javascript`、`aliyun-oss-sdk-6.18.0`），在页面中引入
- [ ] 1.3 从 `docs/fluffy-time-design/css/fluffy.css` 抽取并落地基础设计系统样式到 `css/`（毛玻璃/奶油/新拟态变量与组件）
- [ ] 1.4 建立运行期配置读取方案（Cloudflare Pages 环境变量注入：密码、OSS 参数）与 `config.js` 占位

## 2. 密码访问控制（access-gate）

- [ ] 2.1 创建 `password.html`（根目录），落地毛玻璃密码卡片与显示/隐藏切换
- [ ] 2.2 实现 `js/access-gate.js`：校验输入密码是否等于环境变量注入的密码
- [ ] 2.3 校验通过后写入会话标记（sessionStorage）并跳转主页；主页在无标记时重定向回密码页
- [ ] 2.4 密码错误提示与边界处理（空输入、连续错误）

## 3. 事件数据模型与时间计算（event-cards）

- [ ] 3.1 定义 4 类事件的 JSON 数据模型（节日/倒计时/周期性节日/已过天数 + 公历/农历字段）
- [ ] 3.2 实现 `js/time-calc.js`：倒计时（目标未来）、正计时（已过天数）、周期循环（取下一次发生日）计算
- [ ] 3.3 集成 `lunar-javascript`：农历 → 公历换算，周期性农历事件求下一次公历日期
- [ ] 3.4 走动时间渲染（天/时/分/秒），每秒刷新
- [ ] 3.5 卡片渲染函数：由配置数据生成 DOM，不写死

## 4. 节假日数据接入（holiday-data）

- [ ] 4.1 实现 `js/holiday.js`：请求 `api.jiejiariapi.com/v1/holidays/{year}`
- [ ] 4.2 按 name 分组，取每组最早日期作为节日代表日
- [ ] 4.3 法定节假日判定（isOffDay）与高速免费标注（仅春节、清明、劳动节、国庆节）
- [ ] 4.4 API 失败降级处理（提示 + 空数据兜底）

## 5. OSS 存储读写（oss-storage）

- [ ] 5.1 实现 `js/oss-storage.js`：用 aliyun-oss-sdk 初始化 client（参数来自注入配置）
- [ ] 5.2 读取 OSS 上的事件配置 JSON（参考 download 示例）
- [ ] 5.3 覆盖写回事件配置 JSON（参考 upload 示例）
- [ ] 5.4 读取失败/写入失败的降级与错误提示

## 6. 主页交互体验（home-experience）

- [ ] 6.1 创建 `index.html`（根目录）主页结构：固定卡片区 + 顶部标题栏 + 下方列表
- [ ] 6.2 初始只展示固定卡片；实现滚动触发标题栏按钮与列表的动画过渡浮现
- [ ] 6.3 列表卡片置顶功能（置顶项排前 + 状态持久化到配置）
- [ ] 6.4 列表卡片拖拽排序（排序结果持久化到配置）
- [ ] 6.5 新增事件弹窗（在原型基础上优化外观），表单支持 4 类事件 + 公历/农历切换
- [ ] 6.6 新增事件提交 → 更新配置 → 回写 OSS → 刷新卡片渲染
- [ ] 6.7 PC/手机端响应式适配验证

## 7. 部署手册（deployment-guide）

- [ ] 7.1 编写 Cloudflare Pages 部署步骤（连接仓库、构建设置、环境变量配置）
- [ ] 7.2 编写阿里云 OSS 配置步骤（Bucket 创建、CORS、RAM 子账号最小权限策略、仅限指定 JSON 读写）
- [ ] 7.3 编写环境变量清单（密码、OSS region/bucket/AK/SK 等）与注入说明
- [ ] 7.4 编写初始 OSS JSON 文件示例与上线验证清单

## 8. 集成验证

- [ ] 8.1 端到端流程验证：密码 → 主页 → 节日/自定义卡片渲染 → 新增回写 → 刷新保留
- [ ] 8.2 农历事件计算正确性验证
- [ ] 8.3 响应式与降级场景验证（API 失败、OSS 失败、密码错误）
```

## openspec/changes/build-time-countdown-site/specs/access-gate/spec.md

- Source: openspec/changes/build-time-countdown-site/specs/access-gate/spec.md
- Lines: 1-27
- SHA256: 22e5ca4152c085a783518645afe40c38da3bdd81cfb03a1f5da1069d4626661b

```md
## ADDED Requirements

### Requirement: 密码访问控制
系统 SHALL 在用户进入主页面前展示密码输入界面，只有输入与配置密码一致时才放行进入主页。密码值 SHALL 来源于 Cloudflare Pages 环境变量，在构建期注入到前端可读取的配置中，不得硬编码在源码仓库。

#### Scenario: 密码正确放行
- **WHEN** 用户在密码输入框中输入与配置一致的密码并提交
- **THEN** 系统校验通过，跳转/切换到主页面，并在本次会话内记住已通过校验

#### Scenario: 密码错误拒绝
- **WHEN** 用户输入的密码与配置不一致并提交
- **THEN** 系统拒绝进入，保持在密码页并给出错误提示，不暴露正确密码

#### Scenario: 未通过校验直接访问主页
- **WHEN** 用户在未通过密码校验的情况下尝试直接打开主页面
- **THEN** 系统将其重定向回密码页

### Requirement: 会话记忆
系统 SHALL 在用户通过密码校验后，于当前浏览器会话内保持登录态，避免同一会话内重复输入密码。

#### Scenario: 会话内免重复输入
- **WHEN** 用户已通过密码校验，在同一会话内刷新或再次打开主页
- **THEN** 系统直接放行进入主页，无需重新输入密码

#### Scenario: 会话结束需重新校验
- **WHEN** 浏览器会话结束（关闭标签/会话存储清除）后用户再次访问
- **THEN** 系统要求重新输入密码
```

## openspec/changes/build-time-countdown-site/specs/deployment-guide/spec.md

- Source: openspec/changes/build-time-countdown-site/specs/deployment-guide/spec.md
- Lines: 1-20
- SHA256: 2e4ebe4d6ad6f856e1483a18bf364ae90ed6b4d9d4a7a1d128957a5cab4072ef

```md
## ADDED Requirements

### Requirement: 完整部署手册
项目 SHALL 输出一份完整的部署手册，覆盖 Cloudflare Pages 部署、环境变量配置、阿里云 OSS RAM 子账号最小权限配置与上线流程。

#### Scenario: Cloudflare Pages 部署说明
- **WHEN** 读者按手册操作部署
- **THEN** 手册提供从代码托管到 Cloudflare Pages 上线的完整步骤

#### Scenario: 环境变量配置说明
- **WHEN** 读者配置访问密码与 OSS 参数
- **THEN** 手册列出所有需要在 Cloudflare Pages 配置的环境变量及其含义

#### Scenario: OSS RAM 子账号最小权限说明
- **WHEN** 读者配置阿里云 OSS 访问凭证
- **THEN** 手册说明如何创建 RAM 子账号并授予仅限指定 JSON 文件读写的最小权限策略

#### Scenario: 安全风险提示
- **WHEN** 读者阅读安全相关章节
- **THEN** 手册明确说明 OSS 凭证在纯静态站点会暴露于前端，以及最小权限方案如何限制泄露破坏面
```

## openspec/changes/build-time-countdown-site/specs/event-cards/spec.md

- Source: openspec/changes/build-time-countdown-site/specs/event-cards/spec.md
- Lines: 1-53
- SHA256: 0e9b92228fe1b08380367353975d26b389bb6dba1ec7da7dbd88f8f4ec20cf61

```md
## ADDED Requirements

### Requirement: 事件类型模型
系统 SHALL 支持四种事件类型，每种类型有明确的时间计算语义：
- **节日（festival）**：来自节假日数据源，展示距离下一次该节日的倒计时
- **倒计时（countdown）**：距离某个未来目标日期还有多少天（如退休）
- **周期性节日（recurring）**：每年循环的纪念日（如结婚纪念日），展示距离下一次周年的倒计时
- **已过天数（elapsed）**：从某个过去的起始日期到现在已经过去多少天（如出生、恋爱）

#### Scenario: 倒计时事件计算
- **WHEN** 事件类型为倒计时且目标日期在未来
- **THEN** 卡片展示从当前时间到目标日期的剩余天数与时分秒

#### Scenario: 已过天数事件计算
- **WHEN** 事件类型为已过天数且起始日期在过去
- **THEN** 卡片展示从起始日期到当前时间已经过去的天数

#### Scenario: 周期性事件跨年滚动
- **WHEN** 事件类型为周期性节日，且今年的纪念日已过去
- **THEN** 系统自动计算距离明年该纪念日的倒计时

### Requirement: 公历与农历支持
系统 SHALL 支持公历与农历两种日期体系。农历日期 SHALL 通过 `lunar-javascript` 库换算为对应的公历日期后再参与时间计算，并正确处理周期性农历事件的下一次公历日期。

#### Scenario: 农历周期事件换算
- **WHEN** 事件以农历日期定义且为周期性（如农历某月某日）
- **THEN** 系统换算出该农历日期在当前或次年对应的公历日期，并据此计算倒计时

#### Scenario: 公历事件直接计算
- **WHEN** 事件以公历日期定义
- **THEN** 系统直接使用该公历日期进行时间计算，无需农历换算

### Requirement: 走动时间展示
系统 SHALL 在卡片上实时展示走动的时间（倒计时或正计时），并按秒刷新。

#### Scenario: 时间每秒刷新
- **WHEN** 卡片处于展示状态
- **THEN** 卡片上的时间数值每秒更新一次

### Requirement: 事件编辑与删除
系统 SHALL 支持对已有自定义事件（countdown / recurring / elapsed）进行编辑与删除。编辑复用新增弹窗并回填当前值，删除需二次确认。编辑或删除后 SHALL 将更新后的完整事件配置写回 OSS。节日（festival）事件来自 API，不支持编辑与删除其数据本身。

#### Scenario: 编辑自定义事件
- **WHEN** 用户对某个自定义事件触发编辑并保存修改
- **THEN** 系统更新该事件字段，重新渲染卡片，并将完整配置写回 OSS

#### Scenario: 删除自定义事件
- **WHEN** 用户对某个自定义事件触发删除并确认
- **THEN** 系统从事件配置中移除该事件，重新渲染，并将完整配置写回 OSS

#### Scenario: 节日事件不可删除数据
- **WHEN** 用户查看来自 API 的节日卡片
- **THEN** 系统不提供删除其节日数据的入口（仅允许调整置顶/排序）
```

## openspec/changes/build-time-countdown-site/specs/holiday-data/spec.md

- Source: openspec/changes/build-time-countdown-site/specs/holiday-data/spec.md
- Lines: 1-31
- SHA256: aad60fe32de981692bc1722fc8540fe16dce682d989afbe87e2477cada110559

```md
## ADDED Requirements

### Requirement: 节假日数据接入
系统 SHALL 调用 `api.jiejiariapi.com/v1/holidays/{year}` 接口获取节假日数据。返回数据 SHALL 按节日 name 分组，每个节日取该组中最早的一天作为时间计算的目标日期。

#### Scenario: 按 name 分组取最早日期
- **WHEN** 接口返回同一 name（如"春节"）的多个日期
- **THEN** 系统取这些日期中最早的一天作为该节日卡片的目标日期

#### Scenario: 接口请求失败降级
- **WHEN** 节假日接口请求失败或超时
- **THEN** 系统展示降级提示，不阻塞其他卡片的展示

#### Scenario: 动态年份与跨年滚动
- **WHEN** 应用加载时，以当前系统年份构造接口路径（如当前为 2026 年则请求 `/holidays/2026`）
- **THEN** 系统请求当前年份的节假日数据；若某节日在当前年份的目标日期已过去，则请求次年数据并滚动到次年该节日的最早日期计算倒计时

### Requirement: 法定节假日与高速免费标注
系统 SHALL 根据接口返回的 `isOffDay` 字段判定是否为法定节假日（放假日）。系统 SHALL 对春节、清明节、劳动节、国庆节四个节日标注"高速免费"，其余节日不标注。

#### Scenario: 高速免费节日标注
- **WHEN** 节日为春节、清明节、劳动节或国庆节
- **THEN** 该节日卡片标注"高速免费"

#### Scenario: 非高速免费节日不标注
- **WHEN** 节日为元旦、端午节、中秋节等
- **THEN** 该节日卡片不标注"高速免费"

#### Scenario: 法定节假日判定
- **WHEN** 接口返回某日期 `isOffDay` 为 true
- **THEN** 该节日标注为"法定节假日"
```

## openspec/changes/build-time-countdown-site/specs/home-experience/spec.md

- Source: openspec/changes/build-time-countdown-site/specs/home-experience/spec.md
- Lines: 1-74
- SHA256: fac6c72e94672ffc1492a8d5f0548996fec0a6b024c3589bea16c58eaa04d8cb

```md
## ADDED Requirements

### Requirement: 固定卡片初始视图
主页面 SHALL 在初始进入时只展示固定的几个事件卡片，每个卡片显示标题、类型标签与走动的时间（倒计时/正计时）。

#### Scenario: 初次进入主页
- **WHEN** 用户通过密码校验进入主页
- **THEN** 页面只显示固定卡片，顶部标题栏按钮与下方事件列表尚未显现

### Requirement: 滑动动画过渡
主页面 SHALL 在用户向下滑动后，通过动画过渡显现顶部标题栏按钮与下方事件列表。

#### Scenario: 向下滑动显现
- **WHEN** 用户向下滑动超过阈值
- **THEN** 顶部标题栏按钮与下方事件列表以动画过渡浮现

#### Scenario: 减少动效偏好
- **WHEN** 用户系统开启 prefers-reduced-motion
- **THEN** 过渡动画被弱化或即时切换，功能仍可用

### Requirement: 卡片置顶
事件列表 SHALL 支持将任一卡片置顶，置顶卡片排在列表最前，且置顶状态持久化到 OSS 配置。节假日卡片（来自 API）与自定义事件卡片 SHALL 一同参与置顶，节假日卡片的置顶状态以其稳定合成 ID（`festival:<name>`）记录在 OSS 配置的 `holidayMeta` 中。

#### Scenario: 置顶卡片
- **WHEN** 用户点击某卡片的置顶按钮
- **THEN** 该卡片移动到列表最前并标记为已置顶，状态写回 OSS

#### Scenario: 节假日卡片置顶
- **WHEN** 用户置顶一个来自 API 的节假日卡片
- **THEN** 系统将该置顶状态以 `festival:<name>` 记录到 `holidayMeta` 并写回 OSS，刷新后节假日卡片仍保持置顶

### Requirement: 卡片拖拽排序
事件列表 SHALL 支持通过拖拽调整卡片顺序，新顺序持久化到 OSS 配置。节假日卡片与自定义事件卡片 SHALL 在同一列表中统一排序，所有卡片按 `pinned` 降序、`order` 升序统一排列。

#### Scenario: 拖拽排序
- **WHEN** 用户拖动某卡片到新位置
- **THEN** 列表按新顺序排列并写回 OSS

#### Scenario: 节假日与自定义卡片混合排序
- **WHEN** 用户拖动节假日卡片与自定义卡片调整相对顺序
- **THEN** 系统统一记录各卡片顺序（节假日卡片顺序存入 `holidayMeta`，自定义事件顺序存入其自身 `order`）并写回 OSS

### Requirement: 事件编辑与删除
事件列表 SHALL 为自定义事件卡片提供编辑与删除入口，编辑复用新增弹窗，删除需二次确认，变更后写回 OSS。

#### Scenario: 编辑事件
- **WHEN** 用户对某自定义事件卡片点击编辑
- **THEN** 系统打开预填该事件数据的弹窗，保存后更新配置并写回 OSS

#### Scenario: 删除事件
- **WHEN** 用户对某自定义事件卡片点击删除并确认
- **THEN** 系统从配置中移除该事件并写回 OSS，页面同步移除该卡片

### Requirement: 新增事件弹窗
主页面 SHALL 提供新增事件弹窗，用于创建 4 类事件，表单根据日期体系（公历/农历）动态显示对应字段，并在保存后写回 OSS。

#### Scenario: 打开新增弹窗
- **WHEN** 用户点击新增事件按钮
- **THEN** 弹出优化后的新增事件弹窗

#### Scenario: 切换日期体系
- **WHEN** 用户在弹窗中切换公历/农历
- **THEN** 表单动态显示对应的日期输入字段

### Requirement: 响应式适配
主页面 SHALL 同时适配电脑端与手机端，在不同屏幕宽度下正确显示与交互。

#### Scenario: 电脑端显示
- **WHEN** 用户在宽屏设备访问
- **THEN** 页面以适合宽屏的布局展示卡片与列表

#### Scenario: 手机端显示
- **WHEN** 用户在窄屏移动设备访问
- **THEN** 页面以单栏布局展示，交互元素可正常触控操作
```

## openspec/changes/build-time-countdown-site/specs/oss-storage/spec.md

- Source: openspec/changes/build-time-countdown-site/specs/oss-storage/spec.md
- Lines: 1-38
- SHA256: 1889c59d67699e3ec7e84d7be2d69d86a9292f651c244086cf055fe251e1dd6c

```md
## ADDED Requirements

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
```

