import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    root: 'packages/hekireki',
    setupFiles: ['../../vitest.setup.ts'],
    testTimeout: 30000,
    includeSource: ['src/**/*.ts'],
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
    },
  },
})
