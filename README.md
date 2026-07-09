# 时光倒计时

一个基于纯静态技术栈的倒计时应用，采用 Fluffy 毛玻璃新拟态设计风格。

## 技术特性

- **纯静态**：无构建打包，所有第三方库通过 CDN 引入
- **密码保护**：单密码访问机制，密码通过 Cloudflare Pages 环境变量在构建期注入
- **云端同步**：基于阿里云 OSS 的数据同步功能
- **农历支持**：使用 lunar-javascript 库支持农历日期转换
- **响应式设计**：手机优先的单栏布局

## 项目结构

```
├── index.html          # 主页面
├── password.html       # 密码验证页面
├── css/
│   └── fluffy.css     # Fluffy 设计系统样式
├── js/
│   ├── config.js      # 配置文件（包含占位符）
│   ├── password.js    # 密码验证逻辑
│   ├── lunar-helper.js # 农历转换辅助函数
│   ├── storage.js     # 本地存储与 OSS 同步
│   ├── countdown.js   # 倒计时计算逻辑
│   ├── ui.js          # UI 交互逻辑
│   └── app.js         # 应用入口
├── docs/              # 文档与设计原型
└── openspec/          # OpenSpec 规格文档
```

## CDN 依赖

- **lunar-javascript** v1.6.12：农历日期转换
- **aliyun-oss-sdk** v6.18.0：阿里云 OSS 对象存储

## 部署配置

### Cloudflare Pages 环境变量

需要在 Cloudflare Pages 项目中配置以下环境变量：

- `PASSWORD`：访问密码
- `OSS_REGION`：阿里云 OSS 区域（如 `oss-cn-hangzhou`）
- `OSS_ACCESS_KEY_ID`：OSS AccessKey ID
- `OSS_ACCESS_KEY_SECRET`：OSS AccessKey Secret
- `OSS_BUCKET`：OSS Bucket 名称
- `OSS_ENDPOINT`：OSS Endpoint（可选）

### 构建脚本

在 Cloudflare Pages 构建设置中配置：

**构建命令**：
```bash
./build.sh
```

**输出目录**：`.` 或 `dist`

构建脚本会将 `js/config.js` 中的占位符替换为环境变量的实际值。

## 本地开发

1. 直接用浏览器打开 `password.html` 或 `index.html`
2. 开发模式下，`config.js` 的占位符未替换，密码验证会自动跳过

## 功能特性

### 核心功能

- ✅ 创建倒计时事件（公历/农历）
- ✅ 固定卡片展示（最多 3 个）
- ✅ 列表展示所有事件
- ✅ 拖拽排序
- ✅ 置顶功能
- ✅ 实时倒计时更新
- ✅ 云端同步（阿里云 OSS）

### 设计特性

- 🎨 Fluffy 毛玻璃新拟态风格
- 🎨 暖色调配色（奶油、珊瑚、薄荷、天空蓝）
- 🎨 光泽动画与细节雕琢
- 📱 手机优先的响应式布局

## 许可证

MIT
