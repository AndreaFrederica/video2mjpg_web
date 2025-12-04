<template>
  <q-layout view="lHh Lpr lFf">
    <q-page-container>
      <q-page class="app-page q-pa-md q-pa-lg-md">
        <div class="page-header">
          <div>
            <div class="title">GIF / 视频 → 安卓 Motion Photo（动态照片）</div>
            <div class="subtitle">纯前端版，基于 FFmpeg.wasm</div>
          </div>
          <div class="status-chip">
            <q-badge color="primary" outline v-if="ffmpegReady">FFmpeg 已加载</q-badge>
            <q-badge color="warning" outline v-else>FFmpeg 未加载</q-badge>
          </div>
        </div>

        <q-banner class="note-banner q-mb-lg" rounded>
          ⚡ 支持本地处理（FFmpeg.wasm）和后端服务加速两种模式。
        </q-banner>

        <BackendConfig
          :model-value="processingMode"
          :backend-url-prop="backendUrl"
          :auth-token-prop="authToken"
          @update:model-value="handleModeChange"
          @update:backend-url="handleBackendUrlChange"
          @update:auth-token="handleAuthTokenChange"
          @connection-status="handleConnectionStatus"
        />

        <div class="content-grid">
          <q-card flat bordered class="section-card">
            <q-card-section>
              <div class="section-title">选择 GIF / 视频文件</div>
              <q-file
                v-model="selectedFile"
                accept="image/gif,video/*"
                outlined
                clearable
                :disable="isConverting"
                @update:model-value="handleFileChange"
                label="点击或拖拽文件到此处"
                counter
              >
                <template #prepend>
                  <q-icon name="upload" />
                </template>
              </q-file>
              <div class="status-text">{{ fileStatus }}</div>
            </q-card-section>
          </q-card>

          <q-card flat bordered class="section-card">
            <q-card-section>
              <div class="section-title">预览</div>
              <div class="video-shell">
                <video ref="videoRef" class="preview-video" controls playsinline crossorigin="anonymous"></video>
              </div>
              <div class="status-text">{{ videoStatus }}</div>
              <div v-if="isPrepareProgress" class="progress-container q-mt-sm">
                <q-linear-progress
                  :value="progressValue"
                  color="primary"
                  track-color="grey-3"
                  size="lg"
                  rounded
                  stripe
                  :indeterminate="progressValue <= 0"
                />
                <div class="progress-info q-mt-xs">
                  <span class="progress-percentage">{{ Math.round(progressValue * 100) }}%</span>
                  <span class="progress-time" v-if="progressElapsed">
                    已用 {{ progressElapsed }}
                    <template v-if="progressEta && progressValue > 0.01"> · 剩余 {{ progressEta }}</template>
                  </span>
                  <span class="progress-label">{{ progressLabel }}</span>
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <q-card flat bordered class="section-card q-mt-lg">
          <q-card-section>
            <div class="section-title q-mb-md">
              视频裁剪时间轴
              <q-toggle
                v-model="enableThumbnails"
                label="显示缩略图"
                size="sm"
                class="q-ml-md"
              />
            </div>

            <VideoTimeline
              :duration="videoDuration"
              :start="rangeStartTime"
              :end="rangeEndTime"
              :cover="coverTimeValue"
              :current-time="currentTime"
              :playing="isPlaying"
              :disabled="!previewReady"
              :ffmpeg-client="enableThumbnails && previewReady ? ffmpegClient : undefined"
              :session-id="backendSessionId"
              @update:start="handleStartInput"
              @update:end="handleEndInput"
              @update:cover="handleCoverInput"
              @seek="handleSeek"
              @toggle-play="handleTogglePlay"
              @thumbnail-progress="handleThumbnailProgress"
            />

            <q-linear-progress
              v-if="isGeneratingThumbnails"
              :value="thumbnailProgress / 100"
              color="secondary"
              track-color="grey-3"
              size="md"
              rounded
              stripe
              class="q-mt-sm"
            >
              <div class="absolute-full flex flex-center">
                <q-badge color="white" text-color="secondary" :label="thumbnailStatus" />
              </div>
            </q-linear-progress>

            <RangeControls
              :start="startInput"
              :end="endInput"
              :cover="coverInput"
              :start-label="startTimeDisplay"
              :end-label="endTimeDisplay"
              :cover-label="coverTimeDisplay"
              @update:start="handleStartInput"
              @update:end="handleEndInput"
              @update:cover="handleCoverInput"
            />

            <div class="status-text q-mt-sm">{{ rangeStatus }}</div>
          </q-card-section>
        </q-card>

        <div class="content-grid q-mt-lg">
          <SpeedControl
            :target-length="targetLength"
            :auto-speed="autoSpeed"
            :speed-input="speedInput"
            :speed-label="speedLabel"
            :status-text="speedStatus"
            :disabled="isConverting"
            @update:target-length="handleTargetLength"
            @update:auto-speed="handleAutoSpeed"
            @update:speed-input="handleSpeedInput"
          />

          <ActionPanel
            :disabled="convertDisabled"
            :loading="isConverting"
            :status-text="convertStatus"
            :progress-active="isConvertProgress"
            :progress-value="progressValue"
            :progress-text="progressText"
            @convert="convertToMotionPhoto"
          />
        </div>

        <footer class="app-footer q-mt-xl">
          <div class="footer-content">
            <div class="footer-section">
              <div class="footer-title">快速访问</div>
              <div class="footer-links">
                <a href="https://blog.sirrus.cc" target="_blank" rel="noopener noreferrer" class="footer-link">
                  <q-icon name="feed" size="sm" />
                  <span>博客</span>
                </a>
                <a href="https://anh.sirrus.cc" target="_blank" rel="noopener noreferrer" class="footer-link">
                  <q-icon name="auto_stories" size="sm" />
                  <span>小说助手</span>
                </a>
                <a href="https://guides.sirrus.cc" target="_blank" rel="noopener noreferrer" class="footer-link">
                  <q-icon name="checklist" size="sm" />
                  <span>在线检查单</span>
                </a>
                <a href="https://lite-editor.sirrus.cc" target="_blank" rel="noopener noreferrer" class="footer-link">
                  <q-icon name="edit" size="sm" />
                  <span>轻量版编辑器</span>
                </a>
              </div>
            </div>
            <div class="footer-divider"></div>
            <div class="footer-section">
              <div class="footer-text">
                © 2025 Andrea Frederica. 所有工具均基于开源技术构建。
              </div>
            </div>
          </div>
        </footer>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Notify } from "quasar";
