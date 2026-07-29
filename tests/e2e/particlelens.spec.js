import { expect, test } from "@playwright/test";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const MIME_TYPES = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".mjs": "text/javascript",
  ".png": "image/png",
  ".py": "text/x-python",
  ".wasm": "application/wasm",
  ".whl": "application/octet-stream",
};

async function startStaticServer() {
  const root = path.resolve("dist/web");
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      const target = path.resolve(root, relative);
      if (!target.startsWith(`${root}${path.sep}`) && target !== root) {
        response.writeHead(403).end();
        return;
      }
      if (!(await stat(target)).isFile()) {
        response.writeHead(404).end();
        return;
      }
      const body = await readFile(target);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Length": body.byteLength,
        "Content-Type": MIME_TYPES[path.extname(target)] || "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let closed = false;
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    async close() {
      if (closed) return;
      closed = true;
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function syntheticBitmap() {
  const width = 800;
  const height = 600;
  const rowBytes = width * 3;
  const pixelBytes = rowBytes * height;
  const buffer = Buffer.alloc(54 + pixelBytes);
  buffer.write("BM", 0, "ascii");
  buffer.writeUInt32LE(buffer.length, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(pixelBytes, 34);

  const circles = [
    { x: 150, y: 150, r: 30 },
    { x: 350, y: 220, r: 48 },
    { x: 590, y: 310, r: 40 },
  ];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = 232;
      for (const circle of circles) {
        if ((x - circle.x) ** 2 + (y - circle.y) ** 2 <= circle.r ** 2) {
          value = 100;
        }
      }
      if (x >= 700 && x <= 779 && y >= 548 && y <= 552) value = 0;
      const bmpY = height - 1 - y;
      const offset = 54 + bmpY * rowBytes + x * 3;
      buffer[offset] = value;
      buffer[offset + 1] = value;
      buffer[offset + 2] = value;
    }
  }
  return buffer;
}

async function openReadyApp(page, url = "./") {
  await page.goto(url);
  await page.locator("#runtimeLoader.hidden, #runtimeLoader.failed").waitFor({
    state: "attached",
    timeout: 180_000,
  });
  if (await page.locator("#runtimeLoader").evaluate((element) => element.classList.contains("failed"))) {
    throw new Error(await page.locator("#runtimePhase").textContent());
  }
  await expect(page.locator("#imageMenuTrigger")).toBeEnabled();
}

async function uploadAndDetect(page) {
  await page.locator("#imageInput").setInputFiles({
    name: "synthetic.bmp",
    mimeType: "image/bmp",
    buffer: syntheticBitmap(),
  });
  await expect(page.locator("#imageName")).toHaveText("synthetic.bmp");
  await expect(page.locator("#micronsPerPixel")).toHaveValue("0.625");
  await expect(page.locator("#micronsPerPixelInfo")).toBeHidden();
  await expect(page.locator("#runDetect")).toBeEnabled();

  await page.locator("#contrastMode").selectOption("none");
  await page.locator("#sensitivity").fill("0.7");
  await page.locator("#minDiameter").fill("15");
  await page.locator("#maxDiameter").fill("80");
  await page.locator("#runDetect").click();
  await expect(page.locator("#statusBadge")).toHaveText(/已识别|Detected/, {
    timeout: 60_000,
  });
}

async function summarizeExportedPng(page) {
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#exportPng").click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("Exported PNG was not available for inspection.");
  const base64 = (await readFile(downloadPath)).toString("base64");

  return page.evaluate(async (encoded) => {
    const response = await fetch(`data:image/png;base64,${encoded}`);
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const countColor = (red, green, blue) => {
      let count = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index] === red && pixels[index + 1] === green && pixels[index + 2] === blue) {
          count += 1;
        }
      }
      return count;
    };
    const legendPixelOffset = (20 * canvas.width + 20) * 4;
    return {
      width: canvas.width,
      height: canvas.height,
      selectionBlue: countColor(90, 167, 255),
      scaleBlue: countColor(47, 120, 255),
      legendGreen: countColor(116, 198, 157),
      paddingMagenta: countColor(217, 70, 239),
      legendPixel: Array.from(pixels.slice(legendPixelOffset, legendPixelOffset + 3)),
    };
  }, base64);
}

test("falls back to the browser detector when native configuration is stale", async ({ page }) => {
  await page.route("**/runtime-config.json*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ detector: "native" }),
    }),
  );
  await page.route("**/api/health", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>ParticleLens</title>",
    }),
  );

  await openReadyApp(page);
  await expect(page.locator("#runtimeLoader")).toHaveClass(/hidden/);
  await expect(page.locator("#runDetect")).toBeDisabled();
  await expect(page.locator("#micronsPerPixelLabel")).toHaveCSS("color", "rgb(230, 213, 74)");
  await expect(page.locator("#micronsPerPixelInfo")).toBeVisible();
  await expect(page.locator("#micronsPerPixelInfoText")).toContainText(
    /Open an image|请先打开图片/,
  );
});

