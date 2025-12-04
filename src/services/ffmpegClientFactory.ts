/**
 * FFmpeg 客户端工厂
 * 支持在本地 FFmpeg.wasm 和后端 FFmpeg 服务之间切换
 */

import type { FfmpegClient, ProgressInfo, ClipResult } from "./ffmpegClient";
import { createFfmpegClient } from "./ffmpegClient";
import type { BackendFFmpegClient } from "./backendFFmpegClient";
import { createBackendFFmpegClient } from "./backendFFmpegClient";

export type ProcessingMode = "local" | "backend";

export type UnifiedFFmpegClient = {
  mode: ProcessingMode;
  ensureLoaded: () => Promise<void>;
  cleanupFiles?: (nameOrSessionId?: string) => Promise<void> | void;
  transcodeSource: (
    file: File
  ) => Promise<Uint8Array | { sessionId: string; previewUrl: string; duration: number }>;
  convertClipAndFrames: (params: any) => Promise<ClipResult | Uint8Array>;
  generateThumbnail: (timestamp: number, sessionId?: string) => Promise<Uint8Array>;
  isBackendMode: () => boolean;
};

type FactoryOptions = {
  mode: ProcessingMode;
  backendUrl?: string;
  authToken?: string;
  onProgress?: (info: ProgressInfo) => void;
  corePath?: string;
};

/**
 * 创建统一的 FFmpeg 客户端
 */
export function createUnifiedFFmpegClient(options: FactoryOptions): UnifiedFFmpegClient {
  const { mode, backendUrl, authToken, onProgress, corePath } = options;

  if (mode === "backend") {
    if (!backendUrl || !backendUrl.trim()) {
      // 后端模式但没有 URL，返回一个占位客户端
      return {
        mode: "backend",
        isBackendMode: () => true,
        ensureLoaded: async () => {
          throw new Error("后端服务 URL 未配置，请先设置");
        },
        transcodeSource: async () => {
          throw new Error("后端服务 URL 未配置，请先设置");
        },
        convertClipAndFrames: async () => {
          throw new Error("后端服务 URL 未配置，请先设置");
        },
        generateThumbnail: async () => {
          throw new Error("后端服务 URL 未配置，请先设置");
        },
      };
    }
    const backendClient = createBackendFFmpegClient({ backendUrl, authToken, onProgress });
    return {
      mode: "backend",
      isBackendMode: () => true,
      ensureLoaded: () => backendClient.ensureLoaded(),
      cleanupFiles: (sessionId?: string) => {
        if (sessionId) {
          return backendClient.cleanupFiles(sessionId);
        }
      },
      transcodeSource: (file: File) => backendClient.transcodeSource(file),
      convertClipAndFrames: (params: any) => backendClient.convertClipAndFrames(params),
      generateThumbnail: (timestamp: number, sessionId?: string) => {
        if (!sessionId) {
          throw new Error("后端模式需要 sessionId");
        }
        return backendClient.generateThumbnail(timestamp, sessionId);
      },
    };
  } else {
    // 本地模式
    const localClient = createFfmpegClient({ onProgress, corePath });
    return {
      mode: "local",
      isBackendMode: () => false,
      ensureLoaded: () => localClient.ensureLoaded(),
      cleanupFiles: (names?: string) => {
        localClient.cleanupFiles(names?.split(","));
      },
      transcodeSource: (file: File) => localClient.transcodeSource(file),
      convertClipAndFrames: (params: any) => localClient.convertClipAndFrames(params),
      generateThumbnail: (timestamp: number) => localClient.generateThumbnail(timestamp),
    };
  }
}
