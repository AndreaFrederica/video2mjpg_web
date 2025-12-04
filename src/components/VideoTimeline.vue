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
        <div class="divider"></div>
        <button 
          class="quick-btn refresh-btn" 
          type="button" 
          :disabled="disabled || isGeneratingThumbnails" 
          @click="handleRefreshThumbnails" 
          title="重新生成缩略图">
          <span class="material-icons">{{ isGeneratingThumbnails ? 'hourglass_empty' : 'refresh' }}</span>
          <span>{{ isGeneratingThumbnails ? '生成中...' : '重算缩略图' }}</span>
        </button>
      </div>
    </div>

    <div class="timeline-tracker" ref="trackerRef">
      <div class="timeline-thumbnails" v-if="thumbnailUrls.size > 0">
        <div
          v-for="[timestamp, data] of thumbnailUrls.entries()"
          :key="timestamp"
          class="thumbnail"
          :style="{
            backgroundImage: `url(${data.url})`,
            left: `${data.index * thumbnailWidth}px`,
            width: `${thumbnailWidth}px`
          }"
        ></div>
      </div>
      <div class="timeline-progress" :style="{ width: progressPercent }"></div>
      <div class="timeline-range" :style="{ left: rangeLeft, width: rangeWidth }" @mousedown="handleRangeMouseDown"></div>
      <div class="timeline-markers">
        <div class="marker start-marker" :style="{ left: rangeLeft }" title="段落开始" @mousedown="(e: MouseEvent) => handleMarkerDown('start', e)">
          <div class="marker-label">开始</div>
        </div>
        <div class="marker end-marker" :style="{ left: endPercent }" title="段落结束" @mousedown="(e: MouseEvent) => handleMarkerDown('end', e)">
          <div class="marker-label">结束</div>
        </div>
        <div class="marker cover-marker" :style="{ left: coverPercent }" title="封面图" @mousedown="(e: MouseEvent) => handleMarkerDown('cover', e)">
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
        <div class="legend-marker legend-static start-marker"></div>
        <span class="legend-label">片头</span>
      </div>
      <div class="legend-item">
        <div class="legend-marker legend-static end-marker"></div>
        <span class="legend-label">片尾</span>
      </div>
      <div class="legend-item">
        <div class="legend-marker legend-static cover-marker"></div>
        <span class="legend-label">封面</span>
      </div>
      <div class="legend-item">
        <div class="legend-marker legend-static playhead"></div>
        <span class="legend-label">播放位置</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { UnifiedFFmpegClient } from "../services/ffmpegClientFactory";

const props = defineProps<{
  duration: number;
  start: number;
  end: number;
  cover: number;
  currentTime: number;
  disabled?: boolean;
  playing?: boolean;
  ffmpegClient?: UnifiedFFmpegClient;
  sessionId?: string;
}>();

const emit = defineEmits<{
  (e: "update:start", value: number): void;
  (e: "update:end", value: number): void;
  (e: "update:cover", value: number): void;
  (e: "seek", value: number): void;
  (e: "toggle-play"): void;
  (e: "thumbnail-progress", progress: { current: number; total: number; percentage: number }): void;
}>();

// 清空缩略图的方法
function clearThumbnails() {
  thumbnailUrls.value.forEach((data) => URL.revokeObjectURL(data.url));
  thumbnailUrls.value.clear();
  thumbnailWidth.value = 0;
  isGeneratingThumbnails.value = false;
  // 停止宽度监控
  stopWidthMonitoring();
}

const trackerRef = ref<HTMLDivElement | null>(null);
const thumbnailUrls = ref<Map<number, { url: string; index: number }>>(new Map());
const isGeneratingThumbnails = ref(false);
const thumbnailWidth = ref(0); // 实际缩略图宽度（像素）

