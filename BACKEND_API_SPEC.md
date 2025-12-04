# 后端 FFmpeg 服务 API 规范

本文档定义了前端应用与后端 FFmpeg 服务之间的 API 接口规范。

## 鉴权

所有 API 请求可选支持 Bearer Token 鉴权。如果配置了 token，请在请求头中添加：

```
Authorization: Bearer {your_token_here}
```

## 基础 URL

假设后端服务运行在 `http://backend-server:8000`，所有 API 路径都相对于该 URL。

---

## API 端点

### 1. 健康检查

**端点**: `HEAD /health`

**描述**: 检查后端服务是否可用

**请求头**: 
- 可选: `Authorization: Bearer {token}`

**响应**:
- **200 OK**: 服务可用
- **401 Unauthorized**: 需要有效的 token
- **503 Service Unavailable**: 服务不可用

**示例**:
```bash
curl -I -H "Authorization: Bearer your_token" http://localhost:8000/health
```

---

### 2. 上传并转码视频

**端点**: `POST /prepare`

**描述**: 上传视频/GIF 文件，后端转码为 MP4 并返回预览 URL

**请求头**:
- `Content-Type: multipart/form-data`
- 可选: `Authorization: Bearer {token}`

**请求参数**:
- `file` (必需): 视频或 GIF 文件 (File object)

**响应** (200 OK):
```json
{
  "session_id": "unique_session_identifier",
  "preview_url": "http://backend-server:8000/preview/session_id.mp4",
  "duration": 10.5
}
```

**错误响应**:
```json
{
  "detail": "错误描述信息"
}
```

**HTTP 状态码**:
- **200 OK**: 成功
- **400 Bad Request**: 文件格式不支持或参数错误
- **401 Unauthorized**: 需要有效的 token
- **413 Payload Too Large**: 文件过大
- **500 Internal Server Error**: 服务器错误

**示例**:
```bash
curl -X POST \
  -H "Authorization: Bearer your_token" \
  -F "file=@video.mp4" \
  http://localhost:8000/prepare
```

---

### 3. 生成 Motion Photo

**端点**: `POST /convert`

**描述**: 根据给定的参数生成 Motion Photo (包含封面、动态效果、缩略图的 JPEG)

**请求头**:
- `Content-Type: application/x-www-form-urlencoded`
- 可选: `Authorization: Bearer {token}`

**请求参数**:
- `session_id` (必需, string): 由 `/prepare` 返回的 session ID
- `range_start` (必需, number): 视频片段开始时间 (秒)
- `range_end` (必需, number): 视频片段结束时间 (秒)
- `cover_time` (必需, number): 封面图提取时间 (秒)
- `speed` (必需, number): 视频播放速度倍数 (例如 1.0, 2.0)

**响应**:
- **200 OK**: 返回生成的 Motion Photo JPEG 文件 (二进制)
  - `Content-Type: image/jpeg`

**错误响应**:
```json
{
  "detail": "错误描述信息"
}
```

**HTTP 状态码**:
- **200 OK**: 成功
- **400 Bad Request**: 参数错误或无效的时间范围
- **401 Unauthorized**: 需要有效的 token
- **404 Not Found**: Session 不存在或已过期
- **422 Unprocessable Entity**: 处理参数错误
- **500 Internal Server Error**: 服务器错误

**示例**:
```bash
curl -X POST \
  -H "Authorization: Bearer your_token" \
  -d "session_id=abc123&range_start=0&range_end=5&cover_time=2.5&speed=1.5" \
  http://localhost:8000/convert \
  -o motion_photo.jpg
```

---

### 4. 生成缩略图 (可选)

**端点**: `POST /thumbnail`

**描述**: 为给定的视频时间戳生成缩略图

**请求头**:
- `Content-Type: application/json`
- 可选: `Authorization: Bearer {token}`

**请求体**:
```json
{
  "session_id": "session_identifier",
  "timestamp": 2.5
}
```

**响应**:
- **200 OK**: 返回缩略图 JPEG 文件 (二进制)
  - `Content-Type: image/jpeg`

**错误响应**:
```json
{
  "detail": "错误描述信息"
}
```

**HTTP 状态码**:
- **200 OK**: 成功
- **400 Bad Request**: 参数错误
- **401 Unauthorized**: 需要有效的 token
- **404 Not Found**: Session 不存在
- **422 Unprocessable Entity**: 时间戳超出范围
- **500 Internal Server Error**: 服务器错误

**示例**:
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_token" \
  -d '{"session_id":"abc123","timestamp":2.5}' \
  http://localhost:8000/thumbnail \
  -o thumbnail.jpg
