// Performance rules for the Studio server: work that is repeated where it need not be.

import { TEST_FILE, filenameOf, memberOf } from './helpers.js'

const ITERATING = new Set([
  'map',
  'flatMap',
  'filter',
  'forEach',
  'some',
  'every',
  'reduce',
  'find',
])
const LOOKUPS = new Set(['find', 'findIndex', 'filter', 'some', 'every', 'includes', 'indexOf'])
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'])
const LOOPS = new Set(['ForOfStatement', 'ForInStatement', 'ForStatement', 'WhileStatement'])

// The innermost function a node sits in, or null at module level.
function enclosingFunction(node) {
  return node.parent === null || node.parent === undefined
    ? null
    : FUNCTIONS.has(node.parent.type)
      ? node.parent
      : enclosingFunction(node.parent)
}

// Whether a node is the callback of `xs.map(...)` and the like, or the body of a loop.
function isIteration(node) {
  if (FUNCTIONS.has(node.type)) {
    const call = node.parent
    return (
      call?.type === 'CallExpression' &&
      call.arguments[0] === node &&
      call.callee.type === 'MemberExpression' &&
      call.callee.property.type === 'Identifier' &&
      ITERATING.has(call.callee.property.name)
    )
  }
  return LOOPS.has(node.type)
}

// The iteration (callback or loop) a node runs in, stopping at the first function that is not one.
function enclosingIteration(node) {
  const parent = node.parent
  if (parent === null || parent === undefined) return null
  if (isIteration(parent)) return parent
  return FUNCTIONS.has(parent.type) ? null : enclosingIteration(parent)
}

