import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { attachSyncServer } from './server/index.ts'
import { defaultProdDbPath } from './server/db.ts'
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
const syncDbPath = readDbPathFromArgv(process.argv) ?? defaultProdDbPath()

// Absolute dist/ path, captured in `configResolved` (the config may be
// bundled to a temp file at build time, so import.meta.url is unreliable).
let outDir = ''

// Fonts loaded on demand (everything except the default, DM Sans) are kept
// out of the service-worker precache — see the localaction-sw plugin and
// public/sw.js's runtime font caching.
const LAZY_FONT = /^fonts\/(?!DMSans-)/
// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    {
      // Wires the TinyBase WS sync handler into Vite's HTTP server upgrade
      // events. Used in both `bun run dev` (configureServer) and
      // `bun run preview` (configurePreviewServer); the prod server
      // (`bun run start`) calls the same `attachSyncServer` directly.
      // Keeps the WS code in one place and avoids drift between modes.
      // The server module imports `bun:sqlite`, which only resolves under
      // the Bun runtime — every Vite invocation must be `bun --bun vite`.
      // INVARIANT: dev/preview must also pass `--configLoader runner`
      // (scripts/dev.ts, package.json `preview`). Vite's default rolldown
      // config bundler breaks `ws` upgrade handling under Bun — the
      // bundled handler accepts the socket server-side but its 101
      // response never reaches the wire. The native module runner skips
      // bundling and the handshake works.
      name: 'localaction-sync',
      async configureServer(server) {
        await attachSyncToVite(server, 'dev', syncDbPath)
      },
      async configurePreviewServer(server) {
        await attachSyncToVite(server, 'preview', syncDbPath)
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
})
// Attach the TinyBase WS sync handler to a Vite dev/preview HTTP server.
// `attachSyncServer` only needs an EventEmitter to register the `upgrade`
// listener, so gate on the `.on` capability rather than checking for any
// `http.Server`-specific property. The DB path (`--db`) is read from
// `process.argv` — `scripts/dev.ts` moves it past Vite's `--` separator so
// `cac` ignores it, and always injects `defaultDevDbPath()` when the user
// didn't pass one; the `?? defaultProdDbPath()` above covers bare
// `vite preview`. The HTTP/WS port is whatever Vite binds (native `--port`).
async function attachSyncToVite(
  server: { httpServer: unknown },
  label: string,
  dbPath: string,
): Promise<void> {
  const httpServer = server.httpServer
  if (httpServer == null || typeof httpServer !== 'object') return
  if (!('on' in httpServer) || typeof httpServer.on !== 'function') return
  logInfo('server', `attached WS sync handler (vite ${label})`)
  await attachSyncServer(httpServer as Server, { dbPath })
}
