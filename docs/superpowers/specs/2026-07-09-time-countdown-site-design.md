---
comet_change: build-time-countdown-site
role: technical-design
canonical_spec: openspec
archived-with: 2026-07-09-build-time-countdown-site
status: final
---

# 时间倒计时静态网站 — 技术设计

> 上游事实源为 OpenSpec delta spec（`openspec/changes/build-time-countdown-site/specs/`）。
> 本文档只描述 HOW（架构、模块、数据流、算法、测试），不复制需求。

## 1. 背景与约束

把 `docs/fluffy-time-design/` 下的静态原型（毛玻璃+奶油风+新拟态）落地为可配置、数据可持久化的纯静态网站，部署到 Cloudflare Pages。

硬约束：
- **纯静态、无构建打包**：第三方库全部 CDN 引入，源码即产物
- **HTML/CSS/JS 分离**：HTML 放根目录，CSS 放 `css/`，JS 放 `js/`
- **无后端**：不引入 Workers/D1/Node/Python，不做 STS 令牌服务
- **单密码访问**：密码与 OSS 参数经 Cloudflare Pages 环境变量在构建期注入

## 2. 模块划分（职责单一）

```
js/
├── config.js         # 构建期占位符替换的运行时配置（密码、OSS 参数）
├── access-gate.js    # 密码校验 + 会话态 + 主页守卫
├── lunar.js          # 农历↔公历换算封装（包裹 lunar-javascript）
├── time-calc.js      # 4 类事件的时间计算（纯函数，可独立测试）
├── holiday.js        # 节假日 API 拉取 + 按 name 分组 + 高速免费标注
├── oss-storage.js    # OSS 读 / 覆盖写（包裹 aliyun-oss-sdk）
├── store.js          # 事件数据中心：合并「自定义事件 + 节假日」、排序/置顶/增删改
├── card-render.js    # 由配置生成卡片 DOM（固定卡片区 + 列表）
├── modal.js          # 新增/编辑弹窗，公历农历动态字段
└── home.js           # 主页装配：滚动动画、拖拽、事件绑定，串起以上模块
```

每个模块的契约：
- `config.js`：导出 `window.APP_CONFIG = { password, oss: {region,bucket,accessKeyId,accessKeySecret,objectKey} }`（占位符构建期替换）
- `access-gate.js`：`verify(input)`、`isAuthed()`、`requireAuth()`（无会话态则跳回密码页）
- `lunar.js`：`lunarToSolar(year,month,day,isLeap)`、`nextSolarOfLunar(month,day)`（求下一次公历日）
- `time-calc.js`：`resolveTargetDate(event)`（把任意事件归约为一个公历目标时刻）、`diff(now, target)`（→ 天/时/分/秒）
- `holiday.js`：`fetchHolidays(year)`、`groupByName(raw)`（取最早日）、`isHighwayFree(name)`
- `oss-storage.js`：`read()`（→ 配置对象）、`write(config)`（覆盖写回）
- `store.js`：`load()`、`getSortedCards()`、`add/update/remove(event)`、`togglePin(id)`、`reorder(ids)`
- `card-render.js`：`renderFixed(cards)`、`renderList(cards)`
- `modal.js`：`openCreate()`、`openEdit(event)`、`onSubmit(cb)`

## 3. 数据流

```
config.js ──▶ oss-storage.js ──┐
                                ├──▶ store.js ──▶ card-render.js ──▶ DOM
holiday.js (API) ──────────────┘         ▲
                                         │
                    modal.js (增/改/删) ─┘──▶ 写回 oss-storage.js
```

初始化顺序（`home.js`）：
1. `access-gate.requireAuth()` 守卫
2. 并行：`oss-storage.read()` 拉自定义事件 + `holiday.fetchHolidays(currentYear)` 拉节假日
3. `store.load()` 合并两者，应用 `holidayMeta` 覆盖节假日的 pinned/order
4. `card-render` 渲染固定卡片区（置顶卡片）+ 列表
5. 启动每秒定时器刷新走动时间
6. 绑定滚动动画、拖拽、置顶、新增/编辑/删除事件

## 4. 数据模型（OSS 上的 events.json）

```json
{
  "version": 1,
  "updatedAt": "2026-07-09T12:00:00Z",
  "events": [
    {
      "id": "evt_ab12cd",
      "type": "countdown",
      "title": "退休",
      "calendar": "solar",
      "date": "2046-07-01",
      "note": "距离新的生活节奏",
      "pinned": true,
      "order": 0
    },
    {
      "id": "evt_ef34gh",
      "type": "recurring",
      "title": "结婚纪念日",
      "calendar": "lunar",
      "lunarMonth": 8,
      "lunarDay": 16,
      "note": "",
      "pinned": false,
      "order": 1
    }
  ],
  "holidayMeta": {
    "festival:春节":   { "pinned": true,  "order": -1 },
    "festival:清明节": { "pinned": false, "order": 5 }
  }
}
```

