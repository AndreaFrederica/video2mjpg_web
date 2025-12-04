<template>
  <q-card flat bordered class="backend-config-card">
    <q-card-section>
      <div class="row items-center q-gutter-md">
        <div class="col">
          <div class="text-subtitle2 q-mb-sm">处理模式</div>
          <q-option-group
            v-model="localMode"
            :options="modeOptions"
            color="primary"
            inline
            @update:model-value="handleModeChange"
          />
        </div>
      </div>

      <q-separator class="q-my-md" />

      <div v-if="!localMode" class="backend-config">
        <div class="text-subtitle2 q-mb-md">后端服务配置</div>
        <q-input
          v-model="backendUrl"
          outlined
          dense
          type="url"
          label="后端 FFmpeg 服务 URL"
          :disable="isConnecting"
          @blur="handleUrlBlur"
          hint="例如: http://192.168.1.100:8000 或 https://your-server.com/ffmpeg"
          class="q-mb-md"
        >
          <template #prepend>
            <q-icon name="link" />
          </template>
          <template #append v-if="connectionStatus === 'connected'">
            <q-icon name="check_circle" color="positive" />
          </template>
          <template #append v-else-if="connectionStatus === 'failed'">
            <q-icon name="error" color="negative" />
          </template>
          <template #append v-else-if="isConnecting">
            <q-spinner size="24px" color="primary" />
          </template>
        </q-input>

        <q-input
          v-model="authToken"
          outlined
          dense
          type="password"
          label="鉴权 Token (可选)"
          hint="如果后端需要鉴权，请输入 Token"
          class="q-mb-md"
        >
          <template #prepend>
            <q-icon name="lock" />
          </template>
          <template #append>
            <q-icon
              :name="showToken ? 'visibility_off' : 'visibility'"
              class="cursor-pointer"
              @click="showToken = !showToken"
            />
          </template>
        </q-input>

        <div v-if="connectionStatus === 'failed'" class="text-caption text-negative q-mb-md">
          ❌ 无法连接到后端服务，请检查 URL 是否正确
        </div>
        <div v-else-if="connectionStatus === 'connected'" class="text-caption text-positive q-mb-md">
          ✓ 已连接到后端服务
        </div>

        <q-banner v-if="!localMode" class="info-banner q-mb-md" rounded>
          💡 使用后端服务会显著加快处理速度。确保服务地址正确且网络连接正常。
        </q-banner>
      </div>

      <div v-else class="local-info">
        <q-banner class="info-banner" rounded>
          💻 使用本地 FFmpeg.wasm 处理。所有操作在浏览器内完成，无需后端。
        </q-banner>
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";

interface Props {
  modelValue: "local" | "backend";
  backendUrlProp?: string;
  authTokenProp?: string;
  onModeChange?: (mode: "local" | "backend") => void;
  onBackendUrlChange?: (url: string) => void;
  onAuthTokenChange?: (token: string) => void;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: "local",
  backendUrlProp: "",
  authTokenProp: "",
});

const emit = defineEmits<{
  "update:model-value": [mode: "local" | "backend"];
  "update:backendUrl": [url: string];
  "update:authToken": [token: string];
  "connection-status": [status: "idle" | "connecting" | "connected" | "failed"];
}>();

const localMode = ref(props.modelValue === "local");
const backendUrl = ref(props.backendUrlProp || "");
const authToken = ref(props.authTokenProp || "");
const showToken = ref(false);
const connectionStatus = ref<"idle" | "connecting" | "connected" | "failed">("idle");
const isConnecting = ref(false);

const modeOptions = [
  { label: "本地处理 (FFmpeg.wasm)", value: true },
  { label: "后端服务加速", value: false },
];

watch(
  () => props.modelValue,
  (newVal) => {
    localMode.value = newVal === "local";
  }
);

watch(
  () => props.backendUrlProp,
  (newVal) => {
    if (newVal) {
      backendUrl.value = newVal;
    }
  }
);

watch(
  () => props.authTokenProp,
  (newVal) => {
    if (newVal) {
      authToken.value = newVal;
    }
  }
);

const handleModeChange = (isLocal: boolean) => {
  const mode = isLocal ? "local" : "backend";
  emit("update:model-value", mode);
  props.onModeChange?.(mode);

  if (isLocal) {
    connectionStatus.value = "idle";
    emit("connection-status", "idle");
  } else if (backendUrl.value) {
    testConnection();
  }
};

const handleUrlBlur = () => {
  if (backendUrl.value && !localMode.value) {
    emit("update:backendUrl", backendUrl.value);
    testConnection();
  }
};

const testConnection = async () => {
  if (!backendUrl.value) {
    connectionStatus.value = "idle";
    return;
  }

  isConnecting.value = true;
  connectionStatus.value = "connecting";
  emit("connection-status", "connecting");

  try {
    const url = backendUrl.value.replace(/\/$/, "");
    const headers: Record<string, string> = {};
    if (authToken.value) {
      headers["Authorization"] = `Bearer ${authToken.value}`;
    }

    const resp = await fetch(`${url}/health`, {
      method: "HEAD",
      headers,
      signal: AbortSignal.timeout(5000),
    });

    if (resp.ok) {
      connectionStatus.value = "connected";
      emit("connection-status", "connected");
      // 保存 token
      if (authToken.value) {
        emit("update:authToken", authToken.value);
      }
    } else {
      connectionStatus.value = "failed";
      emit("connection-status", "failed");
    }
  } catch (err) {
    connectionStatus.value = "failed";
    emit("connection-status", "failed");
  } finally {
    isConnecting.value = false;
  }
};
</script>

<style scoped lang="scss">
.backend-config-card {
  background: linear-gradient(135deg, #f5f5f5 0%, #ffffff 100%);
}

.info-banner {
  background: rgba(33, 150, 243, 0.08);
  border-left: 3px solid #2196f3;
}

.backend-config {
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
