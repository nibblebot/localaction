import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { VitePWA } from 'vite-plugin-pwa'
import { attachSyncServer } from './server/index.ts'

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
          attachSyncServer(server.httpServer)
        }
      },
      configurePreviewServer(server) {
        if (!server.httpServer) return
        if ('maxHeadersCount' in server.httpServer) {
          attachSyncServer(server.httpServer)
        }
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: { enabled: true },
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'LocalAction',
        short_name: 'LocalAction',
        description: 'Local-first domain, project, task, and notes management.',
        theme_color: '#08060d',
        background_color: '#16171d',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
    }),
  ],
})
