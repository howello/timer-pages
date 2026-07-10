# responsive-shell Specification

## Purpose
TBD - created by archiving change refine-countdown-site. Update Purpose after archive.
## Requirements
### Requirement: 双端响应式布局
系统 SHALL 同时适配电脑端和手机端。PC 端使用居中单栏布局（max-width: 720px），手机端（≤640px）使用全宽单栏布局。不得使用固定宽度容器（如 390px）限制视口。

#### Scenario: 电脑端居中显示
- **WHEN** 屏幕宽度 ≥ 1025px
- **THEN** 页面卡片区居中，最大宽度 720px，特色卡片区可以 2 列显示，背景显示奶油网格纹理

#### Scenario: 平板端显示
- **WHEN** 屏幕宽度 641-1024px
- **THEN** 内容居中单栏，最大宽度 640px

#### Scenario: 手机端显示
- **WHEN** 屏幕宽度 ≤ 640px
- **THEN** 卡片满宽（减去 padding），交互元素适合触控（最小 44px 触控目标）

### Requirement: 背景与布局容器
系统 SHALL 移除原 `phone-shell` 固定宽度容器，使用 `<body>` 上的奶油渐变 + 网格纹背景，内容包裹在 `<main class="cream-canvas">` 居中容器中。

#### Scenario: 背景层正确渲染
- **WHEN** 页面加载
- **THEN** 背景呈现淡奶油到淡绿的渐变 + 极淡网格线纹理

### Requirement: 减少动效支持
系统 SHALL 尊重用户 `prefers-reduced-motion` 系统偏好，动效弱化或即时切换。

#### Scenario: 动效弱化
- **WHEN** 用户系统开启 prefers-reduced-motion
- **THEN** 所有过渡动画时间缩短至接近 0