import VideoTimeline from "./components/VideoTimeline.vue";
import SpeedControl from "./components/SpeedControl.vue";
import ActionPanel from "./components/ActionPanel.vue";
import RangeControls from "./components/RangeControls.vue";
import BackendConfig from "./components/BackendConfig.vue";
import { assembleMotionPhoto, createFfmpegClient, type ProgressInfo } from "./services/ffmpegClient";
import { createUnifiedFFmpegClient, type ProcessingMode, type UnifiedFFmpegClient } from "./services/ffmpegClientFactory";

const selectedFile = ref<File | null>(null);
const videoRef = ref<HTMLVideoElement | null>(null);

const processingMode = ref<ProcessingMode>("local");
const backendUrl = ref("");
const authToken = ref("");
const backendSessionId = ref<string | null>(null);
const backendConnectionStatus = ref<"idle" | "connecting" | "connected" | "failed">("idle");

const fileStatus = ref("");
const videoStatus = ref("");
const rangeStatus = ref("");
const speedStatus = ref("");
const convertStatus = ref("");

let ffmpegClient: UnifiedFFmpegClient;

// localStorage 存储键
const STORAGE_KEYS = {
  PROCESSING_MODE: "video2mjpg_processingMode",
  BACKEND_URL: "video2mjpg_backendUrl",
  AUTH_TOKEN: "video2mjpg_authToken",
};

// 保存配置到 localStorage
function saveSettings() {
  localStorage.setItem(STORAGE_KEYS.PROCESSING_MODE, processingMode.value);
  localStorage.setItem(STORAGE_KEYS.BACKEND_URL, backendUrl.value);
  if (authToken.value) {
    localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, authToken.value);
  }
}

// 从 localStorage 读取配置
function loadSettings() {
  const savedMode = localStorage.getItem(STORAGE_KEYS.PROCESSING_MODE) as ProcessingMode | null;
  if (savedMode) {
    processingMode.value = savedMode;
    console.log("已恢复处理模式:", savedMode);
  }

  const savedUrl = localStorage.getItem(STORAGE_KEYS.BACKEND_URL);
  if (savedUrl) {
    backendUrl.value = savedUrl;
    console.log("已恢复后端 URL:", savedUrl);
  }

  const savedToken = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
  if (savedToken) {
    authToken.value = savedToken;
    console.log("已恢复身份验证令牌");
  }
  
  return {
    modeChanged: !!savedMode,
    urlChanged: !!savedUrl,
    tokenChanged: !!savedToken,
  };
}

