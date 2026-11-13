// Rules that keep a failure from disappearing.

import { TEST_FILE, filenameOf, isAsConst, isWithin, memberOf } from './helpers.js'

const RECOVER =
  /^(catch|catchAll|catchCause|catchAllCause|catchTag|catchTags|catchIf|catchSome|catchSomeCause|orElse|orElseSucceed|orElseFail)$/u

export const failureRules = {
  // Why: an assertion only tells the compiler to trust you; nothing is checked at runtime.
  //   NG: const config = value as Config
  //   NG: const config = <Config>value
  //   OK: if (isConfig(value)) { … }        // narrow with a type guard
  //   OK: const config = Config.parse(value) // or parse it with its schema
  //   OK: const KINDS = ['sqlite', 'postgresql'] as const
  'no-type-assertion': {
    meta: { docs: { description: 'disallow type assertions except `as const`' } },
    create(context) {
      if (TEST_FILE.test(filenameOf(context))) return {}
      const message =
        'Do not use a type assertion. It only tells the compiler to trust you and checks nothing at runtime. Narrow the value with a type guard (or parse it with its schema) so the type is earned, not asserted. `as const` is fine.'
      function check(node) {
        if (!isAsConst(node)) context.report({ node, message })
      }
      return { TSAsExpression: check, TSTypeAssertion: check }
    },
  },

  // Why: a catch-all branch swallows every failure added later. Ending with Match.exhaustive
  //      turns a new failure into a type error instead.
  //   NG: Match.value(error).pipe(Match.tag('DatabaseError', ...), Match.orElse(() => ...))
  //   NG: Match.value(error).pipe(Match.tag('DatabaseError', ...))   // no end
  //   OK: Match.value(error).pipe(Match.tag('A', ...), Match.tag('B', ...), Match.exhaustive)
  'match-exhaustive': {
    meta: {
      docs: {
        description: 'Match pipelines must end with Match.exhaustive; Match.orElse is not allowed',
      },
    },
    create(context) {
      return {
        MemberExpression(node) {
          if (memberOf(node, 'Match') !== 'orElse') return
          context.report({
            node,
            message:
              'Do not use `Match.orElse`. A catch-all branch swallows every failure added later without a type error. List each `_tag` with `Match.tag` and end with `Match.exhaustive`.',
          })
        },
        CallExpression(node) {
          const callee = node.callee
          if (
            callee.type !== 'MemberExpression' ||
            callee.computed ||
            callee.property.type !== 'Identifier' ||
            callee.property.name !== 'pipe'
          ) {
            return
          }
          if (memberOf(callee.object.callee, 'Match') !== 'value') return
          if (memberOf(node.arguments.at(-1), 'Match') === 'exhaustive') return
          context.report({
            node,
            message:
              'End this `Match.value(...).pipe(...)` with `Match.exhaustive`, so that adding a new failure to the Effect makes this a type error instead of an unhandled case.',
          })
        },
      }
    },
  },

  // Why: a failure recovered from without a trace is gone for good. A recovery must log the
  //      failure or turn it into another named failure; `Effect.ignore` leaves nothing.
  //   NG: removePath(path).pipe(Effect.catch(() => Effect.void))
  //   NG: removePath(path).pipe(Effect.ignore)
  //   OK: removePath(path).pipe(Effect.catch((error) => Effect.logWarning('cannot remove', error)))
  //   OK: readRow().pipe(Effect.catch(() => Effect.fail(new UnknownModelError({ model }))))
  'catch-must-log': {
    meta: {
      docs: {
        description: 'recovering from a failure must log it or turn it into another failure',
      },
    },
    create(context) {
      if (TEST_FILE.test(filenameOf(context))) return {}
      // The recoveries still being walked, by their call node: which one, and whether a log or a
      // failure has been seen inside it yet.
      const open = new Map()
      return {
        // `Effect.ignore` is passed as a value (`pipe(Effect.ignore)`), so it is found by reference.
        MemberExpression(node) {
          const method = memberOf(node, 'Effect')
          if (method === null || !method.startsWith('ignore')) return
          context.report({
            node,
            message: `Do not use \`Effect.${method}\`: it drops the failure without a trace. Use \`Effect.catch((error) => Effect.logError('...', error))\` so the failure is at least logged.`,
          })
        },
        CallExpression(node) {
          const method = memberOf(node.callee, 'Effect')
          if (method === null) return
          if (RECOVER.test(method)) {
            open.set(node, { method, handled: false })
            return
          }
          if (!method.startsWith('log') && method !== 'fail' && method !== 'failSync') return
          for (const [recovery, frame] of open) {
            if (isWithin(node, recovery)) open.set(recovery, { ...frame, handled: true })
          }
        },
        'CallExpression:exit'(node) {
          const frame = open.get(node)
          if (frame === undefined) return
          open.delete(node)
          if (frame.handled) return
          context.report({
            node,
            message: `\`Effect.${frame.method}\` swallows the failure. Log it (\`Effect.logError('...', error)\`) or turn it into another named failure (\`Effect.fail(new XxxError(...))\`) so it never disappears silently.`,
          })
        },
      }
    },
  },
}
