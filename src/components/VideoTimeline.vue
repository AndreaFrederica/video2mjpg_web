<template>
  <div class="timeline-container">
    <div class="timeline-header">
      <span class="time-tag">{{ currentTimeLabel }} / {{ durationLabel }}</span>
      <div class="header-controls">
        <button class="play-btn" type="button" :disabled="disabled" @click="handleTogglePlay" aria-label="播放/暂停">
          <span class="material-icons">{{ playing ? "pause" : "play_arrow" }}</span>
        </button>
        <div class="divider"></div>
        <div class="quick-buttons">
          <button class="quick-btn" type="button" :disabled="disabled" @click="setCurrentAsStart" title="设置当前播放位置为片头">
            <span class="material-icons">skip_previous</span>
            <span>设片头</span>
          </button>
          <button class="quick-btn" type="button" :disabled="disabled" @click="setCurrentAsCover" title="设置当前播放位置为封面">
            <span class="material-icons">image</span>
            <span>设封面</span>
          </button>
          <button class="quick-btn" type="button" :disabled="disabled" @click="setCurrentAsEnd" title="设置当前播放位置为片尾">
            <span class="material-icons">skip_next</span>
            <span>设片尾</span>
          </button>
        </div>
      </div>
    </div>

    <div class="timeline-tracker" ref="trackerRef">
      <div class="timeline-thumbnails" v-if="thumbnailUrls.size > 0">
        <div
          v-for="[timestamp, url] of thumbnailUrls.entries()"
          :key="timestamp"
          class="thumbnail"
          :style="{ 
            backgroundImage: `url(${url})`, 
            left: `calc(8px + ${(timestamp / safeDuration) * 100}%)`
          }"
        ></div>
      </div>
      <div class="timeline-progress" :style="{ width: progressPercent }"></div>
      <div class="timeline-range" :style="{ left: rangeLeft, width: rangeWidth }" @mousedown="handleRangeMouseDown"></div>
      <div class="timeline-markers">
        <div class="marker start-marker" :style="{ left: rangeLeft }" title="段落开始" @mousedown="(e) => handleMarkerDown('start', e)">
          <div class="marker-label">开始</div>
        </div>
        <div class="marker end-marker" :style="{ left: endPercent }" title="段落结束" @mousedown="(e) => handleMarkerDown('end', e)">
          <div class="marker-label">结束</div>
        </div>
        <div class="marker cover-marker" :style="{ left: coverPercent }" title="封面图" @mousedown="(e) => handleMarkerDown('cover', e)">
          <div class="marker-label">封面</div>
        </div>
        <div class="marker playhead" :style="{ left: progressPercent }" title="当前播放位置" @mousedown="handlePlayheadDown">
          <div class="marker-label">播放</div>
        </div>
      </div>
      <input class="timeline-slider" type="range" :min="0" :max="durationLabelValue" step="0.01" :value="currentTime" @input.prevent />
    </div>

    <div class="timeline-labels">
      <span class="time-label">0.00 s</span>
      <span class="time-label">{{ durationLabel }}</span>
    </div>

    <!-- 图例 -->
    <div class="timeline-legend">
      <div class="legend-item">
        <div class="legend-marker start-marker"></div>
        <span class="legend-label">片头</span>
      </div>
      <div class="legend-item">
        <div class="legend-marker cover-marker"></div>
        <span class="legend-label">封面</span>
      </div>
      <div class="legend-item">
        <div class="legend-marker end-marker"></div>
        <span class="legend-label">片尾</span>
      </div>
      <div class="legend-item">
        <div class="legend-marker playhead"></div>
        <span class="legend-label">播放位置</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { FfmpegClient } from "../services/ffmpegClient";

const props = defineProps<{
  duration: number;
  start: number;
  end: number;
  cover: number;
  currentTime: number;
  disabled?: boolean;
  playing?: boolean;
  ffmpegClient?: FfmpegClient;
}>();

const emit = defineEmits<{
  (e: "update:start", value: number): void;
  (e: "update:end", value: number): void;
  (e: "update:cover", value: number): void;
  (e: "seek", value: number): void;
  (e: "toggle-play"): void;
  (e: "thumbnail-progress", progress: { current: number; total: number; percentage: number }): void;
}>();

const trackerRef = ref<HTMLDivElement | null>(null);
const thumbnailUrls = ref<Map<number, string>>(new Map());
const isGeneratingThumbnails = ref(false);

const safeDuration = computed(() => Math.max(0, props.duration || 0));
const durationLabel = computed(() => `${safeDuration.value.toFixed(2)} s`);
const durationLabelValue = computed(() => safeDuration.value.toFixed(2));
const currentTimeLabel = computed(() => `${Math.max(0, props.currentTime || 0).toFixed(2)} s`);