test("keeps information tooltips inside narrow viewports", async ({ page }) => {
  for (const viewport of [
    { width: 320, height: 640 },
    { width: 540, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await openReadyApp(page);
    await page.locator("#leftToggle").click();

    for (const trigger of await page.locator(".info-point:not([hidden]) .info-point-trigger").all()) {
      await trigger.click();
      const tooltipId = await trigger.getAttribute("aria-describedby");
      const bounds = await page.locator(`#${tooltipId}`).evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        };
      });
      expect(bounds.left).toBeGreaterThanOrEqual(7);
      expect(bounds.top).toBeGreaterThanOrEqual(7);
      expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth - 7);
      expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight - 7);
    }
  }
});

test("aligns the calibration inputs when the length-per-pixel label wraps", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReadyApp(page);

  const scaleInput = await page.locator("#scaleUm").boundingBox();
  const directScaleInput = await page.locator("#micronsPerPixel").boundingBox();

  expect(scaleInput).not.toBeNull();
  expect(directScaleInput).not.toBeNull();
  expect(Math.abs(scaleInput.y - directScaleInput.y)).toBeLessThan(1);
});

test("removes legacy local-image parameters without requesting local files", async ({ page }) => {
  const dialogs = [];
  const localImageRequests = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/local-image") {
      localImageRequests.push(request.url());
    }
  });

  await openReadyApp(
    page,
    "./?image=D%3A%5Cmicroscope%5Csample.jpg",
  );

  expect(new URL(page.url()).searchParams.has("image")).toBe(false);
  expect(localImageRequests).toEqual([]);
  expect(dialogs).toEqual([]);
  await expect(page.locator("#imageName")).toHaveText(/No image selected|未选择图片/);
});

test("runs detection locally and exports corrected results", async ({ page }) => {
  const requestsAfterUpload = [];
  await openReadyApp(page);
  page.on("request", (request) => requestsAfterUpload.push(request));
  await uploadAndDetect(page);

  const rows = page.locator("#particleTable tr");
  await expect(rows).toHaveCount(3);
  const centers = await rows.evaluateAll((items) =>
    items.map((row) => {
      const cells = [...row.querySelectorAll("td")];
      return {
        x: Number(cells[2].textContent),
        y: Number(cells[3].textContent),
        radius: Number(row.dataset.radiusPx),
      };
    }),
  );
  const expectedCenters = [
    { x: 150, y: 150, radius: 30 },
    { x: 350, y: 220, radius: 48 },
    { x: 590, y: 310, radius: 40 },
  ];
  for (const expectedCenter of expectedCenters) {
    const match = centers.find(
      (center) =>
        Math.abs(center.x - expectedCenter.x) <= 2 &&
        Math.abs(center.y - expectedCenter.y) <= 2 &&
        Math.abs(center.radius - expectedCenter.radius) <= 2,
    );
    expect(match).toBeTruthy();
  }
  const micronsPerPx = Number(
    await page.locator("#scaleReadout").getAttribute("data-microns-per-px"),
  );
  expect(Math.abs(micronsPerPx - 0.625)).toBeLessThanOrEqual(1e-9);

  await page.locator("#rightToggle").click();
  await page.locator("[data-right-tab='export']").click();
  const csvDownload = page.waitForEvent("download");
  await page.locator("#exportCsv").click();
  expect((await csvDownload).suggestedFilename()).toMatch(/_corrected\.csv$/);

  const pngDownload = page.waitForEvent("download");
  await page.locator("#exportPng").click();
  expect((await pngDownload).suggestedFilename()).toMatch(/_annotated\.png$/);

  expect(requestsAfterUpload.filter((request) => request.method() !== "GET")).toEqual([]);
});

