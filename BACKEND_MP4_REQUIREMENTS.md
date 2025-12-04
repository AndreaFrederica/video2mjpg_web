# 后端 MP4 预览格式要求

## 问题分析
前端收到错误：`MEDIA_ERR_SRC_NOT_SUPPORTED: MEDIA_ELEMENT_ERROR: Format error`

这表示返回的 MP4 文件浏览器无法播放。

## 后端应保证的 MP4 格式要求

### 1. **视频编码** ✅
```
编解码器: H.264 / AVC
Profile: Baseline
Level: 3.1
```

### 2. **音频编码** ✅
```
编解码器: AAC
比特率: 128k
```

### 3. **Container 格式** ✅
```
Format: MP4
Fast Start: 必须启用 (-movflags +faststart)
  - 这确保 moov atom 在 mdat 之前
  - 允许浏览器在完全下载前开始播放
```

### 4. **Python FastAPI 后端示例**
```python
import subprocess
import os
from pathlib import Path

async def prepare_video(session_id: str, input_file: Path) -> str:
    """转码视频为浏览器兼容的 MP4 格式"""
    
    output_file = Path(f"storage/{session_id}/preview.mp4")
    output_file.parent.mkdir(parents=True, exist_ok=True)
    
    cmd = [
        "ffmpeg",
        "-y",  # 覆盖已存在的文件
        "-i", str(input_file),
        "-movflags", "+faststart",  # ⚠️ 必须启用
        "-pix_fmt", "yuv420p",
        "-c:v", "libx264",
        "-profile:v", "baseline",
        "-level", "3.1",
        "-r", "30",
        "-vf", "scale=ceil(iw/2)*2:ceil(ih/2)*2",  # 确保偶数尺寸
        "-c:a", "aac",
        "-b:a", "128k",
        str(output_file)
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"FFmpeg 错误: {result.stderr}")
    
    # 验证输出文件
    if not output_file.exists() or output_file.stat().st_size == 0:
        raise Exception("转码后的 MP4 文件为空或不存在")
    
    return output_file
```

### 5. **Node.js / Express 示例**
```javascript
const ffmpeg = require('fluent-ffmpeg');

async function prepareVideo(sessionId, inputPath) {
    const outputPath = `storage/${sessionId}/preview.mp4`;
    
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .outputOptions([
                '-movflags +faststart',  // ⚠️ 必须启用
                '-pix_fmt yuv420p',
                '-profile:v baseline',
                '-level 3.1',
                '-r 30',
                '-vf scale=ceil(iw/2)*2:ceil(ih/2)*2',
                '-c:a aac',
                '-b:a 128k'
            ])
            .output(outputPath)
            .on('end', () => {
                // 验证文件
                const stats = fs.statSync(outputPath);
                if (stats.size === 0) {
                    reject(new Error('转码后的 MP4 为空'));
                }
                resolve(outputPath);
            })
            .on('error', reject)
            .run();
    });
}
```

### 6. **HTTP 响应头设置** ✅
```python
# FastAPI
from fastapi import File, UploadFile, Response
from fastapi.responses import FileResponse

@app.post("/prepare")
async def prepare(file: UploadFile = File(...)):
    # ... 转码逻辑 ...
    
    # 返回预览 URL
    return {
        "session_id": session_id,
        "preview_url": f"/preview/{session_id}/preview.mp4",
        "duration": get_duration(preview_file)
    }

@app.get("/preview/{session_id}/{filename}")
async def get_preview(session_id: str, filename: str):
    file_path = Path(f"storage/{session_id}/{filename}")
    
    if not file_path.exists():
        raise HTTPException(status_code=404)
    
    return FileResponse(
        file_path,
        media_type="video/mp4",
        headers={
            "Accept-Ranges": "bytes",  # ⚠️ 必须启用字节范围请求
            "Cache-Control": "public, max-age=3600"
        }
    )
```

### 7. **浏览器兼容性检查清单**
- ✅ H.264 编码（所有现代浏览器支持）
- ✅ AAC 音频（所有现代浏览器支持）
- ✅ Fast Start 标志（必须）
- ✅ 正确的 Content-Type: video/mp4
- ✅ 支持 Range 请求（部分内容加载）
- ✅ 有效的 MP4 header 和 atom

### 8. **测试转码输出**
```bash
# 检查 MP4 是否有效
ffprobe -v error -show_format -show_streams preview.mp4

# 应该输出类似：
# format.format_name=mov,mp4,m4a,3gp,3g2,mj2
# streams[0].codec_type=video
# streams[0].codec_name=h264
# streams[1].codec_type=audio
# streams[1].codec_name=aac

# 检查 moov atom 位置（应该在开头）
ffmpeg -trace atoms -i preview.mp4 2>&1 | head -20
# 应该看到 moov 在 mdat 之前
```

### 9. **常见问题排查**

| 错误 | 原因 | 解决方案 |
|------|------|--------|
| `MEDIA_ERR_SRC_NOT_SUPPORTED` | 编解码器不支持 | 确保使用 H.264 + AAC |
| `MEDIA_ERR_DECODE` | MP4 结构损坏 | 确保启用 `-movflags +faststart` |
| `Connection Reset` | 文件传输中断 | 检查文件大小和网络超时 |
| 视频卡顿 | moov atom 在末尾 | 添加 `+faststart` 标志 |
| 无音频 | 音频编解码器问题 | 使用 `aac` 编码器 |

### 10. **调试建议**
在前端浏览器控制台中，你会看到：
```
验证后端视频 HEAD 响应: {
  status: 206,
  contentType: "video/mp4",
  contentLength: "15728640",
  acceptRanges: "bytes"
}
```

如果 `contentType` 不是 `video/mp4`，后端有问题。
如果 `status` 不是 200 或 206，说明文件无法访问。

### 11. **后端预览 URL 应该**
- ✅ 返回完整的 MP4 文件（不是流）
- ✅ 支持 HTTP Range 请求（部分内容）
- ✅ 设置正确的 Content-Type
- ✅ 有效期至少 1 小时
- ✅ 可以多次访问（不是一次性的）

---

**前端现在会在浏览器控制台输出详细信息，帮助诊断问题！** 🔍
