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

// 全局变量
let sessionId = null;
let currentFileName = null;
let previewReady = false;
let videoDuration = 0;
let rangeStartTime = 0;
let rangeEndTime = 0;
let coverTimeValue = 0;
let isDraggingStart = false;
let isDraggingEnd = false;
let isDraggingCover = false;
let isDraggingPlayhead = false;

// 时间轴相关函数
function resetUI() {
  sessionId = null;
  previewReady = false;
  videoDuration = 0;
  rangeStartTime = 0;
  rangeEndTime = 0;
  coverTimeValue = 0;

  video.removeAttribute("src");
  video.load();
  videoStatus.textContent = "";
  convertStatus.textContent = "";
  fileStatus.textContent = "";
  rangeStatus.textContent = "";

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
  speedStatus.textContent = "";
  convertBtn.disabled = true;
}

function updateTimeline() {
  if (videoDuration <= 0) return;

  // 更新滑块
  timelineSlider.max = videoDuration.toFixed(2);

  // 更新播放头位置
  const currentTime = video.currentTime || 0;
  const progress = (currentTime / videoDuration) * 100;
  timelineProgress.style.width = progress + "%";
  playhead.style.left = progress + "%";

  // 更新选中范围
  const startPercent = (rangeStartTime / videoDuration) * 100;
  const endPercent = (rangeEndTime / videoDuration) * 100;
  timelineRange.style.left = startPercent + "%";
  timelineRange.style.width = (endPercent - startPercent) + "%";

  // 更新标记位置
  startMarker.style.left = startPercent + "%";
  endMarker.style.left = endPercent + "%";
  const coverPercent = (coverTimeValue / videoDuration) * 100;
  coverMarker.style.left = coverPercent + "%";

  // 更新显示标签
  startTime.textContent = rangeStartTime.toFixed(2) + " s";
  endTime.textContent = rangeEndTime.toFixed(2) + " s";
  coverTime.textContent = coverTimeValue.toFixed(2) + " s";

  // 更新输入框
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

  speedLabel.textContent = speed.toFixed(2) + "x";
  const finalLen = len / speed;
  speedStatus.textContent =
    `原始片段长度约 ${len.toFixed(2)} s，经 ${speed.toFixed(2)}x 倍速后约为 ${finalLen.toFixed(2)} s。`;

  rangeStatus.textContent =
    `当前选中范围：${rangeStartTime.toFixed(2)} s ~ ${rangeEndTime.toFixed(2)} s（长度 ${len.toFixed(2)} s）`;
}

function clampTime(time) {
  return Math.max(0, Math.min(time, videoDuration));
}

function setTimeFromSlider(time) {
  if (!previewReady || videoDuration <= 0) return;

  time = clampTime(time);
  video.currentTime = time;
  updateTimeline();
}

// 事件监听器
function initializeTimelineEvents() {
  // 视频时间更新事件
  video.addEventListener("timeupdate", () => {
    if (previewReady && !isDraggingPlayhead) {
      updateTimeline();
    }
  });

  // 时间轴滑块事件 - 禁用直接跳转
  timelineSlider.addEventListener("input", (e) => {
    // 滑块输入被禁用，只能通过拖拽播放头来改变位置
    e.preventDefault();
  });

  // 时间轴点击事件 - 禁用直接跳转
  timelineSlider.addEventListener("click", (e) => {
    // 禁用点击时间轴直接跳转
    e.preventDefault();
  });

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

    // 限制封面时间在选段范围内
    if (time < rangeStartTime) {
      time = rangeStartTime;
    } else if (time > rangeEndTime) {
      time = rangeEndTime;
    }

    coverTimeValue = time;
    updateTimeline();
  });

  // 速度控制事件
  targetLengthInput.addEventListener("input", () => {
    if (previewReady) {
      updateSpeedUI();
    }
  });

  autoSpeed.addEventListener("change", () => {
    if (previewReady) {
      updateSpeedUI();
    }
  });

  speedInput.addEventListener("input", () => {
    autoSpeed.checked = false;
    if (previewReady) {
      updateSpeedUI();
    }
  });

  // 拖拽状态变量
