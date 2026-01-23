# TinyML BLE Monitor

一个基于 Web Bluetooth API 的轻量级网页应用，用于实时接收和显示 TinyML 设备的轴承故障检测结果。

## 📱 功能特性

- **实时 BLE 连接**: 通过 Web Bluetooth 连接 `IoT_ML_Sensor` 设备
- **故障分类显示**: 实时显示 Normal / Ball Fault / Inner Race Fault / Outer Race Fault
- **置信度可视化**: 环形图展示推理置信度
- **数据统计**: 包数/分钟、丢包数、运行时间
- **历史记录**: 信号历史可视化
- **PWA 支持**: 可添加到主屏幕，全屏运行
- **Demo 模式**: 无需真实设备即可测试 UI

## 📲 平台支持

| 平台 | 浏览器 | 支持情况 |
|------|--------|----------|
| Android | Chrome | ✅ 完全支持 |
| iOS | Bluefy | ✅ 支持 |
| iOS | Safari/Chrome | ❌ 不支持 |
| macOS | Chrome | ✅ 支持 |
| Windows | Chrome/Edge | ✅ 支持 |

> ⚠️ **iOS 用户**: 请在 App Store 下载 [Bluefy](https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055) 浏览器

## 🚀 部署到 GitHub Pages

### 1. 创建 GitHub 仓库

```bash
cd /Users/depengsu/app_ble
git init
git add .
git commit -m "Initial commit: TinyML BLE Monitor"
```

### 2. 推送到 GitHub

```bash
git remote add origin https://github.com/YOUR_USERNAME/ble-monitor.git
git branch -M main
git push -u origin main
```

### 3. 启用 GitHub Pages

1. 进入仓库 Settings → Pages
2. Source 选择 `main` 分支
3. 保存后等待几分钟
4. 访问 `https://YOUR_USERNAME.github.io/ble-monitor/`

## 🧪 本地测试

```bash
cd /Users/depengsu/app_ble
python3 -m http.server 8080
```

打开浏览器访问: `http://localhost:8080`

> 注意: 本地测试 BLE 功能需要 HTTPS。可以使用 Demo 模式测试 UI。

## 📡 BLE 设备协议

### 设备信息

- **设备名称**: `IoT_ML_Sensor`
- **Manufacturer ID**: `0xFFFF`

### 数据包格式 (13 字节)

| 偏移 | 字段 | 类型 | 说明 |
|------|------|------|------|
| 0-1 | Header | uint8[2] | 0xA5, 0x5A |
| 2 | Version | uint8 | 协议版本 (0x01) |
| 3 | Sequence | uint8 | 序列号 (0-255) |
| 4 | Label | uint8 | 故障标签 (0-3) |
| 5-6 | Confidence | int16 | Q15 格式置信度 |
| 7-10 | Timestamp | uint32 | 时间戳 (ms) |
| 11-12 | CRC | uint16 | CRC16 校验 |

### 标签映射

| Label | 故障类型 |
|-------|---------|
| 0 | Normal |
| 1 | Ball Fault |
| 2 | Inner Race Fault |
| 3 | Outer Race Fault |

## 📁 项目结构

```
app_ble/
├── index.html      # 主页面
├── styles.css      # 样式
├── app.js          # 应用逻辑
├── ble.js          # Web Bluetooth 模块
├── manifest.json   # PWA 配置
├── sw.js           # Service Worker
├── icons/          # 应用图标
│   ├── icon-192.svg
│   └── icon-512.svg
└── README.md       # 本文档
```

## 📝 许可证

MIT License