test("exports optional annotations and outer margins only when requested", async ({ page }) => {
  await openReadyApp(page);
  await uploadAndDetect(page);

  const canvas = page.locator("#imageCanvas");
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  await page.locator("#quickScaleTool").click();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.8, { steps: 5 });
  await page.mouse.up();
  await page.locator("#rightToggle").click();
  await page.locator("#particleTable tr").first().click();
  await page.locator("[data-right-tab='export']").click();
  await expect(page.locator("#exportSelection")).not.toBeChecked();
  await expect(page.locator("#exportScale")).not.toBeChecked();
  await expect(page.locator("#exportLegend")).not.toBeChecked();
  await expect(page.locator("#exportPaddingColor")).toHaveValue("#ffffff");
  await expect(page.locator("#exportPaddingWidth")).toHaveValue("0");
  await expect(page.locator("#exportScale")).toBeEnabled();
  await expect(page.locator("#exportLegend")).toBeEnabled();

  const defaultExport = await summarizeExportedPng(page);
  expect(defaultExport.width).toBe(800);
  expect(defaultExport.height).toBe(600);
  expect(defaultExport.selectionBlue).toBe(0);
  expect(defaultExport.scaleBlue).toBe(0);
  expect(defaultExport.legendGreen).toBe(0);
  expect(defaultExport.paddingMagenta).toBe(0);

  await page.locator("#exportSelection").check();
  const selectionExport = await summarizeExportedPng(page);
  expect(selectionExport.selectionBlue).toBeGreaterThan(0);
  expect(selectionExport.scaleBlue).toBe(0);
  expect(selectionExport.legendGreen).toBe(0);
  expect(selectionExport.legendPixel).toEqual(defaultExport.legendPixel);

  await page.locator("#exportSelection").uncheck();
  await page.locator("#exportScale").check();
  const scaleExport = await summarizeExportedPng(page);
  expect(scaleExport.selectionBlue).toBe(0);
  expect(scaleExport.scaleBlue).toBeGreaterThan(0);
  expect(scaleExport.legendGreen).toBe(0);
  expect(scaleExport.legendPixel).toEqual(defaultExport.legendPixel);

  await page.locator("#exportScale").uncheck();
  await page.locator("#exportLegend").check();
  const legendExport = await summarizeExportedPng(page);
  expect(legendExport.scaleBlue).toBe(0);
  expect(legendExport.legendGreen).toBeGreaterThan(0);
  expect(legendExport.legendPixel).not.toEqual(defaultExport.legendPixel);

  await page.locator("#exportLegend").uncheck();
  await page.locator("#exportPaddingColor").fill("#d946ef");
  await page.locator("#exportPaddingWidth").fill("8");
  const paddingExport = await summarizeExportedPng(page);
  expect(paddingExport.width).toBe(816);
  expect(paddingExport.height).toBe(616);
  expect(paddingExport.selectionBlue).toBe(0);
  expect(paddingExport.scaleBlue).toBe(0);
  expect(paddingExport.legendGreen).toBe(0);
  expect(paddingExport.paddingMagenta).toBeGreaterThan(22_000);
});

test("opens images from the canvas and warns before replacing current work", async ({ page }) => {
  await openReadyApp(page);

  const firstChooser = page.waitForEvent("filechooser");
  await page.locator("#emptyState").click();
  await (await firstChooser).setFiles({
    name: "first.bmp",
    mimeType: "image/bmp",
    buffer: syntheticBitmap(),
  });
  await expect(page.locator("#imageName")).toHaveText("first.bmp");
  await expect(page.locator("#imageAction")).toHaveText("Upload a new image");

  await page.locator("#imageMenuTrigger").click();
  await expect(page.locator("#replaceImageDialog")).toBeVisible();
  await expect(page.locator("#replaceImageDialog")).toContainText("clear all detected particles");
  await page.locator("#replaceImageDialog [value='cancel']").click();
  await expect(page.locator("#replaceImageDialog")).not.toBeVisible();

  await page.locator("#imageMenuTrigger").click();
  const replacementChooser = page.waitForEvent("filechooser");
  await page.locator("#replaceContinue").click();
  await (await replacementChooser).setFiles({
    name: "replacement.bmp",
    mimeType: "image/bmp",
    buffer: syntheticBitmap(),
  });
  await expect(page.locator("#imageName")).toHaveText("replacement.bmp");
});

