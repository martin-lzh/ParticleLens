const state = {
  lang: localStorage.getItem("particleAnnotatorLang") || "zh",
  statusKey: "status.idle",
  image: null,
  imageName: "",
  imageData: "",
  particles: [],
  selectedIds: new Set(),
  mode: "select",
  drag: null,
  scaleLine: null,
  micronsPerPx: null,
  nextId: 1,
  view: {
    zoom: 1,
    panX: 0,
    panY: 0,
  },
  ui: {
    leftCollapsed: false,
    rightOpen: false,
    dragDepth: 0,
  },
};

const els = {
  appShell: document.querySelector(".app-shell"),
  leftPanel: document.getElementById("leftPanel"),
  leftToggle: document.getElementById("leftToggle"),
  rightPanel: document.getElementById("rightPanel"),
  rightToggle: document.getElementById("rightToggle"),
  canvas: document.getElementById("imageCanvas"),
  imageInput: document.getElementById("imageInput"),
  runDetect: document.getElementById("runDetect"),
  statusBadge: document.getElementById("statusBadge"),
  emptyState: document.getElementById("emptyState"),
  imageName: document.getElementById("imageName"),
  scaleReadout: document.getElementById("scaleReadout"),
  zoomReadout: document.getElementById("zoomReadout"),
  zoomOut: document.getElementById("zoomOut"),
  zoomIn: document.getElementById("zoomIn"),
  resetZoom: document.getElementById("resetZoom"),
  hintText: document.getElementById("hintText"),
  table: document.getElementById("particleTable"),
  countStat: document.getElementById("countStat"),
  meanStat: document.getElementById("meanStat"),
  medianStat: document.getElementById("medianStat"),
  rangeStat: document.getElementById("rangeStat"),
  histogram: document.getElementById("histogramCanvas"),
  scaleUm: document.getElementById("scaleUm"),
  sensitivity: document.getElementById("sensitivity"),
  minDiameter: document.getElementById("minDiameter"),
  maxDiameter: document.getElementById("maxDiameter"),
  contrastMode: document.getElementById("contrastMode"),
  labelLimit: document.getElementById("labelLimit"),
  deleteSelected: document.getElementById("deleteSelected"),
  clearManual: document.getElementById("clearManual"),
  exportCsv: document.getElementById("exportCsv"),
  exportPng: document.getElementById("exportPng"),
  exportAll: document.getElementById("exportAll"),
  scaleTool: document.getElementById("scaleTool"),
  languageToggle: document.getElementById("languageToggle"),
  languageToggleText: document.getElementById("languageToggleText"),
};

const ctx = els.canvas.getContext("2d");

