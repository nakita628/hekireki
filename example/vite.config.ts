import { defineConfig } from 'vite-plus'

import { BASE_RULES, LINT_CATEGORIES, LINT_OPTIONS } from '../lint/oxlint.ts'

export default defineConfig({
  lint: {
    // generated/** is generator output, committed so each target's syntax can be
    // reviewed by eye.
    ignorePatterns: ['**/node_modules/**', 'generated/**'],
    // Setting `plugins` replaces oxlint's default list — restate the defaults, then add import.
    plugins: ['typescript', 'unicorn', 'oxc', 'import', 'promise', 'node'],
    options: LINT_OPTIONS,
    categories: LINT_CATEGORIES,
    // The rules every workspace holds (lint/oxlint.ts at the root).
    rules: BASE_RULES,
    overrides: [
      {
        // generate.mjs is a runnable demo script: printing its report is the
        // product, and it is plain JS with no types for the type-aware rules.
        files: ['**/*.mjs'],
        rules: {
          'no-console': 'off',
          'typescript/no-unsafe-argument': 'off',
          'typescript/no-unsafe-member-access': 'off',
        },
      },
    ],
  },
  // Style (printWidth / quotes / semicolons / import sorting) is inherited from the root
  // vite.config.ts; only the paths this workspace skips are declared here.
})