function initFFmpegClient() {
  ffmpegClient = createUnifiedFFmpegClient({
    mode: processingMode.value,
    backendUrl: processingMode.value === "backend" ? backendUrl.value : undefined,
    authToken: authToken.value || undefined,
    onProgress: (info: ProgressInfo) => {
      if (!progressActive.value) return;
      const value = progressBase + info.ratio * progressSpan;
      progressValue.value = Math.max(0, Math.min(1, value));
      progressEta.value = info.eta;
      progressElapsed.value = info.elapsedFormatted;
    },
  });
}

// 初始化默认客户端
initFFmpegClient();

const startInput = ref(0);
const endInput = ref(0);
const coverInput = ref(0);
const targetLength = ref(5);
const autoSpeed = ref(true);
const speedInput = ref(1);
const enableThumbnails = ref(true);
const thumbnailProgress = ref(0);
const thumbnailStatus = ref("");
const isGeneratingThumbnails = ref(false);

const ffmpegReady = ref(false);
const ffmpegLoading = ref(false);
const previewReady = ref(false);
const isConverting = ref(false);

const videoDuration = ref(0);
const rangeStartTime = ref(0);
const rangeEndTime = ref(0);
const coverTimeValue = ref(0);
const currentTime = ref(0);
const isPlaying = ref(false);
const currentFileName = ref<string | null>(null);
const currentVideoUrl = ref<string | null>(null);
const sourceVideoBytes = ref<Uint8Array | null>(null);

const convertDisabled = ref(true);
const progressActive = ref(false);
const progressValue = ref(0);
const progressLabel = ref("");
const progressContext = ref<"none" | "prepare" | "convert">("none");
const progressEta = ref("");
const progressElapsed = ref("");
let progressBase = 0;
let progressSpan = 1;

const startTimeDisplay = computed(() => `${rangeStartTime.value.toFixed(2)} s`);
const endTimeDisplay = computed(() => `${rangeEndTime.value.toFixed(2)} s`);
const coverTimeDisplay = computed(() => `${coverTimeValue.value.toFixed(2)} s`);
const durationLabel = computed(() => `${videoDuration.value.toFixed(2)} s`);
const speedLabel = computed(() => `${(Number(speedInput.value) || 1).toFixed(2)}x`);
const progressText = computed(() =>
  progressActive.value ? `${progressLabel.value || "处理中…"} ${(progressValue.value * 100).toFixed(0)}%` : ""
);
const isPrepareProgress = computed(() => progressActive.value && progressContext.value === "prepare");
const isConvertProgress = computed(() => progressActive.value && progressContext.value === "convert");

function setStatus(target: typeof fileStatus, text: string) {
  target.value = text || "";
}

function u8ToBlob(u8: Uint8Array, type: string) {
  const buffer = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
  return new Blob([buffer], { type });
}

function clampTime(time: number) {
  return Math.max(0, Math.min(time, videoDuration.value));
}

function setProgressStage(base: number, span: number, label: string, context: "prepare" | "convert" = "convert") {
  progressBase = base;
  progressSpan = span;
  progressLabel.value = label;
  progressActive.value = true;
  progressContext.value = context;
  progressValue.value = base;
}

function clearProgress() {
  progressActive.value = false;
  progressValue.value = 0;
  progressLabel.value = "";
  progressContext.value = "none";
}

async function ensureFfmpeg() {
  if (ffmpegReady.value) return;
  if (ffmpegLoading.value) {
    while (ffmpegLoading.value) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 100));
    }
    return;
  }
  ffmpegLoading.value = true;
  setStatus(fileStatus, "正在下载并初始化 ffmpeg.wasm（首次会稍慢）…");
  await ffmpegClient.ensureLoaded();
  ffmpegReady.value = true;
  ffmpegLoading.value = false;
  setStatus(fileStatus, "ffmpeg.wasm 初始化完成");
}

function cleanupFfmpegFiles() {
  if (processingMode.value === "local") {
    ffmpegClient.cleanupFiles?.();
  } else if (backendSessionId.value) {
    ffmpegClient.cleanupFiles?.(backendSessionId.value);
  }
}

function resetUI() {
  previewReady.value = false;
  videoDuration.value = 0;
  rangeStartTime.value = 0;
  rangeEndTime.value = 0;
  coverTimeValue.value = 0;
  currentTime.value = 0;
  isPlaying.value = false;
  sourceVideoBytes.value = null;
  backendSessionId.value = null;

  if (currentVideoUrl.value) {
    URL.revokeObjectURL(currentVideoUrl.value);
    currentVideoUrl.value = null;
  }
  if (videoRef.value) {
    videoRef.value.removeAttribute("src");
    videoRef.value.load();
  }

  setStatus(videoStatus, "");
  setStatus(convertStatus, "");
  setStatus(fileStatus, "");
  setStatus(rangeStatus, "");
  setStatus(speedStatus, "");

  startInput.value = 0;
  endInput.value = 0;
  coverInput.value = 0;
  speedInput.value = 1;
  convertDisabled.value = true;
  progressActive.value = false;
  progressValue.value = 0;
  progressLabel.value = "";
}