const startPercent = computed(() =>
  safeDuration.value > 0 ? Math.min(100, Math.max(0, (props.start / safeDuration.value) * 100)) : 0
);
const endPercent = computed(() =>
  safeDuration.value > 0 ? `${Math.min(100, Math.max(0, (props.end / safeDuration.value) * 100))}%` : "0%"
);
const coverPercent = computed(() =>
  safeDuration.value > 0 ? `${Math.min(100, Math.max(0, (props.cover / safeDuration.value) * 100))}%` : "0%"
);
const progressPercent = computed(() =>
  safeDuration.value > 0 ? `${Math.min(100, Math.max(0, (props.currentTime / safeDuration.value) * 100))}%` : "0%"
);
const rangeLeft = computed(() => {
  const percent = startPercent.value;
  // 调整 8px margin 对百分比的影响
  const trackerWidth = getWidth();
  const pixelOffset = 8 + (trackerWidth - 16) * (percent / 100);
  return `${pixelOffset}px`;
});
const rangeWidth = computed(() => {
  const end = safeDuration.value > 0 ? Math.min(100, Math.max(0, (props.end / safeDuration.value) * 100)) : 0;
  const trackerWidth = getWidth();
  const widthPercent = Math.max(0, end - startPercent.value);
  return `${(trackerWidth - 16) * (widthPercent / 100)}px`;
});

function clampTime(time: number) {
  return Math.max(0, Math.min(time, safeDuration.value));
}

function getWidth() {
  return trackerRef.value?.offsetWidth || 1;
}

function handleMarkerDown(type: "start" | "end" | "cover", e: MouseEvent) {
  if (props.disabled) return;
  e.preventDefault();
  e.stopPropagation();

  const startX = e.clientX;
  const width = getWidth();
  const initialStart = props.start;
  const initialEnd = props.end;
  const initialCover = props.cover;

  const move = (ev: MouseEvent) => {
    const deltaPercent = ((ev.clientX - startX) / width) * 100;
    const basePercent =
      type === "start"
        ? (initialStart / safeDuration.value) * 100
        : type === "end"
        ? (initialEnd / safeDuration.value) * 100
        : (initialCover / safeDuration.value) * 100;
    const newPercent = Math.max(0, Math.min(100, basePercent + deltaPercent));
    const newTime = clampTime((newPercent / 100) * safeDuration.value);

    if (type === "start") {
      const nextStart = Math.min(newTime, props.end - 0.1);
      emit("update:start", clampTime(nextStart));
    } else if (type === "end") {
      const nextEnd = Math.max(newTime, props.start + 0.1);
      emit("update:end", clampTime(nextEnd));
    } else {
      const clamped = Math.min(Math.max(newTime, props.start), props.end);
      emit("update:cover", clampTime(clamped));
    }
  };

  const up = () => {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
    document.body.style.cursor = "default";
    document.body.style.userSelect = "auto";
  };

  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
  document.body.style.cursor = "ew-resize";
  document.body.style.userSelect = "none";
}

function handleRangeMouseDown(e: MouseEvent) {
  if (props.disabled) return;
  const width = getWidth();
  const startX = e.clientX;
  const initialStart = props.start;
  const initialEnd = props.end;
  const initialCover = props.cover;
  const duration = initialEnd - initialStart;

  const move = (ev: MouseEvent) => {
    const deltaSeconds = ((ev.clientX - startX) / width) * safeDuration.value;
    let newStart = initialStart + deltaSeconds;
    let newEnd = initialEnd + deltaSeconds;

    if (newStart < 0) {
      newStart = 0;
      newEnd = duration;
    } else if (newEnd > safeDuration.value) {
      newEnd = safeDuration.value;
      newStart = safeDuration.value - duration;
    }

    let newCover = initialCover + deltaSeconds;
    if (newCover < newStart) newCover = newStart;
    if (newCover > newEnd) newCover = newEnd;

    emit("update:start", clampTime(newStart));
    emit("update:end", clampTime(newEnd));
    emit("update:cover", clampTime(newCover));
  };

  const up = () => {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
    document.body.style.cursor = "default";
    document.body.style.userSelect = "auto";
  };

  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
  document.body.style.cursor = "move";
  document.body.style.userSelect = "none";
}

function handlePlayheadDown(e: MouseEvent) {
  if (props.disabled) return;
  e.preventDefault();
  e.stopPropagation();
  const width = getWidth();
  const startX = e.clientX;
  const startPercent = safeDuration.value > 0 ? (props.currentTime / safeDuration.value) * 100 : 0;

  const move = (ev: MouseEvent) => {
    const deltaPercent = ((ev.clientX - startX) / width) * 100;
    const newPercent = Math.max(0, Math.min(100, startPercent + deltaPercent));
    const newTime = clampTime((newPercent / 100) * safeDuration.value);
    emit("seek", newTime);
  };

  const up = () => {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
    document.body.style.cursor = "default";
    document.body.style.userSelect = "auto";
  };

  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
  document.body.style.cursor = "ew-resize";
  document.body.style.userSelect = "none";
}

