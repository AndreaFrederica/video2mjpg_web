# Cloudflare Pages 部署指南

## 部署步骤

### 1. 连接 Git 仓库
- 访问 [Cloudflare Dashboard](https://dash.cloudflare.com)
- 进入 Pages 部分，点击 "Create a project"
- 选择 "Connect to Git"
- 授权并选择你的 GitHub/GitLab 仓库

### 2. 配置构建设置
在 Cloudflare Pages 设置中配置：

**Build command:**
```bash
pnpm run build
```

**Build output directory:**
```
dist
```

**Node.js version:** 18+

**Environment variables:**
无需额外配置

### 3. 部署后的重要设置

#### 启用 COOP/COEP 头部
由于此项目使用 FFmpeg.wasm 和 SharedArrayBuffer，需要特定的安全头部。

在 `_headers` 文件中已配置，Cloudflare Pages 会自动应用。

#### 自定义域名
项目已配置使用域名：**`v2mp.sirrus.cc`**

在 Cloudflare Dashboard 中：
1. 进入你的 Pages 项目
2. 选择 "Custom domains"
3. 添加 `v2mp.sirrus.cc`
4. 按照指示配置 DNS 记录（指向 Cloudflare Pages）

或者，如果你的域名已经在 Cloudflare 上管理，可以直接添加 CNAME 记录：
- 类型：CNAME
- 名称：`v2mp`
- 目标：`video2mjpg-web.pages.dev`

### 4. 环境要求
- Node.js 18 或更高版本
- pnpm 9.x

### 5. 常见问题

**Q: 为什么 FFmpeg 加载失败？**
A: 确保 COOP/COEP 头部正确配置。检查浏览器控制台是否有相关错误。

**Q: 部署后页面空白？**
A: 检查构建输出是否包含所有必要的文件。确保 dist 目录中有 index.html。

**Q: 如何自动部署？**
A: 每次推送到主分支时，Cloudflare Pages 会自动触发部署。

**Q: 域名没有指向？**
A: 确保在 Cloudflare DNS 设置中添加了 CNAME 记录，或在 Pages 项目中验证了自定义域名。

## 本地测试

在本地测试 Cloudflare Pages 构建：

```bash
pnpm run build
pnpm run preview
```

然后访问 `http://localhost:4173` 查看构建结果。

## 更多信息

- [Cloudflare Pages 文档](https://developers.cloudflare.com/pages/)
- [Wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/)
- [COOP/COEP 说明](https://web.dev/cross-origin-isolation/)

