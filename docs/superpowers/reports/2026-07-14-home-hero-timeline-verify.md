# 验证报告：home-hero-timeline

- 日期：2026-07-14
- Change：home-hero-timeline
- 验证模式：full（任务 17 > 3，变更文件 5 > 4）
- base-ref：2b707d9 → HEAD：5407baa（18 commit）

## 检查项结果

| # | 检查项 | 结果 | 证据 |
|---|--------|------|------|
| 1 | tasks.md 全部勾选 | PASS | 未勾选计数 0（openspec tasks 17/17，plan 49 step 全勾） |
| 2 | 变更文件与 tasks 一致 | PASS | index.html / fluffy.css / card-render.js / home.js 4 文件，time-calc.js 未改 |
| 3 | 构建（node --check ×3） | PASS | card-render / home / time-calc 均 exit 0 |
| 4 | CSS 完整性 | PASS | fluffy.css 大括号 201/201 平衡 |
| 5 | 无硬编码密钥/unsafe | PASS | 无命中 |
| 6 | 服务器实际内容（wrangler dev） | PASS | index/js/css 全 HTTP 200；新锚点存在；旧节点 0 残留 |
| 7 | 实现符合 design.md / Design Doc | PASS | D1-D7 决策均落地；Design Doc 已含 Spec Patch（当天转小时/农历分显） |
| 8 | delta spec 场景全通过 | PASS | 见下方动态验证 |
| 9 | proposal 目标满足 | PASS | 双面板信息区取代圆盘+slogan，只读，复用现有数据 |
| 10 | delta spec 与 Design Doc 无矛盾 | PASS | Spec Patch 两场景已同步回写 Design Doc |

## 动态验证（真实模块驱动，固定 now）

### getHeroMoments 数据选取（spec Requirement 3，5 Scenario）— 14 PASS / 0 FAIL
- (a) 有置顶且未到：3 行，第一行置顶，后两行按日期升序 ✓
- (b) 无置顶：三行均无置顶标记，日期升序 ✓
- (c) 置顶已到：置顶不出现，回退最近未到 ✓
- (d) 不足三行：按实际数量渲染，无占位 ✓
- (e) 当天到达：diff.days=0 转「N 小时后」，天数位非 0 ✓
- (f) 已过 festival 不进面板 ✓
- (g) formatMomentCountdown isPast 防御分支 ✓

### refreshHeroMoments 每秒刷新避免闪烁 — 7 PASS / 0 FAIL
- 初始渲染 3 行 ✓
- 同集合 refresh：行数不变、行 DOM 对象不变（仅更新文本，无重建）✓
- 集合变化 refresh：全量重建，行数/对象改变 ✓
- 空集合：无 moment-row，显示 timeline-empty「还没有重要日子」✓

### 只读性 + a11y
- buildMomentRow 仅 5×div + 9×span，0 个 button/a ✓
- `<button>` 仅存在于列表卡片 createCard（pin/edit/del），hero 行无 ✓
- section + aria-labelledby + h2 结构就位；时钟无 aria-live ✓

## 最终代码审查（standard，build 阶段已执行）
- 结论：PASS_WITH_NOTES，无 CRITICAL / IMPORTANT
- MINOR#1 死 CSS 残留 → 已派修复 agent 清理（commit 5407baa，10 项 0 命中）
- MINOR#2 formatMomentCountdown 防御分支文案（亚秒竞态瞬显「0 天后」）→ 接受，下一秒全量重建修正，不影响

## 结论

**PASS** — full 验证全部检查项通过，无 CRITICAL / IMPORTANT 遗留。

## 待人工确认（浏览器视觉，非阻塞）
以下需在浏览器实际观感确认（逻辑已通过 Node 验证，视觉留待用户）：
- 1240/980/680/420/320 五档断点无水平溢出、无文本裁切
- 移动端 ≤680 置顶行「· 置顶」合并进日期行、去 hint、省年份
- 秒位每秒变化时时分位不重排（DOM 层已验证行对象不重建）
