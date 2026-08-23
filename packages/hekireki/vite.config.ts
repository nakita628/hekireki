import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    entry: {
      'cli/index': './src/cli/index.ts',
      'bin/atlas': './src/bin/atlas.ts',
      'bin/zod': './src/bin/zod.ts',
      'bin/valibot': './src/bin/valibot.ts',
      'bin/mermaid-er': './src/bin/mermaid-er.ts',
      'bin/ecto': './src/bin/ecto.ts',
      'bin/arktype': './src/bin/arktype.ts',
      'bin/effect': './src/bin/effect.ts',
      'bin/dbml': './src/bin/dbml.ts',
      'bin/docs': './src/bin/docs.ts',
      'bin/drizzle': './src/bin/drizzle.ts',
      'bin/typebox': './src/bin/typebox.ts',
      'bin/ajv': './src/bin/ajv.ts',
      'bin/sqlalchemy': './src/bin/sqlalchemy.ts',
      'bin/gorm': './src/bin/gorm.ts',
      'bin/kysely': './src/bin/kysely.ts',
      'bin/pydantic': './src/bin/pydantic.ts',
      'bin/sea-orm': './src/bin/sea-orm.ts',
      'bin/activerecord': './src/bin/activerecord.ts',
      'bin/eloquent': './src/bin/eloquent.ts',
    },
    format: 'esm',
    dts: true,
    outDir: 'dist',
    clean: true,
    target: 'node20',
    shims: true,
    // `bin` and `exports` point at `.js` / `.d.ts`, not tsdown's `.mjs` default.
    fixedExtension: false,
  },
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 30000,
  },
  lint: {
    ignorePatterns: ['**/node_modules/**', '**/dist/**'],
    // Setting `plugins` replaces oxlint's default list — restate the defaults, then add import.
    plugins: ['typescript', 'unicorn', 'oxc', 'import', 'promise', 'node'],
    options: {
      typeAware: true,
      typeCheck: true,
      // A rule that stops firing must have its `oxlint-disable` comment deleted
      // with it, otherwise the suppression silently outlives its reason.
      reportUnusedDisableDirectives: 'deny',
      // Nothing here is configured as a warning; this keeps a rule that defaults
      // to `warn` from slipping through `vp check` unnoticed.
      denyWarnings: true,
    },
    categories: {
      correctness: 'error',
      suspicious: 'error',
      perf: 'error',
    },
    rules: {
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-param-reassign': ['error', { props: true }],
      'no-shadow': 'error',
      'no-underscore-dangle': 'error',
      'no-console': 'error',
      'no-plusplus': 'error',
      'no-await-in-loop': 'error',
      'no-unused-vars': 'error',
      'typescript/no-explicit-any': 'error',
      'typescript/no-non-null-assertion': 'error',
      'typescript/consistent-type-imports': 'error',
      'typescript/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      'typescript/no-unsafe-type-assertion': 'error',
      'typescript/no-unnecessary-type-assertion': 'error',
      'typescript/no-unnecessary-type-arguments': 'error',
      'typescript/no-floating-promises': 'error',
      'typescript/await-thenable': 'error',
      'typescript/no-misused-promises': 'error',
      'typescript/consistent-return': 'error',
      'typescript/require-await': 'error',
      'typescript/prefer-readonly': 'error',
      'typescript/prefer-nullish-coalescing': 'error',
      'typescript/switch-exhaustiveness-check': 'error',
      'typescript/no-unsafe-argument': 'error',
      'typescript/no-unsafe-assignment': 'error',
      'typescript/no-unsafe-member-access': 'error',
      'typescript/no-unsafe-call': 'error',
      'typescript/no-unsafe-return': 'error',
      'unicorn/consistent-function-scoping': 'error',
      'unicorn/no-array-for-each': 'error',
      'unicorn/no-array-sort': 'error',
      'unicorn/prefer-array-some': 'error',
      'unicorn/prefer-spread': 'error',
      'unicorn/prefer-string-replace-all': 'error',
      // Pedantic-category picks that fit a codegen library; the rest of that
      // category (max-lines, strict-boolean-expressions, …) is not adopted.
      'typescript/strict-void-return': 'error',
      'unicorn/prefer-string-slice': 'error',
      'unicorn/prefer-native-coercion-functions': 'error',
      'unicorn/prefer-import-meta-properties': 'error',
      'unicorn/no-lonely-if': 'error',
      'require-unicode-regexp': 'error',
      'import/no-cycle': 'error',
      'import/no-self-import': 'error',
      'import/no-duplicates': 'error',
      // promise / node rules sit outside the enabled categories, so the ones
      // that matter for an async Node CLI are named explicitly.
      'promise/param-names': 'error',
      'promise/valid-params': 'error',
      'promise/spec-only': 'error',
      'promise/no-new-statics': 'error',
      'promise/no-multiple-resolved': 'error',
      'promise/no-return-wrap': 'error',
      'promise/no-return-in-finally': 'error',
      'promise/no-nesting': 'error',
      'promise/no-promise-in-callback': 'error',
      'promise/no-callback-in-promise': 'error',
      'promise/catch-or-return': 'error',
      'promise/always-return': 'error',
      'promise/prefer-catch': 'error',
      'promise/prefer-await-to-then': 'error',
      'node/no-exports-assign': 'error',
      'node/no-new-require': 'error',
      'node/no-mixed-requires': 'error',
      'node/global-require': 'error',
      'node/no-path-concat': 'error',
      'node/no-top-level-await': 'error',
      'node/handle-callback-err': 'error',
      'node/callback-return': 'error',
    },
    overrides: [
      {
        // The CLI entry reports to stdout: its console output is the product,
        // not a stray debug statement.
        files: ['src/cli/index.ts'],
        rules: {
          'no-console': 'off',
        },
      },
      {
        // Tests build DMMF fixtures by hand; asserting them into the real
        // ReadonlyDeep<DMMF.*> shapes is the sanctioned `as` exception
        // (CLAUDE.md 型安全 #1). Only the rules that police those casts are
        // scoped off here, nothing else is.
        files: ['**/*.test.ts'],
        plugins: ['vitest'],
        rules: {
          'typescript/no-explicit-any': 'off',
          'typescript/consistent-type-assertions': 'off',
          'typescript/no-unsafe-type-assertion': 'off',
          'typescript/no-unsafe-argument': 'off',
          'typescript/no-unsafe-assignment': 'off',
          'typescript/no-unsafe-member-access': 'off',
          'typescript/no-unsafe-call': 'off',
          'typescript/no-unsafe-return': 'off',
          // Fixtures and stubs are defined per test on purpose (CLAUDE.md テスト
          // #5: no shared logic helpers), which is exactly what this rule flags.
          'unicorn/consistent-function-scoping': 'off',
          'vitest/no-focused-tests': 'error',
          'vitest/no-disabled-tests': 'error',
          // The Result-returning APIs are asserted by narrowing the union first
          // (`if (!result.ok) expect(result.error)…`), which reads as conditional.
          'vitest/no-conditional-expect': 'off',
          'vitest/no-commented-out-tests': 'error',
          'vitest/expect-expect': 'error',
          'vitest/require-mock-type-parameters': 'error',
        },
      },
      // Architecture rules for src: each directory may import only the siblings
      // listed in its message. Regexes match relative specifiers only, so external
      // packages never collide with a banned directory name.
      {
        files: ['src/utils/**', 'src/format/**', 'src/fsp/**', 'src/cli/**'],
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
        files: ['src/emit/**'],
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
        files: ['src/generator/**', 'src/helper/**'],
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
        files: ['src/core/**'],
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
        files: ['src/bin/**'],
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
})
