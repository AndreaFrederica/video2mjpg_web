/**
 * 后端 FFmpeg 客户端
 * 支持通过 HTTP API 调用远程 FFmpeg 服务进行视频转码
 */

export type ProgressInfo = {
  ratio: number;
  percentage: number;
  elapsed: number;
  remaining: number;
  eta: string;
  elapsedFormatted: string;
};

type Options = {
  backendUrl: string;
  authToken?: string;
  onProgress?: (info: ProgressInfo) => void;
};

export type ClipResult = {
  clipBytes: Uint8Array;
  coverBytes: Uint8Array;
  thumbBytes: Uint8Array;
};

export type BackendFFmpegClient = {
  ensureLoaded: () => Promise<void>;
  cleanupFiles: (sessionId: string) => Promise<void>;
  transcodeSource: (file: File) => Promise<{ sessionId: string; previewUrl: string; duration: number }>;
  convertClipAndFrames: (params: {
    sessionId: string;
    rangeStart: number;
    rangeEnd: number;
    coverTime: number;
    speed: number;
  }) => Promise<Uint8Array>;
  generateThumbnail: (timestamp: number, sessionId: string) => Promise<Uint8Array>;
};

const formatTime = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

/**
 * 创建后端 FFmpeg 客户端
 * @param options 配置选项，包含后端 URL 和可选的进度回调
 */
export function createBackendFFmpegClient(options: Options): BackendFFmpegClient {
  const { backendUrl, authToken, onProgress } = options;

  if (!backendUrl || !backendUrl.trim()) {
    throw new Error("backendUrl 不能为空");
  }

  // 标准化 URL（移除末尾斜杠）
  const baseUrl = backendUrl.replace(/\/$/, "");

  // 构建请求头
  const buildHeaders = (customHeaders?: Record<string, string>) => {
    const headers: Record<string, string> = {
      ...customHeaders,
    };
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }
    return headers;
  };

  return {
    async ensureLoaded() {
      // 后端客户端不需要加载，只验证连接
      try {
        const resp = await fetch(`${baseUrl}/health`, { method: "HEAD" });
        if (!resp.ok) {
          throw new Error(`后端服务不可用: ${resp.statusText}`);
        }
      } catch (err) {
        throw new Error(`无法连接到后端服务 ${baseUrl}: ${err}`);
      }
    },

    async cleanupFiles(sessionId: string) {
      try {
        await fetch(`${baseUrl}/cleanup`, {
          method: "POST",
          headers: buildHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ session_id: sessionId }),
        });
      } catch (err) {
        console.warn("清理后端文件失败:", err);
      }
    },

    async transcodeSource(file: File) {
      console.log("后端转码: 准备上传文件", { fileName: file.name, fileSize: file.size, fileType: file.type });
      
      const formData = new FormData();
      formData.append("file", file);

      try {
        const resp = await fetch(`${baseUrl}/prepare`, {
          method: "POST",
          headers: buildHeaders(),
          body: formData,
        });

        console.log("后端 /prepare 响应:", { status: resp.status, statusText: resp.statusText });

        if (!resp.ok) {
          const detail = await resp.json().catch(() => ({}));
          throw new Error(`转码失败: ${detail.detail || resp.statusText}`);
        }

        const data = await resp.json();
        console.log("后端转码结果:", { 
          sessionId: data.session_id, 
          previewUrl: data.preview_url,
          duration: data.duration,
          hasSessionId: !!data.session_id,
          hasPreviewUrl: !!data.preview_url
        });
        
        return {
          sessionId: data.session_id,
          previewUrl: data.preview_url,
          duration: data.duration,
        };
      } catch (err) {
        console.error("后端转码请求失败:", {
          error: err,
          message: err instanceof Error ? err.message : String(err),
          url: `${baseUrl}/prepare`
        });
        throw err;
      }
    },

    async convertClipAndFrames(params: {
      sessionId: string;
      rangeStart: number;
      rangeEnd: number;
      coverTime: number;
      speed: number;
    }) {
      const { sessionId, rangeStart, rangeEnd, coverTime, speed } = params;

      const formData = new FormData();
      formData.append("session_id", sessionId);
      formData.append("cover_time", coverTime.toString());
      formData.append("range_start", rangeStart.toString());
      formData.append("range_end", rangeEnd.toString());
      formData.append("speed", speed.toString());

      const resp = await fetch(`${baseUrl}/convert`, {
        method: "POST",
        headers: buildHeaders(),
        body: formData,
      });

      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({}));
        throw new Error(`转换失败: ${detail.detail || resp.statusText}`);
      }

      const blob = await resp.blob();
      return new Uint8Array(await blob.arrayBuffer());
    },

    async generateThumbnail(timestamp: number, sessionId: string) {
      const resp = await fetch(`${baseUrl}/thumbnail`, {
        method: "POST",
        headers: buildHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          session_id: sessionId,
          timestamp,
        }),
      });

      if (!resp.ok) {
        throw new Error(`生成缩略图失败: ${resp.statusText}`);
      }

      const blob = await resp.blob();
      return new Uint8Array(await blob.arrayBuffer());
    },
  };
}
