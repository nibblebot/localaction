import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { attachSyncServer } from './server/index.ts'
import { defaultDevDbPath } from './server/db.ts'
import { startOwnerWatchdog } from './e2e/infra.ts'
import { logInfo } from './src/log.ts'
import type { Server } from 'node:http'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
// Read `--db <path>` / `--db=<path>` from argv. `scripts/dev.ts` forwards our
// `--db` past Vite's `--` separator (Vite's `cac` rejects unknown options), so
// it reaches us here even though Vite's own CLI ignores it. `--port` stays
// native to Vite.
function readDbPathFromArgv(argv: readonly string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--db') {
      const next = argv[i + 1]
      if (next) return resolve(next)
    } else if (arg.startsWith('--db=')) {
      return resolve(arg.slice('--db='.length))
    }
  }
  return undefined
}
const syncDbPath = readDbPathFromArgv(process.argv) ?? defaultDevDbPath()

// Absolute dist/ path, captured in `configResolved` (the config may be
// bundled to a temp file at build time, so import.meta.url is unreliable).
let outDir = ''

// Fonts loaded on demand (everything except the default, DM Sans) are kept
// out of the service-worker precache — see the localaction-sw plugin and
// public/sw.js's runtime font caching.
const LAZY_FONT = /^fonts\/(?!DMSans-)/

// Served by the dev server in place of public/sw.js (see the
// localaction-sw-dev-cleanup plugin). A prod build served on this
// origin earlier may have left a service worker registered; SWs persist per
// origin and keep serving their precached app shell cache-first even after
// the dev server takes over the port — the page looks permanently stale and
// HMR never engages. The browser byte-compares /sw.js against the installed
// worker on every navigation, so serving this self-destructing worker lets
// the stale registration auto-update into it: it wipes every localaction-*
// cache, unregisters itself, and reloads controlled tabs. It deliberately
// has NO fetch handler, so every request falls through to the network.
const DEV_CLEANUP_SW = String.raw`self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('localaction-'))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim())
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => Promise.all(clients.map((client) => client.navigate(client.url))))
  );
});
`
// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    {
      // Wires the TinyBase WS sync handler into Vite's HTTP server upgrade
      // events in `bun run dev` (configureServer); the prod server
      // (`bun run prod`) calls the same `attachSyncServer` directly.
      // Keeps the WS code in one place and avoids drift between modes.
      // The server module imports `bun:sqlite`, which only resolves under
      // the Bun runtime — every Vite invocation must be `bun --bun vite`.
      // INVARIANT: dev must also pass `--configLoader runner`
      // (scripts/dev.ts). Vite's default rolldown config BUNDLER breaks
      // `ws` upgrade handling under Bun — the
      // bundled handler accepts the socket server-side but its 101
      // response never reaches the wire. The native module runner skips
      // bundling and the handshake works.
      name: 'localaction-sync',
      async configureServer(server) {
        // Arms the e2e owner watchdog when LOCALACTION_OWNER_PID is set
        // (Playwright webServer env); a no-op for normal `bun run dev`.
        // The port is not bound yet at configure time, so only the DB path
        // is recorded in the registry entry.
        startOwnerWatchdog({ dbPath: syncDbPath })
        await attachSyncToVite(server, syncDbPath)
      },
    },
    // Dev-only: intercept /sw.js before the static middleware can serve the
    // placeholder template from public/, and answer with DEV_CLEANUP_SW so a
    // stale prod service worker on this origin self-destructs (see above).
    // Only `configureServer` is defined, so the prod server keeps serving
    // the real baked dist/sw.js — the offline e2e suite depends on that.
    {
      name: 'localaction-sw-dev-cleanup',
      configureServer(server) {
        server.middlewares.use('/sw.js', (_req, res) => {
          res.setHeader('content-type', 'application/javascript; charset=utf-8')
          res.setHeader('cache-control', 'no-cache')
          res.end(DEV_CLEANUP_SW)
        })
      },
    },
    // Bakes the precache manifest into dist/sw.js. Runs after the build has
    // emitted bundles and copied public/ (closeBundle), so the file list is
    // complete. The cache version is a content hash of every emitted file:
    // any build that changes a byte produces a new cache name, the new SW
    // precaches it on install, and activate() drops the previous cache.
    // `public/sw.js` itself is the template and is excluded from the list.
    // Non-default fonts are excluded too: only the default (DM Sans) is
    // precached; the rest are fetched on demand when the user switches
    // fonts and runtime-cached by sw.js's fetch handler.
    {
      name: 'localaction-sw',
      apply: 'build',
      configResolved(config) {
        outDir = resolve(config.root, config.build.outDir)
      },
      closeBundle() {
        const dist = outDir;
        const files = readdirSync(dist, { recursive: true })
          .map(String)
          .filter((rel) => statSync(join(dist, rel)).isFile())
          .map((rel) => rel.split(sep).join('/'));
        const urls = files
          .filter((f) => f !== 'sw.js' && !LAZY_FONT.test(f))
          .map((f) => `/${f}`)
          .sort();
        const version = createHash('sha256')
          .update(
            files
              .sort()
              .map(
                (f) =>
                  `${f}:${createHash('sha256').update(readFileSync(join(dist, f))).digest('hex')}`,
              )
              .join('\n'),
          )
          .digest('hex')
          .slice(0, 12);
        const swPath = join(dist, 'sw.js');
        const out = readFileSync(swPath, 'utf8')
          .replaceAll('__CACHE_VERSION__', version)
          .replaceAll('"__PRECACHE_URLS__"', JSON.stringify(urls));
        if (out.includes('__CACHE_VERSION__') || out.includes('__PRECACHE_URLS__')) {
          throw new Error('localaction-sw: token substitution failed in dist/sw.js');
        }
        writeFileSync(swPath, out);
      },
    },
  ],
  resolve: {
    // Force a single React/React-DOM instance across every importer — app
    // code and pre-bundled deps alike. @dnd-kit (and any dependency that
    // gets served un-optimized) does a bare `import 'react'`; without dedupe
    // a stale dep-optimizer cache can resolve that to a different realpath
    // than the app's React, yielding two React copies and the classic
    // "Invalid hook call / resolveDispatcher() is null" crash. Dedupe is
    // resolved at the module level, independent of the optimizer's state.
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    // Always pre-bundle the @dnd-kit packages so they are never served as
    // raw ESM (which keeps their `import 'react'` on the deduped path).
    include: ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
  },
})
// listener, so gate on the `.on` capability rather than checking for any
// `http.Server`-specific property. The DB path (`--db`) is read from
// `process.argv` — `scripts/dev.ts` moves it past Vite's `--` separator so
// `cac` ignores it, and always injects `defaultDevDbPath()` when the user
// didn't pass one; the `?? defaultDevDbPath()` above covers bare Vite
// invocations. The HTTP/WS port is whatever Vite binds (native `--port`).
async function attachSyncToVite(
  server: { httpServer: unknown },
  dbPath: string,
): Promise<void> {
  const httpServer = server.httpServer
  if (httpServer == null || typeof httpServer !== 'object') return
  if (!('on' in httpServer) || typeof httpServer.on !== 'function') return
  logInfo('server', 'attached WS sync handler (vite dev)')
  await attachSyncServer(httpServer as Server, { dbPath })
}