const messages = {
  zh: {
    "app.title": "粒径标注",
    "workspace.aria": "图像观察窗",
    "brand.title": "粒径标注",
    "brand.subtitle": "自动识别后人工校正",
    "nav.toolsPanel": "工具",
    "nav.dataPanel": "数据",
    "nav.languageToggle": "切换到 English",
    "language.target": "EN",
    "image.none": "未选择图片",
    "scale.unset": "比例尺未设置",
    "zoom.aria": "观察窗缩放",
    "zoom.outTitle": "缩小",
    "zoom.inTitle": "放大",
    "zoom.resetTitle": "重置视图",
    "zoom.fit": "适配",
    "hint.initial": "选择图片后可自动识别，也可手动画圆补充。",
    "hint.scale": "拖动一条线覆盖比例尺；完成后自动回到选择。",
    "hint.edit": "左键选择，Shift 多选，右键按直径画圆，Delete 删除，方向键移动，滚轮缩放，中键平移。",
    "emptyState": "拖放或选择一张显微图片",
    "status.idle": "待加载",
    "status.running": "识别中",
    "status.success": "已识别",
    "status.fail": "失败",
    "status.loaded": "已加载",
    "status.loading": "载入中",
    "status.loadFail": "载入失败",
    "errors.imageOnly": "请拖放图片文件。",
    "tabs.toolsAria": "工具分类",
    "tabs.detect": "检测",
    "tabs.edit": "编辑",
    "tabs.export": "导出",
    "tabs.dataAria": "数据视图",
    "tabs.dataPoints": "数据点",
    "tabs.histogram": "柱状图",
    "upload.choose": "选择显微图片",
    "groups.detectParams": "检测参数",
    "groups.editTools": "编辑工具",
    "groups.export": "导出",
    "labels.scaleLength": "比例尺长度 (微米)",
    "labels.sensitivity": "灵敏度",
    "labels.minDiameter": "最小直径 (微米)",
    "labels.maxDiameter": "最大直径 (微米)",
    "labels.contrast": "对比度预处理",
    "labels.labelLimit": "图片标注数量",
    "contrast.background": "背景校正",
    "contrast.none": "不处理",
    "buttons.runDetect": "自动识别",
    "buttons.redrawScale": "重画比例尺",
    "buttons.deleteSelected": "删除选中",
    "buttons.clearManual": "清除手绘",
    "buttons.annotatedImage": "标注图",
    "buttons.exportAll": "导出 CSV + 标注图",
    "edit.note": "左键选择，Shift + 左键多选，右键从颗粒一侧边缘拖到另一侧边缘画圆。Delete 删除选中圆，方向键移动选中圆，Shift + 方向键大步移动。滚轮缩放，中键拖动画布。",
    "stats.title": "统计",
    "stats.count": "主分布颗粒",
    "stats.mean": "平均直径",
    "stats.median": "中位数",
    "stats.range": "范围",
    "table.source": "来源",
    "table.radius": "半径(微米)",
    "table.diameter": "直径(微米)",
    "table.visible": "可见面积",
    "histogram.aria": "粒径分布柱状图",
    "histogram.empty": "暂无 visible_fraction >= 0.5 的粒径数据",
    "unit.um": "微米",
    "unit.umPerPx": "微米/px",
    "source.auto": "自动",
    "source.manual": "手绘",
  },
  en: {
    "app.title": "Particle Size Annotator",
    "workspace.aria": "Image viewport",
    "brand.title": "Particle Size",
    "brand.subtitle": "Auto detection with manual correction",
    "nav.toolsPanel": "Tools",
    "nav.dataPanel": "Data",
    "nav.languageToggle": "Switch to Chinese",
    "language.target": "中文",
    "image.none": "No image selected",
    "scale.unset": "Scale not set",
    "zoom.aria": "Viewport zoom",
    "zoom.outTitle": "Zoom out",
    "zoom.inTitle": "Zoom in",
    "zoom.resetTitle": "Reset view",
    "zoom.fit": "Fit",
    "hint.initial": "Choose an image to detect particles automatically or add circles manually.",
    "hint.scale": "Drag a line across the scale bar; selection mode resumes when you release.",
    "hint.edit": "Left-click to select, Shift for multi-select, right-drag to draw a diameter, Delete to remove, arrow keys to move, wheel to zoom, middle-drag to pan.",
    "emptyState": "Drop or choose a microscope image",
    "status.idle": "Waiting",
    "status.running": "Detecting",
    "status.success": "Detected",
    "status.fail": "Failed",
    "status.loaded": "Loaded",
    "status.loading": "Loading",
    "status.loadFail": "Load failed",
    "errors.imageOnly": "Drop an image file.",
    "tabs.toolsAria": "Tool categories",
    "tabs.detect": "Detect",
    "tabs.edit": "Edit",
    "tabs.export": "Export",
    "tabs.dataAria": "Data views",
    "tabs.dataPoints": "Data points",
    "tabs.histogram": "Histogram",
    "upload.choose": "Choose microscope image",
    "groups.detectParams": "Detection Parameters",
    "groups.editTools": "Edit Tools",
    "groups.export": "Export",
    "labels.scaleLength": "Scale length (µm)",
    "labels.sensitivity": "Sensitivity",
    "labels.minDiameter": "Minimum diameter (µm)",
    "labels.maxDiameter": "Maximum diameter (µm)",
    "labels.contrast": "Contrast preprocessing",
    "labels.labelLimit": "Image label count",
    "contrast.background": "Background correction",
    "contrast.none": "None",
    "buttons.runDetect": "Run Detection",
    "buttons.redrawScale": "Redraw Scale Bar",
    "buttons.deleteSelected": "Delete Selected",
    "buttons.clearManual": "Clear Manual",
    "buttons.annotatedImage": "Annotated Image",
    "buttons.exportAll": "Export CSV + Image",
    "edit.note": "Left-click to select, Shift + left-click to multi-select, and right-drag from one particle edge to the opposite edge to draw a circle. Delete removes selected circles. Arrow keys move selected circles; Shift + arrow keys move farther. Use the wheel to zoom and middle-drag to pan.",
    "stats.title": "Statistics",
    "stats.count": "Main distribution",
    "stats.mean": "Mean diameter",
    "stats.median": "Median",
    "stats.range": "Range",
    "table.source": "Source",
    "table.radius": "Radius (µm)",
    "table.diameter": "Diameter (µm)",
    "table.visible": "Visible area",
    "histogram.aria": "Particle size distribution histogram",
    "histogram.empty": "No particle-size data with visible_fraction >= 0.5",
    "unit.um": "µm",
    "unit.umPerPx": "µm/px",
    "source.auto": "Auto",
    "source.manual": "Manual",
  },
};

function t(key) {
  return messages[state.lang]?.[key] || messages.en[key] || key;
}

function setStatus(key) {
  state.statusKey = key;
  els.statusBadge.textContent = t(key);
}

