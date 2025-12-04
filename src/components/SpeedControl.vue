<template>
  <q-card flat bordered class="section-card">
    <q-card-section class="q-gutter-sm">
      <div class="section-title">时间轴压缩 / 拉伸</div>
      <div class="row items-center q-gutter-sm">
        <q-input
          :model-value="targetLength"
          type="number"
          label="目标长度（秒）"
          min="0.5"
          step="0.1"
          outlined
          dense
          :disable="disabled"
          @update:model-value="(v) => emit('update:targetLength', Number(v))"
        />
        <q-toggle :model-value="autoSpeed" label="自动按目标长度计算倍速" @update:model-value="(v) => emit('update:autoSpeed', v)" />
      </div>
      <div class="row items-center q-gutter-sm slider-row">
        <div>倍速：</div>
        <q-input
          :model-value="speedInput"
          type="number"
          min="0.25"
          max="8"
          step="0.1"
          dense
          outlined
          :disable="disabled"
          style="width: 120px"
          @update:model-value="(v) => emit('update:speedInput', Number(v))"
        />
        <div class="pill">{{ speedLabel }}</div>
      </div>
      <div class="status-text">{{ statusText }}</div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
defineProps<{
  targetLength: number;
  autoSpeed: boolean;
  speedInput: number;
  speedLabel: string;
  statusText: string;
  disabled: boolean;
}>();

const emit = defineEmits<{
  (e: "update:targetLength", value: number): void;
  (e: "update:autoSpeed", value: boolean): void;
  (e: "update:speedInput", value: number): void;
}>();
</script>