test("renders a configurable Pareto diagram and live overlay", async ({ page }) => {
  await openReadyApp(page);
  await uploadAndDetect(page);

  await expect(page.locator("#paretoOverlay")).toBeVisible();
  await expect(page.locator("#scaleLegendOverlay")).toBeVisible();
  await expect(page.locator("#scaleLegendDescription")).toContainText(/80\.0 px/);
  const scaleLengthBeforeZoom = Number(
    await page.locator("#scaleLegendOverlay").getAttribute("data-scale-screen-px"),
  );
  const legendWidthBeforeZoom = (await page.locator("#scaleLegendOverlay").boundingBox()).width;
  await page.locator("#zoomIn").click();
  await expect.poll(
    async () => Number(
      await page.locator("#scaleLegendOverlay").getAttribute("data-scale-screen-px"),
    ),
  ).toBeCloseTo(scaleLengthBeforeZoom * 1.25, 2);
  for (let index = 0; index < 7; index += 1) await page.locator("#zoomIn").click();
  await expect(page.locator("#scaleLegendNotice")).toBeVisible();
  await expect(page.locator("#scaleLegendOverlay")).toHaveAttribute("data-overflow", "true");
  expect((await page.locator("#scaleLegendOverlay").boundingBox()).width)
    .toBeCloseTo(legendWidthBeforeZoom, 1);
  await page.locator("#quickFitView").click();
  await expect(page.locator("#scaleLegendNotice")).toBeHidden();

  const legendBefore = await page.locator("#scaleLegendOverlay").boundingBox();
  const legendHandle = await page.locator("#scaleLegendOverlay .overlay-drag-handle").boundingBox();
  expect(legendBefore).toBeTruthy();
  expect(legendHandle).toBeTruthy();
  await page.mouse.move(legendHandle.x + 28, legendHandle.y + 14);
  await page.mouse.down();
  await page.mouse.move(legendHandle.x + 78, legendHandle.y + 74, { steps: 5 });
  await page.mouse.up();
  const legendAfter = await page.locator("#scaleLegendOverlay").boundingBox();
  expect(legendAfter.x).not.toBe(legendBefore.x);
  expect(legendAfter.y).not.toBe(legendBefore.y);

  await page.locator("#hideScaleLegend").click();
  await expect(page.locator("#scaleLegendOverlay")).toBeHidden();
  await page.locator("#showScaleLegend").check();
  await expect(page.locator("#scaleLegendOverlay")).toBeVisible();

  const paretoBefore = await page.locator("#paretoOverlay").boundingBox();
  const paretoHandle = await page.locator("#paretoOverlay .overlay-drag-handle").boundingBox();
  await page.mouse.move(paretoHandle.x + 35, paretoHandle.y + 14);
  await page.mouse.down();
  await page.mouse.move(paretoHandle.x - 35, paretoHandle.y + 65, { steps: 5 });
  await page.mouse.up();
  const paretoAfter = await page.locator("#paretoOverlay").boundingBox();
  expect(paretoAfter.x).not.toBe(paretoBefore.x);
  expect(paretoAfter.y).not.toBe(paretoBefore.y);
  expect(await page.evaluate(() => localStorage.getItem("particleLensOverlayPositions")))
    .toContain("scale-legend");

  await page.locator("#rightToggle").click();
  await page.locator("[data-right-tab='pareto']").click();
  await expect(page.locator("#paretoPlot .plot-container")).toBeVisible();

  await page.locator("#paretoBinCount").fill("14");
  await expect(page.locator("#paretoBinCountValue")).toHaveText("14");
  expect(await page.evaluate(() => localStorage.getItem("particleLensParetoBins"))).toBe("14");

  await page.locator("#showHistogram").uncheck();
  await expect.poll(
    async () => page.locator("#paretoPlot").evaluate((element) => element.data?.[0]?.visible),
  ).toBe(false);
  await page.locator("#showHistogram").check();

  const chartDownload = page.waitForEvent("download");
  await page.locator("#downloadPareto").click();
  expect((await chartDownload).suggestedFilename()).toMatch(/_pareto\.png$/);
});

test("supports manual correction, scale redraw, zoom, pan, move, and delete", async ({ page }) => {
  await openReadyApp(page);
  await uploadAndDetect(page);

  const rows = page.locator("#particleTable tr");
  await expect(rows).toHaveCount(3);
  const canvas = page.locator("#imageCanvas");
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();

  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.7);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(box.x + box.width * 0.48, box.y + box.height * 0.7, { steps: 5 });
  await page.mouse.up({ button: "right" });
  await expect(rows).toHaveCount(4);
  await expect(rows.last().locator("td").nth(1)).toHaveText(/手绘|Manual/);

  const manualX = Number(await rows.last().locator("td").nth(2).textContent());
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => Number(await rows.last().locator("td").nth(2).textContent())).toBe(
    manualX + 1,
  );

  const initialScale = Number(
    await page.locator("#scaleReadout").getAttribute("data-microns-per-px"),
  );
  await page.locator("#quickScaleTool").click();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.8);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8, { steps: 5 });
  await page.mouse.up({ button: "left" });
  const correctedScale = Number(
    await page.locator("#scaleReadout").getAttribute("data-microns-per-px"),
  );
  expect(correctedScale).not.toBe(initialScale);
  await expect(page.locator("#scaleReadout")).toContainText(/Scale bar|比例尺/);
  await expect(page.locator("#micronsPerPixel")).toBeDisabled();
  await expect(page.locator("#micronsPerPixel")).toHaveValue("0.625");
  await expect(page.locator("#micronsPerPixelLabel")).toHaveCSS("color", "rgb(230, 213, 74)");
  await expect(page.locator("#micronsPerPixelLabel")).toContainText(
    /remove the drawn scale bar|移除手绘标尺/,
  );
  await expect(page.locator("#micronsPerPixelInfo")).toBeVisible();
  await expect(page.locator("#micronsPerPixelInfoText")).toContainText(
    /drawn scale bar currently controls|当前比例由手绘标尺计算/,
  );

  await page.locator("#removeScaleLine").click();
  await expect(page.locator("#micronsPerPixel")).toBeEnabled();
  await expect(page.locator("#scaleReadout")).toContainText(/Direct input|直接输入/);
  await page.locator("#micronsPerPixel").fill("0.5");
  await page.locator("#micronsPerPixel").press("Tab");
  await expect(page.locator("#scaleReadout")).toContainText(/Direct input|直接输入/);
  await expect.poll(
    async () => Number(await page.locator("#scaleReadout").getAttribute("data-microns-per-px")),
  ).toBe(0.5);

  await page.locator("#quickDeleteSelected").click();
  await expect(rows).toHaveCount(3);

  const beforeZoom = await canvas.screenshot();
  await page.locator("#zoomIn").click();
  await expect(page.locator("#zoomReadout")).not.toHaveText("100%");
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.55, { steps: 5 });
  await page.mouse.up({ button: "middle" });
  const afterPan = await canvas.screenshot();
  expect(Buffer.compare(beforeZoom, afterPan)).not.toBe(0);
});

