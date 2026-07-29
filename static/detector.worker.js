const RUNTIME_CACHE = "particlelens-runtime-v0.2.0";

let pyodide = null;
let readyPromise = null;
let analysisQueue = Promise.resolve();

function sendProgress(message) {
  self.postMessage({ type: "progress", ...message });
}

async function digestHex(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function contentType(file) {
  if (file.endsWith(".mjs") || file.endsWith(".js")) return "text/javascript";
  if (file.endsWith(".json")) return "application/json";
  if (file.endsWith(".wasm")) return "application/wasm";
  if (file.endsWith(".py")) return "text/x-python";
  return "application/octet-stream";
}

async function readAndVerify(response, asset, completedBytes, totalBytes) {
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    sendProgress({
      phase: "download",
      file: asset.file,
      loadedBytes: completedBytes + buffer.byteLength,
      totalBytes,
    });
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let assetBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    assetBytes += value.byteLength;
    sendProgress({
      phase: "download",
      file: asset.file,
      loadedBytes: completedBytes + assetBytes,
      totalBytes,
    });
  }
  const combined = new Uint8Array(assetBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined.buffer;
}

async function prefetchRuntime(baseUrl) {
  const cache = await caches.open(RUNTIME_CACHE);
  const manifestUrl = new URL("runtime-manifest.json", baseUrl);
  let manifestResponse = await cache.match(manifestUrl);
  if (!manifestResponse) {
    manifestResponse = await fetch(manifestUrl, { cache: "no-store" });
    if (!manifestResponse.ok) {
      throw new Error(`Runtime manifest failed to load (HTTP ${manifestResponse.status}).`);
    }
    await cache.put(manifestUrl, manifestResponse.clone());
  }
  const manifest = await manifestResponse.json();
  let completedBytes = 0;

  for (const asset of manifest.assets) {
    const url = new URL(asset.file, baseUrl);
    let response = await cache.match(url);
    let buffer;
    if (response) {
      buffer = await response.arrayBuffer();
      sendProgress({
        phase: "download",
        file: asset.file,
        loadedBytes: completedBytes + buffer.byteLength,
        totalBytes: manifest.totalBytes,
        cached: true,
      });
    } else {
      response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`${asset.file} failed to load (HTTP ${response.status}).`);
      buffer = await readAndVerify(response, asset, completedBytes, manifest.totalBytes);
    }

    if (buffer.byteLength !== asset.size || (await digestHex(buffer)) !== asset.sha256) {
      await cache.delete(url);
      throw new Error(`Integrity verification failed for ${asset.file}.`);
    }
    if (!(await cache.match(url))) {
      await cache.put(
        url,
        new Response(buffer, {
          headers: {
            "Content-Type": contentType(asset.file),
            "Content-Length": String(buffer.byteLength),
          },
        }),
      );
    }
    completedBytes += asset.size;
  }
  return manifest;
}

async function cachedText(url) {
  const response = await caches.match(url);
  if (!response) throw new Error(`Verified runtime asset is missing from cache: ${url}`);
  return response.text();
}

function installCacheFirstFetch() {
  const networkFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.method === "GET") {
      const cached = await caches.match(request);
      if (cached) return cached;
    }
    return networkFetch(request);
  };
}

async function importCachedPyodide(baseUrl) {
  const moduleSource = await cachedText(new URL("pyodide.mjs", baseUrl));
  const moduleUrl = URL.createObjectURL(new Blob([moduleSource], { type: "text/javascript" }));
  try {
    return await import(moduleUrl);
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }
}

async function preloadCachedPyodideModule(baseUrl) {
  const asmSource = await cachedText(new URL("pyodide.asm.js", baseUrl));
  globalThis._createPyodideModule = new Function(
    `${asmSource}\nreturn _createPyodideModule;`,
  )();
}

async function initialize(baseUrl) {
  await prefetchRuntime(baseUrl);
  installCacheFirstFetch();

  sendProgress({ phase: "initialize-python" });
  await preloadCachedPyodideModule(baseUrl);
  const pyodideModule = await importCachedPyodide(baseUrl);
  pyodide = await pyodideModule.loadPyodide({ indexURL: baseUrl });

  sendProgress({ phase: "initialize-opencv" });
  await pyodide.loadPackage(["numpy", "opencv-python"]);

  sendProgress({ phase: "initialize-detector" });
  const coreResponse = await fetch(new URL("particle_detection_core.py", baseUrl));
  if (!coreResponse.ok) throw new Error("The shared detector module could not be loaded.");
  pyodide.FS.mkdirTree("/home/pyodide");
  pyodide.FS.writeFile("/home/pyodide/particle_detection_core.py", await coreResponse.text(), {
    encoding: "utf8",
  });
  pyodide.runPython(`
import sys
if "/home/pyodide" not in sys.path:
    sys.path.insert(0, "/home/pyodide")
import particle_detection_core
`);
  sendProgress({ phase: "ready" });
  return {
    pyodideVersion: pyodide.version,
    opencvVersion: pyodide.runPython("particle_detection_core.cv2.__version__"),
  };
}

async function analyze(imageBytes, options) {
  await readyPromise;
  const inputPath = "/tmp/particlelens-input";
  pyodide.FS.writeFile(inputPath, new Uint8Array(imageBytes));
  pyodide.globals.set("particlelens_options_json", JSON.stringify(options));
  try {
    const resultJson = pyodide.runPython(`
import json
from pathlib import Path
from particle_detection_core import analyze_image_bytes

json.dumps(
    analyze_image_bytes(
        Path("${inputPath}").read_bytes(),
        json.loads(particlelens_options_json),
    ),
    separators=(",", ":"),
)
`);
    return JSON.parse(resultJson);
  } finally {
    pyodide.globals.delete("particlelens_options_json");
    try {
      pyodide.FS.unlink(inputPath);
    } catch {
      // The file may not exist when decoding fails early.
    }
  }
}

self.addEventListener("message", (event) => {
  const message = event.data;
  if (message.type === "initialize") {
    if (!readyPromise) readyPromise = initialize(message.runtimeBaseUrl);
    readyPromise
      .then((result) => self.postMessage({ id: message.id, type: "ready", result }))
      .catch((error) => self.postMessage({ id: message.id, type: "error", error: error.message }));
    return;
  }

  if (message.type === "analyze") {
    analysisQueue = analysisQueue
      .then(() => analyze(message.imageBytes, message.options))
      .then((result) => self.postMessage({ id: message.id, type: "result", result }))
      .catch((error) => self.postMessage({ id: message.id, type: "error", error: error.message }));
  }
});
