# video2mjpg-web

🎬 **GIF / 视频 → 安卓 Motion Photo** - 纯前端版本

一个强大的网页应用，可将 GIF 或视频文件转换为安卓 Motion Photo 格式（JPEG + MP4 的混合格式）。所有处理都在浏览器中完成，无需后端服务器。

## ✨ 特性

- 🎥 **支持多格式输入** - GIF、MP4、WebM 等常见视频格式
- 📱 **Motion Photo 输出** - 生成安卓 Motion Photo 格式
- 🚀 **纯前端处理** - 基于 FFmpeg.wasm，所有操作在浏览器中完成
- 🎨 **时间轴编辑** - 直观的视觉化时间轴，支持拖拽设置片头、封面、片尾
- 🖼️ **缩略图预览** - DaVinci Resolve 风格的时间轴缩略图
- ⚡ **实时预览** - 即时查看编辑结果
- 📊 **速度控制** - 自动或手动调整视频速度以达到目标时长
- 🔒 **隐私优先** - 无数据上传，完全离线处理

## 🚀 快速开始

### 在线使用

访问：https://v2mp.sirrus.cc

### 本地开发

#### 前置要求
- Node.js 18+
- pnpm 9+

#### 安装依赖
```bash
pnpm install
```

#### 开发服务器
```bash
pnpm run dev
```

然后打开 `http://localhost:5173`

#### 生产构建
```bash
pnpm run build
```

构建后的文件在 `dist/` 目录

## 📖 使用指南

### 基本流程

1. **选择文件** - 上传 GIF 或视频文件
2. **预览** - 查看文件内容和信息
3. **设置时间轴** - 使用拖拽操作设置：
   - 🟢 **片头** (Start) - 视频片段开始时间
   - 🔴 **片尾** (End) - 视频片段结束时间
   - 🟡 **封面** (Cover) - Motion Photo 封面时间
4. **调整速度** - 设置目标时长，自动或手动调整播放速度
5. **生成** - 点击转换按钮生成 Motion Photo

### 时间轴编辑

- **拖拽指针** - 精确设置时间点
- **快捷按钮** - 一键设置为当前播放时间
- **缩略图预览** - 直观查看各时间点的画面
- **播放控制** - 暂停/播放调整到精确位置

### 速度调整

- **自动速度** - 根据目标时长自动计算播放速度
- **手动速度** - 直接输入具体的速度倍数
- **目标时长** - 设置希望的视频时长

## 🛠️ 技术栈

- **框架** - Vue 3 (Composition API) + TypeScript
- **UI 框架** - Quasar
- **视频处理** - FFmpeg.wasm
- **构建工具** - Vite
- **样式** - SCSS

## 📦 部署

### Cloudflare Pages

此项目已配置支持 Cloudflare Pages 部署。

**部署步骤：**
1. 连接 Git 仓库到 Cloudflare Pages
2. 设置构建命令：`pnpm run build`
3. 设置输出目录：`dist`
4. 配置自定义域名

详细说明见 [CLOUDFLARE_PAGES.md](./CLOUDFLARE_PAGES.md)

## ⚙️ 配置

### 环境变量

项目根目录创建 `.env` 或 `.env.local` 文件：

```env
# 可选配置，默认值通常足够
VITE_PUBLIC_PATH=/
```

## 🤝 贡献

欢迎贡献！请遵循以下步骤：

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📝 许可证

本项目采用 **Mozilla Public License 2.0 (MPL 2.0)** 许可证。

详见 [LICENSE](./LICENSE) 文件。

**简单说明：**
- ✓ 可自由使用、修改和分发
- ✓ 可用于商业项目
- ✓ 修改的代码必须开源
- ✓ 必须保留版权声明

更多信息：https://opensource.org/licenses/MPL-2.0

## 🐛 问题报告

如遇到问题，请在 [GitHub Issues](https://github.com/AndreaFrederica/video2mjpg_web/issues) 中提交报告。

## 📧 联系方式

- 博客：https://blog.sirrus.cc
- 作者：Andrea Frederica
- 域名：https://sirrus.cc

## 🙏 致谢

感谢以下开源项目的支持：

- [FFmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) - 前端视频处理
- [Vue 3](https://vuejs.org/) - 进步式 JavaScript 框架
- [Quasar](https://quasar.dev/) - Vue UI 框架
- [Vite](https://vitejs.dev/) - 现代化构建工具

## 📊 项目信息

- **版本** - 0.1.0
- **Node.js** - 18+
- **pnpm** - 9.x
- **许可证** - MPL 2.0

---

Made with ❤️ by Andrea Frederica
