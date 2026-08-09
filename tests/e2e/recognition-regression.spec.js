import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const FIXTURE_PATH = path.resolve(
  "tests/fixtures/generated/mixed-droplet-emulsion-1024.jpg",
);
const BASELINE_PATH = path.resolve(
  "tests/fixtures/generated/mixed-droplet-emulsion-1024.baseline.json",
);
const FIXTURE_SHA256 = "c76f90395e8a78b90420c56ca8e795196051e1e928661308cfce91b36d38c032";
const UPDATE_BASELINE = process.env.UPDATE_RECOGNITION_BASELINE === "1";

const BASE_PARAMETERS = Object.freeze({
  scaleUm: "50",
  micronsPerPixel: "0.5",
  sensitivity: "0.75",
  minDiameter: "4",
  maxDiameter: "180",
  edgeThresholdLow: "50",
  edgeThresholdHigh: "140",
  minimumEdgeSupport: "0.10",
  circleFitTolerance: "0.08",
  minimumContourCoverage: "0.30",
  contrastMode: "clahe",
  brightness: "0",
  contrastAdjustment: "0",
  gamma: "1",
});

const SCENARIOS = [
  { id: "baseline", overrides: {} },
  { id: "high-sensitivity", overrides: { sensitivity: "0.92" } },
  { id: "small-diameter-range", overrides: { maxDiameter: "60" } },
  { id: "large-diameter-range", overrides: { minDiameter: "60" } },
  {
    id: "permissive-edge-acceptance",
    overrides: {
      edgeThresholdLow: "25",
      edgeThresholdHigh: "90",
      minimumEdgeSupport: "0.05",
      circleFitTolerance: "0.15",
      minimumContourCoverage: "0.15",
    },
  },
  {
    id: "strict-edge-acceptance",
    overrides: {
      edgeThresholdLow: "90",
      edgeThresholdHigh: "200",
      minimumEdgeSupport: "0.20",
      circleFitTolerance: "0.05",
      minimumContourCoverage: "0.50",
    },
  },
  { id: "background-correction", overrides: { contrastMode: "background" } },
  {
    id: "manual-luminance-adjustment",
    overrides: {
      contrastMode: "none",
      brightness: "20",
      contrastAdjustment: "25",
      gamma: "1.35",
    },
  },
  { id: "alternate-calibration", overrides: { micronsPerPixel: "0.75" } },
].map(({ id, overrides }) => ({ id, parameters: { ...BASE_PARAMETERS, ...overrides } }));

