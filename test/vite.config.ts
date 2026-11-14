import { defineConfig } from 'vite-plus'

export default defineConfig({
  test: {
    // Validity checks for the generated foreign-language code: each target is
    // regenerated from prisma/schema.prisma and then checked in its own toolchain. A
    // toolchain that is not installed skips rather than fails, so `vp test`
    // stays runnable without every language present.
    // db/*.test.ts runs `hekireki seed`, the Prisma Client page of `hekireki studio` and
    // `hekireki migrate check` / `plan` against real PostgreSQL and MySQL servers named by
    // HEKIREKI_SEED_PG / HEKIREKI_SEED_MYSQL (the migration tests also on CockroachDB, named by
    // HEKIREKI_SEED_COCKROACH), and skips without them (see examples/compose.yaml).
    include: ['lang/*.test.ts', 'db/*.test.ts'],
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
    // Setting `plugins` replaces oxlint's default list — restate the defaults, then add import,
    // and jest, whose rules read `describe` / `it` / `expect` by name as packages/hekireki does.
    plugins: ['typescript', 'unicorn', 'oxc', 'import', 'promise', 'node', 'jest'],
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
      // The tests (jest plugin). Codegen tests own a byte-for-byte contract: equality is strict,
      // a primitive is compared with toBe, and nothing is a snapshot — the expected text is in the
      // test, where a reviewer reads it. A test runs, is named once, and asserts unconditionally.
      'jest/valid-expect': ['error', { maxArgs: 2 }],
      'jest/no-identical-title': 'error',
      'jest/no-disabled-tests': 'error',
      'jest/no-focused-tests': 'error',
      'jest/no-duplicate-hooks': 'error',
      'jest/no-test-return-statement': 'error',
      // A hook that sets up a toolchain or a database asserts that it did.
      'jest/no-standalone-expect': [
        'error',
        { additionalTestBlockFunctions: ['beforeAll', 'beforeEach', 'afterAll', 'afterEach'] },
      ],
      'jest/no-done-callback': 'error',
      'jest/no-export': 'error',
      'jest/no-alias-methods': 'error',
      'jest/prefer-to-be': 'error',
      'jest/prefer-strict-equal': 'error',
      'jest/prefer-to-have-length': 'error',
      'jest/prefer-equality-matcher': 'error',
      'jest/prefer-comparison-matcher': 'error',
      'jest/prefer-todo': 'error',
      'jest/no-restricted-matchers': [
        'error',
        {
          toMatchSnapshot: 'Write the expected value out with toBe / toStrictEqual.',
          toMatchInlineSnapshot: 'Write the expected value out with toBe / toStrictEqual.',
          toThrowErrorMatchingSnapshot: 'Name the error the call throws.',
          toThrowErrorMatchingInlineSnapshot: 'Name the error the call throws.',
          toEqual: 'Use toStrictEqual: toEqual passes on undefined properties and other classes.',
        },
      ],
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
        // One scenario runs on PostgreSQL, MySQL, MariaDB and CockroachDB, and what each server
        // does with it differs: the expectation branches on the server it runs on.
        files: ['db/**'],
        rules: { 'jest/no-conditional-expect': 'off' },
      },
      {
        // Tests build DMMF fixtures by hand; asserting them into the real
        // ReadonlyDeep<DMMF.*> shapes is the sanctioned `as` exception
        // (CONTRIBUTING.md: tests are exempt from `no as`). Only the rules that police those casts are
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
          // Fixtures and stubs are defined per test on purpose (CONTRIBUTING.md:
          // no shared logic helpers between tests), which is exactly what this rule flags.
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
})
