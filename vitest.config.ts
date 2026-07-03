import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Two-project workspace: React-side code (jsdom) and Node-side scripts
 * (node). Vitest v4 dropped `environmentMatchGlobs` in favour of an
 * explicit `projects` array; this keeps the env split that the AGENTS.md
 * "Quirks" section describes.
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
          setupFiles: [],
          globals: false,
          css: false,
        },
      },
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['scripts/**/*.test.{ts,tsx}', 'server/**/*.test.{ts,tsx}'],
          globals: false,
        },
      },
    ],
  },
});