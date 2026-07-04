import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

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