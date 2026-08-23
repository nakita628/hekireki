import { defineConfig } from 'vite-plus'

// Architecture rules for packages/hekireki/src: each directory may import only the
// siblings listed in its message. Regexes match relative specifiers only, so external
// packages never collide with a banned directory name.
const LAYERS = [
  {
    dirs: ['utils', 'format', 'fsp', 'cli'],
    regex: '^\\.\\./',
    message: 'leaf module: no project-internal imports allowed',
  },
  {
    dirs: ['emit'],
    regex: '^(\\.\\./)+(bin|cli|core|generator|helper|utils)(/.*)?$',
    message: 'emit may only import format, fsp',
  },
  {
    dirs: ['generator', 'helper'],
    regex: '^(\\.\\./)+(bin|cli|core|emit|format|fsp)(/.*)?$',
    message: 'generator and helper may only import utils and each other',
  },
  {
    dirs: ['core'],
    regex: '^(\\.\\./)+(bin|cli)(/.*)?$',
    message: 'core may only import utils, generator, helper, emit, format, fsp',
  },
  {
    dirs: ['bin'],
    regex: '^(\\.\\./)+(cli|emit|format|fsp|generator|helper|utils)(/.*)?$',
    message: 'bin may only import core',
  },
]

export default defineConfig({
  build: {
    sourcemap: true,
  },
  test: {
    setupFiles: ['./vitest.setup.ts'],
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
          globalSetup: ['./test/lang/setup.ts'],
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
    // test/harness/** and example/generated/** are generator output plus
    // foreign-toolchain scaffolding whose TypeScript resolves only through
    // its own tsconfig or not at all (kysely/zod live in packages/hekireki).
    ignorePatterns: ['**/node_modules/**', '**/dist/**', 'test/harness/**', 'example/generated/**'],
    // Setting `plugins` replaces oxlint's default list — restate the defaults, then add import.
    plugins: ['typescript', 'unicorn', 'oxc', 'import'],
    options: {
      typeAware: true,
      typeCheck: true,
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
      'import/no-cycle': 'error',
      'import/no-self-import': 'error',
      'import/no-duplicates': 'error',
    },
    overrides: [
      {
        // The CLI entry and the example / lang-harness runners report to stdout:
        // their console output is the product, not a stray debug statement.
        files: ['packages/hekireki/src/cli/index.ts', 'example/**', 'test/lang/**'],
        rules: {
          'no-console': 'off',
        },
      },
      {
        // Plain JS with no types: the type-aware rules only ever see `any` here.
        files: ['example/**/*.mjs'],
        rules: {
          'typescript/no-unsafe-argument': 'off',
          'typescript/no-unsafe-member-access': 'off',
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
      {
        // The lang harness installs its toolchain in `beforeAll` and asserts
        // that the install itself succeeded — a failed setup must fail loudly,
        // not surface as an unrelated assertion further down.
        files: ['test/lang/**'],
        plugins: ['vitest'],
        rules: {
          'vitest/no-standalone-expect': 'off',
        },
      },
      ...LAYERS.map(({ dirs, regex, message }) => ({
        files: dirs.map((dir) => `packages/hekireki/src/${dir}/**`),
        rules: {
          'no-restricted-imports': ['error', { patterns: [{ regex, message }] }] satisfies [
            'error',
            { patterns: { regex: string; message: string }[] },
          ],
        },
      })),
    ],
  },
  fmt: {
    // test/harness/** and example/generated/** are generator output whose
    // bytes come from the generators' own oxfmt pass; reformatting (import
    // sorting included) would make every regeneration a spurious diff.
    ignorePatterns: ['**/node_modules/**', '**/dist/**', 'test/harness/**', 'example/generated/**'],
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
