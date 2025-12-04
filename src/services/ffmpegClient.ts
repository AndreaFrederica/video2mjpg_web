import { createFFmpeg, fetchFile, type FFmpeg } from "@ffmpeg/ffmpeg";

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

type Options = {
  corePath?: string;
  onProgress?: (info: ProgressInfo) => void;
};

export type ClipResult = {
  clipBytes: Uint8Array;
  coverBytes: Uint8Array;
  thumbBytes: Uint8Array;
};

export type FfmpegClient = {
  ensureLoaded: () => Promise<void>;
  cleanupFiles: (names?: string[]) => void;
  transcodeSource: (file: File) => Promise<Uint8Array>;
  convertClipAndFrames: (params: { rangeStart: number; rangeEnd: number; coverTime: number; speed: number }) => Promise<ClipResult>;
  generateThumbnail: (timestamp: number) => Promise<Uint8Array>;
};

const DEFAULT_CORE_PATH = "https://unpkg.com/@ffmpeg/core@0.10.0/dist/ffmpeg-core.js";

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
  const ffmpeg: FFmpeg = createFFmpeg({
    log: false,
    corePath: options.corePath ?? DEFAULT_CORE_PATH,
  });

  const files = [INPUT_FILE, SOURCE_FILE, CLIP_FILE, COVER_FILE, THUMB_FILE];
  let ready = false;
  let loadingPromise: Promise<void> | null = null;
  let startTime = 0;
  let sourceIsFromGif = false; // 标记源文件是否来自 GIF

  const ensureLoaded = async () => {
    if (ready) return;
    if (loadingPromise) {
      await loadingPromise;
      return;
    }
    loadingPromise = (async () => {
      await ffmpeg.load();
      if (options.onProgress) {
        startTime = performance.now();
        ffmpeg.setProgress(({ ratio }) => {
          const now = performance.now();
          const elapsed = now - startTime;
          const percentage = Math.round(ratio * 100);
          let remaining = 0;
          let eta = "计算中...";

          if (ratio > 0.01 && ratio < 1) {
            const estimated = elapsed / ratio;
            remaining = Math.max(0, estimated - elapsed);
            eta = formatTime(remaining);
          }

          options.onProgress!({
            ratio,
            percentage,
            elapsed: Math.round(elapsed),
            remaining: Math.round(remaining),
            eta,
            elapsedFormatted: formatTime(elapsed),
          });
        });
      }
      ready = true;
      loadingPromise = null;
    })();

    await loadingPromise;
  };

  const cleanupFiles = (names: string[] = files) => {
    names.forEach((name) => {
      try {
        ffmpeg.FS("unlink", name);
      } catch {
        // ignore
      }
    });
  };

  const isVideoFormat = (file: File): boolean => {
    // 检查 MIME 类型
    if (file.type.startsWith("video/")) {
      return true;
    }
    
    // 检查文件扩展名
    const ext = file.name.toLowerCase().split(".").pop() || "";
    const videoExtensions = ["mp4", "webm", "ogg", "mov", "avi", "mkv", "flv", "m4v", "mpg", "mpeg"];
    return videoExtensions.includes(ext);
  };

  const transcodeSource = async (file: File) => {
    try {
      const isVideo = isVideoFormat(file);
      console.log("FFmpeg: 开始处理源文件", { 
        fileName: file.name, 
        fileSize: file.size, 
        fileType: file.type,
        isVideo
      });
      
      await ensureLoaded();
      console.log("FFmpeg: 已加载");
      
      cleanupFiles();
      console.log("FFmpeg: 已清理旧文件");
      
      const fileData = await fetchFile(file);
      console.log("FFmpeg: 已读取文件数据", { dataLength: fileData.length });
      
      // 如果是视频格式，直接写入虚拟文件系统作为 SOURCE_FILE，无需转码
      if (isVideo) {
        console.log("FFmpeg: 检测到视频格式，直接使用原文件，跳过转码");
        sourceIsFromGif = false; // 来自真实视频文件
        ffmpeg.FS("writeFile", SOURCE_FILE, fileData);
        console.log("FFmpeg: 已将视频文件写入虚拟文件系统作为 SOURCE_FILE");
        return fileData;
      }
      
      // GIF 转码 - 直接用老版本的参数
      console.log("FFmpeg: 检测到非视频格式（GIF），开始转码为 MP4…");
      sourceIsFromGif = true;
      ffmpeg.FS("writeFile", INPUT_FILE, fileData);
      console.log("FFmpeg: 已写入输入文件到虚拟文件系统");
      
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
      console.log("FFmpeg: GIF 转码完成");
      
      const result = ffmpeg.FS("readFile", SOURCE_FILE);
      console.log("FFmpeg: 已读取转码结果", { resultSize: result.length });
      
      return result;
    } catch (error) {
      console.error("FFmpeg 处理源文件失败:", {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
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

    // 视频和音频使用完全相同的倍速
    const speedStr = speed.toFixed(4);
    const filterGraph = Math.abs(speed - 1.0) > 1e-3 ? `setpts=PTS/${speedStr}` : "";

    console.log("FFmpeg: 开始生成视频片段和封面", {
      rangeStart,
      rangeEnd,
      coverTime,
      speed,
      speedStr,
      hasFilter: !!filterGraph,
    });

    try {
      console.log("FFmpeg: 执行裁剪命令…");
      // 直接在裁剪时进行完整编码（参数顺序：-ss -to 在 -i 之前）
      const speedStr = speed.toFixed(4);
      const filterGraph =
        Math.abs(speed - 1.0) > 1e-3
          ? `setpts=PTS/${speedStr},scale=ceil(iw/2)*2:ceil(ih/2)*2`
          : "scale=ceil(iw/2)*2:ceil(ih/2)*2";

      const ffmpegArgs = [
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
        "-profile:v",
        "baseline",
        "-level",
        "3.1",
        "-r",
        "30",
        "-filter:v",
        filterGraph,
      ];

      // 根据源文件类型决定是否编码音频
      if (!sourceIsFromGif) {
        // 非 GIF 源才处理音频倍速
        if (Math.abs(speed - 1.0) > 1e-3) {
          let audioTempoFilter = "";
          let currentSpeed = speed;
          const tempoFilters = [];
          
          // 对于超出范围的倍速，链接多个 atempo 过滤器
          while (currentSpeed > 2.0) {
            tempoFilters.push("atempo=2.0");
            currentSpeed /= 2.0;
          }
          while (currentSpeed < 0.5) {
            tempoFilters.push("atempo=0.5");
            currentSpeed /= 0.5;
          }
          tempoFilters.push(`atempo=${currentSpeed.toFixed(4)}`);
          audioTempoFilter = tempoFilters.join(",");
          
          console.log("FFmpeg: 音频倍速过滤器:", audioTempoFilter);
          ffmpegArgs.push("-filter:a", audioTempoFilter);
        }
        ffmpegArgs.push("-c:a", "aac", "-b:a", "128k");
      } else {
        // GIF 来源没有音频，直接禁用
        console.log("FFmpeg: GIF 来源，禁用音频处理");
        ffmpegArgs.push("-an");
      }

      ffmpegArgs.push(CLIP_FILE);

      try {
        await ffmpeg.run(...ffmpegArgs);
        console.log("FFmpeg: 裁剪命令执行完成");
      } catch (error) {
        console.error("FFmpeg: 裁剪命令执行失败:", error);
        throw error;
      }
      
      const clipBytes1 = ffmpeg.FS("readFile", CLIP_FILE);
      console.log("FFmpeg: 裁剪完成，文件大小:", clipBytes1.length);

      console.log("FFmpeg: 执行提取封面命令…");
      await ffmpeg.run(
        "-y",
        "-ss",
        coverTime.toFixed(3),
        "-i",
        SOURCE_FILE,
        "-vframes",
        "1",
        "-q:v",
        "2",
        COVER_FILE
      );
      console.log("FFmpeg: 提取封面完成");

      console.log("FFmpeg: 执行提取缩略图命令…");
      await ffmpeg.run(
        "-y",
        "-ss",
        coverTime.toFixed(3),
        "-i",
        SOURCE_FILE,
        "-vframes",
        "1",
        "-q:v",
        "2",
        THUMB_FILE
      );
      console.log("FFmpeg: 提取缩略图完成");

      const clipBytes = ffmpeg.FS("readFile", CLIP_FILE);
      const coverBytes = ffmpeg.FS("readFile", COVER_FILE);
      const thumbBytes = ffmpeg.FS("readFile", THUMB_FILE);

      console.log("FFmpeg: 读取文件完成", {
        clipSize: clipBytes.length,
        coverSize: coverBytes.length,
        thumbSize: thumbBytes.length,
      });

      if (clipBytes.length === 0) {
        console.error("FFmpeg: 警告 - 生成的视频片段为空！");
        throw new Error("生成的视频片段为空，可能是编码失败");
      }

      return {
        clipBytes,
        coverBytes,
        thumbBytes,
      };
    } catch (error) {
      console.error("FFmpeg: 生成片段和封面失败:", {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  };

  const generateThumbnail = async (timestamp: number): Promise<Uint8Array> => {
    await ensureLoaded();
    const thumbName = `thumb_${timestamp.toFixed(2)}.jpg`;
    
    try {
      // 从已经存在的 SOURCE_FILE 提取帧
      await ffmpeg.run(
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
        thumbName
      );
      
      const data = ffmpeg.FS("readFile", thumbName);
      
      // 清理生成的文件
      try {
        ffmpeg.FS("unlink", thumbName);
      } catch {
        // ignore
      }
      
      return data;
    } catch (error) {
      console.error(`生成缩略图失败 (${timestamp}s):`, error);
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