test("presents sidebars as panel toggles and analysis views as tabs", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openReadyApp(page);

  const leftToggle = page.locator("#leftToggle");
  const rightToggle = page.locator("#rightToggle");
  await expect(leftToggle).toHaveAttribute("aria-controls", "leftPanel");
  await expect(leftToggle).toHaveAttribute("aria-expanded", "true");
  await expect(leftToggle.locator(".lucide-scan-line")).toBeVisible();
  const activeIndicator = await leftToggle.evaluate(
    (element) => getComputedStyle(element, "::after").backgroundColor,
  );

  await leftToggle.click();
  await expect(leftToggle).toHaveAttribute("aria-expanded", "false");
  await expect(leftToggle.locator(".lucide-scan-line")).toBeVisible();
  await expect.poll(
    async () => leftToggle.evaluate(
      (element) => getComputedStyle(element, "::after").backgroundColor,
    ),
  ).not.toBe(activeIndicator);

  await expect(rightToggle).toHaveAttribute("aria-controls", "rightPanel");
  await expect(rightToggle).toHaveAttribute("aria-expanded", "false");
  await expect(rightToggle.locator(".lucide-bar-chart-3")).toBeVisible();
  await rightToggle.click();
  await expect(rightToggle).toHaveAttribute("aria-expanded", "true");
  await expect(rightToggle.locator(".lucide-bar-chart-3")).toBeVisible();

  const rightTabs = page.getByRole("tab");
  await expect(rightTabs).toHaveCount(3);
  const tableTab = page.locator("#rightTabTable");
  const paretoTab = page.locator("#rightTabPareto");
  await expect(tableTab.locator(".tab-label")).toBeVisible();
  await expect(paretoTab.locator(".tab-label")).toBeVisible();
  await expect(tableTab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#rightPanelTable")).toBeVisible();
  await expect(page.locator("#rightPanelPareto")).toBeHidden();

  await tableTab.press("ArrowRight");
  await expect(paretoTab).toBeFocused();
  await expect(paretoTab).toHaveAttribute("aria-selected", "true");
  await expect(tableTab).toHaveAttribute("aria-selected", "false");
  await expect(page.locator("#rightPanelTable")).toBeHidden();
  await expect(page.locator("#rightPanelPareto")).toBeVisible();

  const selectedBorder = await paretoTab.evaluate(
    (element) => getComputedStyle(element).borderBottomColor,
  );
  const inactiveBorder = await tableTab.evaluate(
    (element) => getComputedStyle(element).borderBottomColor,
  );
  expect(selectedBorder).not.toBe(inactiveBorder);

  await page.locator("#actionManualTrigger").click();
  await expect(page.locator("#actionManualDialog")).toBeVisible();
  const mouseTab = page.locator("#mouseManualTab");
  const touchTab = page.locator("#touchManualTab");
  await expect(mouseTab).toHaveClass(/navigation-tab/);
  await expect(mouseTab).toHaveAttribute("aria-selected", "true");
  await expect(
    page.locator("[data-i18n='manual.mouse.selectInput']"),
  ).toBeVisible();
  const manualSelectedBorder = await mouseTab.evaluate(
    (element) => getComputedStyle(element).borderBottomColor,
  );
  const manualInactiveBorder = await touchTab.evaluate(
    (element) => getComputedStyle(element).borderBottomColor,
  );
  expect(manualSelectedBorder).not.toBe(manualInactiveBorder);
  await mouseTab.press("ArrowRight");
  await expect(touchTab).toBeFocused();
  await expect(touchTab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#touchManualPanel")).toBeVisible();
  await expect(
    page.locator("[data-i18n='manual.touch.selectInput']"),
  ).toBeVisible();
});

test("keeps the analysis entry visible across transitional navbar widths", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 768 });
  await openReadyApp(page);

  await expect(page.locator(".topbar #zoomIn")).toHaveCount(0);
  await expect(page.locator(".quick-toolbar #zoomOut")).toHaveCount(1);
  await expect(page.locator(".quick-toolbar #zoomIn")).toHaveCount(1);
  await expect(page.locator(".quick-toolbar #quickFitView")).toHaveCount(1);

  for (const width of [1280, 1180, 1024, 900, 821]) {
    await page.setViewportSize({ width, height: 768 });
    await expect(page.locator("#rightToggle")).toBeVisible();
    const rightEdge = await page.locator("#rightToggle").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.right;
    });
    expect(rightEdge).toBeLessThanOrEqual(width);
    const topbarOverflow = await page.locator(".topbar").evaluate(
      (element) => element.scrollWidth - element.clientWidth,
    );
    expect(topbarOverflow).toBeLessThanOrEqual(1);
  }
});

