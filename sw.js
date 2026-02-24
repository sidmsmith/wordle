const SW_VERSION = "diagnostics-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "sw-ping") {
    return;
  }
  if (event.source) {
    event.source.postMessage({ type: "sw-pong", version: SW_VERSION });
  }
});