function updateSpeedUI() {
  const len = Math.max(0, rangeEndTime.value - rangeStartTime.value);
  if (len <= 0) {
    speedStatus.value = "片段长度为 0，请调整范围。";
    rangeStatus.value = "";
    return;
  }

  let speed = Number(speedInput.value) || 1;
  if (!Number.isFinite(speed) || speed <= 0) speed = 1;

  if (autoSpeed.value) {
    const target = Number(targetLength.value) || 5;
    if (Number.isFinite(target) && target > 0) {
      speed = len / target;
      if (speed < 0.25) speed = 0.25;
      if (speed > 8) speed = 8;
      speedInput.value = Number(speed.toFixed(2));
    }
  }

  const finalLen = len / speed;
  speedStatus.value = `原始片段长度约 ${len.toFixed(2)} s，经 ${speed.toFixed(2)}x 倍速后约为 ${finalLen.toFixed(2)} s。`;
  rangeStatus.value = `当前选中范围：${rangeStartTime.value.toFixed(2)} s ~ ${rangeEndTime.value.toFixed(2)} s（长度 ${len.toFixed(2)} s）`;
}

function waitForVideoMetadata(el: HTMLVideoElement) {
  return new Promise<number>((resolve, reject) => {
    if (!Number.isNaN(el.duration) && Number.isFinite(el.duration) && el.readyState >= 1) {
      resolve(el.duration);
      return;
    }
    
    const timeout = setTimeout(() => {
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("error", onError);
      reject(new Error("视频元数据加载超时（5秒）"));
    }, 5000);
    
    const onLoaded = () => {
      clearTimeout(timeout);
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("error", onError);
      const duration = el.duration;
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error(`无效的视频时长: ${duration}`));
      } else {
        resolve(duration);
      }
    };
    const onError = () => {
      clearTimeout(timeout);
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("error", onError);
      const errorCode = el.error?.code || -1;
      const errorMsg = el.error?.message || "未知错误";
      const errorDetails = {
        code: errorCode,
        message: errorMsg,
        codeNames: ["", "MEDIA_ERR_ABORTED", "MEDIA_ERR_NETWORK", "MEDIA_ERR_DECODE", "MEDIA_ERR_SRC_NOT_SUPPORTED"]
      };
      const errorName = errorDetails.codeNames[errorCode] || `MEDIA_ERROR_${errorCode}`;
      console.error("视频加载错误详情:", {
        errorName,
        errorCode,
        errorMsg,
        src: el.src,
        readyState: el.readyState,
        networkState: el.networkState
      });
      reject(new Error(`无法读取视频元数据 (${errorName}): ${errorMsg}`));
    };
    el.addEventListener("loadedmetadata", onLoaded, { once: true });
    el.addEventListener("error", onError, { once: true });
  });
}

async function getBlobDurationMs(blob: Blob, fallbackSeconds: number) {
  try {
    console.log("尝试从 Blob 读取视频时长:", { blobSize: blob.size, fallbackSeconds });
    
    const tempVideo = document.createElement("video");
    tempVideo.preload = "metadata";
    tempVideo.muted = true;
    tempVideo.playsInline = true;
    tempVideo.crossOrigin = "anonymous";
    
    const url = URL.createObjectURL(blob);
    console.log("创建临时视频元素，URL:", url);
    
    tempVideo.src = url;
    tempVideo.load();
    
    const duration = await waitForVideoMetadata(tempVideo);
    console.log("成功读取视频时长:", { duration, durationMs: Math.round(duration * 1000) });
    
    URL.revokeObjectURL(url);
    
    if (Number.isFinite(duration) && duration > 0) {
      return Math.round(duration * 1000);
    } else {
      console.warn("视频时长无效，使用备用值:", fallbackSeconds);
      return Math.max(1, Math.round(fallbackSeconds * 1000));
    }
  } catch (err) {
    console.error("从 Blob 读取视频时长失败:", err);
    console.warn("使用备用时长值:", fallbackSeconds);
    return Math.max(1, Math.round(fallbackSeconds * 1000));
  }
}

async function prepareSourceVideo(file: File) {
  if (processingMode.value === "local") {
    await prepareSourceVideoLocal(file);
  } else {
    await prepareSourceVideoBackend(file);
  }
}

