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
