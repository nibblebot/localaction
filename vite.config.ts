import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { attachSyncServer } from './server/index.ts'
import type { Server } from 'node:http'

const DEBUG = !!process.env['LOCALACTION_DEBUG']
const dbg = (msg: string): void => {
  if (DEBUG) process.stderr.write(`[vite-sync] ${msg}\n`)
}
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
        await attachSyncToVite(server, 'dev')
      },
      async configurePreviewServer(server) {
        await attachSyncToVite(server, 'preview')
      },
    },
  ],
})
// Attach the TinyBase WS sync handler to a Vite dev/preview HTTP server.
// `attachSyncServer` only needs an EventEmitter to register the `upgrade`
// listener, so gate on the `.on` capability rather than checking for
// any `http.Server`-specific property. Works under both Node and Bun.
async function attachSyncToVite(server: { httpServer: unknown }, label: string): Promise<void> {
  const httpServer = server.httpServer
  if (httpServer == null || typeof httpServer !== 'object') return
  if (!('on' in httpServer) || typeof httpServer.on !== 'function') return
  dbg(`attaching WS sync handler to Vite ${label} server`)
  await attachSyncServer(httpServer as Server)
}
