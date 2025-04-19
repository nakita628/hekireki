import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: ['**/dist/**', '**/src/type/*.ts', '**/node_modules/**', '**/vitest.config.ts'],
    coverage: {
      exclude: [
        '**/src/**/*.test.ts',
        '**/dist/**',
        '**/vitest.config.ts',
        '**/prisma/valibot/*',
        '**/prisma/zod/*',
        '**/common/type/*',
        '**/generator/mermaid-er/type',
      ],
      all: true,
    },
  },
})
