# home-experience Specification

## Purpose
TBD - created by archiving change build-time-countdown-site. Update Purpose after archive.
## Requirements
### Requirement: 固定卡片初始视图
主页面 SHALL 在初始进入时只展示固定的几个事件卡片，每个卡片显示标题、类型标签与走动的时间（倒计时/正计时）。卡片数据 SHALL 全部由配置驱动（OSS 自定义事件 + 节假日 API），不得硬编码在 HTML 中。

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
事件列表 SHALL 支持将任一卡片置顶，置顶卡片排在列表最前，且置顶状态持久化到 OSS 配置。节假日卡片（来自 API）与自定义事件卡片 SHALL 一同参与置顶。

#### Scenario: 置顶卡片
- **WHEN** 用户点击某卡片的置顶按钮
- **THEN** 该卡片移动到列表最前并标记为已置顶，状态写回 OSS

### Requirement: 卡片拖拽排序
事件列表 SHALL 支持通过拖拽调整卡片顺序，新顺序持久化到 OSS 配置。节假日卡片与自定义事件卡片 SHALL 在同一列表中统一排序。触屏设备 SHALL 支持触控拖拽。

#### Scenario: 拖拽排序
- **WHEN** 用户拖动某卡片到新位置
- **THEN** 列表按新顺序排列并写回 OSS

#### Scenario: 触屏拖拽
- **WHEN** 用户在触屏设备上拖动卡片
- **THEN** 系统使用 pointer events 兼容层完成拖拽

### Requirement: 事件编辑与删除
事件列表 SHALL 为自定义事件卡片提供编辑与删除入口，编辑复用新增弹窗，删除需二次确认。

#### Scenario: 编辑事件
- **WHEN** 用户对某自定义事件卡片点击编辑
- **THEN** 系统打开预填该事件数据的弹窗，保存后更新配置并写回 OSS

#### Scenario: 删除事件
- **WHEN** 用户对某自定义事件卡片点击删除并确认
- **THEN** 系统从配置中移除该事件并写回 OSS，页面同步移除该卡片

### Requirement: 新增事件弹窗
主页面 SHALL 提供新增事件弹窗，用于创建 4 类事件，表单根据日期体系（公历/农历）动态显示对应字段。弹窗视觉在原型基础上优化：
- 字段按"基础信息 / 日期设置 / 显示设置"分组，组间留白 20px
- 公历/农历切换使用 segmented control（左右 pill 按钮）而非 checkbox
- 保存按钮置于底部固定 sticky 条（取消 + 保存）
- 错误态在字段下方显示红色 helper text，不使用 alert

#### Scenario: 打开新增弹窗
- **WHEN** 用户点击新增事件按钮
- **THEN** 弹出优化后的新增事件弹窗

#### Scenario: 切换日期体系
- **WHEN** 用户在弹窗中切换公历/农历
- **THEN** 表单动态显示对应的日期输入字段

### Requirement: 响应式适配
主页面 SHALL 同时适配电脑端与手机端，在不同屏幕宽度下正确显示与交互。PC 端使用居中单栏布局（max-width: 720px），不使用固定宽度容器。

#### Scenario: 电脑端显示
- **WHEN** 用户在宽屏设备访问
- **THEN** 页面以居中单栏布局展示卡片与列表，最大宽度 720px

#### Scenario: 手机端显示
- **WHEN** 用户在窄屏移动设备访问
- **THEN** 页面以全宽单栏布局展示，交互元素可正常触控操作

