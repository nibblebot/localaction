// localaction app-shell service worker. Two placeholders below are
// substituted at build time by the `localaction-sw` plugin in vite.config.ts:
// the cache version (content hash of the dist file set) and the precache
// list (JSON array of every dist file except sw.js). In dev this template
// never reaches the browser: the `localaction-sw-dev-cleanup` plugin
// intercepts /sw.js and serves a self-destructing worker instead, and
// src/serviceWorkerRegistration.ts only registers in prod builds.
const VERSION = '__CACHE_VERSION__';
const CACHE = `localaction-${VERSION}`;
const PRECACHE = '__PRECACHE_URLS__';

// Inlined from src/log.ts — public/sw.js is served verbatim, not bundled.
const log = (msg) => console.info(`[localaction] sw — ${msg}`);
const logErr = (msg) => console.error(`[localaction] sw — ${msg}`);

self.addEventListener('install', (event) => {
  log(`installing (cache ${CACHE}, ${PRECACHE.length} files)`);
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => log(`precached ${PRECACHE.length} files`))
      .then(() => self.skipWaiting())
      .catch((err) => {
        // Install aborts; the previous SW (if any) keeps serving.
        logErr(`install failed: ${err instanceof Error ? err.message : String(err)}`);
      }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('localaction-') && key !== CACHE)
            .map((key) => {
              log(`deleted old cache ${key}`);
              return caches.delete(key);
            }),
        ),
      )
      .then(() => self.clients.claim())
      .then(() => log(`activated (cache ${CACHE})`)),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // WS upgrades never fire fetch events, but keep the sync endpoint out of
  // the cache path on principle.
  if (url.pathname === '/ws') return;
  // Non-default fonts are excluded from the precache and fetched on demand
  // when the user switches fonts. Cache-first with a runtime fill so a font
  // keeps working offline once it has been loaded; a font never fetched
  // online simply falls back to the system font offline.
  if (url.pathname.startsWith('/fonts/')) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(request).then(
          (hit) =>
            hit ??
            fetch(request).then((res) => {
              if (res.ok) cache.put(request, res.clone());
              return res;
            }),
        ),
      ),
    );
    return;
  }
  // Hash-based routing: every navigation is the app shell.
  const target = request.mode === 'navigate' ? '/index.html' : request;
  event.respondWith(caches.match(target).then((hit) => hit ?? fetch(request)));
});
