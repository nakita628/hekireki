// The oxlint rules every workspace holds: packages/hekireki, test and example spread these into
// their own `lint` block and add what is theirs (the convention plugin, the Studio's layers, the
// jsdoc rules). One list, so a rule added for the package reaches the tests of the generated code
// and the example too.

import type { OxlintConfig } from 'vite-plus/lint'

type Rules = NonNullable<OxlintConfig['rules']>

export const LINT_OPTIONS = {
  typeAware: true,
  typeCheck: true,
  // A rule that stops firing must have its `oxlint-disable` comment deleted with it, otherwise the
  // suppression silently outlives its reason.
  reportUnusedDisableDirectives: 'deny',
  // Nothing here is configured as a warning; this keeps a rule that defaults to `warn` from
  // slipping through `vp check` unnoticed.
  denyWarnings: true,
} satisfies OxlintConfig['options']

export const LINT_CATEGORIES = {
  correctness: 'error',
  suspicious: 'error',
  perf: 'error',
} satisfies OxlintConfig['categories']

// Rules in the correctness / suspicious / perf categories are already errors via the categories
// above and are not restated; these add rules from the pedantic / style / restriction / nursery
// categories, which no category enables.
export const BASE_RULES: Rules = {
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
  // Code a reader should not have to trace: a block nested four deep, a function with more than
  // fifteen paths through it, a callback in a callback in a callback, a ternary inside a ternary.
  // Each is a function or a name waiting to be written.
  'max-depth': ['error', { max: 3 }],
  complexity: ['error', { max: 15 }],
  'max-nested-callbacks': ['error', { max: 3 }],
  'no-nested-ternary': 'error',
  // A condition is a boolean: `x !== undefined`, `s !== ''`, `n > 0`, never a string, a number or
  // an object that JavaScript coerces.
  'typescript/strict-boolean-expressions': 'error',
  // Old or risky APIs, and spellings that read as mistakes.
  'no-alert': 'error',
  'no-constructor-return': 'error',
  'no-promise-executor-return': 'error',
  'prefer-spread': 'error',
  'symbol-description': 'error',
  'import/no-amd': 'error',
  'unicorn/no-instanceof-array': 'error',
  'unicorn/prefer-date-now': 'error',
  'unicorn/prefer-response-static-json': 'error',
  'unicorn/text-encoding-identifier-case': 'error',
  'unicorn/throw-new-error': 'error',
  'typescript/adjacent-overload-signatures': 'error',
  'typescript/ban-tslint-comment': 'error',
  'typescript/unified-signatures': 'error',
  // A promise is returned as it is; `return await` belongs only inside try / catch.
  'typescript/return-await': 'error',
  'typescript/use-unknown-in-catch-callback-variable': 'error',
  // `unicorn/number-literal-case` stays off: it asks for `0xFF`, and oxfmt writes `0xff`.
  // `unicorn/no-array-method-this-argument` stays off: it reads `Effect.forEach(xs, f, options)`
  // and `Stream.map` as an array method given a `thisArg`.
}

// The tests, through the jest plugin (its rules read `describe` / `it` / `expect` by name, which
// is how the tests call them through `vite-plus/test`).
export const JEST_RULES: Rules = {
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
  'jest/prefer-to-contain': 'error',
  'jest/max-nested-describe': 'error',
  // A test asserts unconditionally: a case that branches is two cases (it.each, or two its).
  'jest/no-conditional-in-test': 'error',
}
