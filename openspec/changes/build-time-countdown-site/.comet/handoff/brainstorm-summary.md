# Brainstorm Summary

- Change: build-time-countdown-site
- Date: 2026-07-09

## 确认的技术方案

### 模块划分（JS 职责单一）
```
js/
├── config.js       # 构建期占位符替换的运行时配置（密码、OSS 参数）
├── access-gate.js  # 密码校验 + 会话态 + 主页守卫
├── lunar.js        # 农历↔公历换算封装（包裹 lunar-javascript）
├── time-calc.js    # 4 类事件时间计算（纯函数，可独立测试）
├── holiday.js      # 节假日 API 拉取 + 按 name 分组 + 高速免费标注
├── oss-storage.js  # OSS 读 / 覆盖写（包裹 aliyun-oss-sdk）
├── store.js        # 事件数据中心：合并自定义事件 + 节假日、排序/置顶/增删改
├── card-render.js  # 由配置生成卡片 DOM
├── modal.js        # 新增/编辑弹窗，公历农历动态字段
└── home.js         # 主页装配：滚动动画、拖拽、事件绑定
```
数据流：config → oss-storage → store ← holiday(API)；store → card-render → DOM；modal 增改 → 写回 oss-storage。

### 数据模型（OSS events.json）
- 顶层：`version`、`updatedAt`、`events[]`、`holidayMeta{}`
- 事件字段：`id`、`type`(festival/countdown/recurring/elapsed)、`title`、`calendar`(solar/lunar)、`date` 或 `lunarMonth`/`lunarDay`(+`lunarYear`)、`note`、`pinned`、`order`
- 节假日不存数据本身，仅以合成 ID `festival:<name>` 在 `holidayMeta` 存 pinned/order

### 关键决策（本轮 brainstorming 确认）
1. 节假日 API 年份：动态取当前年 + 跨年滚动到次年
2. 主页固定卡片 = 取置顶卡片作为固定卡片
3. 需要编辑 + 删除已有事件
4. 节假日卡片能与自定义事件一起置顶/排序

### 时间计算策略
所有类型归约为「一个公历目标时刻」再算差值。countdown=目标−现在；elapsed=现在−起始；recurring=下一次周年；festival=按name取最早日，今年已过用明年。农历经 lunar.js 换算为公历。

### 统一排序
所有卡片按 pinned 降序，再按 order 升序。

## 关键取舍与风险

- OSS 密钥前端暴露 → RAM 子账号最小权限 + 仅限单文件读写
- 并发写覆盖 → 单用户场景可接受
- 节假日 API 不可用 → 降级提示，不阻塞其他卡片
- 农历闰月/跨年边界 → 依赖 lunar-javascript，验证阶段覆盖测试
- 环境变量占位符替换失败 → 部署手册明确构建命令 + 空配置防御提示

## 测试策略

- 纯函数（time-calc/lunar）：test.html 用 console.assert 断言，含农历边界
- holiday 分组：用 2026 真实返回数据断言（春节取 02-14、高速免费标注）
- OSS 读写、主页交互、降级：手工端到端验证
- 不引入 Jest/Vitest（需 npm 构建，违反 Non-Goals）

## Spec Patch

将回写以下 delta spec：
1. event-cards：补「编辑事件」「删除事件」场景
2. home-experience：补「节假日卡片可与自定义事件一起置顶/排序」「编辑/删除入口」场景
3. oss-storage：补 `holidayMeta` 存节假日置顶/排序状态场景
4. holiday-data：补「年份动态取当前年 + 跨年滚动到次年」场景
