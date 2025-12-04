import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL, fetchFile } from "@ffmpeg/util";

export const INPUT_FILE = "input.bin";
export const SOURCE_FILE = "source.mp4";
export const CLIP_FILE = "clip.mp4";
export const COVER_FILE = "cover.jpg";
export const THUMB_FILE = "thumb.jpg";

export type ProgressInfo = {
  ratio: number;
  percentage: number;
  elapsed: number;
  remaining: number;
  eta: string;
  elapsedFormatted: string;
};

export type DownloadProgress = {
  file: string;
  loaded: number;
  total: number;
  percentage: number;
};

type Options = {
  onProgress?: (info: ProgressInfo) => void;
  onMirrorSelect?: (mirror: string, latency: number) => void;
  onDownloadProgress?: (progress: DownloadProgress) => void;
};

export type ClipResult = {
  clipBytes: Uint8Array;
  coverBytes: Uint8Array;
  thumbBytes: Uint8Array;
};

export type FfmpegClient = {
  ensureLoaded: () => Promise<void>;
  cleanupFiles: (names?: string[]) => Promise<void>;
  transcodeSource: (file: File) => Promise<Uint8Array>;
  convertClipAndFrames: (params: {
    rangeStart: number;
    rangeEnd: number;
    coverTime: number;
    speed: number;
  }) => Promise<ClipResult>;
  generateThumbnail: (timestamp: number) => Promise<Uint8Array>;
};

// 多线程核心 CDN 镜像列表（包含国内镜像）
const CORE_MT_MIRRORS = [
  // 国内镜像 - 对中国用户更友好
  {
    name: "npmmirror (阿里云)",
    base: "https://registry.npmmirror.com/@ffmpeg/core-mt/0.12.6/files/dist/esm",
  },
  {
    name: "jsd.cdn.zzko.cn (国内加速)",
    base: "https://jsd.cdn.zzko.cn/npm/@ffmpeg/core-mt@0.12.6/dist/esm",
  },
  {
    name: "fastly.jsdelivr.net",
    base: "https://fastly.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.6/dist/esm",
  },
  // 国际镜像
  {
    name: "jsdelivr",
    base: "https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.6/dist/esm",
  },
  {
    name: "unpkg",
    base: "https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm",
  },
];

// 单线程核心 CDN 镜像列表（包含国内镜像）
const CORE_ST_MIRRORS = [
  // 国内镜像
  {
    name: "npmmirror (阿里云)",
    base: "https://registry.npmmirror.com/@ffmpeg/core/0.12.6/files/dist/esm",
  },
  {
    name: "jsd.cdn.zzko.cn (国内加速)",
    base: "https://jsd.cdn.zzko.cn/npm/@ffmpeg/core@0.12.6/dist/esm",
  },
  {
    name: "fastly.jsdelivr.net",
    base: "https://fastly.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm",
  },
  // 国际镜像
  {
    name: "jsdelivr",
    base: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm",
  },
  {
    name: "unpkg",
    base: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm",
  },
];

/**
 * 带进度的文件下载，返回 Blob URL
 * 使用 toBlobURL 确保 Worker 兼容性
 */
async function fetchWithProgress(
  url: string,
  mimeType: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const contentLength = response.headers.get("content-length");
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  const reader = response.body?.getReader();

  if (!reader) {
    // 回退到 toBlobURL
    return toBlobURL(url, mimeType);
  }

  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(value);
    loaded += value.length;
    onProgress?.(loaded, total);
  }

  // 合并所有 chunks
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  const blob = new Blob([result], { type: mimeType });
  return URL.createObjectURL(blob);
}

/**
 * 测试单个镜像的延迟
 */
async function testMirrorLatency(
  baseUrl: string,
  timeout = 5000
): Promise<number> {
  const testFile = `${baseUrl}/ffmpeg-core.js`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const start = performance.now();
    const response = await fetch(testFile, {
      method: "HEAD",
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return Infinity;
    }

    return performance.now() - start;
  } catch {
    clearTimeout(timeoutId);
    return Infinity;
  }
}

/**
 * 并行测试所有镜像，返回最快的
 */
async function selectFastestMirror(
  mirrors: { name: string; base: string }[],
  onSelect?: (mirror: string, latency: number) => void
): Promise<string> {
  console.log("🔍 测试 CDN 镜像延迟...");

  const results = await Promise.all(
    mirrors.map(async (mirror) => {
      const latency = await testMirrorLatency(mirror.base);
      console.log(`  ${mirror.name}: ${latency === Infinity ? "超时" : `${Math.round(latency)}ms`}`);
      return { ...mirror, latency };
    })
  );

  // 按延迟排序，选择最快的
  results.sort((a, b) => a.latency - b.latency);
  const fastest = results[0];

  if (fastest.latency === Infinity) {
    // 所有镜像都超时，使用默认
    console.warn("⚠️ 所有镜像测试超时，使用默认镜像");
    return mirrors[0].base;
  }

  console.log(`✅ 选择最快镜像: ${fastest.name} (${Math.round(fastest.latency)}ms)`);
  onSelect?.(fastest.name, fastest.latency);

  return fastest.base;
}

