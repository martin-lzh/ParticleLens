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
  await expect(page.locator("#runDetect")).toBeEnabled();
}

async function uploadAndDetect(page) {
  await page.locator("#imageInput").setInputFiles({
    name: "synthetic.bmp",
    mimeType: "image/bmp",
    buffer: syntheticBitmap(),
  });
  await expect(page.locator("#imageName")).toHaveText("synthetic.bmp");

  await page.locator("#contrastMode").selectOption("none");
  await page.locator("#sensitivity").fill("0.7");
  await page.locator("#minDiameter").fill("15");
  await page.locator("#maxDiameter").fill("80");
  await page.locator("#runDetect").click();
  await expect(page.locator("#statusBadge")).toHaveText(/已识别|Detected/, {
    timeout: 60_000,
  });
}

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

  await page.locator("[data-left-tab='export']").click();
  const csvDownload = page.waitForEvent("download");
  await page.locator("#exportCsv").click();
  expect((await csvDownload).suggestedFilename()).toMatch(/_corrected\.csv$/);

  const pngDownload = page.waitForEvent("download");
  await page.locator("#exportPng").click();
  expect((await pngDownload).suggestedFilename()).toMatch(/_annotated\.png$/);

  expect(requestsAfterUpload.filter((request) => request.method() !== "GET")).toEqual([]);
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
  await page.locator("[data-left-tab='edit']").click();
  await page.locator("#scaleTool").click();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.8);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8, { steps: 5 });
  await page.mouse.up({ button: "left" });
  const correctedScale = Number(
    await page.locator("#scaleReadout").getAttribute("data-microns-per-px"),
  );
  expect(correctedScale).not.toBe(initialScale);

  await page.locator("#deleteSelected").click();
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

test("adapts the workspace for mobile and supports touch canvas gestures", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openReadyApp(page);

  await expect(page.locator("#leftPanel")).toHaveClass(/collapsed/);
  await expect(page.locator("#leftToggle")).toHaveAttribute("aria-expanded", "false");
  const topbarBox = await page.locator(".topbar").boundingBox();
  expect(topbarBox?.height).toBeGreaterThanOrEqual(100);

  await page.locator("#leftToggle").click();
  await expect(page.locator("#leftToggle")).toHaveAttribute("aria-expanded", "true");
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

  const beforePan = await canvas.screenshot();
  await canvas.dispatchEvent("pointerdown", pointer(3, 60, 650, true));
  await canvas.dispatchEvent("pointermove", pointer(3, 115, 610, true));
  await canvas.dispatchEvent("pointerup", { ...pointer(3, 115, 610, true), buttons: 0 });
  const afterPan = await canvas.screenshot();
  expect(Buffer.compare(beforePan, afterPan)).not.toBe(0);

  await page.locator("#leftToggle").click();
  await page.locator("[data-left-tab='edit']").click();
  await page.locator("#circleTool").click();
  await expect(page.locator("#leftToggle")).toHaveAttribute("aria-expanded", "false");
  const rows = page.locator("#particleTable tr");
  await canvas.dispatchEvent("pointerdown", pointer(4, 125, 560, true));
  await canvas.dispatchEvent("pointermove", pointer(4, 190, 560, true));
  await canvas.dispatchEvent("pointerup", { ...pointer(4, 190, 560, true), buttons: 0 });
  await expect(rows).toHaveCount(4);
});

test("switches language and restores the app shell offline", async ({ page }) => {
  const origin = await startStaticServer();
  try {
    await openReadyApp(page, origin.url);
    await page.locator("#languageToggle").click();
    await expect(page.locator("#runDetect")).toHaveText("Run Detection");

    await page.locator("#runtimeLoader[data-offline-ready='true']").waitFor({
      state: "attached",
      timeout: 30_000,
    });
    const cacheState = await page.evaluate(async () => {
      const shell = await caches.open("particlelens-shell-v0.2.0");
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
    await expect(page.locator("#runDetect")).toHaveText("Run Detection");
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
  await expect(page.locator("#runDetect")).toBeEnabled();
});
