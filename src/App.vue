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

            <div class="timeline-controls q-mt-md">
              <div class="control-group">
                <label>段落开始: <span class="pill">{{ startTimeDisplay }}</span></label>
                <q-input
                  v-model.number="startInput"
                  type="number"
                  dense
                  outlined
                  min="0"
                  step="0.01"
                  @update:model-value="handleStartInput"
                />
              </div>
              <div class="control-group">
                <label>段落结束: <span class="pill">{{ endTimeDisplay }}</span></label>
                <q-input
                  v-model.number="endInput"
                  type="number"
                  dense
                  outlined
                  min="0"
                  step="0.01"
                  @update:model-value="handleEndInput"
                />
              </div>
              <div class="control-group">
                <label>封面时间: <span class="pill">{{ coverTimeDisplay }}</span></label>
                <q-input
                  v-model.number="coverInput"
                  type="number"
                  dense
                  outlined
                  min="0"
                  step="0.01"
                  @update:model-value="handleCoverInput"
                />
              </div>
            </div>

            <div class="status-text q-mt-sm">{{ rangeStatus }}</div>
          </q-card-section>
        </q-card>

        <div class="content-grid q-mt-lg">
          <q-card flat bordered class="section-card">
            <q-card-section class="q-gutter-sm">
              <div class="section-title">时间轴压缩 / 拉伸</div>
              <div class="row items-center q-gutter-sm">
                <q-input
                  v-model.number="targetLength"
                  type="number"
                  label="目标长度（秒）"
                  min="0.5"
                  step="0.1"
                  outlined
                  dense
                  :disable="isConverting"
                  @update:model-value="handleTargetLength"
                />
                <q-toggle v-model="autoSpeed" label="自动按目标长度计算倍速" @update:model-value="handleAutoSpeed" />
              </div>
              <div class="row items-center q-gutter-sm slider-row">
                <div>倍速：</div>
                <q-input
                  v-model.number="speedInput"
                  type="number"
                  min="0.25"
                  max="8"
                  step="0.1"
                  dense
                  outlined
                  :disable="isConverting"
                  @update:model-value="handleSpeedInput"
                  style="width: 120px"
                />
                <div class="pill">{{ speedLabel }}</div>
              </div>
              <div class="status-text">{{ speedStatus }}</div>
            </q-card-section>
          </q-card>

          <q-card flat bordered class="section-card action-card">
            <q-card-section class="q-gutter-md">
              <div class="section-title">生成 Motion Photo</div>
              <q-btn
                color="primary"
                unelevated
                icon="play_arrow"
                label="使用当前设置生成"
                :disable="convertDisabled"
                :loading="isConverting"
                @click="convertToMotionPhoto"
              />
              <div class="status-text">{{ convertStatus }}</div>
            </q-card-section>
          </q-card>
        </div>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { createFFmpeg, fetchFile, type FFmpeg } from "@ffmpeg/ffmpeg";
import { Notify } from "quasar";
import VideoTimeline from "./components/VideoTimeline.vue";

const ffmpeg: FFmpeg = createFFmpeg({
  log: false,
  corePath: "https://unpkg.com/@ffmpeg/core@0.10.0/dist/ffmpeg-core.js",
});

const INPUT_FILE = "input.bin";
const SOURCE_FILE = "source.mp4";
const CLIP_FILE = "clip.mp4";
const COVER_FILE = "cover.jpg";
const THUMB_FILE = "thumb.jpg";

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

const startTimeDisplay = computed(() => `${rangeStartTime.value.toFixed(2)} s`);
const endTimeDisplay = computed(() => `${rangeEndTime.value.toFixed(2)} s`);
const coverTimeDisplay = computed(() => `${coverTimeValue.value.toFixed(2)} s`);
const durationLabel = computed(() => `${videoDuration.value.toFixed(2)} s`);
const speedLabel = computed(() => `${(Number(speedInput.value) || 1).toFixed(2)}x`);

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
  await ffmpeg.load();
  ffmpegReady.value = true;
  ffmpegLoading.value = false;
  setStatus(fileStatus, "ffmpeg.wasm 初始化完成");
}

