// DOM 元素引用
const fileInput = document.getElementById("fileInput");
const fileStatus = document.getElementById("fileStatus");
const video = document.getElementById("previewVideo");
const videoStatus = document.getElementById("videoStatus");

// 时间轴相关元素
const timelineSlider = document.getElementById("timelineSlider");
const timelineProgress = document.getElementById("timelineProgress");
const timelineRange = document.getElementById("timelineRange");
const startMarker = document.getElementById("startMarker");
const endMarker = document.getElementById("endMarker");
const coverMarker = document.getElementById("coverMarker");
const playhead = document.getElementById("playhead");
const durationLabel = document.getElementById("durationLabel");

// 控制输入元素
const startTimeInput = document.getElementById("startTimeInput");
const endTimeInput = document.getElementById("endTimeInput");
const coverTimeInput = document.getElementById("coverTimeInput");
const startTime = document.getElementById("startTime");
const endTime = document.getElementById("endTime");
const coverTime = document.getElementById("coverTime");

// 速度控制元素
const targetLengthInput = document.getElementById("targetLength");
const autoSpeed = document.getElementById("autoSpeed");
const speedInput = document.getElementById("speedInput");
const speedLabel = document.getElementById("speedLabel");
const speedStatus = document.getElementById("speedStatus");

// 其他元素
const convertBtn = document.getElementById("convertBtn");
const convertStatus = document.getElementById("convertStatus");
const rangeStatus = document.getElementById("rangeStatus");

// FFmpeg wasm 设置
const { createFFmpeg, fetchFile } = window.FFmpeg || {};
const ffmpeg = createFFmpeg
  ? createFFmpeg({
      log: false,
      corePath: "https://unpkg.com/@ffmpeg/core@0.10.0/dist/ffmpeg-core.js",
    })
  : null;

const INPUT_FILE = "input.bin";
const SOURCE_FILE = "source.mp4";
const CLIP_FILE = "clip.mp4";
const COVER_FILE = "cover.jpg";
const THUMB_FILE = "thumb.jpg";

let ffmpegReady = false;
let ffmpegLoading = false;
let previewReady = false;
let timelineEventsReady = false;

let videoDuration = 0;
let rangeStartTime = 0;
let rangeEndTime = 0;
let coverTimeValue = 0;
let currentFileName = null;
let currentVideoUrl = null;

function setStatus(el, text) {
  el.textContent = text || "";
}

function u8ToBlob(u8, type) {
  const buffer = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  return new Blob([buffer], { type });
}

async function ensureFfmpeg() {
  if (!ffmpeg) {
    throw new Error("未加载 ffmpeg.wasm，检查脚本标签是否可访问。");
  }
  if (ffmpegReady) return;
  if (ffmpegLoading) {
    // 等待已有的加载流程
    while (ffmpegLoading) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 100));
    }
    if (ffmpegReady) return;
  }
  ffmpegLoading = true;
  setStatus(fileStatus, "正在下载并初始化 ffmpeg.wasm（首次会稍慢）…");
  await ffmpeg.load();
  ffmpegReady = true;
  ffmpegLoading = false;
}

function cleanupFfmpegFiles() {
  [INPUT_FILE, SOURCE_FILE, CLIP_FILE, COVER_FILE, THUMB_FILE].forEach((name) => {
    try {
      ffmpeg.FS("unlink", name);
    } catch (err) {
      // 忽略不存在的文件
    }
  });
}

function clampTime(time) {
  return Math.max(0, Math.min(time, videoDuration));
}

function resetUI() {
  previewReady = false;
  videoDuration = 0;
  rangeStartTime = 0;
  rangeEndTime = 0;
  coverTimeValue = 0;

  if (currentVideoUrl) {
    URL.revokeObjectURL(currentVideoUrl);
    currentVideoUrl = null;
  }
  video.removeAttribute("src");
  video.load();

  setStatus(videoStatus, "");
  setStatus(convertStatus, "");
  setStatus(fileStatus, "");
  setStatus(rangeStatus, "");
  setStatus(speedStatus, "");

  timelineSlider.max = 0;
  timelineSlider.value = 0;
  timelineProgress.style.width = "0%";
  timelineRange.style.left = "0%";
  timelineRange.style.width = "0%";
  durationLabel.textContent = "0.00 s";

  startTime.textContent = "0.00 s";
  endTime.textContent = "0.00 s";
  coverTime.textContent = "0.00 s";

  startTimeInput.value = 0;
  endTimeInput.value = 0;
  coverTimeInput.value = 0;

  speedInput.value = 1;
  speedLabel.textContent = "1.0x";
  convertBtn.disabled = true;
}

