# 时间倒计时静态网站 — 部署手册

> 部署目标：Cloudflare Pages + 阿里云 OSS（纯静态、无构建打包）

---

## 一、项目结构

```
/                           根目录
├── index.html              主页（固定卡片 + 列表 + 弹窗）
├── password.html           密码进入页
├── css/fluffy.css          毛玻璃/奶油/新拟态设计系统
├── js/config.js            运行时配置（Cloudflare Pages 构建期占位符替换）
├── js/access-gate.js       密码访问控制
├── js/lunar.js             农历换算（包裹 lunar-javascript）
├── js/time-calc.js         时间计算核心（纯函数）
├── js/holiday.js           节假日 API 接入
├── js/oss-storage.js       OSS 读写
├── js/store.js             事件数据中心
├── js/card-render.js       卡片渲染
├── js/modal.js             新增/编辑弹窗
├── js/home.js              主页装配
└── docs/
    └── deployment-guide.md 本文件
```

---

## 二、Cloudflare Pages 部署

### 2.1 连接仓库

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Workers & Pages → **Pages** → **Connect to Git**
3. 选择 Git 仓库（GitHub/GitLab），授权访问
4. 选择部署分支（默认 `master` 或 `main`）

### 2.2 构建设置

由于项目是 **纯静态、无构建打包**：

| 配置项 | 值 |
|--------|-----|
| Framework preset | **No framework** |
| Build command | `sed -i "s/__PASSWORD__/${PASSWORD}/g" js/config.js`（可选） |
| Build output directory | `/` |

**推荐方式（使用 Pages 环境变量 + shell 脚本替换占位符）：**

创建 `build.sh`：

```bash
#!/bin/bash
# Cloudflare Pages 构建脚本：替换占位符
sed -i "s/__PASSWORD__/$PASSWORD/g" js/config.js
sed -i "s/__OSS_REGION__/$OSS_REGION/g" js/config.js
sed -i "s/__OSS_BUCKET__/$OSS_BUCKET/g" js/config.js
sed -i "s/__OSS_AK__/$OSS_AK/g" js/config.js
sed -i "s/__OSS_SK__/$OSS_SK/g" js/config.js
sed -i "s/__OSS_OBJECT_KEY__/$OSS_OBJECT_KEY/g" js/config.js
```

- Build command：`bash build.sh`
- Build output directory：`/`

> ⚠️ `build.sh` 需提交到仓库，**不可包含真实密钥**。

---

## 三、环境变量配置

在 Cloudflare Pages 设置中配置以下 **Build secrets** 环境变量：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `PASSWORD` | 网站访问密码 | `123456` |
| `OSS_REGION` | OSS Bucket 所在区域 | `oss-cn-hangzhou` |
| `OSS_BUCKET` | OSS Bucket 名称 | `countdown-data-xxx` |
| `OSS_AK` | RAM 子账号 AccessKey ID | `LTAI...` |
| `OSS_SK` | RAM 子账号 AccessKey Secret | `xxxx` |
| `OSS_OBJECT_KEY` | OSS 中存储事件数据的 JSON 文件名 | `countdown-data.json` |

> ⚠️ **安全提示**：这些值只存在于 Cloudflare Pages 后台，不会出现在仓库中。
> 构建期 `sed` 替换后，密码和 OSS 密钥会出现在前端的 `config.js` 中。
> 前端密钥不可避免暴露，**必须配合 OSS 最小权限策略控制破坏面**（见第四节）。

---

## 四、阿里云 OSS 配置

### 4.1 创建 Bucket