// 暴露 clearThumbnails 方法给父组件
defineExpose({
  clearThumbnails
});

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
  const trackerWidth = getWidth();
  const availableWidth = trackerWidth - 16; // 减去两侧边距(8px + 8px)
  const initialStart = props.start;
  const initialEnd = props.end;
  const initialCover = props.cover;

  const move = (ev: MouseEvent) => {
    // 计算鼠标移动距离对应的百分比（基于可用宽度）
    const deltaPercent = ((ev.clientX - startX) / availableWidth) * 100;
    const basePercent =
      type === "start"
        ? (initialStart / safeDuration.value) * 100
        : type === "end"
        ? (initialEnd / safeDuration.value) * 100
        : (initialCover / safeDuration.value) * 100;
    // 限制在 0-100% 之间
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
  const trackerWidth = getWidth();
  const availableWidth = trackerWidth - 16; // 减去两侧边距(8px + 8px)
  const startX = e.clientX;
  const initialStart = props.start;
  const initialEnd = props.end;
  const initialCover = props.cover;
  const duration = initialEnd - initialStart;

  const move = (ev: MouseEvent) => {
    // 计算鼠标移动距离对应的时间变化（基于可用宽度）
    const deltaSeconds = ((ev.clientX - startX) / availableWidth) * safeDuration.value;
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
  const trackerWidth = getWidth();
  const availableWidth = trackerWidth - 16; // 减去两侧边距(8px + 8px)
  const startX = e.clientX;
  const startPercent = safeDuration.value > 0 ? (props.currentTime / safeDuration.value) * 100 : 0;

  const move = (ev: MouseEvent) => {
    // 计算鼠标移动距离对应的百分比（基于可用宽度）
    const deltaPercent = ((ev.clientX - startX) / availableWidth) * 100;
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
  thumbnailUrls.value.forEach((data) => URL.revokeObjectURL(data.url));
  // 移除窗口大小监听
  window.removeEventListener("resize", handleWindowResize);
  if (resizeTimer) clearTimeout(resizeTimer);
  // 停止宽度监控
  stopWidthMonitoring();
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

function handleRefreshThumbnails() {
  if (props.disabled || isGeneratingThumbnails.value) return;
  console.log("用户手动触发重算缩略图");
  clearThumbnails();
  generateThumbnails();
}

// Generate thumbnails for the timeline
const generateThumbnails = async () => {
  if (!props.ffmpegClient || safeDuration.value <= 0) return;

  // 如果已经在生成，不重复生成
  if (isGeneratingThumbnails.value) return;

  isGeneratingThumbnails.value = true;
  console.log("开始生成缩略图...");

  // 启动宽度监控
  startWidthMonitoring();
  
  try {
    await props.ffmpegClient.ensureLoaded();
    console.log("FFmpeg 已加载");
    
    // 第一步：生成第一张缩略图以测量实际宽高比
    console.log("步骤 1: 生成第一张缩略图以测量宽高比...");
    try {
      const firstThumbnailData = await props.ffmpegClient.generateThumbnail(0, props.sessionId);
      const buffer = firstThumbnailData.buffer.slice(firstThumbnailData.byteOffset, firstThumbnailData.byteOffset + firstThumbnailData.byteLength) as ArrayBuffer;
      const blob = new Blob([buffer], { type: "image/jpeg" });
      const url = URL.createObjectURL(blob);
      
      // 测量实际缩略图尺寸并计算显示宽度
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          // 缩略图容器的固定高度
          const targetHeight = 42;
          // 保持宽高比计算显示宽度
          const aspectRatio = img.width / img.height;
          thumbnailWidth.value = Math.round(aspectRatio * targetHeight);
          console.log(`检测到缩略图实际尺寸: ${img.width}px × ${img.height}px，宽高比: ${aspectRatio.toFixed(2)}，显示宽度: ${thumbnailWidth.value}px`);
          resolve();
        };
        img.onerror = () => {
          console.warn("加载缩略图用于测量失败，使用默认宽度 80px");
          thumbnailWidth.value = 80;
          resolve();
        };
        img.src = url;
      });
      
      // 清理测量用的临时缩略图
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("生成第一张缩略图失败:", error);
      thumbnailWidth.value = 80; // 使用默认值
    }
    
    // 第二步：根据测量到的宽度计算最优平铺方案
    console.log("步骤 2: 根据 timeline-tracker 实时宽度和缩略图宽度计算平铺方案...");
    
    // 获取 timeline-tracker 的实时宽度并减去左右边距(8px + 8px)
    const trackerWidth = getWidth();
    const availableWidth = trackerWidth - 16;
    
    // 策略：多生成一些缩略图，然后按比例压缩宽度强行塞满
    // 基础数量：按原始宽度计算能放多少张
    const baseCount = Math.floor(availableWidth / thumbnailWidth.value);
    
    // 额外增加 20-30% 的缩略图数量，获得更密集的预览
    const extraRatio = 1.25; // 增加 25%
    let thumbnailCount = Math.floor(baseCount * extraRatio);
    thumbnailCount = Math.max(2, Math.min(thumbnailCount, 50)); // 至少2张，上限50张
    
    // 计算压缩后的宽度：将所有缩略图强行塞入可用宽度
    const compressedWidth = availableWidth / thumbnailCount;
    const compressionRatio = (compressedWidth / thumbnailWidth.value * 100).toFixed(1);
    
    // 更新缩略图宽度为压缩后的值
    const originalWidth = thumbnailWidth.value;
    thumbnailWidth.value = compressedWidth;
    
    // 根据缩略图数量和视频时长，计算时间间隔
    // N 张缩略图之间有 N-1 个间隔
    const interval = thumbnailCount > 1 ? safeDuration.value / (thumbnailCount - 1) : 0;

    console.log(`缩略图生成策略（压缩填充模式）:
- 视频总时长: ${safeDuration.value.toFixed(2)}s
- timeline-tracker 宽度: ${trackerWidth}px
- 可用宽度(减去边距): ${availableWidth}px
- 缩略图原始宽度: ${originalWidth}px
- 基础容纳数量: ${baseCount}张
- 增强后数量: ${thumbnailCount}张 (+${((extraRatio - 1) * 100).toFixed(0)}%)
- 压缩后宽度: ${compressedWidth.toFixed(2)}px
- 压缩比例: ${compressionRatio}%
- 实际占用宽度: ${(thumbnailCount * compressedWidth).toFixed(2)}px (完全填满)
- 时间间隔: ${interval.toFixed(2)}s (更密集的预览)
- 覆盖时间范围: 0.00s ~ ${safeDuration.value.toFixed(2)}s`);
    
    // 第三步：生成所有缩略图
    console.log(`步骤 3: 开始生成所有缩略图（共 ${thumbnailCount} 张，压缩宽度 ${compressedWidth.toFixed(2)}px）...`);
    const urls = new Map<number, { url: string; index: number }>();
    
    // 安全区间：给视频前后各留 0.1 秒
    const safeMargin = 0.1;
    const safeStart = Math.max(0, 0 + safeMargin);
    const safeEnd = Math.max(safeStart, safeDuration.value - safeMargin);
    const safeRange = safeEnd - safeStart;
    
    console.log(`安全范围: ${safeStart.toFixed(2)}s ~ ${safeEnd.toFixed(2)}s (范围宽度: ${safeRange.toFixed(2)}s)`);
    
    for (let i = 0; i < thumbnailCount; i++) {
      // 计算时间点：在安全范围内平均分布
      let time: number;
      if (thumbnailCount === 1) {
        time = safeStart + safeRange / 2; // 只有一张时取中点
      } else {
        const ratio = i / (thumbnailCount - 1); // 0 到 1 之间
        time = safeStart + ratio * safeRange;
      }
      
      // 确保时间点在安全范围内
      time = Math.max(safeStart, Math.min(time, safeEnd));
      
      const key = Math.floor(time * 10) / 10; // 精确到 0.1 秒
      
      try {
        const leftPosition = i * compressedWidth;
        console.log(`生成第 ${i + 1}/${thumbnailCount} 张，时间点: ${time.toFixed(2)}s（安全范围内），位置: ${leftPosition.toFixed(2)}px`);
        const data = await props.ffmpegClient.generateThumbnail(time, props.sessionId);
        const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
        const blob = new Blob([buffer], { type: "image/jpeg" });
        const url = URL.createObjectURL(blob);
        urls.set(key, { url, index: i });
        
        // 实时更新显示
        thumbnailUrls.value = new Map(urls);
        
        // 发送进度更新
        const percentage = Math.round(((i + 1) / thumbnailCount) * 100);
        emit("thumbnail-progress", { current: i + 1, total: thumbnailCount, percentage });
      } catch (error) {
        console.error(`生成缩略图失败 (时间点 ${time.toFixed(2)}s):`, error);
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
    thumbnailUrls.value.forEach((data) => URL.revokeObjectURL(data.url));
    thumbnailUrls.value.clear();
    // 生成新的缩略图
    generateThumbnails();
  } else {
    console.log("VideoTimeline: 没有 FFmpeg 客户端");
  }
}, { immediate: true });

// 监听时间轴容器大小变化，重新生成缩略图
let resizeTimer: number | undefined;
const handleWindowResize = () => {
  // 防抖处理
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (props.ffmpegClient && thumbnailUrls.value.size > 0) {
      console.log("窗口大小变化，重新生成缩略图");
      // 先清空现有缩略图
      clearThumbnails();
      // 重新生成缩略图
      generateThumbnails();
    }
  }, 500);
};

