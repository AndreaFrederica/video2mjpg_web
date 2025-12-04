<template>
  <div class="timeline-controls q-mt-md">
    <div class="control-group">
      <label>段落开始: <span class="pill">{{ startLabel }}</span></label>
      <q-input
        :model-value="start"
        type="number"
        dense
        outlined
        min="0"
        step="0.01"
        @update:model-value="(v) => emit('update:start', Number(v))"
      />
    </div>
    <div class="control-group">
      <label>段落结束: <span class="pill">{{ endLabel }}</span></label>
      <q-input
        :model-value="end"
        type="number"
        dense
        outlined
        min="0"
        step="0.01"
        @update:model-value="(v) => emit('update:end', Number(v))"
      />
    </div>
    <div class="control-group">
      <label>封面时间: <span class="pill">{{ coverLabel }}</span></label>
      <q-input
        :model-value="cover"
        type="number"
        dense
        outlined
        min="0"
        step="0.01"
        @update:model-value="(v) => emit('update:cover', Number(v))"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  start: number;
  end: number;
  cover: number;
  startLabel: string;
  endLabel: string;
  coverLabel: string;
}>();

const emit = defineEmits<{
  (e: "update:start", value: number): void;
  (e: "update:end", value: number): void;
  (e: "update:cover", value: number): void;
}>();
</script>
