import { cacheApplicationShell, clearRuntimeCache, createDetector } from "./detection.js";
import {
  BarChart3,
  CircleHelp,
  CirclePlus,
  createIcons,
  Download,
  FileSpreadsheet,
  Hand,
  ImageDown,
  ImagePlus,
  Maximize2,
  MousePointer2,
  Move,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop,
  Ruler,
  ScanLine,
  ShieldCheck,
  Table2,
  Trash2,
  TriangleAlert,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide";
import { circleVisibleFraction, summarizeDiameters } from "./particle-math.js";

const compactLayout = window.matchMedia(
  "(max-width: 820px), (max-width: 900px) and (max-height: 560px)",
);
const toolbarPositions = new Set(["left", "right", "top", "bottom"]);
const savedToolbarPosition = localStorage.getItem("particleLensToolbarPosition");
const savedLanguage =
  localStorage.getItem("particleLensLang") || localStorage.getItem("particleAnnotatorLang");
const browserLanguage = navigator.languages?.[0] || navigator.language || "en";
const overlayPositionStorageKey = "particleLensOverlayPositions";
const panelWidthStorageKey = "particleLensPanelWidths";
const defaultPanelWidths = { left: 340, right: 440 };

function savedPanelWidths() {
  try {
    const saved = JSON.parse(localStorage.getItem(panelWidthStorageKey) || "{}");
    return {
      left: Number(saved.left) || defaultPanelWidths.left,
      right: Number(saved.right) || defaultPanelWidths.right,
    };
  } catch {
    return { ...defaultPanelWidths };
  }
}

const initialPanelWidths = savedPanelWidths();

function savedOverlayPositions() {
  try {
    return JSON.parse(localStorage.getItem(overlayPositionStorageKey) || "{}");
  } catch {
    return {};
  }
}

const state = {
  lang: savedLanguage || (browserLanguage.toLowerCase().startsWith("zh") ? "zh" : "en"),
  statusKey: "status.idle",
  image: null,
  imageName: "",
  imageBytes: null,
  imageObjectUrl: "",
  detector: null,
  particles: [],
  selectedIds: new Set(),
  mode: "select",
  drag: null,
  scaleLine: null,
  micronsPerPx: null,
  scaleSource: null,
  nextId: 1,
  view: {
    zoom: 1,
    panX: 0,
    panY: 0,
  },
  ui: {
    leftCollapsed: compactLayout.matches,
    rightOpen: false,
    dragDepth: 0,
    toolbarPosition: toolbarPositions.has(savedToolbarPosition) ? savedToolbarPosition : "left",
    paretoBinCount: Math.min(
      30,
      Math.max(5, Number(localStorage.getItem("particleLensParetoBins")) || 10),
    ),
    showHistogram: true,
    showCumulative: true,
    showParetoOverlay: true,
    showScaleLegend: true,
    panelWidths: {
      left: initialPanelWidths.left,
      right: initialPanelWidths.right,
    },
  },
};

const activePointers = new Map();
let pinchGesture = null;
let panelResizeDrag = null;
let pendingImageFile = null;
let replacementAuthorized = false;
let plotlyApi = null;
let plotlyPromise = null;

async function loadPlotly() {
  if (plotlyApi) return plotlyApi;
  plotlyPromise ||= import("plotly.js-basic-dist-min").then((module) => module.default);
  plotlyApi = await plotlyPromise;
  return plotlyApi;
}

const els = {
  appShell: document.querySelector(".app-shell"),
  leftPanel: document.getElementById("leftPanel"),
  leftPanelResizeHandle: document.getElementById("leftPanelResizeHandle"),
  leftToggle: document.getElementById("leftToggle"),
  rightPanel: document.getElementById("rightPanel"),
  rightPanelResizeHandle: document.getElementById("rightPanelResizeHandle"),
  rightToggle: document.getElementById("rightToggle"),
  panelBackdrop: document.getElementById("panelBackdrop"),
  quickToolbar: document.querySelector(".quick-toolbar"),
  quickToolButtons: Array.from(document.querySelectorAll("[data-canvas-tool]")),
  quickFitView: document.getElementById("quickFitView"),
  quickDeleteSelected: document.getElementById("quickDeleteSelected"),
  quickToolbarPosition: document.getElementById("quickToolbarPosition"),
  quickToolbarPositionMenu: document.getElementById("quickToolbarPositionMenu"),
  quickToolbarPositionButtons: Array.from(document.querySelectorAll("[data-toolbar-position]")),
  canvas: document.getElementById("imageCanvas"),
  imageInput: document.getElementById("imageInput"),
  imageMenuTrigger: document.getElementById("imageMenuTrigger"),
  imageAction: document.getElementById("imageAction"),
  runDetect: document.getElementById("runDetect"),
  statusBadge: document.getElementById("statusBadge"),
  emptyState: document.getElementById("emptyState"),
  gestureHint: document.getElementById("canvasGestureHint"),
  imageName: document.getElementById("imageName"),
  scaleReadout: document.getElementById("scaleReadout"),
  zoomReadout: document.getElementById("zoomReadout"),
  zoomOut: document.getElementById("zoomOut"),
  zoomIn: document.getElementById("zoomIn"),
  hintText: document.getElementById("hintText"),
  table: document.getElementById("particleTable"),
  countStat: document.getElementById("countStat"),
  meanStat: document.getElementById("meanStat"),
  medianStat: document.getElementById("medianStat"),
  rangeStat: document.getElementById("rangeStat"),
  scaleUm: document.getElementById("scaleUm"),
  micronsPerPixel: document.getElementById("micronsPerPixel"),
  sensitivity: document.getElementById("sensitivity"),
  minDiameter: document.getElementById("minDiameter"),
  maxDiameter: document.getElementById("maxDiameter"),
  contrastMode: document.getElementById("contrastMode"),
  labelLimit: document.getElementById("labelLimit"),
  exportCsv: document.getElementById("exportCsv"),
  exportPng: document.getElementById("exportPng"),
  exportAll: document.getElementById("exportAll"),
  exportSelection: document.getElementById("exportSelection"),
  exportScale: document.getElementById("exportScale"),
  exportLegend: document.getElementById("exportLegend"),
  exportPaddingColor: document.getElementById("exportPaddingColor"),
  exportPaddingWidth: document.getElementById("exportPaddingWidth"),
  paretoPlot: document.getElementById("paretoPlot"),
  paretoOverlay: document.getElementById("paretoOverlay"),
  paretoOverlayPlot: document.getElementById("paretoOverlayPlot"),
  paretoBinCount: document.getElementById("paretoBinCount"),
  paretoBinCountValue: document.getElementById("paretoBinCountValue"),
  showHistogram: document.getElementById("showHistogram"),
  showCumulative: document.getElementById("showCumulative"),
  showParetoOverlay: document.getElementById("showParetoOverlay"),
  hideParetoOverlay: document.getElementById("hideParetoOverlay"),
  scaleLegendOverlay: document.getElementById("scaleLegendOverlay"),
  scaleLegendCanvas: document.getElementById("scaleLegendCanvas"),
  scaleLegendNotice: document.getElementById("scaleLegendNotice"),
  scaleLegendDescription: document.getElementById("scaleLegendDescription"),
  showScaleLegend: document.getElementById("showScaleLegend"),
  hideScaleLegend: document.getElementById("hideScaleLegend"),
  detectRequirement: document.getElementById("detectRequirement"),
  floatingOverlays: Array.from(document.querySelectorAll(".floating-overlay")),
  downloadPareto: document.getElementById("downloadPareto"),
  replaceImageDialog: document.getElementById("replaceImageDialog"),
  replaceExport: document.getElementById("replaceExport"),
  replaceContinue: document.getElementById("replaceContinue"),
  actionManualTrigger: document.getElementById("actionManualTrigger"),
  actionManualDialog: document.getElementById("actionManualDialog"),
  actionManualClose: document.getElementById("actionManualClose"),
  actionManualTabs: Array.from(document.querySelectorAll("[data-manual-tab]")),
  actionManualPanels: Array.from(document.querySelectorAll("[data-manual-panel]")),
  languageToggle: document.getElementById("languageToggle"),
  languageToggleText: document.getElementById("languageToggleText"),
  runtimeLoader: document.getElementById("runtimeLoader"),
  runtimePhase: document.getElementById("runtimePhase"),
  runtimeProgress: document.getElementById("runtimeProgress"),
  runtimeBytes: document.getElementById("runtimeBytes"),
  runtimeRetry: document.getElementById("runtimeRetry"),
};

const ctx = els.canvas.getContext("2d");

const messages = {
  zh: {
    "app.title": "ParticleLens",
    "workspace.aria": "图像观察窗",
    "canvas.aria": "图像编辑画布",
    "toolbar.aria": "图像编辑工具",
    "toolbar.select": "选择",
    "toolbar.selectTitle": "选择工具 (V)",
    "toolbar.pan": "抓手",
    "toolbar.panTitle": "抓手工具 (H)",
    "toolbar.draw": "按直径画圆",
    "toolbar.drawTitle": "按直径画圆 (C)",
    "toolbar.scale": "重画比例尺",
    "toolbar.scaleTitle": "重画比例尺 (R)",
    "toolbar.fit": "适配视图",
    "toolbar.fitTitle": "适配视图 (F)",
    "toolbar.delete": "删除选中",
    "toolbar.deleteTitle": "删除选中 (Delete)",
    "toolbar.position": "工具栏位置",
    "toolbar.positionTitle": "选择工具栏位置",
    "toolbar.positionMenuAria": "工具栏位置",
    "toolbar.positionLeft": "左侧",
    "toolbar.positionRight": "右侧",
    "toolbar.positionTop": "顶部",
    "toolbar.positionBottom": "底部",
    "brand.title": "ParticleLens",
    "brand.subtitle": "显微粒径识别与校正",
    "nav.toolsPanel": "识别设置",
    "nav.dataPanel": "分析与导出",
    "nav.closePanels": "关闭面板",
    "nav.resizeToolsPanel": "调整识别设置面板宽度",
    "nav.resizeDataPanel": "调整分析与导出面板宽度",
    "nav.languageToggle": "切换到 English",
    "language.target": "EN",
    "manual.open": "鼠标与触控操作说明",
    "manual.close": "关闭操作说明",
    "manual.title": "画布操作说明",
    "manual.subtitle": "选择输入方式，查看如何检查和校正颗粒。",
    "manual.tabsAria": "输入方式",
    "manual.mouseTab": "鼠标",
    "manual.touchTab": "触控",
    "manual.mouse.selectTitle": "选择颗粒",
    "manual.mouse.selectBody": "左键单击圆圈。按住 Shift 单击可添加或移除多选中的圆圈。",
    "manual.mouse.moveTitle": "移动颗粒",
    "manual.mouse.moveBody": "按住左键拖动选中的圆圈，可移动整个选择。",
    "manual.mouse.panTitle": "平移图像",
    "manual.mouse.panBody": "按住鼠标中键拖动任意位置，或选择抓手工具后按住左键拖动。",
    "manual.mouse.drawTitle": "添加颗粒",
    "manual.mouse.drawBody": "按住右键沿颗粒直径拖动，或选择画圆工具后按住左键拖动。",
    "manual.mouse.zoomTitle": "缩放",
    "manual.mouse.zoomBody": "滚动滚轮，以指针所在位置为中心放大或缩小。",
    "manual.mouse.scaleTitle": "设置比例",
    "manual.mouse.scaleBody": "选择比例尺工具，然后沿图中的比例尺按住左键拖动。",
    "manual.mouse.shortcuts": "快捷键：V 选择 · H 抓手 · C 画圆 · R 比例尺 · F 适配视图 · Delete 删除选中",
    "manual.touch.selectTitle": "选择颗粒",
    "manual.touch.selectBody": "点按圆圈进行选择。点按图像空白处可清除选择。",
    "manual.touch.moveTitle": "移动颗粒",
    "manual.touch.moveBody": "拖动选中的圆圈以调整位置。",
    "manual.touch.panTitle": "平移图像",
    "manual.touch.panBody": "拖动图像空白处，或选择抓手工具后在任意位置拖动。",
    "manual.touch.drawTitle": "添加颗粒",
    "manual.touch.drawBody": "选择画圆工具，然后从颗粒的一侧拖到另一侧。",
    "manual.touch.zoomTitle": "缩放与平移",
    "manual.touch.zoomBody": "双指捏合缩放；两指同时移动可平移。",
    "manual.touch.scaleTitle": "设置比例",
    "manual.touch.scaleBody": "选择比例尺工具，然后沿图中的比例尺拖动。",
    "image.none": "未选择图片",
    "scale.unset": "比例尺未设置",
    "scale.sourceDirect": "直接输入",
    "scale.sourceLine": "比例尺",
    "zoom.outTitle": "缩小",
    "zoom.inTitle": "放大",
    "hint.initial": "选择图片后可自动识别，也可手动画圆补充。",
    "hint.scale": "拖动一条线覆盖比例尺；完成后自动回到选择。",
    "hint.draw": "从颗粒一侧拖到另一侧，按直径添加圆；再次点按工具可退出。",
    "hint.pan": "拖动画布进行平移；按 V 或选择箭头返回选择工具。",
    "hint.edit": "点按选择，拖动颗粒可移动，拖动空白处可平移，双指捏合可缩放。",
    "emptyState.title": "打开显微图片",
    "emptyState.detail": "点击选择文件或照片，也可拖放到此处",
    "gesture.guide": "点按选择 · 拖动平移或移动 · 双指缩放",
    "status.idle": "待加载",
    "status.running": "识别中",
    "status.success": "已识别",
    "status.fail": "失败",
    "status.loaded": "已加载",
    "status.loading": "载入中",
    "status.loadFail": "载入失败",
    "runtime.loading": "正在准备本地识别引擎",
    "runtime.download": "下载运行组件",
    "runtime.python": "初始化 Python",
    "runtime.opencv": "加载 OpenCV",
    "runtime.detector": "加载识别模块",
    "runtime.native": "连接离线识别引擎",
    "runtime.ready": "准备完成",
    "runtime.failed": "识别引擎加载失败",
    "runtime.retry": "重试",
    "runtime.offline": "下载 Windows 离线版",
    "warnings.largeImage": "图片超过 2000 万像素，识别可能占用较多内存并需要更长时间。",
    "errors.imageOnly": "请拖放图片文件。",
    "upload.openTitle": "打开图片",
    "upload.openAction": "打开图片",
    "upload.replaceAction": "上传新图片",
    "detect.title": "颗粒识别",
    "detect.subtitle": "运行本地识别前调整参数。",
    "detect.localNote": "识别在浏览器本地运行，图片不会上传。",
    "detect.scaleRequired": "请先绘制比例尺或输入每像素长度，再运行识别。",
    "tabs.toolsAria": "工具分类",
    "tabs.detect": "检测",
    "tabs.edit": "编辑",
    "tabs.export": "导出",
    "tabs.dataAria": "数据视图",
    "tabs.dataPoints": "数据点",
    "tabs.pareto": "Pareto 分布",
    "upload.choose": "选择显微图片",
    "groups.detectParams": "检测参数",
    "groups.editTools": "编辑工具",
    "groups.export": "导出",
    "labels.scaleLength": "比例尺长度 (微米)",
    "labels.micronsPerPixel": "每像素长度 (微米/px)",
    "labels.sensitivity": "灵敏度",
    "labels.sensitivityInfoAria": "查看灵敏度说明",
    "labels.sensitivityInfo": "这是圆形检测的形状置信阈值（0.01–0.98），不是颗粒的物理量。数值越低，判定越宽松：可检出边缘较弱、残缺或不够圆的颗粒，但误检会增加；数值越高，判定越严格：更偏向边缘清晰、完整且接近圆形的颗粒，但可能漏检。",
    "labels.minDiameter": "最小直径 (微米)",
    "labels.maxDiameter": "最大直径 (微米)",
    "labels.contrast": "对比度预处理",
    "labels.labelLimit": "图片标注数量",
    "contrast.background": "背景校正",
    "contrast.none": "不处理",
    "buttons.runDetect": "自动识别",
    "buttons.drawCircle": "按直径画圆",
    "buttons.redrawScale": "重画比例尺",
    "buttons.deleteSelected": "删除选中",
    "buttons.clearManual": "清除手绘",
    "buttons.annotatedImage": "标注图",
    "buttons.exportAll": "导出 CSV + 标注图",
    "edit.note": "触控：点按选择颗粒，拖动颗粒可移动，拖动空白处可平移，双指捏合可缩放；选择“按直径画圆”后拖过颗粒直径。鼠标仍支持右键画圆、滚轮缩放与中键平移。",
    "stats.title": "统计",
    "stats.count": "主分布颗粒",
    "stats.mean": "平均直径",
    "stats.median": "中位数",
    "stats.range": "范围",
    "stats.rule": "可见面积 ≥ 50%",
    "table.source": "来源",
    "table.radius": "半径(微米)",
    "table.diameter": "直径(微米)",
    "table.visible": "可见面积",
    "pareto.aria": "粒径 Pareto 图",
    "pareto.overlayAria": "实时 Pareto 分布",
    "pareto.live": "实时分布",
    "pareto.hideOverlay": "隐藏实时分布",
    "pareto.binCount": "分箱数量",
    "pareto.frequency": "频数",
    "pareto.cumulative": "累计百分比",
    "pareto.overlay": "实时叠加图",
    "pareto.download": "下载当前图表",
    "pareto.empty": "识别颗粒并设置比例尺后显示分布",
    "pareto.xAxis": "粒径 (微米)",
    "pareto.yFrequency": "颗粒数",
    "pareto.yCumulative": "累计百分比",
    "export.description": "保存校正后的数据、标注图或同时保存两者。",
    "export.imageContents": "标注图内容",
    "export.selection": "选中颗粒高亮",
    "export.scale": "比例尺",
    "export.legend": "比例与粒径图例",
    "export.paddingColor": "外扩留白颜色",
    "export.paddingWidth": "外扩留白宽度 (px)",
    "replace.title": "替换当前图片？",
    "replace.warning": "打开另一张图片会清空全部识别结果、人工校正、比例尺和当前选择。请先导出需要保留的数据。",
    "replace.cancel": "取消",
    "replace.export": "先导出数据",
    "replace.continue": "替换图片",
    "legend.aria": "比例尺与粒径图例",
    "legend.title": "比例与粒径",
    "legend.hide": "隐藏比例图例",
    "legend.show": "在图片上显示比例图例",
    "legend.scale": "比例尺",
    "legend.minimum": "最小粒径",
    "legend.maximum": "最大粒径",
    "legend.zoomOut": "部分参考长度超出图例宽度，请缩小图片查看完整长度。",
    "unit.um": "微米",
    "unit.umPerPx": "微米/px",
    "source.auto": "自动",
    "source.manual": "手绘",
  },
  en: {
    "app.title": "ParticleLens",
    "workspace.aria": "Image viewport",
    "canvas.aria": "Image editing canvas",
    "toolbar.aria": "Image editing tools",
    "toolbar.select": "Select",
    "toolbar.selectTitle": "Select tool (V)",
    "toolbar.pan": "Hand",
    "toolbar.panTitle": "Hand tool (H)",
    "toolbar.draw": "Draw circle by diameter",
    "toolbar.drawTitle": "Draw circle by diameter (C)",
    "toolbar.scale": "Redraw scale bar",
    "toolbar.scaleTitle": "Redraw scale bar (R)",
    "toolbar.fit": "Fit view",
    "toolbar.fitTitle": "Fit view (F)",
    "toolbar.delete": "Delete selected",
    "toolbar.deleteTitle": "Delete selected (Delete)",
    "toolbar.position": "Toolbar position",
    "toolbar.positionTitle": "Choose toolbar position",
    "toolbar.positionMenuAria": "Toolbar position",
    "toolbar.positionLeft": "Left",
    "toolbar.positionRight": "Right",
    "toolbar.positionTop": "Top",
    "toolbar.positionBottom": "Bottom",
    "brand.title": "ParticleLens",
    "brand.subtitle": "Microscope particle sizing and correction",
    "nav.toolsPanel": "Detection settings",
    "nav.dataPanel": "Analysis and export",
    "nav.closePanels": "Close panels",
    "nav.resizeToolsPanel": "Resize detection settings panel",
    "nav.resizeDataPanel": "Resize analysis and export panel",
    "nav.languageToggle": "Switch to Chinese",
    "language.target": "中文",
    "manual.open": "Mouse and touch controls",
    "manual.close": "Close controls",
    "manual.title": "Canvas controls",
    "manual.subtitle": "Select an input method to see how to inspect and correct particles.",
    "manual.tabsAria": "Input method",
    "manual.mouseTab": "Mouse",
    "manual.touchTab": "Touch",
    "manual.mouse.selectTitle": "Select particles",
    "manual.mouse.selectBody": "Left-click a circle. Shift-click to add or remove circles from the selection.",
    "manual.mouse.moveTitle": "Move particles",
    "manual.mouse.moveBody": "Left-drag a selected circle to move the entire selection.",
    "manual.mouse.panTitle": "Pan the image",
    "manual.mouse.panBody": "Middle-drag anywhere, or choose the Hand tool and left-drag.",
    "manual.mouse.drawTitle": "Add a particle",
    "manual.mouse.drawBody": "Right-drag across a particle’s diameter, or use the Draw Circle tool and left-drag.",
    "manual.mouse.zoomTitle": "Zoom",
    "manual.mouse.zoomBody": "Scroll the wheel to zoom toward or away from the pointer.",
    "manual.mouse.scaleTitle": "Set the scale",
    "manual.mouse.scaleBody": "Choose the Scale tool, then left-drag along the image’s scale bar.",
    "manual.mouse.shortcuts": "Shortcuts: V Select · H Hand · C Draw · R Scale · F Fit view · Delete Remove selected",
    "manual.touch.selectTitle": "Select a particle",
    "manual.touch.selectBody": "Tap a circle to select it. Tap empty image space to clear the selection.",
    "manual.touch.moveTitle": "Move a particle",
    "manual.touch.moveBody": "Drag a selected circle to reposition it.",
    "manual.touch.panTitle": "Pan the image",
    "manual.touch.panBody": "Drag empty image space, or choose the Hand tool and drag anywhere.",
    "manual.touch.drawTitle": "Add a particle",
    "manual.touch.drawBody": "Choose the Draw Circle tool, then drag from one edge of the particle to the other.",
    "manual.touch.zoomTitle": "Zoom and pan",
    "manual.touch.zoomBody": "Pinch with two fingers to zoom; move both fingers together to pan.",
    "manual.touch.scaleTitle": "Set the scale",
    "manual.touch.scaleBody": "Choose the Scale tool, then drag along the image’s scale bar.",
    "image.none": "No image selected",
    "scale.unset": "Scale not set",
    "scale.sourceDirect": "Direct input",
    "scale.sourceLine": "Scale bar",
    "zoom.outTitle": "Zoom out",
    "zoom.inTitle": "Zoom in",
    "hint.initial": "Choose an image to detect particles automatically or add circles manually.",
    "hint.scale": "Drag a line across the scale bar; selection mode resumes when you release.",
    "hint.draw": "Drag from one particle edge to the other to add a circle; tap the tool again to exit.",
    "hint.pan": "Drag the canvas to pan; press V or choose the pointer to return to selection.",
    "hint.edit": "Tap to select, drag a particle to move it, drag empty image space to pan, and pinch to zoom.",
    "emptyState.title": "Open a microscope image",
    "emptyState.detail": "Click to choose a file or photo, or drop it here",
    "gesture.guide": "Tap to select · Drag to pan or move · Pinch to zoom",
    "status.idle": "Waiting",
    "status.running": "Detecting",
    "status.success": "Detected",
    "status.fail": "Failed",
    "status.loaded": "Loaded",
    "status.loading": "Loading",
    "status.loadFail": "Load failed",
    "runtime.loading": "Preparing the local detection engine",
    "runtime.download": "Downloading runtime components",
    "runtime.python": "Initializing Python",
    "runtime.opencv": "Loading OpenCV",
    "runtime.detector": "Loading the detector",
    "runtime.native": "Connecting to the offline detector",
    "runtime.ready": "Ready",
    "runtime.failed": "The detection engine failed to load",
    "runtime.retry": "Retry",
    "runtime.offline": "Download the Windows offline app",
    "warnings.largeImage": "This image exceeds 20 megapixels. Detection may use substantial memory and take longer.",
    "errors.imageOnly": "Drop an image file.",
    "upload.openTitle": "Open an image",
    "upload.openAction": "Open an image",
    "upload.replaceAction": "Upload a new image",
    "detect.title": "Particle detection",
    "detect.subtitle": "Tune recognition before running the local detector.",
    "detect.localNote": "Detection runs locally in your browser. Your image is not uploaded.",
    "detect.scaleRequired": "Set a scale bar or enter µm/px to enable detection.",
    "tabs.toolsAria": "Tool categories",
    "tabs.detect": "Detect",
    "tabs.edit": "Edit",
    "tabs.export": "Export",
    "tabs.dataAria": "Data views",
    "tabs.dataPoints": "Data points",
    "tabs.pareto": "Pareto distribution",
    "upload.choose": "Choose microscope image",
    "groups.detectParams": "Detection Parameters",
    "groups.editTools": "Edit Tools",
    "groups.export": "Export",
    "labels.scaleLength": "Scale length (µm)",
    "labels.micronsPerPixel": "Length per pixel (µm/px)",
    "labels.sensitivity": "Sensitivity",
    "labels.sensitivityInfoAria": "Show sensitivity explanation",
    "labels.sensitivityInfo": "This is the circle detector's shape-confidence threshold (0.01–0.98), not a physical particle quantity. Lower values relax acceptance, finding weaker, incomplete, or less circular edges but increasing false positives. Higher values are stricter, favoring clear, complete, circular edges but potentially missing particles.",
    "labels.minDiameter": "Minimum diameter (µm)",
    "labels.maxDiameter": "Maximum diameter (µm)",
    "labels.contrast": "Contrast preprocessing",
    "labels.labelLimit": "Image label count",
    "contrast.background": "Background correction",
    "contrast.none": "None",
    "buttons.runDetect": "Run Detection",
    "buttons.drawCircle": "Draw Circle by Diameter",
    "buttons.redrawScale": "Redraw Scale Bar",
    "buttons.deleteSelected": "Delete Selected",
    "buttons.clearManual": "Clear Manual",
    "buttons.annotatedImage": "Annotated Image",
    "buttons.exportAll": "Export CSV + Image",
    "edit.note": "Touch: tap a particle to select it, drag a particle to move it, drag empty image space to pan, and pinch to zoom. Choose “Draw Circle by Diameter” and drag across a particle to add one. Mouse input still supports right-drag drawing, wheel zoom, and middle-drag panning.",
    "stats.title": "Statistics",
    "stats.count": "Main distribution",
    "stats.mean": "Mean diameter",
    "stats.median": "Median",
    "stats.range": "Range",
    "stats.rule": "Visible area ≥ 50%",
    "table.source": "Source",
    "table.radius": "Radius (µm)",
    "table.diameter": "Diameter (µm)",
    "table.visible": "Visible area",
    "pareto.aria": "Particle size Pareto diagram",
    "pareto.overlayAria": "Live Pareto distribution",
    "pareto.live": "Live distribution",
    "pareto.hideOverlay": "Hide live distribution",
    "pareto.binCount": "Bin count",
    "pareto.frequency": "Frequency",
    "pareto.cumulative": "Cumulative",
    "pareto.overlay": "Live overlay",
    "pareto.download": "Download current chart",
    "pareto.empty": "Detect particles and set the scale to show the distribution",
    "pareto.xAxis": "Diameter (µm)",
    "pareto.yFrequency": "Particles",
    "pareto.yCumulative": "Cumulative percentage",
    "export.description": "Save corrected measurements, the annotated image, or both.",
    "export.imageContents": "Image contents",
    "export.selection": "Selected particle highlight",
    "export.scale": "Scale bar",
    "export.legend": "Scale and diameter legend",
    "export.paddingColor": "Outer margin color",
    "export.paddingWidth": "Outer margin size (px)",
    "replace.title": "Replace the current image?",
    "replace.warning": "Opening another image will clear all detected particles, manual corrections, scale settings, and selections. Export anything you need first.",
    "replace.cancel": "Cancel",
    "replace.export": "Export data first",
    "replace.continue": "Replace image",
    "legend.aria": "Scale and diameter legend",
    "legend.title": "Scale and diameter",
    "legend.hide": "Hide scale legend",
    "legend.show": "Show scale legend on image",
    "legend.scale": "Scale",
    "legend.minimum": "Minimum",
    "legend.maximum": "Maximum",
    "legend.zoomOut": "One or more reference lengths exceed the legend width. Zoom out to see them in full.",
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
  if (els.runtimeRetry) els.runtimeRetry.textContent = t("runtime.retry");

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
  els.imageAction.textContent = t(state.image ? "upload.replaceAction" : "upload.openAction");
  els.imageMenuTrigger.setAttribute("title", t("upload.openTitle"));
  setStatus(state.statusKey);
  setHint();
  updateStats();
  draw();
}

function setLanguage(lang) {
  state.lang = lang === "en" ? "en" : "zh";
  localStorage.setItem("particleLensLang", state.lang);
  localStorage.removeItem("particleAnnotatorLang");
  applyTranslations();
}

function toggleLanguage() {
  setLanguage(state.lang === "zh" ? "en" : "zh");
}

function setActionManualTab(name, { focus = false } = {}) {
  const nextTab = els.actionManualTabs.find((tab) => tab.dataset.manualTab === name);
  if (!nextTab) return;

  for (const tab of els.actionManualTabs) {
    const active = tab === nextTab;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  for (const panel of els.actionManualPanels) {
    const active = panel.dataset.manualPanel === name;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  }
  if (focus) nextTab.focus();
}

function openActionManual() {
  if (els.actionManualDialog.open) return;
  els.actionManualDialog.showModal();
  const activeTab = els.actionManualTabs.find((tab) => tab.getAttribute("aria-selected") === "true");
  activeTab?.focus();
}

function closeActionManual() {
  if (els.actionManualDialog.open) els.actionManualDialog.close();
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
  renderScaleLegend();
}

function canvasPoint(event) {
  const rect = els.canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  return {
    x: (event.clientX - rect.left) * dpr,
    y: (event.clientY - rect.top) * dpr,
  };
}

function resizePareto() {
  if (plotlyApi && els.paretoPlot?.data) plotlyApi.Plots.resize(els.paretoPlot);
  if (plotlyApi && els.paretoOverlayPlot?.data && !els.paretoOverlay.hidden) {
    plotlyApi.Plots.resize(els.paretoOverlayPlot);
  }
}

function overlayBounds(overlay, left, top) {
  const containerRect = els.canvas.closest(".canvas-wrap").getBoundingClientRect();
  const overlayRect = overlay.getBoundingClientRect();
  const topbarRect = document.querySelector(".topbar").getBoundingClientRect();
  const minimumTop = topbarRect.bottom - containerRect.top;
  return {
    left: Math.min(
      Math.max(8, left),
      Math.max(8, containerRect.width - overlayRect.width - 8),
    ),
    top: Math.min(
      Math.max(minimumTop + 8, top),
      Math.max(minimumTop + 8, containerRect.height - overlayRect.height - 8),
    ),
  };
}

function positionFloatingOverlay(overlay, left, top, persist = false) {
  if (overlay.hidden) return;
  const position = overlayBounds(overlay, left, top);
  overlay.classList.add("user-positioned");
  overlay.style.left = `${position.left}px`;
  overlay.style.top = `${position.top}px`;
  overlay.style.right = "auto";
  overlay.style.bottom = "auto";
  if (persist) {
    const positions = savedOverlayPositions();
    positions[overlay.dataset.overlayId] = position;
    localStorage.setItem(overlayPositionStorageKey, JSON.stringify(positions));
  }
}

function restoreFloatingOverlayPosition(overlay) {
  const saved = savedOverlayPositions()[overlay.dataset.overlayId];
  if (!saved || !Number.isFinite(saved.left) || !Number.isFinite(saved.top)) return;
  positionFloatingOverlay(overlay, saved.left, saved.top);
}

function clampFloatingOverlays() {
  for (const overlay of els.floatingOverlays) {
    if (overlay.hidden || !overlay.classList.contains("user-positioned")) continue;
    positionFloatingOverlay(
      overlay,
      Number.parseFloat(overlay.style.left) || 0,
      Number.parseFloat(overlay.style.top) || 0,
      true,
    );
  }
}

function makeFloatingOverlayDraggable(overlay) {
  const handle = overlay.querySelector(".overlay-drag-handle");
  if (!handle) return;
  let drag = null;

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    event.preventDefault();
    const overlayRect = overlay.getBoundingClientRect();
    const containerRect = els.canvas.closest(".canvas-wrap").getBoundingClientRect();
    drag = {
      pointerId: event.pointerId,
      dx: event.clientX - overlayRect.left,
      dy: event.clientY - overlayRect.top,
      containerLeft: containerRect.left,
      containerTop: containerRect.top,
    };
    overlay.classList.add("is-dragging");
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    positionFloatingOverlay(
      overlay,
      event.clientX - drag.containerLeft - drag.dx,
      event.clientY - drag.containerTop - drag.dy,
    );
  });

  const finishDrag = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (handle.hasPointerCapture?.(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    drag = null;
    overlay.classList.remove("is-dragging");
    const left = Number.parseFloat(overlay.style.left);
    const top = Number.parseFloat(overlay.style.top);
    if (Number.isFinite(left) && Number.isFinite(top)) {
      positionFloatingOverlay(overlay, left, top, true);
    }
  };
  handle.addEventListener("pointerup", finishDrag);
  handle.addEventListener("pointercancel", finishDrag);
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
  renderScaleLegend();
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
  return circleVisibleFraction(particle, size.width, size.height);
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
  targetCtx.fillStyle = options.export
    ? options.exportPaddingColor || "#ffffff"
    : "#0b0d0f";
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


  const sorted = activeParticles()
    .filter(includedInDistribution)
    .sort((a, b) => b.r - a.r);
  const labelLimit = Number(els.labelLimit.value || 0);
  const labelIds = new Set(sorted.slice(0, labelLimit).map((p) => p.id));

  const showSelection = !options.export || options.includeSelection;
  for (const particle of activeParticles()) {
    drawParticle(targetCtx, particle, t, labelIds.has(particle.id), false, showSelection);
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

  const line = options.export
    ? state.scaleLine
    : state.drag?.kind === "scale" ? state.drag : state.scaleLine;
  if (line && (!options.export || options.includeScale)) drawScaleLine(targetCtx, line, t);
  if (options.export && options.includeLegend) drawExportLegend(targetCtx);
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

function drawParticle(targetCtx, particle, transform, showLabel, ghost = false, showSelection = true) {
  const x = particle.x * transform.scale + transform.ox;
  const y = particle.y * transform.scale + transform.oy;
  const r = particle.r * transform.scale;
  const selected = showSelection && state.selectedIds.has(particle.id);

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

function scaleLegendEntries() {
  if (!state.micronsPerPx) return [];
  const scaleUm = Number(els.scaleUm.value || 50);
  const minUm = Number(els.minDiameter.value || 0);
  const maxUm = Number(els.maxDiameter.value || 0);
  return [
    { label: t("legend.scale"), um: scaleUm, px: scaleUm / state.micronsPerPx, color: "#e6d54a" },
    { label: t("legend.minimum"), um: minUm, px: minUm / state.micronsPerPx, color: "#74c69d" },
    { label: t("legend.maximum"), um: maxUm, px: maxUm / state.micronsPerPx, color: "#5aa7ff" },
  ];
}

function displayMicrons(value) {
  return value.toLocaleString(state.lang === "zh" ? "zh-CN" : "en", {
    maximumFractionDigits: 4,
  });
}

function drawExportLegend(targetCtx) {
  const entries = scaleLegendEntries();
  if (entries.length === 0) return;

  const x = 12;
  const y = 12;
  const width = Math.max(160, Math.min(280, targetCtx.canvas.width - 24));
  const height = 150;
  const labelX = x + 12;
  const barX = x + 12;
  const maxBarWidth = width - 24;

  targetCtx.save();
  targetCtx.fillStyle = "rgba(15, 17, 20, 0.9)";
  targetCtx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  targetCtx.lineWidth = 1;
  targetCtx.beginPath();
  targetCtx.roundRect(x, y, width, height, 8);
  targetCtx.fill();
  targetCtx.stroke();

  targetCtx.fillStyle = "#dce2e5";
  targetCtx.font = '600 11px "Segoe UI", system-ui, sans-serif';
  targetCtx.textBaseline = "middle";
  targetCtx.fillText(t("legend.title"), labelX, y + 16);
  targetCtx.font = '11px "Segoe UI", system-ui, sans-serif';

  entries.forEach((entry, index) => {
    const labelY = y + 42 + index * 34;
    const barY = labelY + 12;
    const entryOverflows = entry.px > maxBarWidth;
    const barWidth = Math.max(1, Math.min(entry.px, maxBarWidth));
    targetCtx.fillStyle = "#dce2e5";
    targetCtx.fillText(
      `${entry.label}  ${displayMicrons(entry.um)} ${t("unit.um")}  ·  ${entry.px.toFixed(1)} px`,
      labelX,
      labelY,
    );
    targetCtx.strokeStyle = entry.color;
    targetCtx.lineWidth = 2;
    targetCtx.beginPath();
    targetCtx.moveTo(barX, barY);
    targetCtx.lineTo(barX + barWidth, barY);
    targetCtx.stroke();
    targetCtx.beginPath();
    targetCtx.moveTo(barX, barY - 3);
    targetCtx.lineTo(barX, barY + 3);
    if (entryOverflows) {
      targetCtx.moveTo(barX + barWidth - 7, barY - 4);
      targetCtx.lineTo(barX + barWidth - 2, barY + 1);
      targetCtx.moveTo(barX + barWidth - 7, barY + 1);
      targetCtx.lineTo(barX + barWidth - 2, barY + 6);
    } else {
      targetCtx.moveTo(barX + barWidth, barY - 3);
      targetCtx.lineTo(barX + barWidth, barY + 3);
    }
    targetCtx.stroke();
  });
  targetCtx.restore();
}

function updateStats() {
  const distribution = distributionParticles();
  const values = distribution.map(diameterUm).filter((v) => v > 0).sort((a, b) => a - b);
  els.countStat.textContent = distribution.length.toString();
  const summary = summarizeDiameters(values);
  if (!summary) {
    els.meanStat.textContent = "-";
    els.medianStat.textContent = "-";
    els.rangeStat.textContent = "-";
  } else {
    els.meanStat.textContent = `${summary.mean.toFixed(2)} ${t("unit.um")}`;
    els.medianStat.textContent = `${summary.median.toFixed(2)} ${t("unit.um")}`;
    els.rangeStat.textContent = `${summary.min.toFixed(2)}-${summary.max.toFixed(2)} ${t("unit.um")}`;
  }

  if (state.micronsPerPx) {
    const sourceKey = state.scaleSource === "line" ? "scale.sourceLine" : "scale.sourceDirect";
    els.scaleReadout.textContent =
      `${state.micronsPerPx.toFixed(4)} ${t("unit.umPerPx")} · ${t(sourceKey)}`;
    els.scaleReadout.dataset.micronsPerPx = String(state.micronsPerPx);
  } else {
    els.scaleReadout.textContent = t("scale.unset");
    delete els.scaleReadout.dataset.micronsPerPx;
  }

  els.detectRequirement.hidden = Boolean(state.micronsPerPx);
  renderTable();
  renderPareto(values);
  renderScaleLegend();
}

function paretoSeries(values) {
  if (!values.length) return null;
  const min = values[0];
  const max = values[values.length - 1];
  const binCount = state.ui.paretoBinCount;
  const span = Math.max(0.001, max - min);
  const binWidth = span / binCount;
  const counts = Array.from({ length: binCount }, () => 0);
  for (const value of values) {
    const index = Math.min(binCount - 1, Math.floor((value - min) / binWidth));
    counts[index] += 1;
  }
  let cumulative = 0;
  return {
    centers: counts.map((_, index) => min + (index + 0.5) * binWidth),
    counts,
    cumulative: counts.map((count) => {
      cumulative += count;
      return (cumulative / values.length) * 100;
    }),
    binWidth,
  };
}

function paretoTraces(series) {
  if (!series) return [];
  return [
    {
      x: series.centers,
      y: series.counts,
      width: series.binWidth * 0.88,
      type: "bar",
      name: t("pareto.frequency"),
      marker: { color: "#e6d54a", line: { color: "#f3e77c", width: 1 } },
      opacity: 0.82,
      hovertemplate: `%{x:.2f} ${t("unit.um")}<br>${t("pareto.yFrequency")}: %{y}<extra></extra>`,
      visible: state.ui.showHistogram,
    },
    {
      x: series.centers,
      y: series.cumulative,
      type: "scatter",
      mode: "lines+markers",
      name: t("pareto.cumulative"),
      yaxis: "y2",
      line: { color: "#5aa7ff", width: 2.5 },
      marker: { color: "#5aa7ff", size: 5 },
      hovertemplate: `%{x:.2f} ${t("unit.um")}<br>%{y:.1f}%<extra></extra>`,
      visible: state.ui.showCumulative,
    },
  ];
}

function paretoLayout(compact = false, hasValues = true) {
  return {
    autosize: true,
    paper_bgcolor: "rgba(15,17,20,0)",
    plot_bgcolor: "rgba(15,17,20,0)",
    margin: compact ? { l: 28, r: 30, t: 8, b: 24 } : { l: 44, r: 46, t: 18, b: 46 },
    showlegend: !compact,
    legend: {
      orientation: "h",
      x: 0,
      y: 1.16,
      font: { color: "#c8d0d5", size: 11 },
    },
    font: { family: "Segoe UI, system-ui, sans-serif", color: "#9aa5ad", size: compact ? 9 : 11 },
    bargap: 0.08,
    xaxis: {
      title: compact ? "" : { text: t("pareto.xAxis"), standoff: 10 },
      gridcolor: "rgba(255,255,255,0.07)",
      zerolinecolor: "rgba(255,255,255,0.12)",
      tickfont: { size: compact ? 8 : 10 },
      fixedrange: compact,
    },
    yaxis: {
      title: compact ? "" : { text: t("pareto.yFrequency"), standoff: 6 },
      rangemode: "tozero",
      gridcolor: "rgba(255,255,255,0.07)",
      zerolinecolor: "rgba(255,255,255,0.12)",
      tickfont: { size: compact ? 8 : 10 },
      fixedrange: compact,
    },
    yaxis2: {
      title: compact ? "" : { text: t("pareto.yCumulative"), standoff: 6 },
      overlaying: "y",
      side: "right",
      range: [0, 105],
      ticksuffix: "%",
      showgrid: false,
      tickfont: { size: compact ? 8 : 10 },
      fixedrange: compact,
    },
    annotations: hasValues
      ? []
      : [{
        text: t("pareto.empty"),
        x: 0.5,
        y: 0.5,
        xref: "paper",
        yref: "paper",
        showarrow: false,
        font: { color: "#7d878e", size: compact ? 9 : 12 },
      }],
  };
}

function paretoConfig(compact = false) {
  return {
    responsive: true,
    displaylogo: false,
    displayModeBar: compact ? false : "hover",
    scrollZoom: !compact,
    modeBarButtonsToRemove: ["lasso2d", "select2d"],
    toImageButtonOptions: {
      format: "png",
      filename: `${state.imageName || "particles"}_pareto`,
      width: 1200,
      height: 720,
      scale: 1,
    },
  };
}

function renderScaleLegend() {
  const visible = Boolean(
    state.image &&
    state.micronsPerPx &&
    state.ui.showScaleLegend,
  );
  els.showScaleLegend.checked = state.ui.showScaleLegend;
  els.scaleLegendOverlay.hidden = !visible;
  if (!visible) {
    els.scaleLegendDescription.textContent = "";
    return;
  }

  restoreFloatingOverlayPosition(els.scaleLegendOverlay);
  const entries = scaleLegendEntries();
  const dpr = window.devicePixelRatio || 1;
  const screenScale = fitTransform().scale / dpr;
  for (const entry of entries) entry.screenPx = entry.px * screenScale;
  const description = entries
    .map((entry) =>
      `${entry.label}: ${displayMicrons(entry.um)} ${t("unit.um")} = ${entry.px.toFixed(1)} px (image), ` +
      `${entry.screenPx.toFixed(1)} px (screen)`
    )
    .join(". ");
  els.scaleLegendDescription.textContent = description;

  const canvas = els.scaleLegendCanvas;
  const cssWidth = Math.max(240, Math.round(canvas.clientWidth || 270));
  const cssHeight = Math.max(126, Math.round(canvas.clientHeight || 126));
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  const legendCtx = canvas.getContext("2d");
  legendCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  legendCtx.clearRect(0, 0, cssWidth, cssHeight);

  const labelX = 12;
  const barX = 12;
  const maxBarWidth = cssWidth - 24;
  const hasOverflow = entries.some((entry) => entry.screenPx > maxBarWidth);
  els.scaleLegendOverlay.classList.toggle("has-overflow", hasOverflow);
  els.scaleLegendOverlay.dataset.scaleScreenPx = entries[0].screenPx.toFixed(3);
  els.scaleLegendOverlay.dataset.overflow = String(hasOverflow);
  els.scaleLegendNotice.hidden = !hasOverflow;
  legendCtx.font = '11px "Segoe UI", system-ui, sans-serif';
  legendCtx.textBaseline = "middle";

  entries.forEach((entry, index) => {
    const labelY = 17 + index * 38;
    const barY = labelY + 13;
    const entryOverflows = entry.screenPx > maxBarWidth;
    const barWidth = Math.max(1, Math.min(entry.screenPx, maxBarWidth));
    legendCtx.fillStyle = "#dce2e5";
    legendCtx.fillText(
      `${entry.label}  ${displayMicrons(entry.um)} ${t("unit.um")}  ·  ${entry.px.toFixed(1)} px`,
      labelX,
      labelY,
    );
    legendCtx.strokeStyle = entry.color;
    legendCtx.lineWidth = 2;
    legendCtx.beginPath();
    legendCtx.moveTo(barX, barY);
    legendCtx.lineTo(barX + barWidth, barY);
    legendCtx.stroke();
    legendCtx.beginPath();
    legendCtx.moveTo(barX, barY - 3);
    legendCtx.lineTo(barX, barY + 3);
    if (entryOverflows) {
      legendCtx.moveTo(barX + barWidth - 7, barY - 4);
      legendCtx.lineTo(barX + barWidth - 2, barY + 1);
      legendCtx.moveTo(barX + barWidth - 7, barY + 1);
      legendCtx.lineTo(barX + barWidth - 2, barY + 6);
    } else {
      legendCtx.moveTo(barX + barWidth, barY - 3);
      legendCtx.lineTo(barX + barWidth, barY + 3);
    }
    legendCtx.stroke();
  });

  if (els.scaleLegendOverlay.classList.contains("user-positioned")) {
    positionFloatingOverlay(
      els.scaleLegendOverlay,
      Number.parseFloat(els.scaleLegendOverlay.style.left) || 0,
      Number.parseFloat(els.scaleLegendOverlay.style.top) || 0,
    );
  }
}

async function renderPareto(inputValues = null) {
  const values = inputValues ||
    distributionParticles().map(diameterUm).filter((value) => value > 0).sort((a, b) => a - b);
  const series = paretoSeries(values);
  const traces = paretoTraces(series);

  const showOverlay = Boolean(series) && state.ui.showParetoOverlay;
  els.paretoOverlay.hidden = !showOverlay;
  els.showParetoOverlay.checked = state.ui.showParetoOverlay;
  if (showOverlay) restoreFloatingOverlayPosition(els.paretoOverlay);
  if (!series && !plotlyApi) {
    els.paretoPlot.classList.add("is-empty");
    els.paretoPlot.textContent = t("pareto.empty");
    return;
  }

  const Plotly = await loadPlotly();
  els.paretoPlot.classList.remove("is-empty");
  Plotly.react(els.paretoPlot, traces, paretoLayout(false, Boolean(series)), paretoConfig(false));
  if (showOverlay) {
    Plotly.react(
      els.paretoOverlayPlot,
      traces,
      paretoLayout(true, true),
      paretoConfig(true),
    );
  }
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
      return `<tr${classAttr} data-id="${p.id}" data-radius-px="${p.r}">
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
  updateQuickToolbar();
  draw();
}

function nearestParticle(point, extraTolerance = 0) {
  let best = null;
  let bestDistance = Infinity;
  for (const particle of activeParticles()) {
    const distance = Math.hypot(point.x - particle.x, point.y - particle.y);
    const tolerance = Math.max(6, particle.r * 0.25, extraTolerance);
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
  } else if (state.mode === "draw") {
    els.hintText.textContent = t("hint.draw");
  } else if (state.mode === "pan") {
    els.hintText.textContent = t("hint.pan");
  } else if (!state.image) {
    els.hintText.textContent = t("hint.initial");
  } else {
    els.hintText.textContent = t("hint.edit");
  }
}

function setInteractionMode(mode) {
  state.mode = mode;
  els.canvas.dataset.mode = mode;
  updateQuickToolbar();
  setHint();
}

function updateQuickToolbar() {
  const hasImage = Boolean(state.image);
  for (const button of els.quickToolButtons) {
    const active = button.dataset.canvasTool === state.mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    button.disabled = !state.image && button.dataset.canvasTool !== "select";
  }
  els.quickFitView.disabled = !hasImage;
  els.zoomOut.disabled = !hasImage;
  els.zoomIn.disabled = !hasImage;
  els.quickDeleteSelected.disabled = state.selectedIds.size === 0;
  els.exportCsv.disabled = !hasImage;
  els.exportPng.disabled = !hasImage;
  els.exportAll.disabled = !hasImage;
  els.exportSelection.disabled = !hasImage;
  els.exportScale.disabled = !hasImage || !state.scaleLine;
  els.exportLegend.disabled = !hasImage || !state.micronsPerPx;
  els.exportPaddingColor.disabled = !hasImage;
  els.exportPaddingWidth.disabled = !hasImage;
  els.downloadPareto.disabled = distributionParticles().every((particle) => diameterUm(particle) <= 0);
  els.micronsPerPixel.disabled = !hasImage;
  if (state.statusKey !== "status.running") {
    els.runDetect.disabled = !hasImage || !state.detector || !state.micronsPerPx;
  }
}

function setToolbarPositionMenu(open) {
  els.quickToolbarPositionMenu.hidden = !open;
  els.quickToolbarPosition.setAttribute("aria-expanded", String(open));
}

function setToolbarPosition(position, persist = true) {
  const nextPosition = toolbarPositions.has(position) ? position : "left";
  state.ui.toolbarPosition = nextPosition;
  els.appShell.dataset.toolbarPosition = nextPosition;
  for (const button of els.quickToolbarPositionButtons) {
    const selected = button.dataset.toolbarPosition === nextPosition;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-checked", String(selected));
  }
  if (persist) localStorage.setItem("particleLensToolbarPosition", nextPosition);
  setToolbarPositionMenu(false);
}

function clearScaleMode() {
  setInteractionMode("select");
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
    state.scaleSource = "line";
    els.micronsPerPixel.value = state.micronsPerPx.toFixed(6);
  }
}

function setScaleFromDirectInput() {
  const value = Number(els.micronsPerPixel.value);
  if (Number.isFinite(value) && value > 0) {
    state.micronsPerPx = value;
    state.scaleSource = "direct";
  } else if (state.scaleLine) {
    setScaleFromLine(state.scaleLine);
  } else {
    state.micronsPerPx = null;
    state.scaleSource = null;
  }
  refresh();
}

async function runDetection() {
  if (!state.imageBytes || !state.detector || !state.micronsPerPx) return;
  setStatus("status.running");
  els.runDetect.disabled = true;

  const scaleUm = Number(els.scaleUm.value || 50);
  const scalePx = state.scaleSource === "line" && state.scaleLine
    ? Math.hypot(state.scaleLine.x2 - state.scaleLine.x1, state.scaleLine.y2 - state.scaleLine.y1)
    : scaleUm / state.micronsPerPx;

  const payload = {
    scaleUm,
    scalePx,
    minDiameterUm: Number(els.minDiameter.value || 2),
    maxDiameterUm: Number(els.maxDiameter.value || 95),
    sensitivity: Number(els.sensitivity.value || 0.88),
    contrast: els.contrastMode.value,
  };

  try {
    const data = await state.detector.analyze(state.imageBytes, payload);

    state.micronsPerPx = data.micronsPerPx;
    els.micronsPerPixel.value = state.micronsPerPx.toFixed(6);
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
    els.runDetect.disabled = !state.image || !state.detector || !state.micronsPerPx;
  }
}

async function loadImage(file) {
  const imageBytes = await file.arrayBuffer();
  const imageUrl = URL.createObjectURL(file);
  loadImageData(imageUrl, file.name, imageBytes, true);
}

function openImagePicker() {
  els.imageInput.value = "";
  els.imageInput.click();
}

function requestImageSelection(file = null) {
  if (!state.image) {
    if (file) loadImage(file);
    else openImagePicker();
    return;
  }
  pendingImageFile = file;
  els.replaceImageDialog.showModal();
}

function acceptImageReplacement() {
  els.replaceImageDialog.close();
  if (pendingImageFile) {
    const file = pendingImageFile;
    pendingImageFile = null;
    loadImage(file);
    return;
  }
  replacementAuthorized = true;
  openImagePicker();
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
  requestImageSelection(file);
}

function loadImageData(imageUrl, imageName, imageBytes, revokeUrl = false) {
  if (state.imageObjectUrl) URL.revokeObjectURL(state.imageObjectUrl);
  state.imageBytes = imageBytes;
  state.imageObjectUrl = revokeUrl ? imageUrl : "";
  state.imageName = imageName;
  state.image = new Image();
  state.image.onload = () => {
    state.particles = [];
    state.scaleLine = null;
    state.micronsPerPx = null;
    state.scaleSource = null;
    els.micronsPerPixel.value = "";
    state.selectedIds.clear();
    state.nextId = 1;
    resetView();
    els.emptyState.classList.add("hidden");
    els.gestureHint.classList.remove("hidden");
    els.imageName.textContent = imageName;
    els.imageAction.textContent = t("upload.replaceAction");
    if (state.image.naturalWidth * state.image.naturalHeight > 20_000_000) {
      alert(t("warnings.largeImage"));
    }
    setStatus("status.loaded");
    closeCompactPanels();
    refresh();
  };
  state.image.src = imageUrl;
}

function removeLegacyImageQuery() {
  const pageUrl = new URL(window.location.href);
  if (!pageUrl.searchParams.has("image")) return;
  pageUrl.searchParams.delete("image");
  window.history.replaceState(window.history.state, "", pageUrl);
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
  const exportPadding = Math.max(
    0,
    Math.min(500, Math.round(Number(els.exportPaddingWidth.value) || 0)),
  );
  const out = document.createElement("canvas");
  out.width = state.image.naturalWidth + exportPadding * 2;
  out.height = state.image.naturalHeight + exportPadding * 2;
  draw(out.getContext("2d"), {
    export: true,
    exportPadding,
    includeSelection: els.exportSelection.checked,
    includeScale: els.exportScale.checked,
    includeLegend: els.exportLegend.checked,
    exportPaddingColor: els.exportPaddingColor.value,
  });
  out.toBlob((blob) => {
    if (blob) downloadBlob(`${state.imageName || "image"}_annotated.png`, blob);
  }, "image/png");
}

function exportAll() {
  exportCsv();
  window.setTimeout(exportPng, 120);
}

function panelWidthLimits() {
  const min = 280;
  const max = Math.max(
    min,
    Math.floor(Math.min(720, window.innerWidth - 180, window.innerWidth * 0.7)),
  );
  return { min, max };
}

function panelForSide(side) {
  return side === "left" ? els.leftPanel : els.rightPanel;
}

function panelHandleForSide(side) {
  return side === "left" ? els.leftPanelResizeHandle : els.rightPanelResizeHandle;
}

function clampPanelWidth(width) {
  const limits = panelWidthLimits();
  return Math.min(limits.max, Math.max(limits.min, Math.round(width)));
}

function applyPanelWidths() {
  const rootStyle = document.documentElement.style;
  if (compactLayout.matches) {
    rootStyle.removeProperty("--left-drawer-width");
    rootStyle.removeProperty("--right-drawer-width");
    els.leftPanelResizeHandle.setAttribute("aria-disabled", "true");
    els.rightPanelResizeHandle.setAttribute("aria-disabled", "true");
    return;
  }

  const limits = panelWidthLimits();
  for (const side of ["left", "right"]) {
    const width = clampPanelWidth(state.ui.panelWidths[side]);
    const handle = panelHandleForSide(side);
    rootStyle.setProperty(`--${side}-drawer-width`, `${width}px`);
    handle.setAttribute("aria-disabled", "false");
    handle.setAttribute("aria-valuemin", String(limits.min));
    handle.setAttribute("aria-valuemax", String(limits.max));
    handle.setAttribute("aria-valuenow", String(width));
  }
}

function persistPanelWidths() {
  localStorage.setItem(panelWidthStorageKey, JSON.stringify(state.ui.panelWidths));
}

function setPanelWidth(side, width, persist = false) {
  state.ui.panelWidths[side] = clampPanelWidth(width);
  applyPanelWidths();
  if (persist) persistPanelWidths();
}

function beginPanelResize(event) {
  if (compactLayout.matches || event.button !== 0) return;
  const handle = event.currentTarget;
  const side = handle.dataset.panelSide;
  const panel = panelForSide(side);
  event.preventDefault();
  handle.setPointerCapture(event.pointerId);
  handle.classList.add("is-resizing");
  document.body.classList.add("panel-resizing");
  panelResizeDrag = {
    handle,
    pointerId: event.pointerId,
    side,
    startX: event.clientX,
    startWidth: panel.getBoundingClientRect().width,
  };
}

function updatePanelResize(event) {
  if (!panelResizeDrag || event.pointerId !== panelResizeDrag.pointerId) return;
  event.preventDefault();
  const direction = panelResizeDrag.side === "left" ? 1 : -1;
  const delta = (event.clientX - panelResizeDrag.startX) * direction;
  setPanelWidth(panelResizeDrag.side, panelResizeDrag.startWidth + delta);
}

function finishPanelResize(event) {
  if (!panelResizeDrag || event.pointerId !== panelResizeDrag.pointerId) return;
  const { handle } = panelResizeDrag;
  if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  handle.classList.remove("is-resizing");
  document.body.classList.remove("panel-resizing");
  panelResizeDrag = null;
  persistPanelWidths();
  clampFloatingOverlays();
}

function resizePanelFromKeyboard(event) {
  if (compactLayout.matches) return;
  const side = event.currentTarget.dataset.panelSide;
  const currentWidth = panelForSide(side).getBoundingClientRect().width;
  const limits = panelWidthLimits();
  let nextWidth = null;
  if (event.key === "Home") nextWidth = limits.min;
  if (event.key === "End") nextWidth = limits.max;
  if (event.key === "ArrowLeft") nextWidth = currentWidth + (side === "right" ? 16 : -16);
  if (event.key === "ArrowRight") nextWidth = currentWidth + (side === "left" ? 16 : -16);
  if (nextWidth === null) return;
  event.preventDefault();
  setPanelWidth(side, nextWidth, true);
  clampFloatingOverlays();
}

function makePanelResizable(handle) {
  handle.addEventListener("pointerdown", beginPanelResize);
  handle.addEventListener("keydown", resizePanelFromKeyboard);
}

function syncPanels() {
  applyPanelWidths();
  els.leftPanel.classList.toggle("collapsed", state.ui.leftCollapsed);
  els.rightPanel.classList.toggle("open", state.ui.rightOpen);
  els.appShell.classList.toggle("left-panel-open", !state.ui.leftCollapsed);
  els.appShell.classList.toggle("right-panel-open", state.ui.rightOpen);
  els.leftToggle.setAttribute("aria-expanded", String(!state.ui.leftCollapsed));
  els.rightToggle.setAttribute("aria-expanded", String(state.ui.rightOpen));
  els.appShell.classList.toggle(
    "panels-open",
    compactLayout.matches && (!state.ui.leftCollapsed || state.ui.rightOpen),
  );
}

function closeCompactPanels() {
  if (!compactLayout.matches) return;
  state.ui.leftCollapsed = true;
  state.ui.rightOpen = false;
  syncPanels();
}

function handleLayoutChange(event) {
  if (event.matches) {
    state.ui.leftCollapsed = true;
    state.ui.rightOpen = false;
  } else {
    state.ui.leftCollapsed = false;
    state.ui.rightOpen = false;
  }
  syncPanels();
}

els.imageInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    replacementAuthorized = false;
    return;
  }
  if (state.image && !replacementAuthorized) {
    requestImageSelection(file);
    return;
  }
  replacementAuthorized = false;
  loadImage(file);
});
els.imageMenuTrigger.addEventListener("click", () => requestImageSelection());
els.emptyState.addEventListener("click", () => requestImageSelection());
els.replaceContinue.addEventListener("click", acceptImageReplacement);
els.replaceExport.addEventListener("click", exportAll);

window.addEventListener("dragenter", handleDragEnter);
window.addEventListener("dragover", handleDragOver);
window.addEventListener("dragleave", handleDragLeave);
window.addEventListener("drop", handleDrop);

els.runDetect.addEventListener("click", runDetection);
els.exportCsv.addEventListener("click", exportCsv);
els.exportPng.addEventListener("click", exportPng);
els.exportAll.addEventListener("click", exportAll);
els.zoomOut.addEventListener("click", () => zoomAt(1 / 1.25));
els.zoomIn.addEventListener("click", () => zoomAt(1.25));
for (const button of els.quickToolButtons) {
  button.addEventListener("click", () => setInteractionMode(button.dataset.canvasTool));
}
els.quickFitView.addEventListener("click", resetView);
els.quickDeleteSelected.addEventListener("click", deleteSelectedParticles);
els.quickToolbarPosition.addEventListener("click", () => {
  const open = els.quickToolbarPositionMenu.hidden;
  setToolbarPositionMenu(open);
  if (open) {
    const selected = els.quickToolbarPositionButtons.find(
      (button) => button.dataset.toolbarPosition === state.ui.toolbarPosition,
    );
    selected?.focus();
  }
});
for (const button of els.quickToolbarPositionButtons) {
  button.addEventListener("click", () => {
    setToolbarPosition(button.dataset.toolbarPosition);
    els.quickToolbarPosition.focus();
  });
}
els.quickToolbarPositionMenu.addEventListener("keydown", (event) => {
  if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) return;
  event.preventDefault();
  const currentIndex = els.quickToolbarPositionButtons.indexOf(document.activeElement);
  const direction = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
  const nextIndex = (currentIndex + direction + els.quickToolbarPositionButtons.length)
    % els.quickToolbarPositionButtons.length;
  els.quickToolbarPositionButtons[nextIndex].focus();
});
document.addEventListener("pointerdown", (event) => {
  if (!els.quickToolbarPositionMenu.hidden && !els.quickToolbar.contains(event.target)) {
    setToolbarPositionMenu(false);
  }
});
els.actionManualTrigger.addEventListener("click", openActionManual);
els.actionManualClose.addEventListener("click", closeActionManual);
for (const tab of els.actionManualTabs) {
  tab.addEventListener("click", () => setActionManualTab(tab.dataset.manualTab));
}
els.actionManualDialog.addEventListener("click", (event) => {
  if (event.target === els.actionManualDialog) closeActionManual();
});
els.actionManualDialog.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const currentIndex = els.actionManualTabs.indexOf(document.activeElement);
  if (currentIndex < 0) return;
  event.preventDefault();
  let nextIndex;
  if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = els.actionManualTabs.length - 1;
  else {
    const direction = event.key === "ArrowRight" ? 1 : -1;
    nextIndex = (currentIndex + direction + els.actionManualTabs.length)
      % els.actionManualTabs.length;
  }
  setActionManualTab(els.actionManualTabs[nextIndex].dataset.manualTab, { focus: true });
});
els.languageToggle.addEventListener("click", toggleLanguage);
els.leftToggle.addEventListener("click", () => {
  state.ui.leftCollapsed = !state.ui.leftCollapsed;
  if (compactLayout.matches && !state.ui.leftCollapsed) state.ui.rightOpen = false;
  syncPanels();
});
els.rightToggle.addEventListener("click", () => {
  state.ui.rightOpen = !state.ui.rightOpen;
  if (compactLayout.matches && state.ui.rightOpen) state.ui.leftCollapsed = true;
  syncPanels();
});
els.panelBackdrop.addEventListener("click", closeCompactPanels);
compactLayout.addEventListener("change", handleLayoutChange);
window.addEventListener("pointermove", updatePanelResize);
window.addEventListener("pointerup", finishPanelResize);
window.addEventListener("pointercancel", finishPanelResize);

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
    resizePareto();
  });
});

els.paretoBinCount.value = String(state.ui.paretoBinCount);
els.paretoBinCountValue.textContent = String(state.ui.paretoBinCount);
els.paretoBinCount.addEventListener("input", () => {
  state.ui.paretoBinCount = Number(els.paretoBinCount.value);
  els.paretoBinCountValue.textContent = String(state.ui.paretoBinCount);
  localStorage.setItem("particleLensParetoBins", String(state.ui.paretoBinCount));
  renderPareto();
});
els.showHistogram.addEventListener("change", () => {
  state.ui.showHistogram = els.showHistogram.checked;
  renderPareto();
});
els.showCumulative.addEventListener("change", () => {
  state.ui.showCumulative = els.showCumulative.checked;
  renderPareto();
});
els.showParetoOverlay.addEventListener("change", () => {
  state.ui.showParetoOverlay = els.showParetoOverlay.checked;
  renderPareto();
});
els.hideParetoOverlay.addEventListener("click", () => {
  state.ui.showParetoOverlay = false;
  els.showParetoOverlay.checked = false;
  renderPareto();
});
els.showScaleLegend.addEventListener("change", () => {
  state.ui.showScaleLegend = els.showScaleLegend.checked;
  renderScaleLegend();
});
els.hideScaleLegend.addEventListener("click", () => {
  state.ui.showScaleLegend = false;
  els.showScaleLegend.checked = false;
  renderScaleLegend();
});
els.downloadPareto.addEventListener("click", async () => {
  const Plotly = await loadPlotly();
  Plotly.downloadImage(els.paretoPlot, {
    format: "png",
    filename: `${state.imageName || "particles"}_pareto`,
    width: 1200,
    height: 720,
    scale: 1,
  });
});

els.table.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  selectParticle(Number(row.dataset.id), event.shiftKey);
});

function pointerPair() {
  return Array.from(activePointers.values()).slice(0, 2);
}

function pointerPairMetrics() {
  const [first, second] = pointerPair();
  if (!first || !second) return null;
  return {
    distance: Math.hypot(second.x - first.x, second.y - first.y),
    center: {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    },
  };
}

function beginPinchGesture() {
  const metrics = pointerPairMetrics();
  if (!metrics || metrics.distance < 1) return;
  if (state.drag?.kind === "move") {
    for (const item of state.drag.particles) {
      item.p.x = item.x;
      item.p.y = item.y;
    }
  }
  state.drag = null;
  delete els.canvas.dataset.dragging;
  pinchGesture = metrics;
}

function startPointerDrag(event) {
  const canvasPos = canvasPoint(event);
  const imagePos = canvasToImage(event);
  const isMouse = event.pointerType === "mouse";
  const pointerId = event.pointerId;

  if ((isMouse && event.button === 1) || (state.mode === "pan" && event.button === 0)) {
    state.drag = {
      kind: "pan",
      pointerId,
      startX: canvasPos.x,
      startY: canvasPos.y,
      startPanX: state.view.panX,
      startPanY: state.view.panY,
      didMove: false,
      clearSelectionOnTap: false,
    };
    els.canvas.dataset.dragging = "pan";
    return;
  }

  if ((isMouse && event.button === 2) || state.mode === "draw") {
    state.drag = {
      kind: "diameter",
      pointerId,
      x1: imagePos.x,
      y1: imagePos.y,
      x2: imagePos.x,
      y2: imagePos.y,
    };
    return;
  }

  if (state.mode === "scale") {
    state.drag = {
      kind: "scale",
      pointerId,
      x1: imagePos.x,
      y1: imagePos.y,
      x2: imagePos.x,
      y2: imagePos.y,
    };
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  const touchTolerance = event.pointerType === "touch"
    ? (18 * dpr) / fitTransform().scale
    : 0;
  const particle = nearestParticle(imagePos, touchTolerance);
  if (particle) {
    if (event.shiftKey) {
      selectParticle(particle.id, true);
      return;
    }
    if (!state.selectedIds.has(particle.id)) {
      state.selectedIds.clear();
      state.selectedIds.add(particle.id);
      refresh();
    }
    state.drag = {
      kind: "move",
      pointerId,
      startX: imagePos.x,
      startY: imagePos.y,
      startCanvasX: canvasPos.x,
      startCanvasY: canvasPos.y,
      didMove: false,
      particles: selectedParticles().map((p) => ({ p, x: p.x, y: p.y })),
    };
    return;
  }

  if (isMouse) {
    selectParticle(null, event.shiftKey);
    return;
  }

  state.drag = {
    kind: "pan",
    pointerId,
    startX: canvasPos.x,
    startY: canvasPos.y,
    startPanX: state.view.panX,
    startPanY: state.view.panY,
    didMove: false,
    clearSelectionOnTap: true,
  };
  els.canvas.dataset.dragging = "pan";
}

function updatePointerDrag(event) {
  if (!state.drag || state.drag.pointerId !== event.pointerId) return;
  const canvasPos = canvasPoint(event);

  if (state.drag.kind === "pan") {
    const dx = canvasPos.x - state.drag.startX;
    const dy = canvasPos.y - state.drag.startY;
    state.drag.didMove ||= Math.hypot(dx, dy) > 4 * (window.devicePixelRatio || 1);
    state.view.panX = state.drag.startPanX + dx;
    state.view.panY = state.drag.startPanY + dy;
    draw();
    return;
  }

  const imagePos = canvasToImage(event);
  if (state.drag.kind === "move") {
    const canvasDistance = Math.hypot(
      canvasPos.x - state.drag.startCanvasX,
      canvasPos.y - state.drag.startCanvasY,
    );
    state.drag.didMove ||= canvasDistance > 3 * (window.devicePixelRatio || 1);
    const dx = imagePos.x - state.drag.startX;
    const dy = imagePos.y - state.drag.startY;
    for (const item of state.drag.particles) {
      item.p.x = item.x + dx;
      item.p.y = item.y + dy;
    }
  } else if (state.drag.kind === "diameter" || state.drag.kind === "scale") {
    state.drag.x2 = imagePos.x;
    state.drag.y2 = imagePos.y;
  }
  draw();
}

function finishPointerDrag(cancelled = false) {
  if (!state.drag) return;
  const drag = state.drag;
  state.drag = null;
  delete els.canvas.dataset.dragging;

  if (cancelled) {
    refresh();
    return;
  }

  if (drag.kind === "pan") {
    if (drag.clearSelectionOnTap && !drag.didMove) selectParticle(null);
    else draw();
    return;
  }

  if (drag.kind === "move") {
    refresh();
    return;
  }

  if (drag.kind === "diameter") {
    const circle = circleFromDiameterDrag(drag);
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
  } else if (drag.kind === "scale") {
    const px = Math.hypot(drag.x2 - drag.x1, drag.y2 - drag.y1);
    if (px > 5) {
      state.scaleLine = { ...drag };
      delete state.scaleLine.pointerId;
      setScaleFromLine(state.scaleLine);
    }
    clearScaleMode();
  }
  refresh();
}

els.canvas.addEventListener("pointerdown", (event) => {
  if (!state.image) return;
  event.preventDefault();
  els.canvas.focus({ preventScroll: true });
  try {
    els.canvas.setPointerCapture(event.pointerId);
  } catch {
    // Synthetic pointer events may not have an active platform pointer to capture.
  }
  activePointers.set(event.pointerId, canvasPoint(event));

  if (activePointers.size === 2) {
    beginPinchGesture();
    return;
  }
  if (activePointers.size > 2) return;
  startPointerDrag(event);
});

els.canvas.addEventListener("pointermove", (event) => {
  if (!activePointers.has(event.pointerId)) return;
  event.preventDefault();
  activePointers.set(event.pointerId, canvasPoint(event));

  if (pinchGesture && activePointers.size >= 2) {
    const metrics = pointerPairMetrics();
    if (!metrics || metrics.distance < 1) return;
    const factor = metrics.distance / pinchGesture.distance;
    zoomAt(factor, metrics.center);
    state.view.panX += metrics.center.x - pinchGesture.center.x;
    state.view.panY += metrics.center.y - pinchGesture.center.y;
    pinchGesture = metrics;
    draw();
    return;
  }
  updatePointerDrag(event);
});

function endPointer(event, cancelled = false) {
  const wasPinching = Boolean(pinchGesture);
  activePointers.delete(event.pointerId);
  if (els.canvas.hasPointerCapture?.(event.pointerId)) {
    els.canvas.releasePointerCapture(event.pointerId);
  }

  if (wasPinching) {
    state.drag = null;
    delete els.canvas.dataset.dragging;
    if (activePointers.size < 2) pinchGesture = null;
    return;
  }

  if (state.drag?.pointerId === event.pointerId) finishPointerDrag(cancelled);
}

els.canvas.addEventListener("pointerup", (event) => endPointer(event));
els.canvas.addEventListener("pointercancel", (event) => endPointer(event, true));

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
  if (els.actionManualDialog.open) return;

  if (!event.altKey && !event.ctrlKey && !event.metaKey) {
    const key = event.key.toLowerCase();
    const modeShortcuts = {
      v: "select",
      h: "pan",
      c: "draw",
      r: "scale",
    };
    if (event.key === "Escape") {
      event.preventDefault();
      if (!els.quickToolbarPositionMenu.hidden) {
        setToolbarPositionMenu(false);
        els.quickToolbarPosition.focus();
        return;
      }
      setInteractionMode("select");
      return;
    }
    if (key in modeShortcuts && (state.image || key === "v")) {
      event.preventDefault();
      setInteractionMode(modeShortcuts[key]);
      return;
    }
    if (key === "f" && state.image) {
      event.preventDefault();
      resetView();
      return;
    }
  }

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

els.micronsPerPixel.addEventListener("change", setScaleFromDirectInput);
els.scaleUm.addEventListener("change", () => {
  if (state.scaleLine) setScaleFromLine(state.scaleLine);
  refresh();
});
for (const input of [els.minDiameter, els.maxDiameter]) {
  input.addEventListener("input", renderScaleLegend);
}
els.labelLimit.addEventListener("change", refresh);

new ResizeObserver(resizeCanvas).observe(els.canvas);
new ResizeObserver(resizePareto).observe(els.paretoPlot);
new ResizeObserver(resizePareto).observe(els.paretoOverlayPlot);
window.addEventListener("resize", () => {
  applyPanelWidths();
  clampFloatingOverlays();
});

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function showRuntimeProgress(progress) {
  const labels = {
    download: "runtime.download",
    "initialize-python": "runtime.python",
    "initialize-opencv": "runtime.opencv",
    "initialize-detector": "runtime.detector",
    native: "runtime.native",
    ready: "runtime.ready",
  };
  els.runtimePhase.textContent = t(labels[progress.phase] || "runtime.loading");
  if (progress.phase === "download" && progress.totalBytes > 0) {
    els.runtimeProgress.max = progress.totalBytes;
    els.runtimeProgress.value = Math.min(progress.loadedBytes, progress.totalBytes);
    els.runtimeBytes.textContent =
      `${formatBytes(progress.loadedBytes)} / ${formatBytes(progress.totalBytes)}`;
  } else {
    els.runtimeProgress.removeAttribute("value");
    els.runtimeBytes.textContent = "";
  }
}

async function initializeRuntime() {
  els.runtimeLoader.classList.remove("hidden", "failed");
  els.runtimeRetry.hidden = true;
  els.runtimePhase.textContent = t("runtime.loading");
  els.runtimeProgress.removeAttribute("value");
  els.runtimeBytes.textContent = "";
  els.runDetect.disabled = true;
  state.detector?.close();
  try {
    state.detector = await createDetector(showRuntimeProgress);
    showRuntimeProgress({ phase: "ready" });
    els.runtimeLoader.classList.add("hidden");
    els.runDetect.disabled = !state.image || !state.micronsPerPx;
    await cacheApplicationShell();
    els.runtimeLoader.dataset.offlineReady = "true";
  } catch (error) {
    state.detector = null;
    els.runtimeLoader.classList.add("failed");
    delete els.runtimeLoader.dataset.offlineReady;
    els.runtimePhase.textContent = `${t("runtime.failed")}: ${error.message}`;
    els.runtimeProgress.removeAttribute("value");
    els.runtimeBytes.textContent = "";
    els.runtimeRetry.hidden = false;
  }
}

els.runtimeRetry.addEventListener("click", async () => {
  await clearRuntimeCache();
  await initializeRuntime();
});

async function bootstrap() {
  createIcons({
    icons: {
      BarChart3,
      CircleHelp,
      CirclePlus,
      Download,
      FileSpreadsheet,
      Hand,
      ImageDown,
      ImagePlus,
      Maximize2,
      MousePointer2,
      Move,
      PanelBottom,
      PanelLeft,
      PanelRight,
      PanelTop,
      Ruler,
      ScanLine,
      ShieldCheck,
      Table2,
      Trash2,
      TriangleAlert,
      X,
      ZoomIn,
      ZoomOut,
    },
  });
  for (const overlay of els.floatingOverlays) makeFloatingOverlayDraggable(overlay);
  makePanelResizable(els.leftPanelResizeHandle);
  makePanelResizable(els.rightPanelResizeHandle);
  setToolbarPosition(state.ui.toolbarPosition, false);
  syncPanels();
  setInteractionMode("select");
  applyTranslations();
  resizeCanvas();
  resizePareto();
  updateZoomReadout();
  removeLegacyImageQuery();
  await initializeRuntime();
}

bootstrap();
