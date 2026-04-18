import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Playwright specs live alongside vitest, but we never want vitest to try
    // to execute them — they are invoked via `npm run test:e2e`.
    exclude: ['node_modules', 'dist', 'tests/e2e/**/*.spec.ts'],
  },
});