function applyTranslations() {
  document.documentElement.lang = state.lang === "zh" ? "zh-CN" : "en";
  document.title = t("app.title");
  if (els.languageToggleText) els.languageToggleText.textContent = t("language.target");

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((node) => {
    node.setAttribute("title", t(node.dataset.i18nTitle));
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((node) => {
    node.setAttribute("aria-label", t(node.dataset.i18nAria));
  });

  els.imageName.textContent = state.image ? state.imageName : t("image.none");
  setStatus(state.statusKey);
  setHint();
  updateStats();
  draw();
}

function setLanguage(lang) {
  state.lang = lang === "en" ? "en" : "zh";
  localStorage.setItem("particleAnnotatorLang", state.lang);
  applyTranslations();
}

function toggleLanguage() {
  setLanguage(state.lang === "zh" ? "en" : "zh");
}

function fitTransform() {
  if (!state.image) return { scale: 1, ox: 0, oy: 0 };
  const fitScale = Math.min(
    els.canvas.width / state.image.naturalWidth,
    els.canvas.height / state.image.naturalHeight
  );
  const scale = fitScale * state.view.zoom;
  const ox = (els.canvas.width - state.image.naturalWidth * scale) / 2;
  const oy = (els.canvas.height - state.image.naturalHeight * scale) / 2;
  return { scale, ox: ox + state.view.panX, oy: oy + state.view.panY };
}

function resizeCanvas() {
  const rect = els.canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  els.canvas.width = Math.max(1, Math.round(rect.width * dpr));
  els.canvas.height = Math.max(1, Math.round(rect.height * dpr));
  draw();
}

function canvasPoint(event) {
  const rect = els.canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  return {
    x: (event.clientX - rect.left) * dpr,
    y: (event.clientY - rect.top) * dpr,
  };
}

function resizeHistogram() {
  const rect = els.histogram.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  els.histogram.width = Math.max(1, Math.round(rect.width * dpr));
  els.histogram.height = Math.max(1, Math.round(rect.height * dpr));
  drawHistogram();
}

function imageToCanvas(point) {
  const t = fitTransform();
  return { x: point.x * t.scale + t.ox, y: point.y * t.scale + t.oy };
}

function canvasToImage(event) {
  const point = canvasPoint(event);
  const t = fitTransform();
  return {
    x: (point.x - t.ox) / t.scale,
    y: (point.y - t.oy) / t.scale,
  };
}

function resetView() {
  state.view.zoom = 1;
  state.view.panX = 0;
  state.view.panY = 0;
  updateZoomReadout();
  draw();
}

function zoomAt(factor, center = null) {
  if (!state.image) return;
  const before = fitTransform();
  const canvasCenter = center || { x: els.canvas.width / 2, y: els.canvas.height / 2 };
  const imagePoint = {
    x: (canvasCenter.x - before.ox) / before.scale,
    y: (canvasCenter.y - before.oy) / before.scale,
  };

  state.view.zoom = Math.min(8, Math.max(0.25, state.view.zoom * factor));
  const fitScale = Math.min(
    els.canvas.width / state.image.naturalWidth,
    els.canvas.height / state.image.naturalHeight
  );
  const scale = fitScale * state.view.zoom;
  const baseOx = (els.canvas.width - state.image.naturalWidth * scale) / 2;
  const baseOy = (els.canvas.height - state.image.naturalHeight * scale) / 2;
  state.view.panX = canvasCenter.x - imagePoint.x * scale - baseOx;
  state.view.panY = canvasCenter.y - imagePoint.y * scale - baseOy;
  updateZoomReadout();
  draw();
}

function updateZoomReadout() {
  els.zoomReadout.textContent = `${Math.round(state.view.zoom * 100)}%`;
}

function isEditableTarget(target) {
  return target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement;
}

function activeParticles() {
  return state.particles.filter((p) => !p.deleted);
}

function imageSize() {
  if (!state.image) return null;
  return { width: state.image.naturalWidth, height: state.image.naturalHeight };
}

function visibleFraction(particle) {
  const size = imageSize();
  if (!size || particle.r <= 0) return 0;
  const { width, height } = size;

  if (
    particle.x - particle.r >= 0 &&
    particle.x + particle.r <= width &&
    particle.y - particle.r >= 0 &&
    particle.y + particle.r <= height
  ) {
    return 1;
  }

  const xMin = Math.max(0, particle.x - particle.r);
  const xMax = Math.min(width, particle.x + particle.r);
  if (xMin >= xMax || particle.y + particle.r <= 0 || particle.y - particle.r >= height) {
    return 0;
  }

  const samples = 240;
  const dx = (xMax - xMin) / samples;
  let visibleArea = 0;
  for (let idx = 0; idx < samples; idx += 1) {
    const x = xMin + (idx + 0.5) * dx;
    const halfHeight = Math.sqrt(Math.max(0, particle.r * particle.r - (x - particle.x) ** 2));
    const yMin = Math.max(0, particle.y - halfHeight);
    const yMax = Math.min(height, particle.y + halfHeight);
    visibleArea += Math.max(0, yMax - yMin) * dx;
  }

  return Math.min(1, Math.max(0, visibleArea / (Math.PI * particle.r * particle.r)));
}

function includedInDistribution(particle) {
  return visibleFraction(particle) >= 0.5;
}

function distributionParticles() {
  return activeParticles().filter(includedInDistribution);
}

function diameterUm(particle) {
  return state.micronsPerPx ? 2 * particle.r * state.micronsPerPx : 0;
}

function radiusMicrons(particle) {
  return state.micronsPerPx ? particle.r * state.micronsPerPx : 0;
}

function draw(targetCtx = ctx, options = {}) {
  const canvas = targetCtx.canvas;
  targetCtx.clearRect(0, 0, canvas.width, canvas.height);
  targetCtx.fillStyle = "#0b0d0f";
  targetCtx.fillRect(0, 0, canvas.width, canvas.height);
  if (!state.image) return;

  const exportPadding = options.exportPadding || 0;
  const t = options.export
    ? { scale: 1, ox: exportPadding, oy: exportPadding }
    : fitTransform();

  targetCtx.drawImage(
    state.image,
    t.ox,
    t.oy,
    state.image.naturalWidth * t.scale,
    state.image.naturalHeight * t.scale
  );

  if (options.export && exportPadding > 0) {
    targetCtx.save();
    targetCtx.strokeStyle = "#4b535c";
    targetCtx.lineWidth = 1;
    targetCtx.strokeRect(t.ox + 0.5, t.oy + 0.5, state.image.naturalWidth - 1, state.image.naturalHeight - 1);
    targetCtx.restore();
  }

  const sorted = activeParticles()
    .filter(includedInDistribution)
    .sort((a, b) => b.r - a.r);
  const labelLimit = Number(els.labelLimit.value || 0);
  const labelIds = new Set(sorted.slice(0, labelLimit).map((p) => p.id));

  for (const particle of activeParticles()) {
    drawParticle(targetCtx, particle, t, labelIds.has(particle.id));
  }

  if (state.drag?.kind === "diameter") {
    const preview = circleFromDiameterDrag(state.drag);
    drawParticle(
      targetCtx,
      { id: -1, x: preview.x, y: preview.y, r: preview.r, source: "manual" },
      t,
      false,
      true
    );
    drawDiameterLine(targetCtx, state.drag, t);
  }

  const line = state.drag?.kind === "scale" ? state.drag : state.scaleLine;
  if (line) drawScaleLine(targetCtx, line, t);
}

function circleFromDiameterDrag(drag) {
  return {
    x: (drag.x1 + drag.x2) / 2,
    y: (drag.y1 + drag.y2) / 2,
    r: Math.hypot(drag.x2 - drag.x1, drag.y2 - drag.y1) / 2,
  };
}

function drawDiameterLine(targetCtx, line, transform) {
  const a = { x: line.x1 * transform.scale + transform.ox, y: line.y1 * transform.scale + transform.oy };
  const b = { x: line.x2 * transform.scale + transform.ox, y: line.y2 * transform.scale + transform.oy };
  targetCtx.save();
  targetCtx.strokeStyle = "#ff3b30";
  targetCtx.lineWidth = 1.5;
  targetCtx.beginPath();
  targetCtx.moveTo(a.x, a.y);
  targetCtx.lineTo(b.x, b.y);
  targetCtx.stroke();
  targetCtx.restore();
}

function drawParticle(targetCtx, particle, transform, showLabel, ghost = false) {
  const x = particle.x * transform.scale + transform.ox;
  const y = particle.y * transform.scale + transform.oy;
  const r = particle.r * transform.scale;
  const selected = state.selectedIds.has(particle.id);

  targetCtx.save();
  targetCtx.lineWidth = selected ? 3 : 2;
  targetCtx.strokeStyle = ghost ? "#5aa7ff" : selected ? "#5aa7ff" : "#f5ef3e";
  targetCtx.fillStyle = "#ff3b30";
  targetCtx.beginPath();
  targetCtx.arc(x, y, r, 0, Math.PI * 2);
  targetCtx.stroke();
  targetCtx.beginPath();
  targetCtx.arc(x, y, 2.5, 0, Math.PI * 2);
  targetCtx.fill();

  if (showLabel && state.micronsPerPx) {
    const label = `${diameterUm(particle).toFixed(1)} ${t("unit.um")}`;
    const fontSize = Math.max(12, 13 * transform.scale);
    targetCtx.strokeStyle = "#ff3b30";
    targetCtx.lineWidth = 1;
    targetCtx.beginPath();
    targetCtx.moveTo(x - r, y);
    targetCtx.lineTo(x + r, y);
    targetCtx.stroke();
    targetCtx.fillStyle = "#ff3b30";
    targetCtx.font = `${fontSize}px Segoe UI, sans-serif`;
    const metrics = targetCtx.measureText(label);
    const margin = 4;
    const labelX = Math.min(
      Math.max(x + 5, margin),
      Math.max(margin, targetCtx.canvas.width - metrics.width - margin)
    );
    const preferredY = y - r - 6;
    const alternateY = y + r + fontSize + 6;
    const unclampedY = preferredY >= fontSize + margin ? preferredY : alternateY;
    const labelY = Math.min(
      Math.max(unclampedY, fontSize + margin),
      targetCtx.canvas.height - margin
    );
    targetCtx.fillText(label, labelX, labelY);
  }
  targetCtx.restore();
}

function drawScaleLine(targetCtx, line, transform) {
  const a = { x: line.x1 * transform.scale + transform.ox, y: line.y1 * transform.scale + transform.oy };
  const b = { x: line.x2 * transform.scale + transform.ox, y: line.y2 * transform.scale + transform.oy };
  targetCtx.save();
  targetCtx.strokeStyle = "#2f78ff";
  targetCtx.lineWidth = 4;
  targetCtx.beginPath();
  targetCtx.moveTo(a.x, a.y);
  targetCtx.lineTo(b.x, b.y);
  targetCtx.stroke();
  targetCtx.restore();
}

function updateStats() {
  const distribution = distributionParticles();
  const values = distribution.map(diameterUm).filter((v) => v > 0).sort((a, b) => a - b);
  els.countStat.textContent = distribution.length.toString();
  if (!values.length) {
    els.meanStat.textContent = "-";
    els.medianStat.textContent = "-";
    els.rangeStat.textContent = "-";
  } else {
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const mid = Math.floor(values.length / 2);
    const median = values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
    els.meanStat.textContent = `${mean.toFixed(2)} ${t("unit.um")}`;
    els.medianStat.textContent = `${median.toFixed(2)} ${t("unit.um")}`;
    els.rangeStat.textContent = `${values[0].toFixed(2)}-${values[values.length - 1].toFixed(2)} ${t("unit.um")}`;
  }

  if (state.micronsPerPx) {
    els.scaleReadout.textContent = `${state.micronsPerPx.toFixed(4)} ${t("unit.umPerPx")}`;
  } else {
    els.scaleReadout.textContent = t("scale.unset");
  }

  renderTable();
  drawHistogram(values);
}

function drawHistogram(inputValues = null) {
  const canvas = els.histogram;
  const hctx = canvas.getContext("2d");
  const values = inputValues || distributionParticles().map(diameterUm).filter((v) => v > 0).sort((a, b) => a - b);
  const width = canvas.width;
  const height = canvas.height;
  hctx.clearRect(0, 0, width, height);
  hctx.fillStyle = "#0f1114";
  hctx.fillRect(0, 0, width, height);

  const pad = Math.max(22, Math.round(width * 0.08));
  const top = 16;
  const bottom = 26;
  const plotW = Math.max(1, width - pad - 12);
  const plotH = Math.max(1, height - top - bottom);

  hctx.strokeStyle = "#323840";
  hctx.lineWidth = 1;
  hctx.beginPath();
  hctx.moveTo(pad, top);
  hctx.lineTo(pad, top + plotH);
  hctx.lineTo(pad + plotW, top + plotH);
  hctx.stroke();

  if (!values.length) {
    hctx.fillStyle = "#6f7a83";
    hctx.font = "12px Segoe UI, sans-serif";
    hctx.fillText(t("histogram.empty"), pad + 8, top + 24);
    return;
  }

  const min = values[0];
  const max = values[values.length - 1];
  const binCount = Math.min(18, Math.max(5, Math.round(Math.sqrt(values.length))));
  const span = Math.max(0.001, max - min);
  const counts = Array.from({ length: binCount }, () => 0);
  for (const value of values) {
    const idx = Math.min(binCount - 1, Math.floor(((value - min) / span) * binCount));
    counts[idx] += 1;
  }

  const maxCount = Math.max(...counts);
  const gap = Math.max(2, plotW / binCount * 0.12);
  const barW = plotW / binCount - gap;
  hctx.fillStyle = "#e6d54a";
  for (let i = 0; i < binCount; i += 1) {
    const barH = (counts[i] / maxCount) * (plotH - 6);
    const x = pad + i * (plotW / binCount) + gap / 2;
    const y = top + plotH - barH;
    hctx.fillRect(x, y, Math.max(1, barW), barH);
  }

  hctx.fillStyle = "#9aa5ad";
  hctx.font = "11px Segoe UI, sans-serif";
  hctx.fillText(`${min.toFixed(1)}`, pad, height - 7);
  const maxText = `${max.toFixed(1)} ${t("unit.um")}`;
  const metrics = hctx.measureText(maxText);
  hctx.fillText(maxText, pad + plotW - metrics.width, height - 7);
  hctx.fillText(`${maxCount}`, 4, top + 8);
}

function renderTable() {
  const rows = activeParticles()
    .slice()
    .sort((a, b) => a.id - b.id)
    .slice(0, 250)
    .map((p) => {
      const classes = [
        state.selectedIds.has(p.id) ? "selected" : "",
        includedInDistribution(p) ? "" : "excluded",
      ].filter(Boolean);
      const classAttr = classes.length ? ` class="${classes.join(" ")}"` : "";
      return `<tr${classAttr} data-id="${p.id}">
        <td>${p.id}</td>
        <td>${t(`source.${p.source}`)}</td>
        <td>${p.x.toFixed(1)}</td>
        <td>${p.y.toFixed(1)}</td>
        <td>${radiusMicrons(p).toFixed(2)}</td>
        <td>${diameterUm(p).toFixed(2)}</td>
        <td>${visibleFraction(p).toFixed(3)}</td>
      </tr>`;
    })
    .join("");
  els.table.innerHTML = rows;
}

function refresh() {
  updateStats();
  draw();
}

function nearestParticle(point) {
  let best = null;
  let bestDistance = Infinity;
  for (const particle of activeParticles()) {
    const distance = Math.hypot(point.x - particle.x, point.y - particle.y);
    const tolerance = Math.max(6, particle.r * 0.25);
    if (distance <= particle.r + tolerance && distance < bestDistance) {
      best = particle;
      bestDistance = distance;
    }
  }
  return best;
}

function setHint() {
  if (state.mode === "scale") {
    els.hintText.textContent = t("hint.scale");
  } else if (!state.image) {
    els.hintText.textContent = t("hint.initial");
  } else {
    els.hintText.textContent = t("hint.edit");
  }
}

function setScaleMode() {
  state.mode = "scale";
  els.scaleTool.classList.add("active");
  setHint();
}

function clearScaleMode() {
  state.mode = "select";
  els.scaleTool.classList.remove("active");
  setHint();
}

function selectParticle(id, additive = false) {
  if (!additive) state.selectedIds.clear();
  if (id !== null && id !== undefined) {
    if (additive && state.selectedIds.has(id)) {
      state.selectedIds.delete(id);
    } else {
      state.selectedIds.add(id);
    }
  }
  refresh();
}

function selectedParticles() {
  return state.particles.filter((p) => !p.deleted && state.selectedIds.has(p.id));
}

function moveSelected(dx, dy) {
  for (const particle of selectedParticles()) {
    particle.x += dx;
    particle.y += dy;
  }
  refresh();
}

function deleteSelectedParticles() {
  for (const particle of state.particles) {
    if (state.selectedIds.has(particle.id)) particle.deleted = true;
  }
  state.selectedIds.clear();
  refresh();
}

function setScaleFromLine(line) {
  const px = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
  if (px > 1) {
    state.micronsPerPx = Number(els.scaleUm.value || 50) / px;
  }
}

async function runDetection() {
  if (!state.imageData) return;
  setStatus("status.running");
  els.runDetect.disabled = true;

  const scalePx = state.scaleLine
    ? Math.hypot(state.scaleLine.x2 - state.scaleLine.x1, state.scaleLine.y2 - state.scaleLine.y1)
    : null;

  const payload = {
    imageData: state.imageData,
    scaleUm: Number(els.scaleUm.value || 50),
    scalePx,
    minDiameterUm: Number(els.minDiameter.value || 2),
    maxDiameterUm: Number(els.maxDiameter.value || 95),
    sensitivity: Number(els.sensitivity.value || 0.88),
    contrast: els.contrastMode.value,
  };

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Detection failed");

    state.micronsPerPx = data.micronsPerPx;
    state.particles = data.particles.map((p) => ({ ...p, deleted: false }));
    state.nextId = Math.max(0, ...state.particles.map((p) => p.id)) + 1;
    state.selectedIds.clear();
    if (!state.scaleLine && data.scaleBar) {
      const [x, y, w, h] = data.scaleBar;
      state.scaleLine = { x1: x, y1: y + h / 2, x2: x + w, y2: y + h / 2 };
    }
    setStatus("status.success");
    refresh();
  } catch (error) {
    setStatus("status.fail");
    alert(error.message);
  } finally {
    els.runDetect.disabled = false;
  }
}

function loadImage(file) {
  const reader = new FileReader();
  reader.onload = () => {
    loadImageData(reader.result, file.name);
  };
  reader.readAsDataURL(file);
}

function isImageFile(file) {
  return file && file.type.startsWith("image/");
}

function droppedImageFile(event) {
  return Array.from(event.dataTransfer?.files || []).find(isImageFile) || null;
}

function setDragOver(active) {
  els.appShell.classList.toggle("drag-over", active);
}

function handleFileDrag(event) {
  const hasFiles = Array.from(event.dataTransfer?.types || []).includes("Files");
  if (!hasFiles) return false;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  return true;
}

function handleDragEnter(event) {
  if (!handleFileDrag(event)) return;
  state.ui.dragDepth += 1;
  setDragOver(true);
}

function handleDragOver(event) {
  handleFileDrag(event);
}

function handleDragLeave(event) {
  if (!handleFileDrag(event)) return;
  state.ui.dragDepth = Math.max(0, state.ui.dragDepth - 1);
  if (state.ui.dragDepth === 0) setDragOver(false);
}

function handleDrop(event) {
  if (!handleFileDrag(event)) return;
  state.ui.dragDepth = 0;
  setDragOver(false);
  const file = droppedImageFile(event);
  if (!file) {
    alert(t("errors.imageOnly"));
    return;
  }
  loadImage(file);
}

function loadImageData(imageData, imageName) {
  state.imageData = imageData;
  state.imageName = imageName;
  state.image = new Image();
  state.image.onload = () => {
    state.particles = [];
    state.scaleLine = null;
    state.micronsPerPx = null;
    state.selectedIds.clear();
    state.nextId = 1;
    resetView();
    els.emptyState.classList.add("hidden");
    els.imageName.textContent = imageName;
    setStatus("status.loaded");
    refresh();
  };
  state.image.src = imageData;
}

async function loadImageFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const imagePath = params.get("image");
  if (!imagePath) return;

  try {
    setStatus("status.loading");
    const response = await fetch(`/api/local-image?path=${encodeURIComponent(imagePath)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load image");
    loadImageData(data.imageData, data.name);
  } catch (error) {
    setStatus("status.loadFail");
    alert(error.message);
  }
}

function deleteParticle(id) {
  const particle = state.particles.find((p) => p.id === id);
  if (particle) {
    particle.deleted = true;
    state.selectedIds.delete(id);
    refresh();
  }
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportCsv() {
  const header = [
    "particle_id",
    "source",
    "center_x_px",
    "center_y_px",
    "radius_px",
    "radius_micrometer",
    "diameter_micrometer",
    "visible_fraction",
    "included_in_distribution",
  ];
  const lines = [header.join(",")];
  for (const p of activeParticles()) {
    lines.push([
      p.id,
      p.source,
      p.x.toFixed(4),
      p.y.toFixed(4),
      p.r.toFixed(4),
      radiusMicrons(p).toFixed(4),
      diameterUm(p).toFixed(4),
      visibleFraction(p).toFixed(6),
      includedInDistribution(p) ? "true" : "false",
    ].join(","));
  }
  downloadBlob(`${state.imageName || "particles"}_corrected.csv`, new Blob([lines.join("\n")], { type: "text/csv" }));
}

function exportPng() {
  if (!state.image) return;
  const exportPadding = 96;
  const out = document.createElement("canvas");
  out.width = state.image.naturalWidth + exportPadding * 2;
  out.height = state.image.naturalHeight + exportPadding * 2;
  draw(out.getContext("2d"), { export: true, exportPadding });
  out.toBlob((blob) => {
    if (blob) downloadBlob(`${state.imageName || "image"}_annotated.png`, blob);
  }, "image/png");
}

function exportAll() {
  exportCsv();
  window.setTimeout(exportPng, 120);
}

els.imageInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) loadImage(file);
});

window.addEventListener("dragenter", handleDragEnter);
window.addEventListener("dragover", handleDragOver);
window.addEventListener("dragleave", handleDragLeave);
window.addEventListener("drop", handleDrop);

els.runDetect.addEventListener("click", runDetection);
els.deleteSelected.addEventListener("click", deleteSelectedParticles);
els.clearManual.addEventListener("click", () => {
  state.particles = state.particles.filter((p) => p.source !== "manual");
  refresh();
});
els.exportCsv.addEventListener("click", exportCsv);
els.exportPng.addEventListener("click", exportPng);
els.exportAll.addEventListener("click", exportAll);
els.zoomOut.addEventListener("click", () => zoomAt(1 / 1.25));
els.zoomIn.addEventListener("click", () => zoomAt(1.25));
els.resetZoom.addEventListener("click", resetView);
els.scaleTool.addEventListener("click", setScaleMode);
els.languageToggle.addEventListener("click", toggleLanguage);
els.leftToggle.addEventListener("click", () => {
  state.ui.leftCollapsed = !state.ui.leftCollapsed;
  els.leftPanel.classList.toggle("collapsed", state.ui.leftCollapsed);
});
els.rightToggle.addEventListener("click", () => {
  state.ui.rightOpen = !state.ui.rightOpen;
  els.rightPanel.classList.toggle("open", state.ui.rightOpen);
});

document.querySelectorAll("[data-left-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-left-tab]").forEach((tab) => {
      tab.classList.toggle("active", tab === button);
    });
    document.querySelectorAll("[data-left-panel]").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.leftPanel === button.dataset.leftTab);
    });
  });
});

document.querySelectorAll("[data-right-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-right-tab]").forEach((tab) => {
      tab.classList.toggle("active", tab === button);
    });
    document.querySelectorAll("[data-right-panel]").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.rightPanel === button.dataset.rightTab);
    });
    resizeHistogram();
  });
});

els.table.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  selectParticle(Number(row.dataset.id), event.shiftKey);
});

els.canvas.addEventListener("mousedown", (event) => {
  if (!state.image) return;
  if (event.button === 1) {
    event.preventDefault();
    const point = canvasPoint(event);
    state.drag = {
      kind: "pan",
      startX: point.x,
      startY: point.y,
      startPanX: state.view.panX,
      startPanY: state.view.panY,
    };
    return;
  }

  const point = canvasToImage(event);
  if (event.button === 2) {
    event.preventDefault();
    state.drag = { kind: "diameter", x1: point.x, y1: point.y, x2: point.x, y2: point.y };
  } else if (state.mode === "scale") {
    state.drag = { kind: "scale", x1: point.x, y1: point.y, x2: point.x, y2: point.y };
  } else {
    const particle = nearestParticle(point);
    if (particle) {
      if (event.shiftKey) {
        selectParticle(particle.id, true);
      } else {
        if (!state.selectedIds.has(particle.id)) {
          state.selectedIds.clear();
          state.selectedIds.add(particle.id);
          refresh();
        }
        const selected = selectedParticles();
        state.drag = {
          kind: "move",
          startX: point.x,
          startY: point.y,
          particles: selected.map((p) => ({ p, x: p.x, y: p.y })),
        };
      }
    } else {
      selectParticle(null, event.shiftKey);
    }
  }
});

els.canvas.addEventListener("mousemove", (event) => {
  if (!state.drag) return;
  if (state.drag.kind === "pan") {
    const point = canvasPoint(event);
    state.view.panX = state.drag.startPanX + point.x - state.drag.startX;
    state.view.panY = state.drag.startPanY + point.y - state.drag.startY;
    draw();
    return;
  }

  const point = canvasToImage(event);
  if (state.drag.kind === "move") {
    const dx = point.x - state.drag.startX;
    const dy = point.y - state.drag.startY;
    for (const item of state.drag.particles) {
      item.p.x = item.x + dx;
      item.p.y = item.y + dy;
    }
  } else if (state.drag.kind === "diameter" || state.drag.kind === "scale") {
    state.drag.x2 = point.x;
    state.drag.y2 = point.y;
  }
  draw();
});

window.addEventListener("mouseup", () => {
  if (!state.drag) return;
  if (state.drag.kind === "pan") {
    state.drag = null;
    draw();
    return;
  }

  if (state.drag.kind === "move") {
    state.drag = null;
    refresh();
    return;
  }

  if (state.drag.kind === "diameter") {
    const circle = circleFromDiameterDrag(state.drag);
    if (circle.r > 3) {
      const id = state.nextId++;
      state.particles.push({
        id,
        x: circle.x,
        y: circle.y,
        r: circle.r,
        source: "manual",
        deleted: false,
      });
      state.selectedIds.clear();
      state.selectedIds.add(id);
    }
  } else if (state.drag.kind === "scale") {
    const px = Math.hypot(state.drag.x2 - state.drag.x1, state.drag.y2 - state.drag.y1);
    if (px > 5) {
      state.scaleLine = { ...state.drag };
      setScaleFromLine(state.scaleLine);
    }
    clearScaleMode();
  }
  state.drag = null;
  refresh();
});

els.canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

els.canvas.addEventListener("wheel", (event) => {
  if (!state.image) return;
  event.preventDefault();
  const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
  zoomAt(factor, canvasPoint(event));
}, { passive: false });

window.addEventListener("keydown", (event) => {
  if (isEditableTarget(event.target)) return;

  if (event.key === "Backspace" || event.key === "Delete") {
    if (state.selectedIds.size > 0) {
      event.preventDefault();
      deleteSelectedParticles();
    }
    return;
  }

  const step = event.shiftKey ? 10 : 1;
  const moves = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  };
  if (event.key in moves && state.selectedIds.size > 0) {
    event.preventDefault();
    const [dx, dy] = moves[event.key];
    moveSelected(dx, dy);
  }
});

for (const input of [els.scaleUm, els.labelLimit]) {
  input.addEventListener("change", () => {
    if (state.scaleLine) setScaleFromLine(state.scaleLine);
    refresh();
  });
}

new ResizeObserver(resizeCanvas).observe(els.canvas);
new ResizeObserver(resizeHistogram).observe(els.histogram);
applyTranslations();
resizeCanvas();
resizeHistogram();
updateZoomReadout();
loadImageFromQuery();