字段语义：

| 字段 | 含义 |
|------|------|
| `type` | `festival` / `countdown` / `recurring` / `elapsed` |
| `calendar` | `solar`（公历）/ `lunar`（农历） |
| `date` | 公历事件用，`YYYY-MM-DD` |
| `lunarMonth`/`lunarDay` | 农历事件用；`elapsed`/`countdown` 农历再加 `lunarYear` |
| `lunarLeap` | 是否闰月，默认 false |
| `note` | 备注 |
| `pinned`/`order` | 置顶与排序，写回 OSS 持久化 |

## 5. 节假日置顶/排序方案（关键设计）

节假日数据来自 API、不存 OSS，但需支持置顶/排序：
- 节假日用**稳定合成 ID**：`festival:<name>`（如 `festival:春节`）
- 只把**置顶/排序状态**存进 `holidayMeta`，节日数据本身不存
- 每次加载：API 拉节日 → 生成节日卡片 → 用 `holidayMeta` 覆盖 pinned/order → 与自定义事件合并统一排序

**统一排序规则**：所有卡片按 `pinned` 降序，再按 `order` 升序。

**固定卡片区**：取 `pinned === true` 的卡片作为初始固定展示的卡片。

## 6. 时间计算与农历边界

核心策略：所有类型最终归约为「一个公历目标时刻」，再统一算差值。`time-calc.js` 为纯函数。

| 类型 | 计算逻辑 |
|------|---------|
| `countdown` | 目标公历日 − 现在，剩余天/时/分/秒 |
| `elapsed` | 现在 − 起始公历日，已过天数 |
| `recurring` | 求「下一次周年」的公历日期后倒计时 |
| `festival` | 按 name 分组取最早日 → 若今年已过用明年 → 倒计时 |

农历换算（`lunar.js` 包裹 lunar-javascript）：
- 农历周期事件：用当前公历年 + lunarMonth/lunarDay 求公历日；若已过 → 用次年
- **闰月**：`Lunar.fromYmd(year, month, day)` 中 month 传负数代表闰月；默认取常规月，遇无效日期回退该月最后一天
- **跨年滚动**：统一在「求下一次公历日」时判断 `< 今天 → 年份 +1` 后重算

节假日年份：动态取当前年 `currentYear`，若某节日今年已过则请求次年数据并滚动。

## 7. 环境变量注入

Cloudflare Pages 静态站点无运行时环境变量，采用**构建期占位符替换**：
- 仓库放 `js/config.js` 模板，含 `__PASSWORD__`、`__OSS_REGION__`、`__OSS_BUCKET__`、`__OSS_AK__`、`__OSS_SK__`、`__OSS_OBJECT_KEY__` 等占位符
- Pages 构建命令用 shell 脚本（`sed`）把占位符替换为真实环境变量值
- 页面对空/未替换配置做防御性提示

## 8. OSS 凭证安全

采用 **RAM 子账号 + 最小权限 + 只写指定 JSON 文件**：
- 子账号策略仅授予对单个 JSON 对象的 `GetObject`/`PutObject`
- 密钥仍暴露在前端，但破坏面被限制到一个文件
- 部署手册详述子账号创建与策略 JSON

## 9. 测试策略

纯静态无构建，采用轻量浏览器内验证 + 纯函数手工断言：

| 层次 | 方法 |
|------|------|
| `time-calc.js` / `lunar.js` | `test.html` 用 `console.assert` 跑固定输入输出断言（含农历边界） |
| `holiday.js` 分组 | 用 2026 真实返回数据断言（春节取 02-14、高速免费标注正确） |
| OSS 读写 | 手工端到端：新增→写回→刷新保留 |
| 主页交互 | 手工验证：滚动动画、拖拽、置顶、响应式（PC/手机） |
| 降级 | 手工模拟：API 失败、OSS 失败、密码错误 |

不引入 Jest/Vitest（需要 npm 构建，违反 Non-Goals）。

## 10. 风险与权衡

| 风险 | 缓解 |
|------|------|
| OSS 密钥前端暴露 | RAM 子账号最小权限 + 仅限单文件读写 |
| 多设备并发写覆盖 | 单用户私人站点可接受；写回前可先拉最新再合并（后续优化） |
| 节假日 API 不可用 | 降级：节日卡片占位提示，不阻塞其他卡片 |
| 农历闰月/跨年边界 | lunar.js 封装处理，test.html 覆盖边界用例 |
| 占位符替换失败 | 部署手册明确构建命令，页面对空配置防御提示 |

## 11. Spec Patch（已回写 delta spec）

1. **event-cards**：补「编辑事件」「删除事件」场景
2. **holiday-data**：补「年份动态取当前年 + 跨年滚动到次年」场景
3. **oss-storage**：补 `holidayMeta` 存节假日置顶/排序状态场景
4. **home-experience**：补「节假日卡片可与自定义事件一起置顶/排序」「编辑/删除入口」场景
