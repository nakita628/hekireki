import { resolve } from 'node:path'

import { defineConfig } from 'vite-plus'

const __dirname = import.meta.dirname

export default defineConfig({
  build: {
    sourcemap: true,
  },
  test: {
    setupFiles: [resolve(__dirname, 'vitest.setup.ts')],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: ['packages/hekireki/src/**/*.ts'],
      exclude: ['packages/hekireki/src/**/*.test.ts'],
      reporter: ['text', 'json', 'html'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['packages/hekireki/src/**/*.test.ts'],
        },
      },
      {
        // Validity checks for the generated foreign-language code: each target
        // is regenerated from test/schema.prisma and then checked in its own
        // toolchain. A toolchain that is not installed skips rather than fails,
        // so `vp test` stays runnable without every language present.
        extends: true,
        test: {
          name: 'lang',
          include: ['test/lang/*.test.ts'],
          globalSetup: [resolve(__dirname, 'test/lang/setup.ts')],
          // cargo check, bundle install and mix deps.get dominate; they share
          // one harness tree per language, so the files run one at a time.
          fileParallelism: false,
          testTimeout: 900_000,
          hookTimeout: 900_000,
        },
      },
    ],
  },
  lint: {
    // test/harness/** is generator output plus foreign-toolchain scaffolding
    // whose TypeScript (drizzle) resolves only through its own tsconfig.
    ignorePatterns: ['dist/**', 'test/harness/**'],
    // Setting `plugins` replaces oxlint's default list — restate the defaults, then add import.
    plugins: ['typescript', 'unicorn', 'oxc', 'import'],
    options: {
      typeAware: true,
    },
    categories: {
      suspicious: 'error',
    },
    rules: {
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-param-reassign': 'error',
      // Codegen closures intentionally reuse names like `model` / `field`.
      'no-shadow': 'off',
      'typescript/no-explicit-any': 'error',
      'typescript/no-non-null-assertion': 'error',
      'typescript/consistent-type-imports': 'error',
      'typescript/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      'typescript/no-floating-promises': 'error',
      'typescript/await-thenable': 'error',
      'typescript/no-misused-promises': 'error',
      // Per-generator emit helpers are defined inside the function they serve.
      'unicorn/consistent-function-scoping': 'off',
      // Guard-clause early returns (bare `return`) beside value returns are idiomatic here.
      'typescript/consistent-return': 'off',
      // `__dirname` here is the Node convention, not a private-member marker.
      'no-underscore-dangle': 'off',
      // generator ⇄ helper mutual recursion is by design.
      'import/no-cycle': 'off',
      'import/no-self-import': 'error',
      'import/no-duplicates': 'error',
    },
    // Architecture rules for packages/hekireki/src: each directory may import only the
    // siblings listed in its message. Regexes match relative specifiers only, so external
    // packages never collide with a banned directory name.
    overrides: [
      {
        // Tests build DMMF fixtures by hand; asserting them into the real
        // ReadonlyDeep<DMMF.*> shapes is the sanctioned `as` exception.
        files: ['**/*.test.ts'],
        rules: {
          'typescript/consistent-type-assertions': 'off',
          'typescript/no-unsafe-type-assertion': 'off',
          'typescript/no-explicit-any': 'off',
        },
      },
      {
        files: [
          'packages/hekireki/src/utils/**',
          'packages/hekireki/src/format/**',
          'packages/hekireki/src/fsp/**',
          'packages/hekireki/src/cli/**',
        ],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                {
                  regex: '^\\.\\./',
                  message: 'leaf module: no project-internal imports allowed',
                },
              ],
            },
          ],
        },
      },
      {
        files: ['packages/hekireki/src/emit/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                {
                  regex: '^(\\.\\./)+(bin|cli|core|generator|helper|utils)(/.*)?$',
                  message: 'emit may only import format, fsp',
                },
              ],
            },
          ],
        },
      },
      {
        files: ['packages/hekireki/src/generator/**', 'packages/hekireki/src/helper/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                {
                  regex: '^(\\.\\./)+(bin|cli|core|emit|format|fsp)(/.*)?$',
                  message: 'generator and helper may only import utils and each other',
                },
              ],
            },
          ],
        },
      },
      {
        files: ['packages/hekireki/src/core/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                {
                  regex: '^(\\.\\./)+(bin|cli)(/.*)?$',
                  message: 'core may only import utils, generator, helper, emit, format, fsp',
                },
              ],
            },
          ],
        },
      },
      {
        files: ['packages/hekireki/src/bin/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                {
                  regex: '^(\\.\\./)+(cli|emit|format|fsp|generator|helper|utils)(/.*)?$',
                  message: 'bin may only import core',
                },
              ],
            },
          ],
        },
      },
    ],
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
