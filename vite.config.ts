import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { attachSyncServer } from './server/index.ts'

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
      // events. Used in both `bun run dev` (configureServer) and
      // `bun run preview` (configurePreviewServer); the prod server
      // (`bun run start`) calls the same `attachSyncServer` directly.
      // Keeps the WS code in one place and avoids drift between modes.
      name: 'localaction-sync',
      async configureServer(server) {
        if (!server.httpServer) return
        // Vite's typed `HttpServer` is `http.Server | Http2SecureServer`; we
        // only support plain HTTP.
        if ('maxHeadersCount' in server.httpServer) {
          dbg('attaching WS sync handler to Vite dev server (no proxy: WS shares Vite\'s HTTP server via the upgrade event)')
          await attachSyncServer(server.httpServer)
        }
      },
      async configurePreviewServer(server) {
        if (!server.httpServer) return
        if ('maxHeadersCount' in server.httpServer) {
          dbg('attaching WS sync handler to Vite preview server')
          await attachSyncServer(server.httpServer)
        }
      },
    },
  ],
})