function cleanupFfmpegFiles() {
  [INPUT_FILE, SOURCE_FILE, CLIP_FILE, COVER_FILE, THUMB_FILE].forEach((name) => {
    try {
      ffmpeg.FS("unlink", name);
    } catch {
      // ignore
    }
  });
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

function buildMotionXmpXml({
  videoLength,
  durationMs,
  microVideoOffset,
  thumbnailLength,
}: {
  videoLength: number;
  durationMs: number;
  microVideoOffset?: number;
  thumbnailLength?: number;
}) {
  const xml = [
    '<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 5.1.0-jc003">',
    '  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '    <rdf:Description rdf:about=""',
    '        xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/"',
    '        xmlns:Container="http://ns.google.com/photos/1.0/container/"',
    '        xmlns:Item="http://ns.google.com/photos/1.0/container/item/"',
    '        xmlns:GCamera="http://ns.google.com/photos/1.0/camera/"',
    '      hdrgm:Version="1.0"',
    '      GCamera:MicroVideoVersion="1"',
    '      GCamera:MicroVideo="1"',
    `      GCamera:MicroVideoOffset="${microVideoOffset ?? videoLength}"`,
    '      GCamera:MicroVideoPresentationTimestampUs="0">',
    '      <Container:Directory>',
    '        <rdf:Seq>',
    '          <rdf:li rdf:parseType="Resource">',
    '            <Container:Item',
    '              Item:Semantic="Primary"',
    '              Item:Mime="image/jpeg"/>',
    '          </rdf:li>',
    '          <rdf:li rdf:parseType="Resource">',
    '            <Container:Item',
    '              Item:Semantic="GainMap"',
    '              Item:Mime="image/jpeg"',
    `              Item:Length="${thumbnailLength ?? videoLength}"/>`,
    '          </rdf:li>',
    '        </rdf:Seq>',
    '      </Container:Directory>',
    '    </rdf:Description>',
    '  </rdf:RDF>',
    '</x:xmpmeta>',
  ].join("\n");

  return new TextEncoder().encode(xml);
}

function buildXmpSegment(xmpXml: Uint8Array) {
  const header = new TextEncoder().encode("http://ns.adobe.com/xap/1.0/\x00");
  const payload = new Uint8Array(header.length + xmpXml.length);
  payload.set(header, 0);
  payload.set(xmpXml, header.length);

  const length = payload.length + 2;
  if (length > 0xffff) {
    throw new Error("XMP 段过长");
  }

  const segment = new Uint8Array(4 + payload.length);
  segment[0] = 0xff;
  segment[1] = 0xe1;
  segment[2] = (length >> 8) & 0xff;
  segment[3] = length & 0xff;
  segment.set(payload, 4);
  return segment;
}

function addMotionPhotoXmp(
  jpegBytes: Uint8Array,
  {
    videoLength,
    durationMs,
    microVideoOffset,
    thumbnailLength,
  }: { videoLength: number; durationMs: number; microVideoOffset?: number; thumbnailLength?: number }
) {
  if (!(jpegBytes[0] === 0xff && jpegBytes[1] === 0xd8)) {
    throw new Error("输入文件不是 JPEG");
  }

  const xmpXml = buildMotionXmpXml({
    videoLength,
    durationMs,
    microVideoOffset,
    thumbnailLength,
  });
  const xmpSegment = buildXmpSegment(xmpXml);

  let insertPos = 2;
  let pos = 2;
  const data = jpegBytes;

  while (pos < data.length - 1) {
    if (data[pos] === 0xff) {
      const marker = data[pos + 1];
      if (marker === 0xda || marker === 0xd9) {
        insertPos = pos;
        break;
      }
      if (marker >= 0xe0 && marker <= 0xef) {
        if (pos + 3 < data.length) {
          const segLen = (data[pos + 2] << 8) | data[pos + 3];
          pos += 2 + segLen;
          insertPos = pos;
          continue;
        }
      }
      pos += 1;
    } else {
      pos += 1;
    }
  }

  const out = new Uint8Array(insertPos + xmpSegment.length + (data.length - insertPos));
  out.set(data.subarray(0, insertPos), 0);
  out.set(xmpSegment, insertPos);
  out.set(data.subarray(insertPos), insertPos + xmpSegment.length);
  return out;
}

function assembleMotionPhoto(
  coverBytes: Uint8Array,
  videoBytes: Uint8Array,
  thumbnailBytes: Uint8Array,
  durationMs: number
) {
  const videoLength = videoBytes.length;
  let microVideoOffset = videoLength;
  let thumbSize = 0;
  let prevThumbSize = 0;
  let thumbnailWithXmp = thumbnailBytes;

  for (let i = 0; i < 5; i += 1) {
    thumbnailWithXmp = addMotionPhotoXmp(thumbnailBytes, {
      videoLength,
      durationMs,
      microVideoOffset,
    });
    thumbSize = thumbnailWithXmp.length;
    const newOffset = videoLength + thumbSize;
    if (thumbSize === prevThumbSize) break;
    prevThumbSize = thumbSize;
    microVideoOffset = newOffset;
  }

  const coverWithXmp = addMotionPhotoXmp(coverBytes, {
    videoLength,
    durationMs,
    microVideoOffset,
    thumbnailLength: thumbSize,
  });

  thumbnailWithXmp = addMotionPhotoXmp(thumbnailBytes, {
    videoLength,
    durationMs,
    microVideoOffset,
  });

  const result = new Uint8Array(coverWithXmp.length + videoBytes.length + thumbnailWithXmp.length);
  let offset = 0;
  result.set(coverWithXmp, offset);
  offset += coverWithXmp.length;
  result.set(videoBytes, offset);
  offset += videoBytes.length;
  result.set(thumbnailWithXmp, offset);
  return result;
}

async function prepareSourceVideo(file: File) {
  await ensureFfmpeg();
  cleanupFfmpegFiles();

  ffmpeg.FS("writeFile", INPUT_FILE, await fetchFile(file));
  setStatus(fileStatus, `已选择: ${file.name}，正在用 ffmpeg.wasm 转码…`);

  await ffmpeg.run(
    "-y",
    "-i",
    INPUT_FILE,
    "-movflags",
    "+faststart",
    "-pix_fmt",
    "yuv420p",
    "-c:v",
    "libx264",
    "-profile:v",
    "baseline",
    "-level",
    "3.1",
    "-r",
    "30",
    "-vf",
    "scale=ceil(iw/2)*2:ceil(ih/2)*2",
    SOURCE_FILE
  );

  const mp4Data = ffmpeg.FS("readFile", SOURCE_FILE);
  const mp4Blob = u8ToBlob(mp4Data, "video/mp4");

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

  try {
    const filterGraph =
      Math.abs(speed - 1.0) > 1e-3
        ? `setpts=PTS/${speed.toFixed(4)},scale=ceil(iw/2)*2:ceil(ih/2)*2`
        : "scale=ceil(iw/2)*2:ceil(ih/2)*2";

    await ffmpeg.run(
      "-y",
      "-ss",
      rangeStartTime.value.toFixed(3),
      "-to",
      rangeEndTime.value.toFixed(3),
      "-i",
      SOURCE_FILE,
      "-movflags",
      "+faststart",
      "-pix_fmt",
      "yuv420p",
      "-c:v",
      "libx264",
      "-profile:v",
      "baseline",
      "-level",
      "3.1",
      "-r",
      "30",
      "-filter:v",
      filterGraph,
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      CLIP_FILE
    );

    await ffmpeg.run(
      "-y",
      "-ss",
      coverTimeValue.value.toFixed(3),
      "-i",
      SOURCE_FILE,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      COVER_FILE
    );

    await ffmpeg.run(
      "-y",
      "-ss",
      coverTimeValue.value.toFixed(3),
      "-i",
      SOURCE_FILE,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      THUMB_FILE
    );

    const clipBytes = ffmpeg.FS("readFile", CLIP_FILE);
    const coverBytes = ffmpeg.FS("readFile", COVER_FILE);
    const thumbBytes = ffmpeg.FS("readFile", THUMB_FILE);

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
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : String(err);
    setStatus(convertStatus, `转换失败：${message}`);
    Notify.create({ message: `转换失败：${message}`, color: "negative" });
  } finally {
    isConverting.value = false;
    convertDisabled.value = !previewReady.value;
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

function handleTargetLength() {
  if (previewReady.value) updateSpeedUI();
}

function handleAutoSpeed() {
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
