import { defineConfig } from 'vite-plus'

export default defineConfig({
  lint: {
    // generated/** is generator output, committed so each target's syntax can be
    // reviewed by eye.
    ignorePatterns: ['**/node_modules/**', 'generated/**'],
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
  fmt: {
    // generated/** is generator output whose bytes come from the generators' own
    // oxfmt pass; reformatting would make every regeneration a spurious diff.
    ignorePatterns: ['**/node_modules/**', 'generated/**'],
  },
})