async function prepareSourceVideoLocal(file: File) {
  await ensureFfmpeg();
  cleanupFfmpegFiles();

  setStatus(fileStatus, `已选择: ${file.name}，正在用 ffmpeg.wasm 转码…`);
  setProgressStage(0, 1, "预处理转码中…", "prepare");

  const mp4Data = await ffmpegClient.transcodeSource(file) as Uint8Array;
  console.log("FFmpeg 转码完成:", { dataSize: mp4Data.length, isUint8Array: mp4Data instanceof Uint8Array });
  
  const mp4Blob = u8ToBlob(mp4Data, "video/mp4");
  console.log("创建视频 Blob:", { blobSize: mp4Blob.size, blobType: mp4Blob.type });
  
  progressValue.value = 1;
  progressLabel.value = "预处理完成";

  // 保存视频字节数据供缩略图使用
  console.log("保存视频字节数据用于缩略图", { 
    size: mp4Data.length, 
    enableThumbnails: enableThumbnails.value 
  });
  sourceVideoBytes.value = mp4Data;

  if (currentVideoUrl.value) {
    URL.revokeObjectURL(currentVideoUrl.value);
  }
  
  currentVideoUrl.value = URL.createObjectURL(mp4Blob);
  console.log("创建视频预览 URL:", { videoUrl: currentVideoUrl.value });
  
  if (videoRef.value) {
    videoRef.value.src = currentVideoUrl.value;
    videoRef.value.load();
    console.log("视频元素已加载源，等待元数据…");
  } else {
    throw new Error("视频预览元素不存在");
  }
  
  isPlaying.value = false;

  console.log("等待视频元数据加载…");
  const durationSec = await waitForVideoMetadata(videoRef.value!);
  console.log("视频元数据已加载:", { duration: durationSec });
  
  videoDuration.value = Number.isFinite(durationSec) ? durationSec : 0;
  currentTime.value = 0;

  if (videoDuration.value <= 0) {
    throw new Error(`无效的视频时长: ${videoDuration.value}`);
  }

  videoStatus.value = `视频总时长约 ${videoDuration.value.toFixed(2)} s。`;

  const recommended = 5;
  if (videoDuration.value > recommended) {
    rangeStartTime.value = (videoDuration.value - recommended) / 2;
    rangeEndTime.value = rangeStartTime.value + recommended;
  } else {
    rangeStartTime.value = 0;
    rangeEndTime.value = videoDuration.value;
  }
  coverTimeValue.value = (rangeStartTime.value + rangeEndTime.value) / 2;

  previewReady.value = true;
  convertDisabled.value = false;

  updateSpeedUI();

  setStatus(fileStatus, `已选择: ${file.name}，转码完成，开始预览。`);
  clearProgress();
}

