const SHELL_CACHE = "particlelens-shell-v0.2.5";
const RUNTIME_CACHE = "particlelens-runtime-v0.2.0";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("particlelens-") &&
                key !== SHELL_CACHE &&
                key !== RUNTIME_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      ),
    ]),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_SHELL") return;
  const urls = event.data.urls.filter((url) => {
    const parsed = new URL(url);
    return (
      parsed.origin === self.location.origin &&
      !parsed.pathname.includes("/runtime/") &&
      !parsed.pathname.endsWith("/runtime-config.json")
    );
  });
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async (cache) => {
      await Promise.all(
        urls.map(async (url) => {
          try {
            const response = await fetch(url, { cache: "reload" });
            if (response.ok) await cache.put(url, response);
          } catch {
            // A later visit can retry any shell resource that failed here.
          }
        }),
      );
      event.ports[0]?.postMessage({ type: "SHELL_CACHED" });
    }),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.includes("/api/")) return;

  if (url.pathname.endsWith("/runtime-config.json")) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }

  if (url.pathname.includes("/runtime/")) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      }),
    );
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        try {
          const response = await fetch(event.request);
          if (response.ok) await cache.put(event.request, response.clone());
          return response;
        } catch {
          const fallback = await cache.match(event.request) ||
            await cache.match(new URL("./", self.registration.scope));
          if (fallback) return fallback;
          throw new Error("Offline document is unavailable.");
        }
      }),
    );
    return;
  }

  event.respondWith(
    caches.open(SHELL_CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      const update = fetch(event.request)
        .then(async (response) => {
          if (response.ok) await cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => null);

      if (cached) {
        event.waitUntil(update);
        return cached;
      }

      const response = await update;
      if (response) return response;
      throw new Error("Offline resource is unavailable.");
    }),
  );
});