function updateTimeline() {
  if (videoDuration <= 0) return;

  timelineSlider.max = videoDuration.toFixed(2);

  const currentTime = video.currentTime || 0;
  const progress = (currentTime / videoDuration) * 100;
  timelineProgress.style.width = `${progress}%`;
  playhead.style.left = `${progress}%`;

  const startPercent = (rangeStartTime / videoDuration) * 100;
  const endPercent = (rangeEndTime / videoDuration) * 100;
  timelineRange.style.left = `${startPercent}%`;
  timelineRange.style.width = `${endPercent - startPercent}%`;

  startMarker.style.left = `${startPercent}%`;
  endMarker.style.left = `${endPercent}%`;
  const coverPercent = (coverTimeValue / videoDuration) * 100;
  coverMarker.style.left = `${coverPercent}%`;

  startTime.textContent = `${rangeStartTime.toFixed(2)} s`;
  endTime.textContent = `${rangeEndTime.toFixed(2)} s`;
  coverTime.textContent = `${coverTimeValue.toFixed(2)} s`;

  startTimeInput.value = rangeStartTime.toFixed(2);
  endTimeInput.value = rangeEndTime.toFixed(2);
  coverTimeInput.value = coverTimeValue.toFixed(2);
}

function updateSpeedUI() {
  const len = Math.max(0, rangeEndTime - rangeStartTime);
  if (len <= 0) {
    speedStatus.textContent = "片段长度为 0，请调整范围。";
    return;
  }

  let speed = parseFloat(speedInput.value || "1");
  if (!isFinite(speed) || speed <= 0) speed = 1;

  if (autoSpeed.checked) {
    const target = parseFloat(targetLengthInput.value || "5");
    if (isFinite(target) && target > 0) {
      speed = len / target;
      if (speed < 0.25) speed = 0.25;
      if (speed > 8) speed = 8;
      speedInput.value = speed.toFixed(2);
    }
  }

  speedLabel.textContent = `${speed.toFixed(2)}x`;
  const finalLen = len / speed;
  speedStatus.textContent = `原始片段长度约 ${len.toFixed(2)} s，经 ${speed.toFixed(2)}x 倍速后约为 ${finalLen.toFixed(2)} s。`;

  rangeStatus.textContent = `当前选中范围：${rangeStartTime.toFixed(2)} s ~ ${rangeEndTime.toFixed(2)} s（长度 ${len.toFixed(2)} s）`;
}

