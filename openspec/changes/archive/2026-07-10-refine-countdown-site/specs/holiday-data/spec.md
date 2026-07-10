# holiday-data Delta Specification

## MODIFIED Requirements

### Requirement: 节假日数据接入
系统 SHALL 调用 Pages Functions 代理路径 `/api/holidays/{year}` 获取节假日数据（替代直接请求 `api.jiejiariapi.com`），解决跨域问题。返回数据 SHALL 按节日 name 分组，每个节日取该组中最早的一天作为时间计算的目标日期。

#### Scenario: 按 name 分组取最早日期
- **WHEN** 接口返回同一 name（如"春节"）的多个日期
- **THEN** 系统取这些日期中最早的一天作为该节日卡片的目标日期

#### Scenario: 接口请求失败降级
- **WHEN** 节假日接口请求失败或超时
- **THEN** 系统展示降级提示，不阻塞其他卡片的展示

#### Scenario: 动态年份与跨年滚动
- **WHEN** 应用加载时，以 `new Date().getFullYear()` 获取当前系统年份构造接口路径
- **THEN** 系统请求当前年份的节假日数据；若某节日在当前年份的目标日期已过去，则请求次年数据并滚动到次年该节日的最早日期计算倒计时

### Requirement: 法定节假日与高速免费标注
系统 SHALL 根据接口返回的 `isOffDay` 字段判定是否为法定节假日（放假日）。系统 SHALL 从 `/api/config` 获取高速免费节日名单（默认 `["春节","清明节","劳动节","国庆节"]`）进行标注。

#### Scenario: 高速免费节日标注
- **WHEN** 节日名称在 `/api/config` 返回的 `holidayFreeNames` 列表中
- **THEN** 该节日卡片标注"高速免费"

#### Scenario: 非高速免费节日不标注
- **WHEN** 节日不在 `holidayFreeNames` 列表中
- **THEN** 该节日卡片不标注"高速免费"

#### Scenario: 法定节假日判定
- **WHEN** 接口返回某日期 `isOffDay` 为 true
- **THEN** 该节日标注为"法定节假日"