onBeforeUnmount(() => {
  document.body.style.cursor = "default";
  document.body.style.userSelect = "auto";
  // Clean up thumbnail URLs
  thumbnailUrls.value.forEach((url) => URL.revokeObjectURL(url));
});

function handleTogglePlay() {
  if (props.disabled) return;
  emit("toggle-play");
}

function setCurrentAsStart() {
  if (props.disabled) return;
  const newStart = clampTime(props.currentTime);
  if (newStart < props.end - 0.1) {
    emit("update:start", newStart);
  }
}

function setCurrentAsCover() {
  if (props.disabled) return;
  const newCover = clampTime(Math.min(Math.max(props.currentTime, props.start), props.end));
  emit("update:cover", newCover);
}

function setCurrentAsEnd() {
  if (props.disabled) return;
  const newEnd = clampTime(props.currentTime);
  if (newEnd > props.start + 0.1) {
    emit("update:end", newEnd);
  }
}

// Generate thumbnails for the timeline
const generateThumbnails = async () => {
  if (!props.ffmpegClient || safeDuration.value <= 0) return;
  
  // 如果已经在生成，不重复生成
  if (isGeneratingThumbnails.value) return;
  
  isGeneratingThumbnails.value = true;
  console.log("开始生成缩略图...");
  
  try {
    await props.ffmpegClient.ensureLoaded();
    console.log("FFmpeg 已加载");
    
    // 生成覆盖整个视频时长的缩略图，每2秒一张
    const step = 2;
    const urls = new Map<number, string>();
    const totalFrames = Math.ceil(safeDuration.value / step);
    
    console.log(`将生成 ${totalFrames + 1} 张缩略图`);
    
    for (let i = 0; i <= totalFrames; i++) {
      const time = Math.min(i * step, safeDuration.value);
      const key = Math.floor(time * 10) / 10; // 精确到 0.1 秒
      
      // 检查是否已有缓存
      if (thumbnailUrls.value.has(key)) {
        urls.set(key, thumbnailUrls.value.get(key)!);
        const percentage = Math.round(((i + 1) / (totalFrames + 1)) * 100);
        emit("thumbnail-progress", { current: i + 1, total: totalFrames + 1, percentage });
        continue;
      }
      
      try {
        console.log(`生成第 ${i + 1}/${totalFrames + 1} 张，时间点: ${time.toFixed(2)}s`);
        const data = await props.ffmpegClient.generateThumbnail(time);
        const blob = new Blob([data], { type: "image/jpeg" });
        const url = URL.createObjectURL(blob);
        urls.set(key, url);
        // 实时更新显示
        thumbnailUrls.value = new Map(urls);
        
        // 发送进度更新
        const percentage = Math.round(((i + 1) / (totalFrames + 1)) * 100);
        emit("thumbnail-progress", { current: i + 1, total: totalFrames + 1, percentage });
      } catch (error) {
        console.error(`生成缩略图失败 (${time}s):`, error);
      }
    }
    
    console.log(`缩略图生成完成，共 ${urls.size} 张`);
  } catch (error) {
    console.error("缩略图生成失败:", error);
  } finally {
    isGeneratingThumbnails.value = false;
    // 完成后发送 100% 进度
    emit("thumbnail-progress", { current: 0, total: 0, percentage: 100 });
  }
};

// Watch for ffmpeg client changes
watch(() => props.ffmpegClient, (newClient, oldClient) => {
  console.log("VideoTimeline: ffmpegClient 变化检测", {
    hasNewClient: !!newClient,
    hasOldClient: !!oldClient,
    duration: safeDuration.value
  });
  
  if (newClient) {
    console.log("VideoTimeline: 检测到 FFmpeg 客户端，准备生成缩略图");
    // 清空旧的缩略图
    thumbnailUrls.value.forEach((url) => URL.revokeObjectURL(url));
    thumbnailUrls.value.clear();
    // 生成新的缩略图
    generateThumbnails();
  } else {
    console.log("VideoTimeline: 没有 FFmpeg 客户端");
  }
}, { immediate: true });
</script>

<style scoped>
.timeline-container {
  margin-top: 1rem;
}

.timeline-header {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
  align-items: center;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.divider {
  width: 1px;
  height: 24px;
  background: #d1d5db;
}

.play-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.15s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
}

.play-btn:hover {
  background: #f3f4f6;
}

.play-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.quick-buttons {
  display: flex;
  gap: 0.25rem;
}

