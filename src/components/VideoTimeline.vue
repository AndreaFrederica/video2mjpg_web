<template>
<div class="timeline-container">
  <div class="timeline-toolbar">
    <button class="play-btn" type="button" :disabled="disabled" @click="handleTogglePlay">
      <span class="material-icons">{{ playing ? "pause" : "play_arrow" }}</span>
      <span>{{ playing ? "暂停" : "播放" }}</span>
    </button>
    <span class="time-tag">{{ currentTimeLabel }} / {{ durationLabel }}</span>
  </div>
  <div class="timeline-tracker" ref="trackerRef">
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
        <div class="marker playhead" :style="{ left: progressPercent }" title="当前播放位置" @mousedown="handlePlayheadDown"></div>
      </div>
      <input class="timeline-slider" type="range" :min="0" :max="durationLabelValue" step="0.01" :value="currentTime" @input.prevent />
    </div>
    <div class="timeline-labels">
      <span class="time-label">0.00 s</span>
      <span class="time-label">{{ durationLabel }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";

const props = defineProps<{
  duration: number;
  start: number;
  end: number;
  cover: number;
  currentTime: number;
  disabled?: boolean;
  playing?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:start", value: number): void;
  (e: "update:end", value: number): void;
  (e: "update:cover", value: number): void;
  (e: "seek", value: number): void;
  (e: "toggle-play"): void;
}>();

const trackerRef = ref<HTMLDivElement | null>(null);

const safeDuration = computed(() => Math.max(0, props.duration || 0));
const durationLabel = computed(() => `${safeDuration.value.toFixed(2)} s`);
const durationLabelValue = computed(() => safeDuration.value.toFixed(2));
const currentTimeLabel = computed(() => `${Math.max(0, props.currentTime || 0).toFixed(2)} s`);

const startPercent = computed(() =>
  safeDuration.value > 0 ? Math.min(100, Math.max(0, (props.start / safeDuration.value) * 100)) : 0
);
const endPercent = computed(() =>
  safeDuration.value > 0 ? Math.min(100, Math.max(0, (props.end / safeDuration.value) * 100)) : 0
);
const coverPercent = computed(() =>
  safeDuration.value > 0 ? Math.min(100, Math.max(0, (props.cover / safeDuration.value) * 100)) : 0
);
const progressPercent = computed(() =>
  safeDuration.value > 0 ? `${Math.min(100, Math.max(0, (props.currentTime / safeDuration.value) * 100))}%` : "0%"
);
const rangeLeft = computed(() => `${startPercent.value}%`);
const rangeWidth = computed(() => `${Math.max(0, endPercent.value - startPercent.value)}%`);

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
});

function handleTogglePlay() {
  if (props.disabled) return;
  emit("toggle-play");
}
</script>

<style scoped>
.timeline-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
  gap: 0.5rem;
}

.play-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.9rem;
  border-radius: 999px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.15s ease;
}

.play-btn:hover {
  background: #f3f4f6;
}

.play-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.time-tag {
  font-size: 0.9rem;
  color: #4b5563;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  background: #f3f4f6;
}
</style>
