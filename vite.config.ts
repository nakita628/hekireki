import { resolve } from 'node:path'

import { defineConfig } from 'vite-plus'

const __dirname = import.meta.dirname

export default defineConfig({
  build: {
    sourcemap: true,
  },
  test: {
    setupFiles: [resolve(__dirname, 'vitest.setup.ts')],
    include: ['packages/hekireki/src/**/*.test.ts', 'test/**/*.test.ts'],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: ['packages/hekireki/src/**/*.ts'],
      exclude: ['packages/hekireki/src/**/*.test.ts'],
      reporter: ['text', 'json', 'html'],
    },
  },
  lint: {
    ignorePatterns: ['dist/**'],
    options: {
      typeAware: true,
    },
  },
  fmt: {
    ignorePatterns: ['**/node_modules/**', '**/dist/**'],
    printWidth: 100,
    singleQuote: true,
    semi: false,
    sortPackageJson: true,
    experimentalSortImports: {},
  },
  staged: {
    '*.{js,ts,tsx}': 'vp check --fix',
  },
})
