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
      // events. Used in both `pnpm dev` (configureServer) and `pnpm preview`
      // (configurePreviewServer); the Node prod server (`pnpm start`) calls
      // the same `attachSyncServer` directly. Keeps the WS code in one
      // place and avoids drift between modes.
      name: 'localaction-sync',
      configureServer(server) {
        if (!server.httpServer) return
        // Vite's typed `HttpServer` is `http.Server | Http2SecureServer`; we
        // only support plain HTTP.
        if ('maxHeadersCount' in server.httpServer) {
          dbg('attaching WS sync handler to Vite dev server (no proxy: WS shares Vite\'s HTTP server via the upgrade event)')
          attachSyncServer(server.httpServer)
        }
      },
      configurePreviewServer(server) {
        if (!server.httpServer) return
        if ('maxHeadersCount' in server.httpServer) {
          dbg('attaching WS sync handler to Vite preview server')
          attachSyncServer(server.httpServer)
        }
      },
    },
  ],
})
