<template>
  <q-layout view="lHh Lpr lFf">
    <q-page-container>
      <q-page class="app-page q-pa-md q-pa-lg-md">
        <div class="page-header">
          <div>
            <div class="title">GIF / 视频 → 安卓 Motion Photo</div>
            <div class="subtitle">纯前端版，基于 FFmpeg.wasm 与 Quasar + Vue 3</div>
          </div>
          <div class="status-chip">
            <q-badge color="primary" outline v-if="ffmpegReady">FFmpeg 已加载</q-badge>
            <q-badge color="warning" outline v-else>FFmpeg 未加载</q-badge>
          </div>
        </div>

        <q-banner class="note-banner q-mb-lg" rounded>
          ⚡ 所有转码与合成都在浏览器内完成，无需后端。运行时需带上 COOP / COEP 头以启用 SharedArrayBuffer（Vite dev server 已默认开启）。
        </q-banner>

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
                <video ref="videoRef" class="preview-video" controls playsinline></video>
              </div>
              <div class="status-text">{{ videoStatus }}</div>
              <q-linear-progress
                v-if="isPrepareProgress"
                :value="progressValue"
                color="primary"
                track-color="grey-3"
                size="md"
                rounded
                stripe
                :indeterminate="progressValue <= 0"
                :label="progressText"
                class="q-mt-sm"
              />
            </q-card-section>
          </q-card>
        </div>

        <q-card flat bordered class="section-card q-mt-lg">
          <q-card-section>
            <div class="section-title q-mb-md">视频裁剪时间轴</div>

            <VideoTimeline
              :duration="videoDuration"
              :start="rangeStartTime"
              :end="rangeEndTime"
              :cover="coverTimeValue"
              :current-time="currentTime"
              :playing="isPlaying"
              :disabled="!previewReady"
              @update:start="handleStartInput"
              @update:end="handleEndInput"
              @update:cover="handleCoverInput"
              @seek="handleSeek"
              @toggle-play="handleTogglePlay"
            />

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
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Notify } from "quasar";
import VideoTimeline from "./components/VideoTimeline.vue";
import SpeedControl from "./components/SpeedControl.vue";
import ActionPanel from "./components/ActionPanel.vue";
import RangeControls from "./components/RangeControls.vue";
import { assembleMotionPhoto, createFfmpegClient } from "./services/ffmpegClient";

const selectedFile = ref<File | null>(null);
const videoRef = ref<HTMLVideoElement | null>(null);

const fileStatus = ref("");
const videoStatus = ref("");
const rangeStatus = ref("");
const speedStatus = ref("");
const convertStatus = ref("");

const startInput = ref(0);
const endInput = ref(0);
const coverInput = ref(0);
const targetLength = ref(5);
const autoSpeed = ref(true);
const speedInput = ref(1);

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

const convertDisabled = ref(true);
const progressActive = ref(false);
const progressValue = ref(0);
const progressLabel = ref("");
const progressContext = ref<"none" | "prepare" | "convert">("none");
let progressBase = 0;
let progressSpan = 1;

const ffmpegClient = createFfmpegClient({
  onProgress: (ratio) => {
    if (!progressActive.value) return;
    const value = progressBase + ratio * progressSpan;
    progressValue.value = Math.max(0, Math.min(1, value));
  },
});

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
  const buffer = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
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
  ffmpegClient.cleanupFiles();
}

function resetUI() {
  previewReady.value = false;
  videoDuration.value = 0;
  rangeStartTime.value = 0;
  rangeEndTime.value = 0;
  coverTimeValue.value = 0;
  currentTime.value = 0;
  isPlaying.value = false;

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
    const onLoaded = () => {
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("error", onError);
      resolve(el.duration);
    };
    const onError = () => {
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("error", onError);
      reject(new Error("无法读取视频元数据"));
    };
    el.addEventListener("loadedmetadata", onLoaded, { once: true });
    el.addEventListener("error", onError, { once: true });
  });
}

async function getBlobDurationMs(blob: Blob, fallbackSeconds: number) {
  try {
    const tempVideo = document.createElement("video");
    tempVideo.preload = "metadata";
    tempVideo.muted = true;
    tempVideo.playsInline = true;
    const url = URL.createObjectURL(blob);
    tempVideo.src = url;
    tempVideo.load();
    const duration = await waitForVideoMetadata(tempVideo);
    URL.revokeObjectURL(url);
    if (Number.isFinite(duration) && duration > 0) {
      return Math.round(duration * 1000);
    }
  } catch {
    // ignore
  }
  return Math.max(1, Math.round(fallbackSeconds * 1000));
}

async function prepareSourceVideo(file: File) {
  await ensureFfmpeg();
  cleanupFfmpegFiles();

  setStatus(fileStatus, `已选择: ${file.name}，正在用 ffmpeg.wasm 转码…`);
  setProgressStage(0, 1, "预处理转码中…", "prepare");

  const mp4Data = await ffmpegClient.transcodeSource(file);
  const mp4Blob = u8ToBlob(mp4Data, "video/mp4");
  progressValue.value = 1;
  progressLabel.value = "预处理完成";

  if (currentVideoUrl.value) {
    URL.revokeObjectURL(currentVideoUrl.value);
  }
  currentVideoUrl.value = URL.createObjectURL(mp4Blob);
  if (videoRef.value) {
    videoRef.value.src = currentVideoUrl.value;
    videoRef.value.load();
  }
  isPlaying.value = false;

  const durationSec = await waitForVideoMetadata(videoRef.value!);
  videoDuration.value = Number.isFinite(durationSec) ? durationSec : 0;
  currentTime.value = 0;

  if (videoDuration.value <= 0) {
    throw new Error("无法读取视频时长");
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

async function convertToMotionPhoto() {
  if (!previewReady.value) {
    setStatus(convertStatus, "请先加载并预览视频。");
    return;
  }

  await ensureFfmpeg();

  let speed = Number(speedInput.value) || 1;
  if (!Number.isFinite(speed) || speed <= 0) speed = 1;

  convertDisabled.value = true;
  isConverting.value = true;
  setStatus(convertStatus, "正在裁剪并生成 Motion Photo…");
  setProgressStage(0, 1, "剪裁与转码中…", "convert");

  try {
    const { clipBytes, coverBytes, thumbBytes } = await ffmpegClient.convertClipAndFrames({
      rangeStart: rangeStartTime.value,
      rangeEnd: rangeEndTime.value,
      coverTime: coverTimeValue.value,
      speed,
    });

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

onMounted(() => {
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