async function prepareSourceVideoBackend(file: File) {
  if (backendConnectionStatus.value !== "connected") {
    throw new Error("后端服务未连接，请检查服务地址");
  }

  setStatus(fileStatus, `已选择: ${file.name}，正在上传到后端服务…`);
  setProgressStage(0, 1, "上传到后端…", "prepare");

  try {
    const result = await ffmpegClient.transcodeSource(file) as { sessionId: string; previewUrl: string; duration: number };
    console.log("后端转码结果:", { sessionId: result.sessionId, previewUrl: result.previewUrl, duration: result.duration });
    
    backendSessionId.value = result.sessionId;
    
    progressValue.value = 1;
    progressLabel.value = "预处理完成";

    if (currentVideoUrl.value) {
      URL.revokeObjectURL(currentVideoUrl.value);
    }
    
    currentVideoUrl.value = result.previewUrl;
    console.log("设置后端视频 URL:", { videoUrl: currentVideoUrl.value });
    
    // 验证后端返回的预览 URL 是否返回有效的 MP4
    try {
      console.log("尝试验证后端视频 URL...");
      // 先尝试 HEAD，如果失败则用 GET with Range
      let response = await fetch(result.previewUrl, { 
        method: 'HEAD',
        credentials: 'same-origin'
      }).catch(async (err) => {
        console.log("HEAD 请求失败，尝试 GET with Range:", err.message);
        // 后备方案：用 GET 请求获取前几字节来验证
        const getResp = await fetch(result.previewUrl, {
          method: 'GET',
          headers: { 'Range': 'bytes=0-1000' },
          credentials: 'same-origin'
        });
        return getResp;
      });

      console.log("验证后端视频响应:", {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('Content-Type'),
        contentLength: response.headers.get('Content-Length'),
        acceptRanges: response.headers.get('Accept-Ranges'),
        contentRange: response.headers.get('Content-Range'),
      });
      
      if (!response.ok && response.status !== 206) {
        console.warn(`警告: 视频验证响应异常 ${response.status} ${response.statusText}`);
      }
      
      const contentType = response.headers.get('Content-Type') || '';
      if (!contentType.includes('video') && !contentType.includes('mp4')) {
        console.warn("警告: Content-Type 可能不是视频格式:", contentType);
      }
    } catch (err) {
      console.warn("验证后端视频 URL 失败（非阻断）:", err);
      // 不阻止继续，可能只是验证工具不支持
    }
    
    if (videoRef.value) {
      // 配置视频元素属性以处理跨域和 COEP 问题
      videoRef.value.crossOrigin = "anonymous";
      videoRef.value.src = currentVideoUrl.value;
      videoRef.value.load();
      console.log("视频元素已加载后端源，等待元数据…", {
        crossOrigin: videoRef.value.crossOrigin,
        src: videoRef.value.src
      });
    } else {
      throw new Error("视频预览元素不存在");
    }
    
    isPlaying.value = false;

    console.log("等待视频元数据加载（后端URL）…");
    const durationSec = await waitForVideoMetadata(videoRef.value!);
    console.log("视频元数据已加载:", { duration: durationSec });
    
    videoDuration.value = Number.isFinite(durationSec) ? durationSec : result.duration;
    currentTime.value = 0;

    if (videoDuration.value <= 0) {
      throw new Error(`无效的视频时长: ${videoDuration.value}`);
    }

    videoStatus.value = `视频总时长约 ${videoDuration.value.toFixed(2)} s（后端处理）。`;

    const recommended = 5;
    if (videoDuration.value > recommended) {
      rangeStartTime.value = (videoDuration.value - recommended) / 2;
      rangeEndTime.value = rangeStartTime.value + recommended;
    } else {
      rangeStartTime.value = 0;
      rangeEndTime.value = videoDuration.value;
    }
    coverTimeValue.value = (rangeStartTime.value + rangeEndTime.value) / 2;

    previewReady.value = true;
    convertDisabled.value = false;

    updateSpeedUI();

    setStatus(fileStatus, `已选择: ${file.name}，后端转码完成，开始预览。`);
    clearProgress();
  } catch (err) {
    console.error("后端处理失败:", err);
    backendSessionId.value = null;
    throw err;
  }
}

async function convertToMotionPhoto() {
  if (!previewReady.value) {
    setStatus(convertStatus, "请先加载并预览视频。");
    return;
  }

  if (processingMode.value === "local") {
    await convertToMotionPhotoLocal();
  } else {
    await convertToMotionPhotoBackend();
  }
}

