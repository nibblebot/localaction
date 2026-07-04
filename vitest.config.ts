import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Two-project workspace: React-side code (jsdom) and Node-side suites (node).
 * Vitest v4 dropped `environmentMatchGlobs` in favour of an explicit
 * `projects` array; this keeps the env split that the AGENTS.md "Quirks"
 * section describes.
 *
 * `tests/integration/**` boots the real Node sync server (`ws` + `sqlite3` +
 * `node:http`) and connects TinyBase clients to it — that's a Node-side
 * suite, so it runs in the `node` env, not jsdom. Running it under jsdom
 * (which only stubs a browser) makes the WS handshake flaky under parallel
 * load. See `tests/integration/sync-roundtrip.test.ts`.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        test: {
          name: 'browser',
          environment: 'jsdom',
          include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
          exclude: ['tests/integration/**'],
          setupFiles: [],
          globals: false,
          css: false,
        },
      },
      {
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'scripts/**/*.test.{ts,tsx}',
            'server/**/*.test.{ts,tsx}',
            'tests/integration/**/*.test.{ts,tsx}',
          ],
          globals: false,
        },
      },
    ],
  },
});