let isDraggingRange = false;
let rangeDragStart = 0;
let rangeDragStartTime = 0;
let rangeDragEndTime = 0;
let rangeDragCoverTime = 0;

// 单个标记拖拽事件处理
  function setupDragHandling(marker, type) {
    let startX = 0;
    let startPercent = 0;

    function handleMouseDown(e) {
      e.preventDefault();
      e.stopPropagation(); // 防止事件冒泡到时间轴滑块
      startX = e.clientX;

      // 获取当前位置百分比
      if (type === 'start') {
        startPercent = (rangeStartTime / videoDuration) * 100;
        isDraggingStart = true;
      } else if (type === 'end') {
        startPercent = (rangeEndTime / videoDuration) * 100;
        isDraggingEnd = true;
      } else if (type === 'cover') {
        startPercent = (coverTimeValue / videoDuration) * 100;
        isDraggingCover = true;
      }

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    }

    function handleMouseMove(e) {
      const deltaX = e.clientX - startX;
      const timelineWidth = timelineSlider.offsetWidth;
      const deltaPercent = (deltaX / timelineWidth) * 100;
      const newPercent = startPercent + deltaPercent;

      // 限制在时间轴范围内
      const clampedPercent = Math.max(0, Math.min(100, newPercent));
      const newTime = (clampedPercent / 100) * videoDuration;

      if (type === 'start') {
        rangeStartTime = clampTime(newTime);
        if (rangeStartTime > rangeEndTime - 0.1) {
          rangeStartTime = rangeEndTime - 0.1;
        }
      } else if (type === 'end') {
        rangeEndTime = clampTime(newTime);
        if (rangeEndTime < rangeStartTime + 0.1) {
          rangeEndTime = rangeStartTime + 0.1;
        }
      } else if (type === 'cover') {
        coverTimeValue = clampTime(newTime);
        // 限制封面时间在选段范围内
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
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
      isDraggingStart = isDraggingEnd = isDraggingCover = false;
    }

    marker.addEventListener("mousedown", handleMouseDown);
  }

  // 设置段落区域拖拽处理
  function setupRangeDragHandling() {
    function handleMouseDown(e) {
      // 只有点击在段落区域内才触发拖拽
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
        document.body.style.cursor = 'move';
        document.body.style.userSelect = 'none';
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

      // 限制在时间轴范围内
      if (newStartTime < 0) {
        newStartTime = 0;
        newEndTime = duration;
      } else if (newEndTime > videoDuration) {
        newEndTime = videoDuration;
        newStartTime = videoDuration - duration;
      }

      rangeStartTime = newStartTime;
      rangeEndTime = newEndTime;

      // 移动封面时间
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
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
      isDraggingRange = false;
    }

    timelineRange.addEventListener("mousedown", handleMouseDown);
  }

  // 设置播放头拖拽处理
  function setupPlayheadDragHandling() {
    let startX = 0;
    let startPercent = 0;

    function handleMouseDown(e) {
      e.preventDefault();
      e.stopPropagation();
      startX = e.clientX;

      // 获取当前播放头的位置百分比
      const currentTime = video.currentTime || 0;
      startPercent = (currentTime / videoDuration) * 100;
      isDraggingPlayhead = true;

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    }

    function handleMouseMove(e) {
      const deltaX = e.clientX - startX;
      const timelineWidth = timelineSlider.offsetWidth;
      const deltaPercent = (deltaX / timelineWidth) * 100;
      const newPercent = startPercent + deltaPercent;

      // 限制在时间轴范围内
      const clampedPercent = Math.max(0, Math.min(100, newPercent));
      const newTime = (clampedPercent / 100) * videoDuration;

      // 更新视频播放位置
      video.currentTime = newTime;

      // 只更新播放头相关的UI，不更新其他标记
      const progress = (newTime / videoDuration) * 100;
      timelineProgress.style.width = progress + "%";
      playhead.style.left = progress + "%";
    }

    function handleMouseUp() {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
      isDraggingPlayhead = false;
    }

    playhead.addEventListener("mousedown", handleMouseDown);
  }

  // 设置各个标记的拖拽处理
  setupDragHandling(startMarker, 'start');
  setupDragHandling(endMarker, 'end');
  setupDragHandling(coverMarker, 'cover');
  setupRangeDragHandling();
  setupPlayheadDragHandling();
}