test("resizes desktop sidebars from their inner edges and restores their widths", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openReadyApp(page);

  const leftPanel = page.locator("#leftPanel");
  const leftHandle = page.locator("#leftPanelResizeHandle");
  const detectionGrid = page.locator("#leftPanel .grid-two");
  const gridColumnCount = () => detectionGrid.evaluate(
    (element) => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length,
  );
  const leftBefore = await leftPanel.boundingBox();
  const leftHandleBox = await leftHandle.boundingBox();
  expect(leftBefore).toBeTruthy();
  expect(leftHandleBox).toBeTruthy();
  await expect.poll(gridColumnCount).toBe(2);
  await page.mouse.move(leftHandleBox.x + leftHandleBox.width / 2, leftHandleBox.y + 120);
  await page.mouse.down();
  await page.mouse.move(leftHandleBox.x + leftHandleBox.width / 2 - 50, leftHandleBox.y + 120, {
    steps: 5,
  });
  await page.mouse.up();
  await expect.poll(async () => (await leftPanel.boundingBox()).width)
    .toBeCloseTo(leftBefore.width - 50, 0);
  await expect.poll(gridColumnCount).toBe(1);

  const narrowHandleBox = await leftHandle.boundingBox();
  expect(narrowHandleBox).toBeTruthy();
  await page.mouse.move(narrowHandleBox.x + narrowHandleBox.width / 2, narrowHandleBox.y + 120);
  await page.mouse.down();
  await page.mouse.move(narrowHandleBox.x + narrowHandleBox.width / 2 + 140, narrowHandleBox.y + 120, {
    steps: 5,
  });
  await page.mouse.up();
  await expect.poll(async () => (await leftPanel.boundingBox()).width)
    .toBeCloseTo(leftBefore.width + 90, 0);
  await expect.poll(gridColumnCount).toBe(2);

  await page.locator("#rightToggle").click();
  const rightPanel = page.locator("#rightPanel");
  const rightHandle = page.locator("#rightPanelResizeHandle");
  await expect.poll(async () => {
    const box = await rightPanel.boundingBox();
    return box ? Math.round(box.x + box.width) : null;
  }).toBe(1280);
  const rightBefore = await rightPanel.boundingBox();
  const rightHandleBox = await rightHandle.boundingBox();
  expect(rightBefore).toBeTruthy();
  expect(rightHandleBox).toBeTruthy();
  await page.mouse.move(rightHandleBox.x + rightHandleBox.width / 2, rightHandleBox.y + 120);
  await page.mouse.down();
  await page.mouse.move(rightHandleBox.x + rightHandleBox.width / 2 - 80, rightHandleBox.y + 120, {
    steps: 5,
  });
  await page.mouse.up();
  await expect.poll(async () => (await rightPanel.boundingBox()).width)
    .toBeCloseTo(rightBefore.width + 80, 0);

  const savedWidths = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("particleLensPanelWidths")),
  );
  expect(savedWidths.left).toBeCloseTo(leftBefore.width + 90, 0);
  expect(savedWidths.right).toBeCloseTo(rightBefore.width + 80, 0);

  await page.reload();
  await openReadyApp(page);
  await expect.poll(async () => (await leftPanel.boundingBox()).width)
    .toBeCloseTo(savedWidths.left, 0);
  await page.locator("#rightToggle").click();
  await expect.poll(async () => (await rightPanel.boundingBox()).width)
    .toBeCloseTo(savedWidths.right, 0);
});