```

---

### 5. 清理 Session 文件 (可选)

**端点**: `POST /cleanup`

**描述**: 清理与特定 session 相关的所有临时文件

**请求头**:
- `Content-Type: application/json`
- 可选: `Authorization: Bearer {token}`

**请求体**:
```json
{
  "session_id": "session_identifier"
}
```

**响应** (200 OK):
```json
{
  "message": "清理成功"
}
```

**HTTP 状态码**:
- **200 OK**: 清理成功
- **400 Bad Request**: 参数错误
- **401 Unauthorized**: 需要有效的 token
- **404 Not Found**: Session 不存在
- **500 Internal Server Error**: 服务器错误

**示例**:
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_token" \
  -d '{"session_id":"abc123"}' \
  http://localhost:8000/cleanup
```

---

## 错误处理

### 通用错误响应格式

```json
{
  "detail": "错误描述信息",
  "error_code": "ERROR_CODE",
  "timestamp": "2025-12-05T12:00:00Z"
}
```

### 常见错误代码

| 代码 | 说明 |
|------|------|
| `INVALID_TOKEN` | Token 无效或已过期 |
| `INVALID_SESSION` | Session ID 无效或已过期 |
| `UNSUPPORTED_FORMAT` | 不支持的文件格式 |
| `INVALID_TIME_RANGE` | 时间范围无效 |
| `FILE_TOO_LARGE` | 文件过大 |
| `PROCESSING_FAILED` | FFmpeg 处理失败 |
| `INTERNAL_ERROR` | 内部服务器错误 |

---

## Session 管理

- Session 在创建后有效期为 **24 小时** (可配置)
- 调用 `/prepare` 时自动创建新 session
- 建议在转码完成后调用 `/cleanup` 清理临时文件
- 可以使用相同 session ID 多次调用 `/convert` 生成不同参数的 Motion Photo

---

## 速率限制 (推荐)

为防止滥用，建议后端实现速率限制：

- 每个 IP 地址: 10 请求/分钟
- 每个 Token: 100 请求/分钟
- 单个文件大小: 500 MB
- 并发处理任务: 最多 3 个

---

## 超时建议

- `/prepare` 上传/转码: 300 秒 (5 分钟)
- `/convert` 生成 Motion Photo: 120 秒 (2 分钟)
- `/thumbnail` 生成缩略图: 30 秒
- `/cleanup` 清理: 10 秒

---

## 跨域 (CORS) 配置

后端需要配置 CORS 以允许来自前端的跨域请求：

```python
# 示例 (FastAPI)
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://your-domain.com"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS", "HEAD"],
    allow_headers=["*"],
)
```

---

## 参考实现

### Python FastAPI 示例

```python
from fastapi import FastAPI, File, UploadFile, Form, Header, HTTPException
from fastapi.responses import FileResponse
import tempfile
import uuid
from typing import Optional

app = FastAPI()

# Token 验证
def verify_token(authorization: Optional[str] = Header(None)):
    if not authorization:
        return None
    
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="无效的认证方案")
        
        # 验证 token 的逻辑
        if not validate_token(token):
            raise HTTPException(status_code=401, detail="Token 无效")
        
        return token
    except ValueError:
        raise HTTPException(status_code=401, detail="认证头格式错误")

@app.head("/health")
async def health_check(token: str = Header(None)):
    verify_token(token)
    return {"status": "ok"}

@app.post("/prepare")
async def prepare(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None)
):
    verify_token(authorization)
    # 实现上传和转码逻辑
    session_id = str(uuid.uuid4())
    # ... 处理文件 ...
    return {
        "session_id": session_id,
        "preview_url": f"/preview/{session_id}.mp4",
        "duration": 10.5
    }

@app.post("/convert")
async def convert(
    session_id: str = Form(...),
    range_start: float = Form(...),
    range_end: float = Form(...),
    cover_time: float = Form(...),
    speed: float = Form(...),
    authorization: Optional[str] = Header(None)
):
    verify_token(authorization)
    # 实现转码逻辑
    # ... 生成 Motion Photo ...
    return FileResponse("output.jpg", media_type="image/jpeg")
```

---

## 前端使用示例

```typescript
const backendClient = createBackendFFmpegClient({
  backendUrl: "http://localhost:8000",
  authToken: "your_token_here",
  onProgress: (info) => console.log(`${info.percentage}%`)
});

// 上传并转码
const result = await backendClient.transcodeSource(file);
console.log("Session ID:", result.sessionId);

// 生成 Motion Photo
const motionPhotoBytes = await backendClient.convertClipAndFrames({
  sessionId: result.sessionId,
  rangeStart: 0,
  rangeEnd: 5,
  coverTime: 2.5,
  speed: 1.5
});

// 清理
await backendClient.cleanupFiles(result.sessionId);
```
