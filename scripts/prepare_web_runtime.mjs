import { createHash } from "node:crypto";
import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = path.join(root, ".cache", "pyodide");
const config = JSON.parse(await readFile(path.join(root, "scripts", "pyodide-assets.json"), "utf8"));
const require = createRequire(import.meta.url);
const pyodideDir = path.dirname(require.resolve("pyodide/pyodide.mjs"));

await mkdir(cacheDir, { recursive: true });

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

async function verifyFile(filePath, expectedHash) {
  const data = await readFile(filePath);
  const actualHash = sha256(data);
  if (actualHash !== expectedHash) {
    throw new Error(`SHA-256 mismatch for ${path.basename(filePath)}: ${actualHash}`);
  }
  return { size: data.byteLength, sha256: actualHash };
}

const assets = [];
for (const [file, expectedHash] of Object.entries(config.runtime)) {
  const source = path.join(pyodideDir, file);
  const target = path.join(cacheDir, file);
  await verifyFile(source, expectedHash);
  await copyFile(source, target);
  const verified = await verifyFile(target, expectedHash);
  assets.push({ file, ...verified });
}

const lock = JSON.parse(await readFile(path.join(pyodideDir, "pyodide-lock.json"), "utf8"));
for (const packageName of config.packages) {
  const packageInfo = lock.packages[packageName];
  if (!packageInfo) throw new Error(`Package ${packageName} is absent from the Pyodide lock file.`);

  const file = packageInfo.file_name;
  const target = path.join(cacheDir, file);
  const valid = await verifyFile(target, packageInfo.sha256).then(
    () => true,
    () => false,
  );

  if (!valid) {
    const response = await fetch(new URL(file, config.baseUrl));
    if (!response.ok) throw new Error(`Failed to download ${file}: HTTP ${response.status}`);
    await writeFile(target, new Uint8Array(await response.arrayBuffer()));
  }
  const verified = await verifyFile(target, packageInfo.sha256);
  assets.push({ file, ...verified });
}

const coreSource = path.join(root, "particle_detection_core.py");
const coreTarget = path.join(cacheDir, "particle_detection_core.py");
await copyFile(coreSource, coreTarget);
const coreData = await readFile(coreTarget);
assets.push({
  file: "particle_detection_core.py",
  size: coreData.byteLength,
  sha256: sha256(coreData),
});

const manifest = {
  version: "0.2.1",
  pyodideVersion: config.version,
  totalBytes: assets.reduce((sum, asset) => sum + asset.size, 0),
  assets,
};
await writeFile(
  path.join(cacheDir, "runtime-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(`Prepared ${assets.length} runtime assets (${manifest.totalBytes} bytes).`);
