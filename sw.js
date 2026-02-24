const CACHE_NAME = "wordle-cache-v2";
const APP_SHELL_URLS = ["/", "/wordle", "/wordle.html", "/manifest.json", "/wordle.png"];

async function warmAppShellCache() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    APP_SHELL_URLS.map(async (url) => {
      try {
        const response = await fetch(url, { cache: "no-cache" });
        if (response && response.ok) {
          await cache.put(url, response.clone());
        }
      } catch (error) {
        // Ignore individual cache failures to avoid blocking install.
      }
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(warmAppShellCache());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return;
  }

  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return cache.match("/wordle.html");
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request).then((networkResponse) => {
        const responseClone = networkResponse.clone();
        caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(request, responseClone))
          .catch(() => {
            // Ignore cache write issues.
          });
        return networkResponse;
      });
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "warm-cache") {
    return;
  }

  event.waitUntil(
    warmAppShellCache().then(() => {
      if (event.source) {
        event.source.postMessage({ type: "cache-warmed", cacheName: CACHE_NAME });
      }
    })
  );
});
