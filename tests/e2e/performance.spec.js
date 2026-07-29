import { expect, test } from "@playwright/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

function twentyMegapixelBitmap() {
  const width = 5000;
  const height = 4001;
  const rowBytes = (width * 3 + 3) & ~3;
  const pixelOffset = 54;
  const buffer = Buffer.alloc(pixelOffset + rowBytes * height);
  buffer.fill(232, pixelOffset);

  buffer.write("BM", 0, "ascii");
  buffer.writeUInt32LE(buffer.length, 2);
  buffer.writeUInt32LE(pixelOffset, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(rowBytes * height, 34);

  for (const [centerX, centerY, radius] of [
    [900, 900, 95],
    [2100, 1350, 120],
    [3450, 2500, 105],
    [4400, 3300, 110],
  ]) {
    for (let y = centerY - radius; y <= centerY + radius; y += 1) {
      const dy = y - centerY;
      const span = Math.floor(Math.sqrt(radius ** 2 - dy ** 2));
      const bmpY = height - 1 - y;
      const start = pixelOffset + bmpY * rowBytes + (centerX - span) * 3;
      const end = pixelOffset + bmpY * rowBytes + (centerX + span + 1) * 3;
      buffer.fill(100, start, end);
    }
  }
  for (let y = 3800; y <= 3805; y += 1) {
    const bmpY = height - 1 - y;
    const start = pixelOffset + bmpY * rowBytes + 4300 * 3;
    const end = pixelOffset + bmpY * rowBytes + 4900 * 3;
    buffer.fill(0, start, end);
  }
  return buffer;
}

test("keeps the main thread responsive while analyzing a 20 MP image", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The release memory gate runs once in Chromium.");
  test.setTimeout(300_000);

  await page.goto("./");
  await page.locator("#runtimeLoader.hidden").waitFor({ state: "attached", timeout: 180_000 });

  const fixtureDirectory = await mkdtemp(path.join(tmpdir(), "particlelens-20mp-"));
  const fixturePath = path.join(fixtureDirectory, "twenty-megapixel.bmp");
  await writeFile(fixturePath, twentyMegapixelBitmap());
  try {
    const warning = page.waitForEvent("dialog");
    await page.locator("#imageInput").setInputFiles(fixturePath);
    const dialog = await warning;
    expect(dialog.message()).toMatch(/20|2000/);
    await dialog.accept();

    await page.locator("#contrastMode").selectOption("none");
    await page.locator("#sensitivity").fill("0.7");
    await page.locator("#minDiameter").fill("10");
    await page.locator("#maxDiameter").fill("40");
    await page.evaluate(() => {
      window.__particleLensFrames = 0;
      window.__particleLensCounting = true;
      const tick = () => {
        window.__particleLensFrames += 1;
        if (window.__particleLensCounting) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    await page.locator("#runDetect").click();
    await expect(page.locator("#statusBadge")).toHaveText(/已识别|Detected/, {
      timeout: 240_000,
    });
    const frames = await page.evaluate(() => {
      window.__particleLensCounting = false;
      return window.__particleLensFrames;
    });
    expect(frames).toBeGreaterThan(10);
  } finally {
    await rm(fixtureDirectory, { recursive: true, force: true });
  }
});