const CSV_COLUMNS = [
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

async function openReadyApp(page) {
  await page.goto("./");
  await page.locator("#runtimeLoader.hidden, #runtimeLoader.failed").waitFor({
    state: "attached",
    timeout: 180_000,
  });
  if (await page.locator("#runtimeLoader").evaluate((element) => element.classList.contains("failed"))) {
    throw new Error(await page.locator("#runtimePhase").textContent());
  }
  await expect(page.locator("#imageMenuTrigger")).toBeEnabled();
}

async function openAdvancedSettings(page) {
  const settings = page.locator("#advancedSettings");
  if (!(await settings.evaluate((element) => element.open))) {
    await settings.locator("summary").click();
  }
  await expect(settings).toHaveAttribute("open", "");
}

async function fillAndVerify(page, selector, value) {
  const input = page.locator(selector);
  await input.fill(value);
  await expect(input).toHaveValue(value);
}

async function applyParameters(page, parameters) {
  await fillAndVerify(page, "#scaleUm", parameters.scaleUm);
  await fillAndVerify(page, "#micronsPerPixel", parameters.micronsPerPixel);
  await page.locator("#micronsPerPixel").press("Tab");
  await expect(page.locator("#scaleReadout")).toHaveAttribute(
    "data-microns-per-px",
    parameters.micronsPerPixel,
  );

  for (const name of [
    "sensitivity",
    "minDiameter",
    "maxDiameter",
    "edgeThresholdLow",
    "edgeThresholdHigh",
    "minimumEdgeSupport",
    "circleFitTolerance",
    "minimumContourCoverage",
    "brightness",
    "contrastAdjustment",
    "gamma",
  ]) {
    await fillAndVerify(page, `#${name}`, parameters[name]);
  }

  await page.locator("#contrastMode").selectOption(parameters.contrastMode);
  await expect(page.locator("#contrastMode")).toHaveValue(parameters.contrastMode);
}

function parseCsv(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  expect(lines.shift()?.split(",")).toEqual(CSV_COLUMNS);
  return lines.map((line) => {
    const values = line.split(",");
    expect(values).toHaveLength(CSV_COLUMNS.length);
    return {
      particleId: Number(values[0]),
      source: values[1],
      centerXPx: values[2],
      centerYPx: values[3],
      radiusPx: values[4],
      radiusMicrometer: values[5],
      diameterMicrometer: values[6],
      visibleFraction: values[7],
      includedInDistribution: values[8] === "true",
    };
  });
}

function numericParts(text) {
  return text.match(/\d+(?:\.\d+)?/g) ?? [];
}

async function readSummary(page, particles) {
  const includedCount = particles.filter((particle) => particle.includedInDistribution).length;
  await expect(page.locator("#particleTable tr")).toHaveCount(Math.min(250, particles.length));
  await expect(page.locator("#countStat")).toHaveText(String(includedCount));
  await expect(page.locator("#mobileCountStat")).toHaveText(String(includedCount));

  const [mean] = numericParts(await page.locator("#meanStat").innerText());
  const [median] = numericParts(await page.locator("#medianStat").innerText());
  const [minimum, maximum] = numericParts(await page.locator("#rangeStat").innerText());
  return {
    detectedCount: particles.length,
    includedCount,
    meanMicrometer: mean,
    medianMicrometer: median,
    minimumMicrometer: minimum,
    maximumMicrometer: maximum,
  };
}

async function ensureExportPanel(page) {
  if (!(await page.locator("#rightTabExport").isVisible())) {
    await page.locator("#rightToggle").click();
  }
  await page.locator("#rightTabExport").click();
  await expect(page.locator("#rightPanelExport")).toBeVisible();
}

async function exportRecognitionCsv(page) {
  await ensureExportPanel(page);
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#exportCsv").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/_corrected\.csv$/);
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("Recognition CSV was unavailable for comparison.");
  return readFile(downloadPath, "utf8");
}

async function writeBaselineAtomically(baseline) {
  const temporaryPath = `${BASELINE_PATH}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
    await rename(temporaryPath, BASELINE_PATH);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

test("keeps generated-image recognition results stable across parameter combinations", async ({
  page,
}, testInfo) => {
  test.setTimeout(600_000);
  test.skip(
    UPDATE_BASELINE && testInfo.project.name !== "chromium",
    "Recognition baselines are recorded once in Chromium.",
  );

  const fixtureBytes = await readFile(FIXTURE_PATH);
  const fixtureSha256 = createHash("sha256").update(fixtureBytes).digest("hex");
  expect(fixtureSha256, "The generated recognition fixture changed unexpectedly.").toBe(
    FIXTURE_SHA256,
  );

  await openReadyApp(page);
  await page.locator("#imageInput").setInputFiles(FIXTURE_PATH);
  await expect(page.locator("#imageName")).toHaveText(path.basename(FIXTURE_PATH));
  await openAdvancedSettings(page);
  await expect(page.locator("#brightness")).toBeEnabled();

  const csvArtifacts = new Map();
  const cases = [];
  for (const [index, scenario] of SCENARIOS.entries()) {
    await test.step(scenario.id, async () => {
      await applyParameters(page, scenario.parameters);
      if (index > 0) {
        await expect(page.locator("#statusBadge")).toHaveText(/设置已更改|Settings changed/);
      }

      await page.locator("#runDetect").click();
      await expect(page.locator("#statusBadge")).toHaveText(/已识别|Detected/, {
        timeout: 90_000,
      });

      const csvText = await exportRecognitionCsv(page);
      const particles = parseCsv(csvText);
      csvArtifacts.set(scenario.id, csvText);
      cases.push({
        id: scenario.id,
        parameters: scenario.parameters,
        summary: await readSummary(page, particles),
        particles,
      });
    });
  }

  const actual = {
    schemaVersion: 1,
    fixture: {
      filename: path.basename(FIXTURE_PATH),
      sha256: fixtureSha256,
    },
    precision: {
      centerPx: 4,
      radiusPx: 4,
      micrometer: 4,
      visibleFraction: 6,
      displayedStatistics: 2,
    },
    cases,
  };

  if (UPDATE_BASELINE) {
    await writeBaselineAtomically(actual);
    return;
  }

  const expected = JSON.parse(await readFile(BASELINE_PATH, "utf8"));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    await testInfo.attach("recognition-actual.json", {
      body: Buffer.from(`${JSON.stringify(actual, null, 2)}\n`),
      contentType: "application/json",
    });
    await testInfo.attach("recognition-expected.json", {
      body: Buffer.from(`${JSON.stringify(expected, null, 2)}\n`),
      contentType: "application/json",
    });
    for (const [scenarioId, csvText] of csvArtifacts) {
      await testInfo.attach(`${scenarioId}.csv`, {
        body: Buffer.from(csvText),
        contentType: "text/csv",
      });
    }
  }
  expect(actual).toEqual(expected);
});