async function convertToMotionPhotoLocal() {
  await ensureFfmpeg();

  let speed = Number(speedInput.value) || 1;
  if (!Number.isFinite(speed) || speed <= 0) speed = 1;

  convertDisabled.value = true;
  isConverting.value = true;
  setStatus(convertStatus, "正在裁剪并生成 Motion Photo…");
  setProgressStage(0, 1, "剪裁与转码中…", "convert");

  try {
    const result = await ffmpegClient.convertClipAndFrames({
      rangeStart: rangeStartTime.value,
      rangeEnd: rangeEndTime.value,
      coverTime: coverTimeValue.value,
      speed,
    });

    // 确保结果是 ClipResult 类型
    if (!('clipBytes' in result)) {
      throw new Error("本地转码返回格式错误");
    }

    const { clipBytes, coverBytes, thumbBytes } = result;

    const clipBlob = u8ToBlob(clipBytes, "video/mp4");
    const fallbackSeconds = Math.max(0.1, (rangeEndTime.value - rangeStartTime.value) / speed);
    const durationMs = await getBlobDurationMs(clipBlob, fallbackSeconds);

    const motionBytes = assembleMotionPhoto(coverBytes, clipBytes, thumbBytes, durationMs);
    const motionBlob = u8ToBlob(motionBytes, "image/jpeg");
    const downloadUrl = URL.createObjectURL(motionBlob);

    const a = document.createElement("a");
    const baseName = (currentFileName.value || "motion_photo").replace(/\.[^/.]+$/, "");
    a.href = downloadUrl;
    a.download = `${baseName}_motion.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(downloadUrl);

    setStatus(convertStatus, "转换成功，文件已下载。");
    Notify.create({ message: "转换成功，文件已下载。", color: "positive" });
    progressValue.value = 1;
    progressLabel.value = "转换完成";
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : String(err);
    setStatus(convertStatus, `转换失败：${message}`);
    Notify.create({ message: `转换失败：${message}`, color: "negative" });
    progressLabel.value = "转换失败";
  } finally {
    isConverting.value = false;
    convertDisabled.value = !previewReady.value;
    setTimeout(() => clearProgress(), 500);
  }
}

async function convertToMotionPhotoBackend() {
  if (!backendSessionId.value) {
    setStatus(convertStatus, "后端会话已过期，请重新上传文件。");
    return;
  }

  let speed = Number(speedInput.value) || 1;
  if (!Number.isFinite(speed) || speed <= 0) speed = 1;

  convertDisabled.value = true;
  isConverting.value = true;
  setStatus(convertStatus, "正在通过后端服务生成 Motion Photo…");
  setProgressStage(0, 1, "后端处理中…", "convert");

  try {
    const result = await ffmpegClient.convertClipAndFrames({
      sessionId: backendSessionId.value,
      rangeStart: rangeStartTime.value,
      rangeEnd: rangeEndTime.value,
      coverTime: coverTimeValue.value,
      speed,
    });

    // 后端返回的是 Uint8Array
    if (!('byteLength' in result)) {
      throw new Error("后端转码返回格式错误");
    }

    const motionBlob = u8ToBlob(result, "image/jpeg");
    const downloadUrl = URL.createObjectURL(motionBlob);

    const a = document.createElement("a");
    const baseName = (currentFileName.value || "motion_photo").replace(/\.[^/.]+$/, "");
    a.href = downloadUrl;
    a.download = `${baseName}_motion.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(downloadUrl);

    setStatus(convertStatus, "转换成功，文件已下载。");
    Notify.create({ message: "转换成功，文件已下载。", color: "positive" });
    progressValue.value = 1;
    progressLabel.value = "转换完成";
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : String(err);
    setStatus(convertStatus, `转换失败：${message}`);
    Notify.create({ message: `转换失败：${message}`, color: "negative" });
    progressLabel.value = "转换失败";
  } finally {
    isConverting.value = false;
    convertDisabled.value = !previewReady.value;
    setTimeout(() => clearProgress(), 500);
  }
}

function handleStartInput(value: number | string | null) {
  const time = clampTime(Number(value) || 0);
  rangeStartTime.value = time;
  if (rangeStartTime.value > rangeEndTime.value) {
    rangeEndTime.value = Math.min(videoDuration.value, rangeStartTime.value + 0.1);
  }
  startInput.value = rangeStartTime.value;
  endInput.value = rangeEndTime.value;
  coverInput.value = coverTimeValue.value;
  updateSpeedUI();
}

function handleEndInput(value: number | string | null) {
  const time = clampTime(Number(value) || 0);
  rangeEndTime.value = time;
  if (rangeEndTime.value < rangeStartTime.value) {
    rangeStartTime.value = Math.max(0, rangeEndTime.value - 0.1);
  }
  startInput.value = rangeStartTime.value;
  endInput.value = rangeEndTime.value;
  coverInput.value = coverTimeValue.value;
  updateSpeedUI();
}

function handleCoverInput(value: number | string | null) {
  let time = clampTime(Number(value) || 0);
  if (time < rangeStartTime.value) time = rangeStartTime.value;
  if (time > rangeEndTime.value) time = rangeEndTime.value;
  coverTimeValue.value = time;
  coverInput.value = coverTimeValue.value;
}

function handleSpeedInput(value: number | string | null) {
  autoSpeed.value = false;
  const speed = Number(value) || 1;
  speedInput.value = speed;
  if (previewReady.value) updateSpeedUI();
}

function handleTargetLength(value: number | string | null) {
  targetLength.value = Number(value) || 0;
  if (previewReady.value) updateSpeedUI();
}

function handleAutoSpeed(value: boolean) {
  autoSpeed.value = value;
  if (previewReady.value) updateSpeedUI();
}

async function handleFileChange(file: File | null) {
  resetUI();
  if (!file) {
    setStatus(fileStatus, "未选择文件");
    return;
  }
  currentFileName.value = file.name;
  try {
    await prepareSourceVideo(file);
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : String(err);
    setStatus(fileStatus, `处理失败：${message}`);
    convertDisabled.value = true;
  }
}

function handleSeek(time: number) {
  const clamped = clampTime(time);
  if (videoRef.value) {
    videoRef.value.currentTime = clamped;
  }
  currentTime.value = clamped;
}

function syncCurrentTime() {
  if (videoRef.value) {
    currentTime.value = videoRef.value.currentTime || 0;
  }
}

function handleVideoPlay() {
  isPlaying.value = true;
}