// 监听时间轴宽度变化（如果时间轴容器大小改变但窗口大小不变）
const trackerWidth = ref(0);
const checkTrackerWidth = () => {
  if (!trackerRef.value) return;
  const newWidth = trackerRef.value.offsetWidth;
  if (newWidth !== trackerWidth.value) {
    trackerWidth.value = newWidth;
    if (props.ffmpegClient && thumbnailUrls.value.size > 0 && trackerWidth.value > 0) {
      console.log("时间轴宽度变化，重新生成缩略图", { oldWidth: trackerWidth.value, newWidth });
      // 先清空现有缩略图
      clearThumbnails();
      // 重新生成缩略图
      generateThumbnails();
    }
  }
};

// 定期检查时间轴宽度变化
let widthCheckInterval: number | undefined;
const startWidthMonitoring = () => {
  if (widthCheckInterval) clearInterval(widthCheckInterval);
  widthCheckInterval = window.setInterval(checkTrackerWidth, 200);
};

const stopWidthMonitoring = () => {
  if (widthCheckInterval) {
    clearInterval(widthCheckInterval);
    widthCheckInterval = undefined;
  }
};

// 添加窗口大小监听
if (typeof window !== "undefined") {
  window.addEventListener("resize", handleWindowResize);
}
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

.refresh-btn.quick-btn:disabled .material-icons {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
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
  overflow: visible;
}

