<template>
  <q-card flat bordered class="section-card action-card">
    <q-card-section class="q-gutter-md">
      <div class="section-title">生成 Motion Photo</div>
      <q-btn
        color="primary"
        unelevated
        icon="play_arrow"
        label="使用当前设置生成"
        :disable="disabled"
        :loading="loading"
        @click="emit('convert')"
      />
      <div class="status-text">{{ statusText }}</div>
      <q-linear-progress
        v-if="progressActive"
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
</template>

<script setup lang="ts">
defineProps<{
  disabled: boolean;
  loading: boolean;
  statusText: string;
  progressActive: boolean;
  progressValue: number;
  progressText: string;
}>();

const emit = defineEmits<{
  (e: "convert"): void;
}>();
</script>
