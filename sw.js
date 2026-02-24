const SW_VERSION = "beta-shell-v1";
const SHELL_CACHE = "wordle-shell-v1";
const CONFIG_CACHE = "wordle-config-v1";
const CONFIG_MODE_KEY = "/__offline_shell_mode__";
const APP_SHELL_URLS = ["/", "/wordle", "/wordle.html", "/manifest.json", "/wordle.png"];

async function getOfflineShellEnabled() {
  const cache = await caches.open(CONFIG_CACHE);
  const response = await cache.match(CONFIG_MODE_KEY);
  if (!response) return false;
  const mode = await response.text();
  return mode === "on";
}

async function setOfflineShellEnabled(enabled) {
  const cache = await caches.open(CONFIG_CACHE);
  await cache.put(
    CONFIG_MODE_KEY,
    new Response(enabled ? "on" : "off", {
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    })
  );
}

async function warmShellCache() {
  const cache = await caches.open(SHELL_CACHE);
  await Promise.all(
    APP_SHELL_URLS.map(async (url) => {
      try {
        const response = await fetch(url, { cache: "no-cache" });
        if (response.ok) {
          await cache.put(url, response.clone());
        }
      } catch (error) {
        // Ignore per-asset fetch failures during warm-up.
      }
    })
  );
}

async function getCachedAppShell() {
  const cache = await caches.open(SHELL_CACHE);
  return (
    (await cache.match("/wordle.html", { ignoreSearch: true })) ||
    (await cache.match("/wordle", { ignoreSearch: true })) ||
    (await cache.match("/", { ignoreSearch: true }))
  );
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (request.mode !== "navigate") return;

  event.respondWith(
    (async () => {
      const enabled = await getOfflineShellEnabled();
      if (!enabled) {
        try {
          return await fetch(request);
        } catch (error) {
          const cachedApp = await getCachedAppShell();
          if (cachedApp) {
            return cachedApp;
          }
          return new Response(
            "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Wordle</title></head><body style='font-family:Arial,sans-serif;background:#121213;color:#fff;padding:24px;'><h2>Wordle is offline.</h2><p>Reconnect once to refresh local cache.</p></body></html>",
            { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
        }
      }

      try {
        return await fetch(request);
      } catch (error) {
        const cachedApp = await getCachedAppShell();

        if (cachedApp) {
          return cachedApp;
        }

        return new Response(
          "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Wordle</title></head><body style='font-family:Arial,sans-serif;background:#121213;color:#fff;padding:24px;'><h2>Wordle is offline.</h2><p>Reconnect once to refresh local cache.</p></body></html>",
          { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      }
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "sw-ping") {
    if (event.source) {
      event.source.postMessage({ type: "sw-pong", version: SW_VERSION });
    }
    return;
  }

  if (event.data?.type === "set-offline-shell-mode") {
    const enabled = Boolean(event.data.enabled);
    event.waitUntil(
      (async () => {
        await setOfflineShellEnabled(enabled);
        if (enabled) {
          await warmShellCache();
        }
        if (event.source) {
          event.source.postMessage({
            type: "offline-shell-mode-updated",
            enabled,
            version: SW_VERSION
          });
        }
      })()
    );
  }
});