// The `const` / `let` names declared under a node, not looking into functions nested in it.
function declaredIn(node) {
  if (node === null || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(declaredIn)
  const own = node.type === 'VariableDeclarator' && node.id.type === 'Identifier' ? [node.id] : []
  const below = Object.entries(node)
    .filter(([key, value]) => key !== 'parent' && value !== null && typeof value === 'object')
    .flatMap(([, value]) =>
      Array.isArray(value) || !FUNCTIONS.has(value.type) ? declaredIn(value) : [],
    )
  return [...own, ...below]
}

// The names a function or loop has for itself, fresh on every turn: its parameters, what a for-of
// binds, and what its body declares.
function ownNames(node) {
  const params = FUNCTIONS.has(node.type) ? node.params : []
  const bound =
    node.type === 'ForOfStatement' || node.type === 'ForInStatement'
      ? (node.left.declarations ?? []).map((d) => d.id)
      : []
  return new Set(
    [...params, ...bound, ...declaredIn(node.body)].flatMap((p) => {
      const target = p.type === 'AssignmentPattern' ? p.left : p
      return target.type === 'Identifier' ? [target.name] : []
    }),
  )
}

// The identifier a member chain starts from (`model.fields` -> `model`).
function rootName(node) {
  if (node.type === 'Identifier') return node.name
  if (node.type === 'MemberExpression') return rootName(node.object)
  return null
}

function isLiteralOnly(node) {
  if (node === null || node === undefined) return true
  if (node.type === 'Literal') return true
  if (node.type === 'TemplateLiteral') return node.expressions.length === 0
  if (node.type === 'ArrayExpression') return node.elements.every(isLiteralOnly)
  return false
}

export const performanceRules = {
  // Why: `Effect.all` and `Effect.forEach` run one at a time unless told otherwise, and the
  //      default reads like a choice nobody made. Say it, so running in sequence is a decision
  //      (one connection, an order that matters) and running at once is not forgotten.
  //   NG: Effect.all([readA(), readB()])
  //   OK: Effect.all([readA(), readB()], { concurrency: 2 })
  //   OK: Effect.forEach(statements, run, { concurrency: 1 })   // one connection, in order
  'effect-explicit-concurrency': {
    meta: { docs: { description: 'Effect.all / Effect.forEach say their concurrency' } },
    create(context) {
      if (TEST_FILE.test(filenameOf(context))) return {}
      return {
        CallExpression(node) {
          const method = memberOf(node.callee, 'Effect')
          if (method !== 'all' && method !== 'forEach') return
          const options = node.arguments[method === 'all' ? 1 : 2]
          const stated =
            options?.type === 'ObjectExpression' &&
            options.properties.some(
              (p) =>
                p.type === 'Property' &&
                p.key.type === 'Identifier' &&
                p.key.name === 'concurrency',
            )
          if (stated) return
          context.report({
            node,
            message: `Say how \`Effect.${method}\` runs: \`{ concurrency: n | 'unbounded' }\` for work that does not wait on itself, \`{ concurrency: 1 }\` where it must run in order (one connection, a sequence that matters).`,
          })
        },
      }
    },
  },

  // Why: a lookup over a whole array, inside a loop over another, is one pass per element:
  //      O(n·m), and the arrays here (models, fields, rows) grow with the schema and the data.
  //      Index the array once, before the loop.
  //   NG: rows.map((row) => fields.find((f) => f.name === row.name))
  //   OK: const byName = new Map(fields.map((f) => [f.name, f]))
  //       rows.map((row) => byName.get(row.name))
  'no-lookup-in-loop': {
    meta: { docs: { description: 'no linear lookup over an outer array inside a loop' } },
    create(context) {
      if (TEST_FILE.test(filenameOf(context))) return {}
      return {
        CallExpression(node) {
          const callee = node.callee
          if (
            callee.type !== 'MemberExpression' ||
            callee.computed ||
            callee.property.type !== 'Identifier' ||
            !LOOKUPS.has(callee.property.name)
          ) {
            return
          }
          const loop = enclosingIteration(node)
          if (loop === null) return
          const root = rootName(callee.object)
          // A lookup over what the loop itself hands in (`row.cells.find`) is not repeated work.
          if (root === null || ownNames(loop).has(root)) return
          context.report({
            node,
            message: `\`${root}….${callee.property.name}(…)\` runs once for every turn of the loop around it. Index it once before the loop (a \`Map\` by key, a \`Set\` for membership) and look up in that.`,
          })
        },
      }
    },
  },

  // Why: the Studio's instances are one read; reading them field by field repeats the lookup and
  //      lets two fields come from two different apps if one is configured in between.
  //   NG: const state = StudioService.studio().state
  //       const db = StudioService.studio().db
  //   OK: const { state, db } = StudioService.studio()
  'one-studio-read': {
    meta: { docs: { description: 'StudioService.studio() is read once per function' } },
    create(context) {
      if (TEST_FILE.test(filenameOf(context))) return {}
      const reads = new Map()
      return {
        CallExpression(node) {
          if (memberOf(node.callee, 'StudioService') !== 'studio') return
          const fn = enclosingFunction(node)
          if (fn === null) return
          const seen = reads.get(fn) ?? 0
          reads.set(fn, seen + 1)
          if (seen === 0) return
          context.report({
            node,
            message:
              'Read the Studio once per function: `const { state, db } = StudioService.studio()`, then use the fields.',
          })
        },
      }
    },
  },

  // Why: a value built from literals alone is the same on every call; building it inside a
  //      function compiles the pattern or fills the collection again each time.
  //   NG: function isRead(sql) { return new RegExp('^select', 'iu').test(sql) }
  //   NG: function isKeyword(word) { return new Set(['select', 'with']).has(word) }
  //   OK: const READ = /^select/iu  ·  const KEYWORDS = new Set(['select', 'with'])  (module level)
  'hoist-constant': {
    meta: {
      docs: { description: 'a RegExp, Set or Map built from literals lives at module level' },
    },
    create(context) {
      if (TEST_FILE.test(filenameOf(context))) return {}
      return {
        NewExpression(node) {
          if (node.callee.type !== 'Identifier') return
          const name = node.callee.name
          if (name !== 'RegExp' && name !== 'Set' && name !== 'Map') return
          if (node.arguments.length === 0 || !node.arguments.every(isLiteralOnly)) return
          if (enclosingFunction(node) === null) return
          context.report({
            node,
            message: `This \`new ${name}(…)\` is built from literals alone, so it is the same on every call. Make it a module-level constant.`,
          })
        },
      }
    },
  },
}