function initializeTimelineEvents() {
  if (timelineEventsReady) return;
  timelineEventsReady = true;

  video.addEventListener("timeupdate", () => {
    if (previewReady && !isDraggingPlayhead) {
      updateTimeline();
    }
  });

  // 时间轴滑块点击/输入禁用，转由拖拽控制
  timelineSlider.addEventListener("input", (e) => e.preventDefault());
  timelineSlider.addEventListener("click", (e) => e.preventDefault());

  // 输入框事件
  startTimeInput.addEventListener("input", (e) => {
    const time = parseFloat(e.target.value) || 0;
    rangeStartTime = clampTime(time);
    if (rangeStartTime > rangeEndTime) {
      rangeEndTime = Math.min(videoDuration, rangeStartTime + 0.1);
    }
    updateTimeline();
    updateSpeedUI();
  });

  endTimeInput.addEventListener("input", (e) => {
    const time = parseFloat(e.target.value) || 0;
    rangeEndTime = clampTime(time);
    if (rangeEndTime < rangeStartTime) {
      rangeStartTime = Math.max(0, rangeEndTime - 0.1);
    }
    updateTimeline();
    updateSpeedUI();
  });

  coverTimeInput.addEventListener("input", (e) => {
    let time = parseFloat(e.target.value) || 0;
    time = clampTime(time);
    if (time < rangeStartTime) time = rangeStartTime;
    if (time > rangeEndTime) time = rangeEndTime;
    coverTimeValue = time;
    updateTimeline();
  });

  // 速度控制事件
  targetLengthInput.addEventListener("input", () => {
    if (previewReady) updateSpeedUI();
  });

  autoSpeed.addEventListener("change", () => {
    if (previewReady) updateSpeedUI();
  });

  speedInput.addEventListener("input", () => {
    autoSpeed.checked = false;
    if (previewReady) updateSpeedUI();
  });

  let isDraggingRange = false;
  let rangeDragStart = 0;
  let rangeDragStartTime = 0;
  let rangeDragEndTime = 0;
  let rangeDragCoverTime = 0;

  function setupDragHandling(marker, type) {
    let startX = 0;
    let startPercent = 0;

    function handleMouseDown(e) {
      e.preventDefault();
      e.stopPropagation();
      startX = e.clientX;

      if (type === "start") {
        startPercent = (rangeStartTime / videoDuration) * 100;
        isDraggingStart = true;
      } else if (type === "end") {
        startPercent = (rangeEndTime / videoDuration) * 100;
        isDraggingEnd = true;
      } else if (type === "cover") {
        startPercent = (coverTimeValue / videoDuration) * 100;
        isDraggingCover = true;
      }

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
    }

    function handleMouseMove(e) {
      const deltaX = e.clientX - startX;
      const timelineWidth = timelineSlider.offsetWidth;
      const deltaPercent = (deltaX / timelineWidth) * 100;
      const newPercent = startPercent + deltaPercent;

      const clampedPercent = Math.max(0, Math.min(100, newPercent));
      const newTime = (clampedPercent / 100) * videoDuration;

      if (type === "start") {
        rangeStartTime = clampTime(newTime);
        if (rangeStartTime > rangeEndTime - 0.1) {
          rangeStartTime = rangeEndTime - 0.1;
        }
      } else if (type === "end") {
        rangeEndTime = clampTime(newTime);
        if (rangeEndTime < rangeStartTime + 0.1) {
          rangeEndTime = rangeStartTime + 0.1;
        }
      } else if (type === "cover") {
        coverTimeValue = clampTime(newTime);
        if (coverTimeValue < rangeStartTime) {
          coverTimeValue = rangeStartTime;
        } else if (coverTimeValue > rangeEndTime) {
          coverTimeValue = rangeEndTime;
        }
      }

      updateTimeline();
      updateSpeedUI();
    }

    function handleMouseUp() {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "default";
      document.body.style.userSelect = "auto";
      isDraggingStart = isDraggingEnd = isDraggingCover = false;
    }

    marker.addEventListener("mousedown", handleMouseDown);
  }

  function setupRangeDragHandling() {
    function handleMouseDown(e) {
      const rect = timelineRange.getBoundingClientRect();
      const clickX = e.clientX - rect.left;

      if (clickX >= 0 && clickX <= rect.width) {
        e.preventDefault();
        e.stopPropagation();

        isDraggingRange = true;
        rangeDragStart = e.clientX;
        rangeDragStartTime = rangeStartTime;
        rangeDragEndTime = rangeEndTime;
        rangeDragCoverTime = coverTimeValue;

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "move";
        document.body.style.userSelect = "none";
      }
    }

    function handleMouseMove(e) {
      if (!isDraggingRange) return;

      const deltaX = e.clientX - rangeDragStart;
      const timelineWidth = timelineSlider.offsetWidth;
      const deltaSeconds = (deltaX / timelineWidth) * videoDuration;

      const duration = rangeDragEndTime - rangeDragStartTime;
      let newStartTime = rangeDragStartTime + deltaSeconds;
      let newEndTime = rangeDragEndTime + deltaSeconds;

      if (newStartTime < 0) {
        newStartTime = 0;
        newEndTime = duration;
      } else if (newEndTime > videoDuration) {
        newEndTime = videoDuration;
        newStartTime = videoDuration - duration;
      }

      rangeStartTime = newStartTime;
      rangeEndTime = newEndTime;

      coverTimeValue = rangeDragCoverTime + deltaSeconds;
      if (coverTimeValue < rangeStartTime) {
        coverTimeValue = rangeStartTime;
      } else if (coverTimeValue > rangeEndTime) {
        coverTimeValue = rangeEndTime;
      }

      updateTimeline();
      updateSpeedUI();
    }

    function handleMouseUp() {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "default";
      document.body.style.userSelect = "auto";
      isDraggingRange = false;
    }

    timelineRange.addEventListener("mousedown", handleMouseDown);
  }

  function setupPlayheadDragHandling() {
    let startX = 0;
    let startPercent = 0;

    function handleMouseDown(e) {
      e.preventDefault();
      e.stopPropagation();
      startX = e.clientX;
      const currentTime = video.currentTime || 0;
      startPercent = (currentTime / videoDuration) * 100;
      isDraggingPlayhead = true;

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
    }

    function handleMouseMove(e) {
      const deltaX = e.clientX - startX;
      const timelineWidth = timelineSlider.offsetWidth;
      const deltaPercent = (deltaX / timelineWidth) * 100;
      const newPercent = startPercent + deltaPercent;

      const clampedPercent = Math.max(0, Math.min(100, newPercent));
      const newTime = (clampedPercent / 100) * videoDuration;

      video.currentTime = newTime;

      const progress = (newTime / videoDuration) * 100;
      timelineProgress.style.width = `${progress}%`;
      playhead.style.left = `${progress}%`;
    }

    function handleMouseUp() {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "default";
      document.body.style.userSelect = "auto";
      isDraggingPlayhead = false;
    }

    playhead.addEventListener("mousedown", handleMouseDown);
  }

  setupDragHandling(startMarker, "start");
  setupDragHandling(endMarker, "end");
  setupDragHandling(coverMarker, "cover");
  setupRangeDragHandling();
  setupPlayheadDragHandling();
}

