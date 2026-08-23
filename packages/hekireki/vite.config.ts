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
    testTimeout: 30_000,
  },
  lint: {
    // Node-only package: declaring the runtime is what lets rules that
    // resolve globals (`no-undef`, `unicorn/prefer-global-this`) tell `process`
    // and `Buffer` apart from a typo.
    env: { node: true, es2024: true },
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
      'no-undef': 'error',
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
      // --- Hardening beyond the enabled categories -------------------------
      // Everything below sits in `pedantic` / `style` / `restriction` /
      // `nursery`, which oxlint leaves off by default. Only rules reachable
      // from this codebase are listed: it is pure functions over Prisma DMMF
      // plus template strings, so class / enum / namespace / DOM rules are
      // deliberately absent rather than enabled as dead weight.

      // Escape hatches out of the type system, and the unsound types that
      // survive `strict`.
      'typescript/ban-ts-comment': 'error',
      'typescript/prefer-ts-expect-error': 'error',
      'typescript/no-unsafe-function-type': 'error',
      'typescript/no-empty-object-type': 'error',
      'typescript/no-invalid-void-type': 'error',
      'typescript/no-non-null-asserted-nullish-coalescing': 'error',
      'typescript/non-nullable-type-assertion-style': 'error',
      // Type-aware: flags calls into APIs their own `@deprecated` tag retired,
      // which plain `tsc` only surfaces as an editor strikethrough.
      'typescript/no-deprecated': 'error',
      'typescript/no-confusing-void-expression': 'error',
      'typescript/no-dynamic-delete': 'error',

      // Declaration style. `consistent-type-definitions: 'type'` locks in the
      // repo-wide `type X = {...}`; the default of this rule is the opposite
      // ('interface'), so the option is load-bearing, not decoration.
      'typescript/consistent-type-definitions': ['error', 'type'],
      'typescript/consistent-type-exports': 'error',
      'typescript/consistent-generic-constructors': 'error',
      'typescript/array-type': 'error',
      'typescript/method-signature-style': 'error',
      // Annotating what the initializer already proves works against
      // CLAUDE.md 型推論 #1.
      'typescript/no-inferrable-types': 'error',

      'typescript/dot-notation': 'error',
      'typescript/prefer-optional-chain': 'error',
      'typescript/prefer-for-of': 'error',
      'typescript/prefer-find': 'error',
      'typescript/prefer-includes': 'error',
      'typescript/prefer-string-starts-ends-with': 'error',
      'typescript/prefer-function-type': 'error',
      'typescript/prefer-reduce-type-parameter': 'error',
      // ESM-only package: a `require` call would not survive the build.
      'typescript/no-require-imports': 'error',
      'typescript/no-import-type-side-effects': 'error',

      // Rejections and throws must carry an Error, or the CLI reports
      // `[object Object]` instead of an actionable message
      // (CLAUDE.md 公開 API #5).
      'typescript/only-throw-error': 'error',
      'typescript/prefer-promise-reject-errors': 'error',
      'no-throw-literal': 'error',
      'unicorn/error-message': 'error',
      'unicorn/prefer-type-error': 'error',

      // Node / ESM hygiene.
      'unicorn/prefer-node-protocol': 'error',
      'unicorn/prefer-module': 'error',
      'unicorn/prefer-global-this': 'error',
      'unicorn/require-module-specifiers': 'error',
      'unicorn/import-style': 'error',
      'unicorn/prefer-export-from': 'error',
      // `no-abusive-eslint-disable` pairs with `reportUnusedDisableDirectives`
      // above: a suppression must name the rule it silences and must still be
      // earning its place.
      'unicorn/no-abusive-eslint-disable': 'error',
      'unicorn/no-anonymous-default-export': 'error',

      // String and array work: this is what a codegen library does all day.
      'prefer-template': 'error',
      'no-useless-concat': 'error',
      'no-multi-str': 'error',
      'unicorn/consistent-template-literal-escape': 'error',
      'unicorn/explicit-length-check': 'error',
      'unicorn/consistent-existence-index-check': 'error',
      'unicorn/require-array-join-separator': 'error',
      'unicorn/prefer-at': 'error',
      'unicorn/prefer-negative-index': 'error',
      'unicorn/prefer-array-index-of': 'error',
      'unicorn/prefer-array-flat': 'error',
      'unicorn/prefer-object-from-entries': 'error',
      'unicorn/prefer-string-trim-start-end': 'error',
      'unicorn/prefer-code-point': 'error',
      'unicorn/consistent-empty-array-spread': 'error',
      // `.push(a); .push(b)` and `?? []` fed to a collection that already
      // accepts the empty case.
      'unicorn/prefer-single-call': 'error',
      'unicorn/no-useless-collection-argument': 'error',
      'unicorn/no-useless-fallback-in-spread': 'error',
      'unicorn/no-unnecessary-array-flat-depth': 'error',
      'unicorn/no-magic-array-flat-depth': 'error',
      'unicorn/no-unnecessary-slice-end': 'error',
      'unicorn/no-length-as-slice-end': 'error',
      'unicorn/no-unreadable-array-destructuring': 'error',
      // Mutating a literal that was just constructed hides the mutation from
      // the reader, which is the opposite of CLAUDE.md 型安全 #4.
      'unicorn/no-immediate-mutation': 'error',

      // Regex and numbers.
      'unicorn/prefer-regexp-test': 'error',
      'prefer-regex-literals': 'error',
      'no-div-regex': 'error',
      'no-regex-spaces': 'error',
      'unicorn/prefer-number-properties': 'error',
      'unicorn/prefer-math-min-max': 'error',
      'unicorn/prefer-math-trunc': 'error',
      'unicorn/prefer-modern-math-apis': 'error',
      'unicorn/numeric-separators-style': 'error',
      'unicorn/no-zero-fractions': 'error',
      'unicorn/escape-case': 'error',
      'unicorn/no-hex-escape': 'error',
      radix: 'error',
      'prefer-numeric-literals': 'error',
      'prefer-exponentiation-operator': 'error',
      'no-implicit-coercion': 'error',
      'unicorn/no-typeof-undefined': 'error',

      // Control flow and declarations. `curly` is set to `multi-line` rather
      // than `all` so the guard-clause form CLAUDE.md 制御フロー #2 endorses
      // (`if (!x) return null` on one line) stays legal, while a body that
      // wraps onto its own line must be braced.
      curly: ['error', 'multi-line'],
      'no-else-return': 'error',
      'no-useless-return': 'error',
      'no-lonely-if': 'error',
      'unicorn/prefer-logical-operator-over-ternary': 'error',
      'unicorn/prefer-default-parameters': 'error',
      'unicorn/no-object-as-default-parameter': 'error',
      'unicorn/no-unreadable-iife': 'error',
      'unicorn/no-useless-switch-case': 'error',
      'default-case-last': 'error',
      'default-param-last': 'error',
      'no-fallthrough': 'error',
      'no-case-declarations': 'error',
      'array-callback-return': 'error',
      'no-loop-func': 'error',
      'no-inner-declarations': 'error',
      'block-scoped-var': 'error',
      'init-declarations': 'error',
      'no-redeclare': 'error',
      'no-multi-assign': 'error',
      'no-return-assign': 'error',
      'no-sequences': 'error',
      'no-useless-assignment': 'error',
      'no-unreachable-loop': 'error',
      // Hoisted `function` declarations are safe to reference above their
      // definition; `const` / `class` are the TDZ hazard this rule is for.
      'no-use-before-define': ['error', { functions: false }],
      'func-style': ['error', 'declaration', { allowArrowFunctions: true }],
      'arrow-body-style': 'error',
      'prefer-arrow-callback': 'error',
      'guard-for-in': 'error',
      'no-labels': 'error',
      'no-label-var': 'error',
      'no-extra-label': 'error',
      'no-lone-blocks': 'error',
      yoda: 'error',
      'no-self-compare': 'error',

      // Objects and globals.
      'object-shorthand': 'error',
      'operator-assignment': 'error',
      'prefer-object-spread': 'error',
      'prefer-object-has-own': 'error',
      'no-prototype-builtins': 'error',
      'no-object-constructor': 'error',
      'no-array-constructor': 'error',
      'no-new-wrappers': 'error',
      'unicorn/new-for-builtins': 'error',
      'prefer-rest-params': 'error',
      'no-implicit-globals': 'error',
      'no-extra-bind': 'error',
      'no-useless-computed-key': 'error',
      'unicorn/no-await-expression-member': 'error',
      'unicorn/no-useless-promise-resolve-reject': 'error',
      'unicorn/prefer-structured-clone': 'error',
      'unicorn/prefer-optional-catch-binding': 'error',
      // Every `catch` in this package binds `e`; the rule's own default is
      // `error`, so the option is what pins the existing convention.
      'unicorn/catch-error-name': ['error', { name: 'e' }],

      // Code injection surfaces (`eval` itself is already `correctness`).
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-bitwise': 'error',
      'no-void': 'error',
      'no-empty': 'error',
      'no-empty-function': 'error',
      'unicode-bom': 'error',
      'new-cap': 'error',
      // A `${...}` inside a single-quoted string is almost always a template
      // literal that lost its backticks — a real hazard when the product is
      // emitted source. Test fixtures that assert on that exact text opt out
      // in the `*.test.ts` override below.
      'no-template-curly-in-string': 'error',
      // CLAUDE.md コメント #1 keeps decisions in git log / CHANGELOG / PR, not
      // in the source; a parked TODO is the same debt in a different shape.
      'no-warning-comments': 'error',

      // Module graph. `no-default-export` is the lint-side twin of CLAUDE.md
      // 公開 API #1; `extensions` keeps relative specifiers `.js`-suffixed,
      // which NodeNext resolution requires at runtime and `tsc` does not check.
      'import/no-default-export': 'error',
      'import/extensions': ['error', 'always', { ignorePackages: true }],
      'import/first': 'error',
      'import/export': 'error',
      'import/unambiguous': 'error',
      'import/no-commonjs': 'error',
      'import/no-absolute-path': 'error',
      'import/no-mutable-exports': 'error',
      'import/no-empty-named-blocks': 'error',
      'import/no-named-default': 'error',
      'import/no-namespace': 'error',
      'import/no-unassigned-import': 'error',
      'import/no-named-as-default': 'error',
      'import/no-named-as-default-member': 'error',
      'import/no-anonymous-default-export': 'error',
      'import/consistent-type-specifier-style': 'error',
      // 120+ of the 123 source files are already kebab-case; this stops the
      // odd camelCase one from re-appearing.
      'unicorn/filename-case': 'error',
    },
    overrides: [
      {
        // Vite's config contract is a default export; the ban stays on for src.
        files: ['vite.config.ts'],
        rules: {
          'import/no-default-export': 'off',
        },
      },
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
          // Fixtures feed and assert on source text that contains a literal
          // `${...}`; here that is the value under test, not a lost backtick.
          'no-template-curly-in-string': 'off',
          'vitest/expect-expect': 'error',
          'vitest/require-mock-type-parameters': 'error',
          'vitest/no-identical-title': 'error',
          'vitest/valid-expect': 'error',
          'vitest/valid-title': 'error',
          'vitest/valid-describe-callback': 'error',
          // An `expect` outside a test case is never run and never reported.
          'vitest/no-standalone-expect': 'error',
          'vitest/no-test-return-statement': 'error',
          'vitest/no-test-prefixes': 'error',
          'vitest/no-duplicate-hooks': 'error',
          'vitest/prefer-hooks-on-top': 'error',
          'vitest/prefer-hooks-in-order': 'error',
          'vitest/consistent-test-it': 'error',
          'vitest/no-alias-methods': 'error',
          // `toStrictEqual` over `toEqual` matches the exact-match mandate in
          // CLAUDE.md テスト #1; `toEqual` ignores `undefined` properties and
          // would let a codegen regression through.
          'vitest/prefer-strict-equal': 'error',
          'vitest/prefer-equality-matcher': 'error',
          'vitest/prefer-called-with': 'error',
          'vitest/require-to-throw-message': 'error',
          'vitest/prefer-each': 'error',
          'vitest/prefer-spy-on': 'error',
          'vitest/no-mocks-import': 'error',
          // Snapshots are a partial-match assertion by another name, so they
          // are kept small and literal where they appear at all.
          'vitest/no-interpolation-in-snapshots': 'error',
          'vitest/no-large-snapshots': 'error',
        },
      },
      // Architecture rules for src: each directory may import only the siblings
      // listed in its message. Regexes match relative specifiers only, so external
      // packages never collide with a banned directory name.
      //
      // The `paths` half of each entry keeps raw `node:fs` out of everything but
      // `src/fsp` (the Result-wrapping I/O layer) and `src/cli`, so a throwing
      // `readFileSync` cannot reappear mid-pipeline. `no-restricted-imports` is
      // replaced wholesale — not merged — when two overrides both name it, which
      // is why the leaf directories are split into two blocks below instead of
      // sharing one.
      {
        files: ['src/utils/**', 'src/format/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              paths: [
                { name: 'node:fs', message: 'file I/O belongs in src/fsp' },
                { name: 'node:fs/promises', message: 'file I/O belongs in src/fsp' },
              ],
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
        // `src/fsp` owns node:fs; `src/cli` reads its own bundled assets.
        files: ['src/fsp/**', 'src/cli/**'],
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
              paths: [
                { name: 'node:fs', message: 'file I/O belongs in src/fsp' },
                { name: 'node:fs/promises', message: 'file I/O belongs in src/fsp' },
              ],
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
              paths: [
                { name: 'node:fs', message: 'file I/O belongs in src/fsp' },
                { name: 'node:fs/promises', message: 'file I/O belongs in src/fsp' },
              ],
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
              paths: [
                { name: 'node:fs', message: 'file I/O belongs in src/fsp' },
                { name: 'node:fs/promises', message: 'file I/O belongs in src/fsp' },
              ],
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
              paths: [
                { name: 'node:fs', message: 'file I/O belongs in src/fsp' },
                { name: 'node:fs/promises', message: 'file I/O belongs in src/fsp' },
              ],
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
      {
        // Last override wins for a given rule, so this must stay after the
        // architecture blocks above. Those rules describe the dependency graph
        // of the shipped modules; a test sits outside that graph and reads the
        // filesystem back to prove what the I/O layer actually wrote.
        files: ['**/*.test.ts'],
        rules: {
          'no-restricted-imports': 'off',
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