.thumbnail {
  position: absolute;
  top: 0;
  height: 42px;
  background-size: cover;
  background-repeat: no-repeat;
  background-position: center;
  opacity: 0.7;
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
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
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
  padding-bottom: 1rem; /* 减少底部内边距 */
  background: #f9fafb;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  justify-content: center;
  overflow: visible; /* 确保伪元素可以超出边界显示 */
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  position: relative; /* 为伪元素提供定位参考 */
}

.legend-marker {
  position: relative;
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

/* 重置图例标记的样式，防止继承时间轴标记的 transform 和 hover 效果 */
.legend-marker.legend-static {
  position: relative; /* 改为 relative，让伪元素可以相对于它定位 */
  transform: none;
  transition: none;
  cursor: default;
}

/* 禁用时间轴标记的伪元素在图例上的应用 */
.legend-marker.legend-static::after {
  display: none;
}

/* 为播放位置图例单独添加向下的三角形 */
.legend-marker.legend-static.playhead::after {
  display: block;
  content: "";
  position: absolute;
  bottom: -3px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right:5px solid transparent;
  border-top: 8px solid #dc2626;
}

/* 特殊处理播放位置图例标记 */
.legend-marker.legend-static.playhead {
  width: 3px !important;
  height: 16px !important;
  background: #dc2626 !important;
  border-radius: 1px !important;
}

/* 其他图例标记的默认样式 */
.legend-marker.legend-static:not(.playhead) {
  width: 12px !important;
  height: 12px !important;
}

.legend-marker.legend-static:not(.playhead):hover {
  transform: none !important;
  width: 12px !important;
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