1. 登录 [阿里云 OSS 控制台](https://oss.console.aliyun.com)
2. 创建 Bucket：
   - 名称：`countdown-data-xxx`（全局唯一）
   - 地域：选择离用户近的区域（如 `oss-cn-hangzhou`）
   - 存储类型：标准存储
   - **访问权限**：**公共读**（用户浏览器需要读取 JSON）
3. 配置 CORS：
   - 新建规则：
     - AllowedOrigins: `https://你的站点.pages.dev`
     - AllowedMethods: `GET, PUT, POST, DELETE`
     - AllowedHeaders: `*`
     - ExposeHeaders: `ETag, x-oss-request-id`
     - MaxAgeSeconds: `3600`

### 4.2 RAM 子账号（最小权限）

**步骤：**

1. 进入 [RAM 控制台](https://ram.console.aliyun.com)
2. 创建用户：
   - 名称：`countdown-oss-user`
   - 访问方式：OpenAPI 调用访问（勾选 **程序访问**）
   - 获取 AccessKey ID 和 Secret（**保存好，后续不会再次显示**）
3. 创建自定义策略：

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "oss:GetObject",
        "oss:PutObject"
      ],
      "Resource": [
        "acs:oss:*:*:countdown-data-xxx/countdown-data.json"
      ]
    }
  ]
}
```

> ⚠️ 将 `countdown-data-xxx` 替换为你的 Bucket 名，`countdown-data.json` 替换为你的对象名。

4. 授权：将策略绑定到 `countdown-oss-user`

### 4.3 安全风险提示

- OSS 密钥会暴露在前端 `config.js` 中，任何访问网站的用户都能获取
- 最小权限策略将破坏面限制到**一个 JSON 文件**
- 即使密钥泄露，攻击者最多只能覆盖这一个文件
- **不要**将 OSS 凭证用于其他敏感资源

---

## 五、初始 OSS JSON 文件

首次部署前，手动上传初始 JSON 到 OSS：

```json
{
  "version": 1,
  "events": [
    {
      "id": "evt_ab12cd",
      "type": "countdown",
      "title": "退休",
      "calendar": "solar",
      "date": "2046-07-01",
      "time": "09:00",
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
      "isLeapMonth": false,
      "note": "",
      "pinned": false,
      "order": 1
    }
  ],
  "holidayMeta": {
    "festival:春节": { "pinned": true, "order": -1 },
    "festival:国庆节": { "pinned": false, "order": 5 }
  }
}
```

**上传方式：**
- 在 OSS 控制台手动上传（文件名为 `countdown-data.json`）
- 或使用 `curl`：

```bash
curl -X PUT "https://countdown-data-xxx.oss-cn-hangzhou.aliyuncs.com/countdown-data.json" \
  -H "Authorization: OSS LTAIxxxxx:xxxxx" \
  -H "Content-Type: application/json" \
  --data-binary @events.json
```

---

## 六、上线验证清单

### 6.1 密码访问

- [ ] 访问网站 → 看到密码页
- [ ] 输入正确密码 → 进入主页
- [ ] 输入错误密码 → 显示错误提示
- [ ] 直接访问 `index.html` → 未认证时跳转密码页
- [ ] 刷新主页 → 仍保持登录态（sessionStorage）
- [ ] 关闭浏览器 → 重新访问需输入密码

### 6.2 主页功能

- [ ] 初始只展示固定卡片（pinned 或前 2 张）
- [ ] 向下滚动 → 显现标题栏按钮与列表
- [ ] 卡片显示走动时间（每秒刷新）
- [ ] 点击新增按钮 → 弹窗出现，可填表单
- [ ] 保存事件 → 卡片刷新，数据写回 OSS
- [ ] 点击置顶 → 卡片置顶，状态写回 OSS
- [ ] 拖拽排序 → 顺序变化，状态写回 OSS
- [ ] 编辑自定义事件 → 弹窗预填，保存后更新
- [ ] 删除自定义事件 → 二次确认，删除后刷新
- [ ] 节日卡片不提供删除入口

### 6.3 降级场景

- [ ] 节假日 API 失败 → 不阻塞其他卡片展示
- [ ] OSS 读取失败 → 空列表初始化，不崩溃
- [ ] OSS 写入失败 → 提示错误，不阻塞页面
- [ ] 密码错误连续 5 次 → 表单锁定 10 秒

### 6.4 响应式

- [ ] 电脑端（>760px）：双栏布局，正常交互
- [ ] 手机端（≤760px）：单栏布局，可触控操作
- [ ] `prefers-reduced-motion`：动画弱化，功能可用

### 6.5 农历计算

- [ ] 农历周期事件 → 换算为正确公历日期
- [ ] 跨年滚动 → 今年已过自动用明年
- [ ] 闰月事件 → 正确处理（month 传负数）

---

## 七、常见问题

**Q: 节假日 API 返回空数据？**
A: `api.jiejiariapi.com` 可能限制某些年份数据。模块已实现降级，空数据不阻塞。如持续异常，可考虑备用 API。

**Q: 浏览器控制台报错 "OSS is not defined"？**
A: CDN 引入 `aliyun-oss-sdk` 失败。检查网络是否能访问 `gosspublic.alicdn.com`，或使用国内镜像。

**Q: 表单提交后卡片不更新？**
A: 检查 `oss-storage.js` 是否正确初始化（参数来自 `config.js` 占位符替换后的真实值）。Cloudflare Pages 构建期需运行 `sed` 替换脚本。
