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