.quick-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.4rem 0.65rem;
  border-radius: 5px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
  font-size: 0.8rem;
  color: #374151;
  transition: all 0.15s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  white-space: nowrap;
}

.quick-btn:hover:not(:disabled) {
  background: #f3f4f6;
  border-color: #9ca3af;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
}

.quick-btn:active:not(:disabled) {
  background: #e5e7eb;
  transform: scale(0.98);
}

.quick-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.quick-btn .material-icons {
  font-size: 0.95rem;
  line-height: 1;
}

.time-tag {
  font-size: 0.9rem;
  color: #4b5563;
  padding: 0.25rem 0.65rem;
  border-radius: 8px;
  background: #eef2ff;
  border: 1px solid #e5e7eb;
}

.timeline-tracker {
  position: relative;
  height: 54px;
  background: linear-gradient(180deg, #f3f4f6 0%, #e5e7eb 100%);
  border: 1px solid #d1d5db;
  border-radius: 10px;
  margin-bottom: 0.8rem;
  overflow: visible;
}

.timeline-thumbnails {
  position: absolute;
  top: 6px;
  left: 8px;
  right: 8px;
  height: 42px;
  pointer-events: none;
  z-index: 0;
  border-radius: 8px;
  overflow: hidden;
}

.thumbnail {
  position: absolute;
  top: 0;
  width: 80px;
  height: 42px;
  background-size: cover;
  background-repeat: no-repeat;
  background-position: center;
  opacity: 0.7;
  border-right: 1px solid rgba(255, 255, 255, 0.3);
  transform: translateX(-40px);
}

.timeline-progress {
  position: absolute;
  top: 0;
  left: 8px;
  height: 42px;
  background: rgba(161, 182, 214, 0.32);
  border-radius: 9px;
  pointer-events: none;
  z-index: 1;
  margin: 6px 0;
  right: 8px;
}

.timeline-range {
  position: absolute;
  top: 6px;
  left: 8px;
  height: 42px;
  background: rgba(59, 130, 246, 0.3);
  border-radius: 9px;
  pointer-events: auto;
  cursor: move;
  z-index: 2;
  right: 8px;
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.35);
}

.timeline-markers {
  position: absolute;
  top: 6px;
  left: 0;
  width: 100%;
  height: 42px;
  pointer-events: none;
  z-index: 3;
}

.marker {
  position: absolute;
  top: 0;
  width: 2px;
  height: 42px;
  cursor: ew-resize;
  pointer-events: auto;
  z-index: 4;
  transition: width 0.1s ease;
  transform: translateX(-50%);
}

.marker:hover {
  width: 3px;
}

.marker::after {
  content: "";
  position: absolute;
  bottom: -10px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-top: 10px solid currentColor;
}

.start-marker {
  background: #10b981;
  color: #10b981;
}

.end-marker {
  background: #ef4444;
  color: #ef4444;
}

.cover-marker {
  background: #fbbf24;
  color: #fbbf24;
  width: 3px;
}

.cover-marker:hover {
  width: 4px;
}

.marker-label {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: 8px;
  background: currentColor;
  color: white;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 0.75rem;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
  z-index: 100;
  font-weight: 500;
  visibility: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  height: 24px;
}

.marker:hover .marker-label {
  opacity: 1;
  visibility: visible;
}

.start-marker .marker-label {
  background: #059669;
}

.end-marker .marker-label {
  background: #dc2626;
}

.cover-marker .marker-label {
  background: #d97706;
}

.playhead .marker-label {
  background: #991b1b;
}

.playhead {
  position: absolute;
  top: 0;
  width: 3px;
  height: 42px;
  background: #dc2626;
  color: #dc2626;
  cursor: ew-resize;
  pointer-events: auto;
  z-index: 7;
  transition: width 0.1s ease;
  transform: translateX(-50%);
}

.playhead:hover {
  width: 4px;
}

.playhead::after {
  content: "";
  position: absolute;
  bottom: -10px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 10px solid #dc2626;
}

.timeline-slider {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 54px;
  opacity: 0;
  pointer-events: none;
  z-index: 5;
}

.timeline-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
  color: #6b7280;
  padding: 0 4px;
  margin-bottom: 1rem;
}

.timeline-legend {
  display: flex;
  gap: 1.5rem;
  font-size: 0.875rem;
  color: #6b7280;
  padding: 0.75rem;
  background: #f9fafb;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  justify-content: center;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.legend-marker {
  position: relative;
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.legend-marker.start-marker {
  background: #10b981;
}

.legend-marker.cover-marker {
  background: #fbbf24;
}

.legend-marker.end-marker {
  background: #ef4444;
}

.legend-marker.playhead {
  width: 3px;
  height: 16px;
  background: #dc2626;
  border-radius: 1px;
}

.legend-label {
  font-weight: 500;
}
</style>
