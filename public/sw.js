/* Managix service worker — offline-first app shell.
 *
 * Strategy:
 *  - App shell + assets: cache-first, refreshed in the background (stale-while-revalidate).
 *  - API /api/* + Supabase: network-first with cache fallback so stale data
 *    still opens the app when the connection drops.
 *  - The business data itself lives in localStorage; the sync engine replays
 *    queued changes when the connection returns.
 */
const CACHE = "managix-v1";
const SHELL = ["/", "/index.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // API: network first, fall back to the last cached response.
  const isApi = url.pathname.startsWith("/api") || url.hostname === "localhost" && url.port === "8787";
  if (isApi) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Dev server websocket / HMR — never cache.
  if (url.pathname.startsWith("/@vite") || url.pathname.includes("hmr")) return;

  // App shell & assets: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetcher = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetcher;
    })
  );
});