test("adapts the workspace for mobile and supports touch canvas gestures", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openReadyApp(page);

  await expect(page.locator("#leftPanel")).toHaveClass(/collapsed/);
  await expect(page.locator("#leftPanelResizeHandle")).toBeHidden();
  await expect(page.locator("#rightPanelResizeHandle")).toBeHidden();
  await expect(page.locator("#leftToggle")).toHaveAttribute("aria-expanded", "false");
  const topbarBox = await page.locator(".topbar").boundingBox();
  expect(topbarBox?.height).toBeGreaterThanOrEqual(100);

  const quickToolbar = page.locator(".quick-toolbar");
  const initialToolbarBox = await quickToolbar.boundingBox();
  expect(initialToolbarBox?.height).toBeGreaterThan(initialToolbarBox?.width);
  for (const position of ["right", "top", "left", "bottom"]) {
    await page.locator("#quickToolbarPosition").click();
    await page.locator(`[data-toolbar-position='${position}']`).click();
    await expect(page.locator(".app-shell")).toHaveAttribute("data-toolbar-position", position);
  }
  const bottomToolbarBox = await quickToolbar.boundingBox();
  expect(bottomToolbarBox?.width).toBeGreaterThan(bottomToolbarBox?.height);
  expect(
    await page.evaluate(() => localStorage.getItem("particleLensToolbarPosition")),
  ).toBe("bottom");
  await page.setViewportSize({ width: 320, height: 844 });
  await page.waitForTimeout(250);
  const narrowToolbarBox = await quickToolbar.boundingBox();
  expect(narrowToolbarBox?.x).toBeGreaterThanOrEqual(0);
  expect((narrowToolbarBox?.x || 0) + (narrowToolbarBox?.width || 0)).toBeLessThanOrEqual(320);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.locator("#leftToggle").click();
  await expect(page.locator("#leftToggle")).toHaveAttribute("aria-expanded", "true");
  await expect.poll(
    async () => page.locator("#leftPanel").evaluate(
      (element) => getComputedStyle(element).transform,
    ),
  ).toBe("none");
  await expect.poll(
    async () => (await page.locator("#leftPanel").boundingBox()).x,
  ).toBeCloseTo(0, 0);
  const portraitPanelBox = await page.locator("#leftPanel").boundingBox();
  expect(portraitPanelBox.x).toBeCloseTo(0, 0);
  expect(portraitPanelBox.y).toBeCloseTo(topbarBox.height, 0);
  expect(portraitPanelBox.width).toBeCloseTo(390, 0);
  expect(portraitPanelBox.height).toBeCloseTo(844 - topbarBox.height, 0);
  const portraitGridColumnCount = await page.locator("#leftPanel .grid-two").evaluate(
    (element) => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length,
  );
  expect(portraitGridColumnCount).toBe(2);
  await expect(page.locator(".workspace")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#rightToggle")).toHaveAttribute("aria-expanded", "false");

  await page.locator("#rightToggle").click();
  await expect(page.locator("#rightToggle")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#leftToggle")).toHaveAttribute("aria-expanded", "false");
  const rightPageBox = await page.locator("#rightPanel").boundingBox();
  expect(rightPageBox.x).toBeCloseTo(0, 0);
  expect(rightPageBox.width).toBeCloseTo(390, 0);

  await page.locator("#leftToggle").click();
  await expect(page.locator("#leftToggle")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#rightToggle")).toHaveAttribute("aria-expanded", "false");
  await page.locator("#imageInput").setInputFiles({
    name: "synthetic.bmp",
    mimeType: "image/bmp",
    buffer: syntheticBitmap(),
  });
  await expect(page.locator("#imageName")).toHaveText("synthetic.bmp");
  await expect(page.locator("#leftToggle")).toHaveAttribute("aria-expanded", "false");

  await page.locator("#leftToggle").click();
  await page.locator("#contrastMode").selectOption("none");
  await page.locator("#sensitivity").fill("0.7");
  await page.locator("#minDiameter").fill("15");
  await page.locator("#maxDiameter").fill("80");
  await expect(page.locator("#micronsPerPixel")).toHaveValue("0.625");
  await expect(page.locator("#runDetect")).toBeEnabled();
  await page.locator("#runDetect").click();
  await expect(page.locator("#statusBadge")).toHaveText(/已识别|Detected/, {
    timeout: 60_000,
  });

  await page.locator("#leftToggle").click();
  const canvas = page.locator("#imageCanvas");
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  const point = (x, y) => ({ clientX: box.x + x, clientY: box.y + y });
  const pointer = (pointerId, x, y, isPrimary = false) => ({
    bubbles: true,
    cancelable: true,
    pointerId,
    pointerType: "touch",
    isPrimary,
    button: 0,
    buttons: 1,
    ...point(x, y),
  });

  const zoomBefore = await page.locator("#zoomReadout").textContent();
  await canvas.dispatchEvent("pointerdown", pointer(1, 150, 380, true));
  await canvas.dispatchEvent("pointerdown", pointer(2, 240, 380));
  await canvas.dispatchEvent("pointermove", pointer(2, 300, 380));
  await canvas.dispatchEvent("pointerup", { ...pointer(2, 300, 380), buttons: 0 });
  await canvas.dispatchEvent("pointerup", { ...pointer(1, 150, 380, true), buttons: 0 });
  await expect(page.locator("#zoomReadout")).not.toHaveText(zoomBefore);

  await page.locator("#quickPanTool").click();
  await expect(page.locator("#quickPanTool")).toHaveAttribute("aria-pressed", "true");
  const beforePan = await canvas.screenshot();
  await canvas.dispatchEvent("pointerdown", pointer(3, 60, 650, true));
  await canvas.dispatchEvent("pointermove", pointer(3, 115, 610, true));
  await canvas.dispatchEvent("pointerup", { ...pointer(3, 115, 610, true), buttons: 0 });
  const afterPan = await canvas.screenshot();
  expect(Buffer.compare(beforePan, afterPan)).not.toBe(0);

  await page.locator("#quickFitView").click();
  await expect(page.locator("#zoomReadout")).toHaveText("100%");
  await page.locator("#quickDrawTool").click();
  await expect(page.locator("#quickDrawTool")).toHaveAttribute("aria-pressed", "true");
  const rows = page.locator("#particleTable tr");
  await canvas.dispatchEvent("pointerdown", pointer(4, 125, 560, true));
  await canvas.dispatchEvent("pointermove", pointer(4, 190, 560, true));
  await canvas.dispatchEvent("pointerup", { ...pointer(4, 190, 560, true), buttons: 0 });
  await expect(rows).toHaveCount(4);
  await expect(page.locator("#quickDeleteSelected")).toBeEnabled();
  await page.locator("#quickDeleteSelected").click();
  await expect(rows).toHaveCount(3);
});

test("switches language and restores the app shell offline", async ({ page }) => {
  const origin = await startStaticServer();
  try {
    await openReadyApp(page, origin.url);
    await expect(page.locator("#runDetect")).toHaveText("Run Detection");
    await page.locator("#languageToggle").click();
    await expect(page.locator("#runDetect")).toHaveText("自动识别");

    await page.locator("#runtimeLoader[data-offline-ready='true']").waitFor({
      state: "attached",
      timeout: 30_000,
    });
    const cacheState = await page.evaluate(async () => {
      const shell = await caches.open("particlelens-shell-v0.2.5");
      const runtime = await caches.open("particlelens-runtime-v0.2.0");
      const moduleUrl = document.querySelector("script[type='module']").src;
      return {
        shellModule: Boolean(await shell.match(moduleUrl)),
        shellDocument: Boolean(await shell.match(window.location.href)),
        runtimeEntries: (await runtime.keys()).length,
      };
    });
    expect(cacheState).toEqual({
      shellModule: true,
      shellDocument: true,
      runtimeEntries: 9,
    });

    await origin.close();
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await Promise.race([
      page.locator("#runtimeLoader.hidden").waitFor({ state: "attached", timeout: 120_000 }),
      page.locator("#runtimeLoader.failed").waitFor({ state: "attached", timeout: 120_000 }).then(
        async () => {
          throw new Error(`Offline initialization failed: ${await page.locator("#runtimePhase").textContent()}`);
        },
      ),
    ]);
    await expect(page.locator("#runDetect")).toHaveText("自动识别");
  } finally {
    await origin.close();
  }
});

test("repairs a failed runtime download on retry", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The recovery path is engine-independent.");
  await openReadyApp(page);
  await page.evaluate(async () => {
    const cache = await caches.open("particlelens-runtime-v0.2.0");
    await cache.put(
      new URL("./runtime/particle_detection_core.py", document.baseURI),
      new Response("corrupt", { headers: { "Content-Type": "text/x-python" } }),
    );
  });
  await page.reload();
  await page.locator("#runtimeLoader.failed").waitFor({ state: "attached", timeout: 60_000 });

  await page.locator("#runtimeRetry").click();
  await page.locator("#runtimeLoader.hidden").waitFor({ state: "attached", timeout: 180_000 });
  await expect(page.locator("#runDetect")).toBeDisabled();
});