const formatTime = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
};

export function createFfmpegClient(options: Options = {}): FfmpegClient {
  const ffmpeg = new FFmpeg();
  const files = [INPUT_FILE, SOURCE_FILE, CLIP_FILE, COVER_FILE, THUMB_FILE];

  let ready = false;
  let loadingPromise: Promise<void> | null = null;
  let startTime = 0;

  // 注册日志回调 - 用于调试
  ffmpeg.on("log", ({ message }) => {
    console.log(`[FFmpeg] ${message}`);
  });

  // 始终注册进度回调
  ffmpeg.on("progress", ({ progress, time }) => {
    // console.log(`[FFmpeg 进度] progress=${progress}, time=${time}`);
    
    if (!options.onProgress) return;
    
    const now = performance.now();
    const elapsed = now - startTime;
    const ratio = progress;
    const percentage = Math.round(ratio * 100);

    let remaining = 0;
    let eta = "计算中...";

    if (ratio > 0.01 && ratio < 1) {
      const estimated = elapsed / ratio;
      remaining = Math.max(0, estimated - elapsed);
      eta = formatTime(remaining);
    }

    options.onProgress({
      ratio,
      percentage,
      elapsed: Math.round(elapsed),
      remaining: Math.round(remaining),
      eta,
      elapsedFormatted: formatTime(elapsed),
    });
  });

  const ensureLoaded = async () => {
    if (ready) return;
    if (loadingPromise) {
      await loadingPromise;
      return;
    }

    loadingPromise = (async () => {
      try {
        const isIsolated =
          typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;
        const hasSharedArrayBuffer = typeof SharedArrayBuffer === "function";

        console.log("🔍 FFmpeg.wasm 环境检查:");
        console.log(`  ✓ crossOriginIsolated: ${isIsolated}`);
        console.log(`  ✓ SharedArrayBuffer: ${hasSharedArrayBuffer}`);

        // 暂时强制使用单线程进行测试
        const useMultiThread = false; // isIsolated && hasSharedArrayBuffer;

        if (useMultiThread) {
          // 使用多线程核心 - 自动选择最快镜像
          console.log("🚀 加载多线程核心...");
          const fastestBase = await selectFastestMirror(
            CORE_MT_MIRRORS,
            options.onMirrorSelect
          );

          // 带进度的下载
          const makeProgress = (file: string) => (loaded: number, total: number) => {
            options.onDownloadProgress?.({
              file,
              loaded,
              total,
              percentage: total > 0 ? Math.round((loaded / total) * 100) : 0,
            });
          };

          console.log("📦 下载 ffmpeg-core.js...");
          const coreURL = await fetchWithProgress(
            `${fastestBase}/ffmpeg-core.js`,
            "text/javascript",
            makeProgress("ffmpeg-core.js")
          );

          console.log("📦 下载 ffmpeg-core.wasm...");
          const wasmURL = await fetchWithProgress(
            `${fastestBase}/ffmpeg-core.wasm`,
            "application/wasm",
            makeProgress("ffmpeg-core.wasm")
          );

          console.log("📦 下载 ffmpeg-core.worker.js...");
          const workerURL = await fetchWithProgress(
            `${fastestBase}/ffmpeg-core.worker.js`,
            "text/javascript",
            makeProgress("ffmpeg-core.worker.js")
          );

          await ffmpeg.load({
            coreURL,
            wasmURL,
            workerURL,
          });
          console.log("✅ FFmpeg.wasm 已加载（多线程核心）");
        } else {
          // 单线程回退 - 自动选择最快镜像
          console.warn("⚠️ 多线程不可用，使用单线程核心");
          const fastestBase = await selectFastestMirror(
            CORE_ST_MIRRORS,
            options.onMirrorSelect
          );

          // 带进度的下载
          const makeProgress = (file: string) => (loaded: number, total: number) => {
            options.onDownloadProgress?.({
              file,
              loaded,
              total,
              percentage: total > 0 ? Math.round((loaded / total) * 100) : 0,
            });
          };

          console.log("📦 下载 ffmpeg-core.js...");
          const coreURL = await fetchWithProgress(
            `${fastestBase}/ffmpeg-core.js`,
            "text/javascript",
            makeProgress("ffmpeg-core.js")
          );

          console.log("📦 下载 ffmpeg-core.wasm...");
          const wasmURL = await fetchWithProgress(
            `${fastestBase}/ffmpeg-core.wasm`,
            "application/wasm",
            makeProgress("ffmpeg-core.wasm")
          );

          await ffmpeg.load({
            coreURL,
            wasmURL,
          });
          console.log("✅ FFmpeg.wasm 已加载（单线程核心）");
        }

        ready = true;
      } catch (error) {
        console.error("❌ FFmpeg 加载失败:", error);
        throw error;
      } finally {
        loadingPromise = null;
      }
    })();

    await loadingPromise;
  };

  const cleanupFiles = async (names: string[] = files) => {
    for (const name of names) {
      try {
        await ffmpeg.deleteFile(name);
      } catch {
        // 文件不存在，忽略
      }
    }
  };

  const transcodeSource = async (file: File) => {
    await ensureLoaded();
    await cleanupFiles();

    startTime = performance.now();

    console.log("📹 开始转码源文件...");
    console.log(`  📁 文件名: ${file.name}, 大小: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
    
    console.log("  ⏳ 读取文件到内存...");
    const fileData = await fetchFile(file);
    console.log(`  ✓ 文件已读取, 大小: ${(fileData.length / 1024 / 1024).toFixed(2)} MB`);
    
    console.log("  ⏳ 写入 FFmpeg 虚拟文件系统...");
    await ffmpeg.writeFile(INPUT_FILE, fileData);
    console.log("  ✓ 文件已写入");

    console.log("  🎬 开始执行 FFmpeg 转码...");
    await ffmpeg.exec([
      "-y",
      "-i",
      INPUT_FILE,
      "-movflags",
      "+faststart",
      "-pix_fmt",
      "yuv420p",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-profile:v",
      "baseline",
      "-level",
      "3.1",
      "-r",
      "30",
      "-vf",
      "scale=ceil(iw/2)*2:ceil(ih/2)*2",
      SOURCE_FILE,
    ]);
    console.log("  ✓ FFmpeg 执行完成");

    const result = await ffmpeg.readFile(SOURCE_FILE);
    console.log("✅ 转码完成");
    return result as Uint8Array;
  };

  const convertClipAndFrames = async ({
    rangeStart,
    rangeEnd,
    coverTime,
    speed,
  }: {
    rangeStart: number;
    rangeEnd: number;
    coverTime: number;
    speed: number;
  }): Promise<ClipResult> => {
    await ensureLoaded();
    startTime = performance.now();

    const filterGraph =
      Math.abs(speed - 1.0) > 1e-3
        ? `setpts=PTS/${speed.toFixed(4)},scale=ceil(iw/2)*2:ceil(ih/2)*2`
        : "scale=ceil(iw/2)*2:ceil(ih/2)*2";

    console.log("🎬 开始裁剪视频...");
    await ffmpeg.exec([
      "-y",
      "-ss",
      rangeStart.toFixed(3),
      "-to",
      rangeEnd.toFixed(3),
      "-i",
      SOURCE_FILE,
      "-movflags",
      "+faststart",
      "-pix_fmt",
      "yuv420p",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
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
      CLIP_FILE,
    ]);

    console.log("📸 提取封面...");
    await ffmpeg.exec([
      "-y",
      "-ss",
      coverTime.toFixed(3),
      "-i",
      SOURCE_FILE,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      COVER_FILE,
    ]);

    await ffmpeg.exec([
      "-y",
      "-ss",
      coverTime.toFixed(3),
      "-i",
      SOURCE_FILE,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      THUMB_FILE,
    ]);

    console.log("✅ 转码完成");
    return {
      clipBytes: (await ffmpeg.readFile(CLIP_FILE)) as Uint8Array,
      coverBytes: (await ffmpeg.readFile(COVER_FILE)) as Uint8Array,
      thumbBytes: (await ffmpeg.readFile(THUMB_FILE)) as Uint8Array,
    };
  };

  const generateThumbnail = async (timestamp: number): Promise<Uint8Array> => {
    await ensureLoaded();
    const thumbName = `thumb_${timestamp.toFixed(2)}.jpg`;

    try {
      await ffmpeg.exec([
        "-ss",
        timestamp.toString(),
        "-i",
        SOURCE_FILE,
        "-vframes",
        "1",
        "-vf",
        "scale=160:-1",
        "-q:v",
        "5",
        thumbName,
      ]);

      const data = await ffmpeg.readFile(thumbName);

      try {
        ffmpeg.deleteFile(thumbName);
      } catch {
        // ignore
      }

      return data as Uint8Array;
    } catch (error) {
      console.error(`❌ 生成缩略图失败 (${timestamp}s)`, error);
      throw error;
    }
  };

  return {
    ensureLoaded,
    cleanupFiles,
    transcodeSource,
    convertClipAndFrames,
    generateThumbnail,
  };
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
  }: {
    videoLength: number;
    durationMs: number;
    microVideoOffset?: number;
    thumbnailLength?: number;
  }
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

export function assembleMotionPhoto(
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