let isDraggingStart = false;
let isDraggingEnd = false;
let isDraggingCover = false;
let isDraggingPlayhead = false;

function waitForVideoMetadata(el) {
  return new Promise((resolve, reject) => {
    if (!Number.isNaN(el.duration) && isFinite(el.duration) && el.readyState >= 1) {
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

async function getBlobDurationMs(blob, fallbackSeconds) {
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
    if (isFinite(duration) && duration > 0) {
      return Math.round(duration * 1000);
    }
  } catch (err) {
    // ignore and fall back
  }
  return Math.max(1, Math.round(fallbackSeconds * 1000));
}

function buildMotionXmpXml({ videoLength, durationMs, microVideoOffset, thumbnailLength }) {
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

function buildXmpSegment(xmpXml) {
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

function addMotionPhotoXmp(jpegBytes, { videoLength, durationMs, microVideoOffset, thumbnailLength }) {
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

function assembleMotionPhoto(coverBytes, videoBytes, thumbnailBytes, durationMs) {
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

async function prepareSourceVideo(file) {
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

  if (currentVideoUrl) {
    URL.revokeObjectURL(currentVideoUrl);
  }
  currentVideoUrl = URL.createObjectURL(mp4Blob);
  video.src = currentVideoUrl;
  video.load();

  const durationSec = await waitForVideoMetadata(video);
  videoDuration = isFinite(durationSec) ? durationSec : 0;

  if (videoDuration <= 0) {
    throw new Error("无法读取视频时长");
  }

  videoStatus.textContent = `视频总时长约 ${videoDuration.toFixed(2)} s。`;
  durationLabel.textContent = `${videoDuration.toFixed(2)} s`;

  const recommended = 5;
  if (videoDuration > recommended) {
    rangeStartTime = (videoDuration - recommended) / 2;
    rangeEndTime = rangeStartTime + recommended;
  } else {
    rangeStartTime = 0;
    rangeEndTime = videoDuration;
  }
  coverTimeValue = (rangeStartTime + rangeEndTime) / 2;

  previewReady = true;
  convertBtn.disabled = false;

  updateTimeline();
  updateSpeedUI();
  initializeTimelineEvents();

  setStatus(fileStatus, `已选择: ${file.name}，转码完成，开始预览。`);
}

async function convertToMotionPhoto() {
  if (!previewReady) {
    setStatus(convertStatus, "请先加载并预览视频。");
    return;
  }

  await ensureFfmpeg();

  let speed = parseFloat(speedInput.value || "1");
  if (!isFinite(speed) || speed <= 0) speed = 1;

  convertBtn.disabled = true;
  setStatus(convertStatus, "正在裁剪并生成 Motion Photo…");

  try {
    const filterGraph =
      Math.abs(speed - 1.0) > 1e-3
        ? `setpts=PTS/${speed.toFixed(4)},scale=ceil(iw/2)*2:ceil(ih/2)*2`
        : "scale=ceil(iw/2)*2:ceil(ih/2)*2";

    await ffmpeg.run(
      "-y",
      "-ss",
      rangeStartTime.toFixed(3),
      "-to",
      rangeEndTime.toFixed(3),
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
      coverTimeValue.toFixed(3),
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
      coverTimeValue.toFixed(3),
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
    const fallbackSeconds = Math.max(0.1, (rangeEndTime - rangeStartTime) / speed);
    const durationMs = await getBlobDurationMs(clipBlob, fallbackSeconds);

    const motionBytes = assembleMotionPhoto(coverBytes, clipBytes, thumbBytes, durationMs);
    const motionBlob = u8ToBlob(motionBytes, "image/jpeg");
    const downloadUrl = URL.createObjectURL(motionBlob);

    const a = document.createElement("a");
    const baseName = (currentFileName || "motion_photo").replace(/\.[^/.]+$/, "");
    a.href = downloadUrl;
    a.download = `${baseName}_motion.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(downloadUrl);

    setStatus(convertStatus, "转换成功，文件已下载。");
  } catch (err) {
    console.error(err);
    setStatus(convertStatus, `转换失败：${err.message || err}`);
  } finally {
    convertBtn.disabled = false;
  }
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  resetUI();

  if (!file) {
    setStatus(fileStatus, "未选择文件");
    return;
  }

  currentFileName = file.name;

  try {
    await prepareSourceVideo(file);
  } catch (err) {
    console.error(err);
    setStatus(fileStatus, `处理失败：${err.message || err}`);
    convertBtn.disabled = true;
  }
});

convertBtn.addEventListener("click", () => {
  convertToMotionPhoto();
});

// 初始化一次事件绑定
initializeTimelineEvents();
