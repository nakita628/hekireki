import { defineConfig } from 'vite-plus'

import { BASE_RULES, JEST_RULES, LINT_CATEGORIES, LINT_OPTIONS } from '../lint/oxlint.ts'

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
    options: LINT_OPTIONS,
    categories: LINT_CATEGORIES,
    // The rules every workspace holds (lint/oxlint.ts at the root).
    rules: { ...BASE_RULES, ...JEST_RULES },
    overrides: [
      {
        // One scenario runs on PostgreSQL, MySQL, MariaDB and CockroachDB, and what each server
        // does with it differs: the expectation branches on the server it runs on.
        files: ['db/**'],
        rules: { 'jest/no-conditional-expect': 'off', 'jest/no-conditional-in-test': 'off' },
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