// 文件上传事件
fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  resetUI();

  if (!file) {
    fileStatus.textContent = "未选择文件";
    return;
  }

  currentFileName = file.name;
  fileStatus.textContent =
    `已选择: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)，正在上传/转码…`;

  const formData = new FormData();
  formData.append("file", file);

  try {
    const resp = await fetch("/prepare", {
      method: "POST",
      body: formData,
    });

    if (!resp.ok) {
      const detail = await resp.json().catch(() => ({}));
      fileStatus.textContent =
        "上传/转码失败：" + (detail.detail || resp.statusText);
      return;
    }

    const data = await resp.json();
    sessionId = data.session_id;
    const previewUrl = data.preview_url;
    const duration = data.duration;

    fileStatus.textContent = `已选择: ${file.name}，后端已转成 mp4。`;
    video.src = previewUrl;
    video.load();

    video.addEventListener(
      "loadedmetadata",
      () => {
        videoDuration = video.duration && isFinite(video.duration)
          ? video.duration
          : duration;

        videoStatus.textContent = `视频总时长约 ${videoDuration.toFixed(2)} s。`;
        durationLabel.textContent = videoDuration.toFixed(2) + " s";

        // 设置默认选段（中间5秒或整个视频）
        const recommended = 5;
        if (videoDuration > recommended) {
          rangeStartTime = (videoDuration - recommended) / 2;
          rangeEndTime = rangeStartTime + recommended;
        } else {
          rangeStartTime = 0;
          rangeEndTime = videoDuration;
        }

        // 设置默认封面时间为选段中间
        coverTimeValue = (rangeStartTime + rangeEndTime) / 2;

        previewReady = true;
        convertBtn.disabled = false;

        updateTimeline();
        updateSpeedUI();
        initializeTimelineEvents();
      },
      { once: true }
    );
  } catch (err) {
    console.error(err);
    fileStatus.textContent = "发生错误：" + err;
  }
});

// 转换按钮事件
convertBtn.addEventListener("click", async () => {
  if (!sessionId) {
    convertStatus.textContent = "请先上传文件。";
    return;
  }
  if (!previewReady) {
    convertStatus.textContent = "视频尚未准备好。";
    return;
  }

  convertBtn.disabled = true;
  convertStatus.textContent = "正在生成 Motion Photo…";

  try {
    let speed = parseFloat(speedInput.value || "1");
    if (!isFinite(speed) || speed <= 0) speed = 1;

    const formData = new FormData();
    formData.append("session_id", sessionId);
    formData.append("cover_time", coverTimeValue.toString());
    formData.append("range_start", rangeStartTime.toString());
    formData.append("range_end", rangeEndTime.toString());
    formData.append("speed", speed.toString());

    const resp = await fetch("/convert", {
      method: "POST",
      body: formData,
    });

    if (!resp.ok) {
      const detail = await resp.json().catch(() => ({}));
      convertStatus.textContent =
        "转换失败：" + (detail.detail || resp.statusText);
      convertBtn.disabled = false;
      return;
    }

    const blob = await resp.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const baseName = (currentFileName || "motion_photo").replace(/\.[^/.]+$/, "");
    a.href = downloadUrl;
    a.download = baseName + "_motion.jpg";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(downloadUrl);

    convertStatus.textContent = "转换成功，文件已下载。";
  } catch (err) {
    console.error(err);
    convertStatus.textContent = "发生错误：" + err;
  } finally {
    convertBtn.disabled = false;
  }
});