function handleVideoPause() {
  isPlaying.value = false;
}

function handleVideoEnded() {
  isPlaying.value = false;
}

async function handleTogglePlay() {
  if (!previewReady.value || !videoRef.value) return;
  try {
    if (isPlaying.value) {
      videoRef.value.pause();
    } else {
      await videoRef.value.play();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(videoStatus, `无法播放：${message}`);
  }
}

function handleThumbnailProgress(progress: { current: number; total: number; percentage: number }) {
  console.log("App: 收到缩略图进度", progress);
  thumbnailProgress.value = progress.percentage;
  
  if (progress.percentage === 100) {
    isGeneratingThumbnails.value = false;
    thumbnailStatus.value = "缩略图生成完成";
    console.log("App: 缩略图生成完成");
    setTimeout(() => {
      thumbnailStatus.value = "";
    }, 2000);
  } else {
    isGeneratingThumbnails.value = true;
    thumbnailStatus.value = `生成缩略图中... ${progress.current}/${progress.total} (${progress.percentage}%)`;
    console.log("App: 更新进度条状态", thumbnailStatus.value);
  }
}

// 调试：监听缩略图相关状态
watch([enableThumbnails, previewReady], ([enabled, ready]) => {
  console.log("App: 缩略图状态变化", {
    enableThumbnails: enabled,
    previewReady: ready,
    willPassClient: enabled && ready
  });
});

function handleModeChange(mode: ProcessingMode) {
  processingMode.value = mode;
  backendSessionId.value = null;
  saveSettings();
  
  // 重新初始化客户端
  initFFmpegClient();
  
  if (mode === "local") {
    backendConnectionStatus.value = "idle";
    setStatus(fileStatus, "已切换到本地处理模式");
  } else {
    setStatus(fileStatus, "已切换到后端处理模式");
  }
}

function handleBackendUrlChange(url: string) {
  backendUrl.value = url;
  saveSettings();
  
  // 如果已经切换到后端模式，重新初始化客户端
  if (processingMode.value === "backend") {
    initFFmpegClient();
  }
}

function handleAuthTokenChange(token: string) {
  authToken.value = token;
  saveSettings();
  
  // 如果已经切换到后端模式，重新初始化客户端
  if (processingMode.value === "backend") {
    initFFmpegClient();
  }
}

function handleConnectionStatus(status: "idle" | "connecting" | "connected" | "failed") {
  backendConnectionStatus.value = status;
  
  if (status === "failed") {
    setStatus(fileStatus, "后端服务连接失败，请检查 URL");
    convertDisabled.value = true;
  } else if (status === "connected") {
    setStatus(fileStatus, "后端服务连接成功");
  }
}

onMounted(() => {
  console.log("App: 组件已挂载");
  
  // 加载保存的配置
  const loadResult = loadSettings();
  
  // 重新初始化客户端以应用加载的配置
  initFFmpegClient();
  
  // 如果恢复了后端配置，自动测试连接
  if (processingMode.value === "backend" && backendUrl.value) {
    console.log("尝试自动连接到后端服务...");
    setTimeout(async () => {
      try {
        backendConnectionStatus.value = "connecting";
        const resp = await fetch(`${backendUrl.value}/health`, { method: "HEAD" });
        if (resp.ok) {
          console.log("后端服务自动连接成功");
          backendConnectionStatus.value = "connected";
          setStatus(fileStatus, "后端服务已连接");
        } else {
          console.warn("后端服务返回异常状态:", resp.status);
          backendConnectionStatus.value = "failed";
          setStatus(fileStatus, "后端服务连接失败");
        }
      } catch (err) {
        console.warn("后端服务自动连接失败:", err);
        backendConnectionStatus.value = "failed";
        setStatus(fileStatus, "后端服务不可用");
      }
    }, 500); // 延迟以确保 UI 渲染完成
  }
  
  if (videoRef.value) {
    videoRef.value.addEventListener("timeupdate", syncCurrentTime);
    videoRef.value.addEventListener("play", handleVideoPlay);
    videoRef.value.addEventListener("pause", handleVideoPause);
    videoRef.value.addEventListener("ended", handleVideoEnded);
  }
});

onBeforeUnmount(() => {
  if (currentVideoUrl.value) {
    URL.revokeObjectURL(currentVideoUrl.value);
  }
  if (videoRef.value) {
    videoRef.value.removeEventListener("timeupdate", syncCurrentTime);
    videoRef.value.removeEventListener("play", handleVideoPlay);
    videoRef.value.removeEventListener("pause", handleVideoPause);
    videoRef.value.removeEventListener("ended", handleVideoEnded);
  }
});
</script>
