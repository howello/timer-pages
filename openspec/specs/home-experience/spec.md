# home-experience Specification

## Purpose
TBD - created by archiving change build-time-countdown-site. Update Purpose after archive.
## Requirements
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

