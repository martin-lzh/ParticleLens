const RUNTIME_CACHE = "particlelens-runtime-v0.2.0";

async function readRuntimeConfig() {
  try {
    const response = await fetch(new URL("./runtime-config.json", document.baseURI), {
      cache: "no-store",
    });
    if (response.ok) return response.json();
  } catch {
    // Static development defaults to the browser detector.
  }
  return { detector: "browser" };
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return null;
  const registration = await navigator.serviceWorker.register(
    new URL("./service-worker.js", document.baseURI),
    { scope: "./", type: "module" },
  );
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    await new Promise((resolve) => {
      const timeout = window.setTimeout(resolve, 2000);
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => {
          window.clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
    });
  }
  return registration;
}

function optionsQuery(options) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value !== null && value !== undefined && value !== "") {
      query.set(key, String(value));
    }
  }
  return query;
}

class NativeDetector {
  async initialize(onProgress) {
    onProgress({ phase: "native", label: "Connecting to the offline detector" });
    const response = await fetch(new URL("./api/health", document.baseURI));
    if (!response.ok) throw new Error("The offline detector is unavailable.");
    onProgress({ phase: "ready", label: "Ready" });
  }

  async analyze(imageBytes, options) {
    const endpoint = new URL("./api/analyze", document.baseURI);
    endpoint.search = optionsQuery(options);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: imageBytes,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Detection failed.");
    return result;
  }

  close() {}
}

class BrowserDetector {
  constructor() {
    this.worker = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  initialize(onProgress) {
    this.worker = new Worker(new URL("./detector.worker.js", import.meta.url), {
      type: "module",
      name: "particlelens-detector",
    });
    this.worker.addEventListener("message", (event) => {
      const message = event.data;
      if (message.type === "progress") {
        onProgress(message);
        return;
      }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      if (message.type === "error") pending.reject(new Error(message.error));
      else pending.resolve(message.result);
      this.pending.delete(message.id);
    });
    this.worker.addEventListener("error", (event) => {
      const error = new Error(event.message || "The browser detector stopped unexpectedly.");
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    });
    return this.request("initialize", {
      runtimeBaseUrl: new URL("./runtime/", document.baseURI).href,
    });
  }

  analyze(imageBytes, options) {
    const transferable = imageBytes.slice(0);
    return this.request("analyze", { imageBytes: transferable, options }, [transferable]);
  }

  request(type, payload, transfer = []) {
    const id = this.nextId++;
    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.worker.postMessage({ id, type, ...payload }, transfer);
    return promise;
  }

  close() {
    this.worker?.terminate();
    this.worker = null;
  }
}

export async function createDetector(onProgress) {
  const config = await readRuntimeConfig();
  if (config.detector === "browser") await registerServiceWorker();
  const detector = config.detector === "native" ? new NativeDetector() : new BrowserDetector();
  await detector.initialize(onProgress);
  return detector;
}

export async function clearRuntimeCache() {
  if ("caches" in window) await caches.delete(RUNTIME_CACHE);
}

export async function cacheApplicationShell() {
  if (!navigator.serviceWorker?.controller) return;
  const resources = performance
    .getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter((url) => {
      const parsed = new URL(url);
      return (
        parsed.origin === window.location.origin &&
        !parsed.pathname.includes("/runtime/")
      );
    });
  resources.push(window.location.href, new URL("./", document.baseURI).href);
  await new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(resolve, 30_000);
    channel.port1.addEventListener("message", () => {
      window.clearTimeout(timeout);
      resolve();
    }, { once: true });
    channel.port1.start();
    navigator.serviceWorker.controller.postMessage({
      type: "CACHE_SHELL",
      urls: [...new Set(resources)],
    }, [channel.port2]);
  });
}
