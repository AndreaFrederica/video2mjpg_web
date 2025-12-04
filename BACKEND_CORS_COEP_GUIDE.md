# 后端 CORS 和 COEP 配置指南

## 问题症状

前端收到错误：
```
net::ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep 206
MEDIA_ERR_SRC_NOT_SUPPORTED: MEDIA_ELEMENT_ERROR: Format error
```

这表示：
1. 后端设置了不兼容的 COEP（Cross-Origin-Embedder-Policy）头
2. 浏览器阻止了跨域资源加载

## 解决方案

### 方案 1：修改后端响应头（推荐）

#### Python FastAPI
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

app = FastAPI()

# 添加 CORS 中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应改为具体域名列表
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/preview/{session_id}")
async def get_preview(session_id: str):
    file_path = f"storage/{session_id}/preview.mp4"
    
    return FileResponse(
        file_path,
        media_type="video/mp4",
        headers={
            "Accept-Ranges": "bytes",  # ✅ 启用字节范围请求
            "Cache-Control": "public, max-age=3600",
            # ⚠️ 移除或不设置这些不兼容的头：
            # "Cross-Origin-Embedder-Policy": "require-corp",
            # "Cross-Origin-Opener-Policy": "same-origin",
        }
    )

# ⚠️ 重要：确保后端没有设置这些头
# 如果 app 级别设置了 COEP，需要移除
```

#### Node.js / Express
```javascript
const express = require('express');
const cors = require('cors');
const app = express();

// 添加 CORS
app.use(cors({
  origin: '*',  // 生产环境应改为具体域名
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['*'],
}));

app.get('/preview/:sessionId', (req, res) => {
  const filePath = `storage/${req.params.sessionId}/preview.mp4`;
  
  res.set({
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',  // ✅ 启用字节范围请求
    'Cache-Control': 'public, max-age=3600',
    // ⚠️ 不要设置这些：
    // 'Cross-Origin-Embedder-Policy': 'require-corp',
    // 'Cross-Origin-Opener-Policy': 'same-origin',
  });
  
  res.sendFile(filePath);
});

app.listen(8100, () => console.log('Server running on port 8100'));
```

#### Nginx 配置
```nginx
location /preview/ {
    # 启用 CORS
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Content-Type' always;
    
    # 视频相关头
    add_header 'Accept-Ranges' 'bytes' always;
    add_header 'Content-Type' 'video/mp4' always;
    add_header 'Cache-Control' 'public, max-age=3600' always;
    
    # ⚠️ 移除或注释掉这些：
    # add_header 'Cross-Origin-Embedder-Policy' 'require-corp' always;
    # add_header 'Cross-Origin-Opener-Policy' 'same-origin' always;
    
    # 处理 OPTIONS 请求
    if ($request_method = 'OPTIONS') {
        return 204;
    }
    
    # 处理 HEAD 请求（如果你的应用不支持 HEAD）
    # 映射到 GET 请求
    limit_except GET POST HEAD OPTIONS {
        deny all;
    }
    
    alias /path/to/storage/;
}
```

### 方案 2：前端添加错误恢复（备用）

如果无法修改后端，前端可以添加备用方案：

```javascript
async function loadVideoWithRetry(videoElement, url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      videoElement.crossOrigin = "anonymous";
      videoElement.src = url;
      videoElement.load();
      
      // 等待元数据加载
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("超时")), 10000);
        videoElement.addEventListener("loadedmetadata", () => {
          clearTimeout(timeout);
          resolve();
        }, { once: true });
        videoElement.addEventListener("error", reject, { once: true });
      });
      
      return true;
    } catch (err) {
      console.warn(`尝试 ${i + 1} 失败:`, err);
      if (i === maxRetries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1))); // 指数退避
    }
  }
}
```

## HTTP 响应头检查清单

后端的视频预览端点应该返回：

```
✅ Content-Type: video/mp4
✅ Accept-Ranges: bytes
✅ Content-Length: [file-size]
✅ Access-Control-Allow-Origin: * (或具体域名)
✅ Access-Control-Allow-Methods: GET, POST, OPTIONS
✅ Cache-Control: public, max-age=3600

❌ 不应该有：
❌ Cross-Origin-Embedder-Policy: require-corp
❌ Cross-Origin-Opener-Policy: same-origin
❌ Content-Security-Policy 限制 blob: 协议
```

## 测试方法

### 1. 用 curl 检查响应头
```bash
# 检查 HEAD 支持
curl -I http://127.0.0.1:8100/preview/session-id.mp4

# 检查 GET 支持
curl -r 0-1000 -v http://127.0.0.1:8100/preview/session-id.mp4

# 检查 OPTIONS（CORS 预检）
curl -X OPTIONS -v http://127.0.0.1:8100/preview/session-id.mp4
```

### 2. 在浏览器中检查
打开浏览器开发者工具 → Network 标签 → 选择视频请求：

```
Response Headers 应该显示：
Content-Type: video/mp4
Accept-Ranges: bytes
Access-Control-Allow-Origin: *
```

### 3. 用 ffprobe 验证 MP4 有效性
```bash
ffprobe -v error -show_format -show_streams preview.mp4
```

## 生产环境建议

### 安全的 CORS 配置
```python
ALLOWED_ORIGINS = [
    "https://yourdomain.com",
    "https://app.yourdomain.com",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)
```

### 安全的 CSP 头
```
Content-Security-Policy: 
  default-src 'self'; 
  media-src 'self' blob: https://yourdomain.com;
  connect-src 'self' https://yourdomain.com;
```

### 不要设置的头
```
❌ Cross-Origin-Embedder-Policy: require-corp
❌ Cross-Origin-Opener-Policy: same-origin
```

这些头会强制所有子资源必须显式声明 CORP（Cross-Origin-Resource-Policy），但视频标签通常无法设置这些头。

## 常见错误排查

| 错误 | 原因 | 解决方案 |
|------|------|--------|
| `ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep` | COEP 头冲突 | 移除 COEP 头或改用 credentialless 模式 |
| `405 Method Not Allowed` | 后端不支持 HEAD | 后端配置支持 HEAD，或前端改用 GET |
| `206 Partial Content` 后仍失败 | Content-Type 错误 | 确保 Content-Type 是 video/mp4 |
| 浏览器提示 "格式错误" | MP4 编码问题 | 检查是否启用了 `-movflags +faststart` |

---

**快速修复步骤：**

1. ✅ 检查后端是否设置了 `Cross-Origin-Embedder-Policy` 头
2. ✅ 如果有，移除它
3. ✅ 确保设置了 `Access-Control-Allow-Origin: *`
4. ✅ 确保设置了 `Accept-Ranges: bytes`
5. ✅ 测试 GET 请求是否能获取完整 MP4 文件

