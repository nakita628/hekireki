import { defineConfig } from 'vite-plus'

export default defineConfig({
  test: {
    // Validity checks for the generated foreign-language code: each target is
    // regenerated from prisma/schema.prisma and then checked in its own toolchain. A
    // toolchain that is not installed skips rather than fails, so `vp test`
    // stays runnable without every language present.
    include: ['lang/*.test.ts'],
    globalSetup: ['./lang/setup.ts'],
    // cargo check, bundle install and mix deps.get dominate; they share one
    // harness tree per language, so the files run one at a time.
    fileParallelism: false,
    testTimeout: 900_000,
    hookTimeout: 900_000,
  },
  lint: {
    // harness/** is generator output plus foreign-toolchain scaffolding whose
    // TypeScript resolves only through its own tsconfig or not at all
    // (kysely/zod live in packages/hekireki).
    ignorePatterns: ['**/node_modules/**', 'harness/**'],
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
    // Rules in the correctness / suspicious / perf categories are already errors via
    // `categories` above and are not restated; this list only adds rules from the
    // pedantic / style / restriction / nursery categories, which no category enables.
    rules: {
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-param-reassign': ['error', { props: true }],
      'no-console': 'error',
      'no-plusplus': 'error',
      'typescript/no-explicit-any': 'error',
      'typescript/no-non-null-assertion': 'error',
      'typescript/consistent-type-imports': 'error',
      'typescript/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      'typescript/no-misused-promises': 'error',
      'typescript/require-await': 'error',
      'typescript/prefer-readonly': 'error',
      'typescript/prefer-nullish-coalescing': 'error',
      'typescript/switch-exhaustiveness-check': 'error',
      'typescript/no-unsafe-argument': 'error',
      'typescript/no-unsafe-assignment': 'error',
      'typescript/no-unsafe-member-access': 'error',
      'typescript/no-unsafe-call': 'error',
      'typescript/no-unsafe-return': 'error',
      'unicorn/no-array-for-each': 'error',
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
          // The other vitest rules this suite relies on (no-focused-tests, expect-expect, ...)
          // sit in the correctness / suspicious categories, so enabling the plugin is enough.
          // The Result-returning APIs are asserted by narrowing the union first
          // (`if (!result.ok) expect(result.error)…`), which reads as conditional.
          'vitest/no-conditional-expect': 'off',
        },
      },
      {
        // The harness runners report to stdout, and they install their toolchain
        // in `beforeAll` and assert that the install itself succeeded — a failed
        // setup must fail loudly, not surface as an unrelated assertion later.
        files: ['lang/**'],
        plugins: ['vitest'],
        rules: {
          'no-console': 'off',
          'vitest/no-standalone-expect': 'off',
        },
      },
    ],
  },
  // Style (printWidth / quotes / semicolons / import sorting) is inherited from the root
  // vite.config.ts; only the paths this workspace skips are declared here.
  fmt: {
    // harness/** is generator output whose bytes come from the generators' own
    // oxfmt pass; reformatting would make every regeneration a spurious diff.
    ignorePatterns: ['**/node_modules/**', 'harness/**'],
  },
})
