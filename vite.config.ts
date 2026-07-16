import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { attachSyncServer } from './server/index.ts'
import type { Server } from 'node:http'
import { resolve } from 'node:path'

const DEBUG = !!process.env['LOCALACTION_DEBUG']
const dbg = (msg: string): void => {
  if (DEBUG) process.stderr.write(`[vite-sync] ${msg}\n`)
}
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
const syncDbPath = readDbPathFromArgv(process.argv)
// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    {
      // Wires the TinyBase WS sync handler into Vite's HTTP server upgrade
      // events. Used in both `pnpm dev` (configureServer) and
      // `pnpm preview` (configurePreviewServer); the prod server
      // (`pnpm start`) calls the same `attachSyncServer` directly.
      // Keeps the WS code in one place and avoids drift between modes.
      // The server module imports the `sqlite3` npm package (a native
      // binding resolved by `tsx`/`vite`/`node` directly).
      name: 'localaction-sync',
      async configureServer(server) {
        await attachSyncToVite(server, 'dev', syncDbPath)
      },
      async configurePreviewServer(server) {
        await attachSyncToVite(server, 'preview', syncDbPath)
      },
    },
  ],
})
// Attach the TinyBase WS sync handler to a Vite dev/preview HTTP server.
// `attachSyncServer` only needs an EventEmitter to register the `upgrade`
// listener, so gate on the `.on` capability rather than checking for any
// `http.Server`-specific property. The DB path (`--db`) is read from
// `process.argv` — `scripts/dev.ts` moves it past Vite's `--` separator so
// `cac` ignores it. The HTTP/WS port is whatever Vite binds (native `--port`).
async function attachSyncToVite(
  server: { httpServer: unknown },
  label: string,
  dbPath: string | undefined,
): Promise<void> {
  const httpServer = server.httpServer
  if (httpServer == null || typeof httpServer !== 'object') return
  if (!('on' in httpServer) || typeof httpServer.on !== 'function') return
  dbg(`attaching WS sync handler to Vite ${label} server`)
  await attachSyncServer(httpServer as Server, dbPath ? { dbPath } : {})
}
