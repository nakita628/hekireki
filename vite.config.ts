import { resolve } from 'node:path'

import { defineConfig } from 'vite-plus'

const __dirname = import.meta.dirname

export default defineConfig({
  build: {
    sourcemap: true,
  },
  test: {
    root: 'packages/hekireki',
    setupFiles: [resolve(__dirname, 'vitest.setup.ts')],
    include: ['src/**/*.test.ts'],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      reporter: ['text', 'json', 'html'],
    },
  },
  lint: {
    ignorePatterns: ['dist/**', 'fixtures/**'],
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
