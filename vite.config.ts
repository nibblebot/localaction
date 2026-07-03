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
      // Under `LOCALACTION_E2E=1` (set by the Playwright `webServer` for
      // the OPFS-only project on a dedicated port) disable the PWA dev
      // layer entirely. In dev the plugin injects a `<script>` that calls
      // `registerDevSW()` → `import.meta.hot.send('vite-pwa-plugin:dev-ready')`.
      // In a fresh test browser context the HMR WebSocket isn't open yet, so
      // that throws `SendBeforeConnectError`, and the page enters an
      // infinite reload loop that destroys every `page.evaluate`'s
      // execution context. Disabling `devOptions.enabled` skips the dev
      // SW script injection. The foundation e2e suite runs against a
      // separate dev server WITHOUT this env so the full PWA (manifest + SW)
      // is exercised. Prod builds run with the env unset, so the SW
      // registers normally.
      devOptions: { enabled: process.env['LOCALACTION_E2E'] !== '1' },
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
