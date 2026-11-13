// Layering rules for the Studio's API (src/studio/server), after drizzler's:
//
//   handlers → usecases → services        (and usecases → domain)
//
// A handler maps HTTP to one usecase; a usecase composes services (I/O) and domain (pure
// decisions); a service touches one piece of I/O; domain takes values and returns values.
// custom.js already holds no-usecase-to-usecase, layer-suffix-pascal-case and the barrels
// (layer-namespace-import); these are what it did not say.
//
//   no-service-to-service      a service does not import another service's values
//   domain-only-from-usecases  only usecases (and domain) import domain's values
//   domain-import-allowlist    domain imports only zod, acorn, other domain modules, the pure
//                              modules of the package (types, utils, sql) and types
//   domain-no-nondeterminism   domain does not read the clock or make random values
//   domain-no-side-effects     domain does no I/O, is not async and keeps no module state
//   handler-one-usecase        a handler calls at most one usecase
//   handler-request-valid      a handler reads its input only as `const data = c.req.valid(...)`
//   handler-response-shape     a 2xx body is parsed with its generated schema; a problem body is
//                              an `as const` literal
//   effect-run-at-edge         Effects are run only in handlers, index.ts and start.ts
//   no-throw / no-try-catch    failures are Effect failures, not exceptions
//   no-class                   the only classes are the Data.TaggedError failures in errors/
//   layer-function-shape       usecase / service / domain functions take at most one argument,
//                              `input`

import {
  INDEX_FILE,
  TEST_FILE,
  effectMember,
  filenameOf,
  isWithin,
  layerOf,
  resolveRelative,
} from './helpers.js'

const DOMAIN_PATH = /(^|[\\/])studio[\\/]server[\\/]domain([\\/]|$)/u
// Effects may be run here: the handlers (the HTTP edge), index.ts (the API's error handler) and
// start.ts (the command that serves the Studio).
const EFFECT_EDGE = /(^|[\\/])studio[\\/]server[\\/](handlers[\\/]|(index|start)\.ts$)/u
const DOMAIN_ALLOWED = [
  /^zod(\/.*)?$/u,
  /^acorn$/u,
  /^\.\/[^/]+$/u,
  /^(\.\.\/)+(types|utils|sql)(\/[\w-]+)?(\.js)?$/u,
]

// The specifier of an import / re-export statement, when it has one.
function sourceOf(node) {
  const value = node.source?.value
  return typeof value === 'string' ? value : null
}

// Whether a statement imports only types (`import type`, `export type`), which carry no behaviour.
function isTypeOnly(node) {
  if (node.importKind === 'type' || node.exportKind === 'type') return true
  return (
    node.specifiers?.length > 0 &&
    node.specifiers.every((s) => s.importKind === 'type' || s.exportKind === 'type')
  )
}

// Visit every import / re-export of a module.
function onImports(check) {
  return {
    ImportDeclaration: check,
    ExportNamedDeclaration(node) {
      if (node.source) check(node)
    },
    ExportAllDeclaration: check,
  }
}

// `c.<name>(...)`.
function isContextCall(node, name) {
  const callee = node.callee
  return (
    callee?.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'c' &&
    callee.property.type === 'Identifier' &&
    callee.property.name === name
  )
}

// The `<method>` of `c.req.<method>(...)`, or null.
function requestMethod(node) {
  const callee = node.callee
  if (
    callee.type !== 'MemberExpression' ||
    callee.computed ||
    callee.property.type !== 'Identifier' ||
    callee.object.type !== 'MemberExpression' ||
    callee.object.computed ||
    callee.object.object.type !== 'Identifier' ||
    callee.object.object.name !== 'c' ||
    callee.object.property.type !== 'Identifier' ||
    callee.object.property.name !== 'req'
  ) {
    return null
  }
  return callee.property.name
}

function isAsConst(node) {
  return (
    node?.type === 'TSAsExpression' &&
    node.typeAnnotation.type === 'TSTypeReference' &&
    node.typeAnnotation.typeName.type === 'Identifier' &&
    node.typeAnnotation.typeName.name === 'const'
  )
}

// The `c.req.valid(...)` call is the whole of `const data = …`, alone or spread with others.
function isConstData(node) {
  const parent = node.parent
  if (
    parent?.type === 'SpreadElement' &&
    parent.parent?.type === 'ObjectExpression' &&
    parent.parent.properties.every((p) => p.type === 'SpreadElement')
  ) {
    return isConstData(parent.parent)
  }
  return (
    parent?.type === 'VariableDeclarator' &&
    parent.init === node &&
    parent.id.type === 'Identifier' &&
    parent.id.name === 'data' &&
    parent.parent?.kind === 'const'
  )
}

// `XxxSchema.parse(…)`.
function isSchemaParse(node) {
  return (
    node?.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.property.type === 'Identifier' &&
    node.callee.property.name === 'parse'
  )
}

// `class … extends Data.TaggedError('…')`.
function isTaggedError(node) {
  const parent = node.superClass
  return (
    parent?.type === 'CallExpression' &&
    parent.callee.type === 'MemberExpression' &&
    parent.callee.object.type === 'Identifier' &&
    parent.callee.object.name === 'Data' &&
    parent.callee.property.type === 'Identifier' &&
    parent.callee.property.name === 'TaggedError'
  )
}

export const layerRules = {
  // Why: a service touches one piece of I/O; combining them is the usecase's job, so reading the
  //      usecase shows everything that happens. Types may be shared.
  //   NG: services/state.ts:  import * as LoadService from './load.js'
  //   OK: usecases/schema.ts calls LoadService, then StateService
  //   OK: import type * as StateService from './state.js'
  'no-service-to-service': {
    meta: { docs: { description: "a service may not import another service's values" } },
    create(context) {
      const filename = filenameOf(context)
      if (
        layerOf(filename) !== 'services' ||
        INDEX_FILE.test(filename) ||
        TEST_FILE.test(filename)
      ) {
        return {}
      }
      return onImports((node) => {
        const source = sourceOf(node)
        if (source === null || isTypeOnly(node)) return
        if (!source.startsWith('./') && !/(^|\/)services(\/|$)/u.test(source)) return
        context.report({
          node: node.source,
          message: `A service may not import another service (\`${source}\`). Each service touches one piece of I/O; call both from the usecase instead, so reading it shows everything that happens. \`import type\` is fine.`,
        })
      })
    },
  },

  // Why: domain holds the pure decisions and the usecase is the one place that applies them.
  //      A handler maps HTTP, a service does I/O; neither decides. Types may be shared.
  //   NG: services/database.ts: import * as SqlDomain from '../domain/index.js'
  //   OK: usecases/database.ts: import * as SqlDomain from '../domain/index.js'
  //   OK: import type { Dialect } from '../domain/index.js'
  'domain-only-from-usecases': {
    meta: { docs: { description: "only usecases (and domain itself) may import domain's values" } },
    create(context) {
      const filename = filenameOf(context)
      const layer = layerOf(filename)
      if (layer === 'usecases' || layer === 'domain' || TEST_FILE.test(filename)) return {}
      return onImports((node) => {
        const source = sourceOf(node)
        if (source === null || isTypeOnly(node)) return
        const resolved = resolveRelative(filename, source)
        if (resolved === null || !DOMAIN_PATH.test(resolved)) return
        context.report({
          node: node.source,
          message: `Only usecases may import domain (\`${source}\`). Domain holds the pure decisions and the usecase is the one place that applies them; pass the decided value to the service instead. \`import type\` is fine.`,
        })
      })
    },
  },

  // Why: domain is pure functions over plain values. An allowlist, not a denylist, so a new
  //      library (ids, dates, http, effect) cannot slip in.
  //   NG: import { Effect } from 'effect' / import fs from 'node:fs' / import '../services/index.js'
  //   OK: import * as z from 'zod' / import { makeCell } from './values.js'
  //   OK: import { quoteIdentifier } from '../../../sql/index.js'
  //   OK: import type { DMMF } from '@prisma/generator-helper'
  'domain-import-allowlist': {
    meta: {
      docs: {
        description:
          "domain may import only zod, acorn, other domain modules, the package's pure modules and types",
      },
    },
    create(context) {
      if (TEST_FILE.test(filenameOf(context))) return {}
      return {
        ...onImports((node) => {
          const source = sourceOf(node)
          if (source === null || isTypeOnly(node)) return
          if (DOMAIN_ALLOWED.some((pattern) => pattern.test(source))) return
          context.report({
            node: node.source,
            message: `Domain may import only zod, acorn, other domain modules and the package's pure modules (types, utils, sql), not \`${source}\`. Anything that talks to the outside world belongs in a service; the usecase passes the result in as a value. \`import type\` is fine.`,
          })
        }),
        ImportExpression(node) {
          context.report({
            node,
            message: 'Domain may not import modules at runtime (`import()`).',
          })
        },
      }
    },
  },

  // Why: a domain function returns the same answer for the same arguments. The clock and random
  //      values change on every call; read them in a service and pass them in.
  //   NG: Date.now() / new Date() / Math.random() / crypto.randomUUID()
  //   OK: new Date(input.at)      // a Date with an argument is a fixed value
  'domain-no-nondeterminism': {
    meta: { docs: { description: 'domain must not read the clock or generate random values' } },
    create(context) {
      if (TEST_FILE.test(filenameOf(context))) return {}
      const fix =
        'Domain functions must return the same answer for the same arguments. Read the clock / make the value in a service and pass it in.'
      const banned = {
        Date: ['now'],
        Math: ['random'],
        crypto: ['randomUUID', 'getRandomValues'],
        performance: ['now'],
      }
      return {
        CallExpression(node) {
          const callee = node.callee
          if (
            callee.type === 'MemberExpression' &&
            !callee.computed &&
            callee.object.type === 'Identifier' &&
            callee.property.type === 'Identifier' &&
            banned[callee.object.name]?.includes(callee.property.name)
          ) {
            context.report({
              node,
              message: `\`${callee.object.name}.${callee.property.name}()\` in domain. ${fix}`,
            })
          }
          if (callee.type === 'Identifier' && callee.name === 'Date') {
            context.report({ node, message: `\`Date()\` in domain. ${fix}` })
          }
        },
        NewExpression(node) {
          if (
            node.callee.type === 'Identifier' &&
            node.callee.name === 'Date' &&
            node.arguments.length === 0
          ) {
            context.report({ node, message: `\`new Date()\` in domain. ${fix}` })
          }
        },
      }
    },
  },

  // Why: domain takes values and returns values. I/O, timers, async and module state make the
  //      answer depend on the world or on call order.
  //   NG: console.log(x) / process.cwd() / setTimeout(...) / async function f() {} / let cache
  //   OK: export function makeCell(input: { … }) { return … }
  'domain-no-side-effects': {
    meta: {
      docs: { description: 'domain must not perform I/O, be async, or keep module state' },
    },
    create(context) {
      if (TEST_FILE.test(filenameOf(context))) return {}
      const ioCalls = new Set([
        'fetch',
        'setTimeout',
        'setInterval',
        'setImmediate',
        'queueMicrotask',
        'require',
      ])
      const ioObjects = new Set(['console', 'process', 'window', 'document', 'globalThis'])
      const tail =
        'Domain functions take values and return values; do this in a service and pass the result in.'
      function reportAsync(node) {
        if (!node.async) return
        context.report({
          node,
          message:
            'Async function in domain. Domain is synchronous: await in a service and pass the value in.',
        })
      }
      return {
        CallExpression(node) {
          if (node.callee.type === 'Identifier' && ioCalls.has(node.callee.name)) {
            context.report({ node, message: `\`${node.callee.name}()\` in domain. ${tail}` })
          }
        },
        MemberExpression(node) {
          if (node.object.type === 'Identifier' && ioObjects.has(node.object.name)) {
            context.report({ node, message: `\`${node.object.name}\` in domain. ${tail}` })
          }
        },
        FunctionDeclaration: reportAsync,
        FunctionExpression: reportAsync,
        ArrowFunctionExpression: reportAsync,
        Program(node) {
          for (const statement of node.body) {
            const declaration =
              statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
            if (declaration?.type === 'VariableDeclaration' && declaration.kind !== 'const') {
              context.report({
                node: declaration,
                message: `Module-level \`${declaration.kind}\` in domain: shared mutable state makes the answer depend on call order.`,
              })
            }
          }
        },
      }
    },
  },

  // Why: one request is one usecase. Once a handler combines usecases, decisions leak into it.
  //   NG: DatabaseUseCase.readDbStatus(); DocsUseCase.readDocs()     // in one handler
  //   OK: one usecase that does both, and the handler maps its result to HTTP
  'handler-one-usecase': {
    meta: { docs: { description: 'a handler may call at most one usecase' } },
    create(context) {
      if (TEST_FILE.test(filenameOf(context))) return {}
      const handlers = new Map()
      return {
        ExportNamedDeclaration(node) {
          if (node.declaration?.type !== 'VariableDeclaration') return
          for (const declarator of node.declaration.declarations) {
            if (declarator.init) handlers.set(declarator, new Set())
          }
        },
        CallExpression(node) {
          const callee = node.callee
          if (
            callee.type !== 'MemberExpression' ||
            callee.computed ||
            callee.object.type !== 'Identifier' ||
            !callee.object.name.endsWith('UseCase') ||
            callee.property.type !== 'Identifier'
          ) {
            return
          }
          for (const [declarator, calls] of handlers) {
            if (isWithin(node, declarator)) {
              calls.add(`${callee.object.name}.${callee.property.name}`)
            }
          }
        },
        'Program:exit'() {
          for (const [declarator, calls] of handlers) {
            if (calls.size <= 1) continue
            context.report({
              node: declarator.id,
              message: `This handler calls ${calls.size} usecases (${[...calls].join(', ')}). One request is one usecase: combine them in a single usecase, and let the handler map its result to HTTP.`,
            })
          }
        },
      }
    },
  },

  // Why: a handler reads its input in exactly one shape, and only after the contract (main.tsp)
  //      validated it; `c.req.json()` and friends hand unvalidated values to the usecase.
  //   NG: const body = await c.req.json()
  //   NG: MigrateUseCase.rehearse(c.req.valid('json'))
  //   OK: const data = c.req.valid('json')
  //   OK: const data = { ...c.req.valid('param'), ...c.req.valid('json') }
  'handler-request-valid': {
    meta: {
      docs: { description: "handlers read input only as `const data = c.req.valid('...')`" },
    },
    create(context) {
      if (TEST_FILE.test(filenameOf(context))) return {}
      const rawReaders = new Set([
        'json',
        'param',
        'query',
        'queries',
        'parseBody',
        'formData',
        'text',
        'arrayBuffer',
        'blob',
      ])
      return {
        CallExpression(node) {
          const method = requestMethod(node)
          if (method === null) return
          if (method === 'valid') {
            if (isConstData(node)) return
            context.report({
              node,
              message:
                "Read the validated input in one shape: `const data = c.req.valid('json' | 'query' | 'param')`, or `const data = { ...c.req.valid('param'), ...c.req.valid('json') }`. Don't destructure, rename or inline it.",
            })
            return
          }
          if (!rawReaders.has(method)) return
          context.report({
            node,
            message: `\`c.req.${method}()\` reads the request before validation. Declare the input in main.tsp and read it as \`const data = c.req.valid('...')\`.`,
          })
        },
      }
    },
  },

  // Why: a 2xx body is checked against the contract (main.tsp) before it leaves, so a body that
  //      drifted is caught. A problem body (4xx / 5xx) is a literal the handler writes itself:
  //      `as const` lets the route's types check it at compile time, and it is not parsed.
  //   NG: c.json(docs, 200)
  //   NG: c.json(NotFoundProblemSchema.parse({ … }), 404)
  //   OK: c.json(DocsSchema.parse(docs), 200)
  //   OK: c.json({ type: '/problems/not-found', … } as const, 404, { … })
  'handler-response-shape': {
    meta: {
      docs: {
        description:
          '2xx bodies are parsed with their schema; problem bodies are `as const` literals',
      },
    },
    create(context) {
      if (TEST_FILE.test(filenameOf(context))) return {}
      return {
        CallExpression(node) {
          if (!isContextCall(node, 'json')) return
          const [body, status] = node.arguments
          if (status?.type !== 'Literal' || typeof status.value !== 'number') return
          if (status.value >= 200 && status.value < 300) {
            if (isSchemaParse(body)) return
            context.report({
              node,
              message:
                'Check a 2xx body against its generated schema before it leaves: `c.json(XxxSchema.parse(value), 200)`, so a body that drifted from main.tsp is caught.',
            })
            return
          }
          if (isAsConst(body) && body.expression.type === 'ObjectExpression') return
          context.report({
            node,
            message: isSchemaParse(body)
              ? 'Do not parse a problem body. Write it as an object literal with `as const`: the route types check it at compile time, and an error path never fails on its own validation.'
              : 'Write a problem body as an object literal with `as const`, so the route types check every field at compile time.',
          })
        },
      }
    },
  },

  // Why: running an Effect inside a usecase or service lets its failure leave the type midway.
  //      Compose with `yield*`; only the edge runs Effects and maps failures to statuses.
  //   NG: usecases/database.ts: await Effect.runPromise(StudioService.readState())
  //   OK: usecases/database.ts: yield* StudioService.readState()
  //   OK: handlers/db.ts:       Effect.runPromise(Effect.matchEffect(...))
  'effect-run-at-edge': {
    meta: { docs: { description: 'run Effects only at the edge (handlers, index.ts, start.ts)' } },
    create(context) {
      const filename = filenameOf(context)
      if (TEST_FILE.test(filename) || EFFECT_EDGE.test(filename)) return {}
      return {
        CallExpression(node) {
          const method = effectMember(node.callee)
          if (method === null || !method.startsWith('run')) return
          context.report({
            node,
            message: `\`Effect.${method}\` away from the edge. Return the Effect and compose it with \`yield*\`; only handlers, index.ts and start.ts run Effects, so every failure stays in the type until the edge maps it.`,
          })
        },
      }
    },
  },

  // Why: a thrown error is invisible in the type, so callers cannot know what to handle. Fail
  //      with a Data.TaggedError instead; the handler's Match.exhaustive then maps every one.
  //   NG: throw new Error('not configured')
  //   OK: return yield* new UnknownModelError({ model })
  'no-throw': {
    meta: { docs: { description: 'fail with Effect failures, not throw' } },
    create(context) {
      if (TEST_FILE.test(filenameOf(context))) return {}
      return {
        ThrowStatement(node) {
          context.report({
            node,
            message:
              'Do not throw. A thrown error is invisible in the type. Fail with a Data.TaggedError (`return yield* new XxxError({ … })`) so it shows in Effect<A, E> and the handler’s Match.exhaustive maps it to a status.',
          })
        },
      }
    },
  },

  // Why: a caught error is `unknown`, so what failed disappears from the type. A `try` with only
  //      a `finally` catches nothing: the throw goes on to whoever runs it, so it is not reported.
  //   NG: try { await driver.query(sql) } catch (error) { … }
  //   OK: try { return run() } finally { restore() }
  //   OK: Effect.tryPromise({ try: () => driver.query(sql), catch: (cause) => new DatabaseError({ … }) })
  'no-try-catch': {
    meta: { docs: { description: 'use Effect.try / Effect.tryPromise, not try / catch' } },
    create(context) {
      if (TEST_FILE.test(filenameOf(context))) return {}
      return {
        TryStatement(node) {
          if (node.handler === null || node.handler === undefined) return
          context.report({
            node,
            message:
              'Do not use try / catch. The caught error is `unknown`, so the failure leaves the type. Wrap the call in `Effect.try` / `Effect.tryPromise({ try, catch: (cause) => new XxxError({ … }) })` so it has a name.',
          })
        },
      }
    },
  },

  // Why: data is plain objects and behaviour is functions. The only classes are the failures in
  //      errors/, as Data.TaggedError, whose `_tag` Match.tag and Match.exhaustive can see.
  //   NG: class StudioState { … } / errors: class NotFound extends Error {}
  //   OK: errors/index.ts: class UnknownModelError extends Data.TaggedError('UnknownModelError')<{ … }> {}
  'no-class': {
    meta: { docs: { description: 'classes only as Data.TaggedError in errors/' } },
    create(context) {
      const filename = filenameOf(context)
      if (TEST_FILE.test(filename)) return {}
      const inErrors = layerOf(filename) === 'errors'
      function check(node) {
        if (inErrors && isTaggedError(node)) return
        context.report({
          node,
          message: inErrors
            ? "Classes in errors/ extend `Data.TaggedError('Name')`, so the failure has a `_tag` Match.tag and Match.exhaustive can see."
            : 'Do not declare classes here. Use plain objects for data and functions for behaviour; the only classes are the failures in errors/ (Data.TaggedError).',
        })
      }
      return { ClassDeclaration: check, ClassExpression: check }
    },
  },

  // Why: one shape for every layer function: at most one argument, an object named `input`.
  //      Fields have names, so they can never be passed in the wrong order, and a new field does
  //      not change every call.
  //   NG: export function runSql(sql: string, params: readonly CellValue[])
  //   OK: export function runSql(input: { readonly sql: string; readonly params: readonly CellValue[] })
  //   OK: export function readDbStatus()
  'layer-function-shape': {
    meta: {
      docs: { description: 'layer functions take at most one argument, an object named input' },
    },
    create(context) {
      const filename = filenameOf(context)
      if (TEST_FILE.test(filename) || INDEX_FILE.test(filename)) return {}
      function check(name, fn, node) {
        const [first, ...rest] = fn.params
        if (first === undefined) return
        const target = first.type === 'AssignmentPattern' ? first.left : first
        if (rest.length === 0 && target.type === 'Identifier' && target.name === 'input') return
        context.report({
          node,
          message: `\`${name}\` must take at most one argument, an object named \`input\` (\`${name}(input: { readonly … })\`). Named fields cannot be passed in the wrong order.`,
        })
      }
      return {
        ExportNamedDeclaration(node) {
          const declaration = node.declaration
          if (declaration?.type === 'FunctionDeclaration' && declaration.id) {
            check(declaration.id.name, declaration, declaration.id)
          }
          if (declaration?.type !== 'VariableDeclaration') return
          for (const d of declaration.declarations) {
            if (
              d.id.type === 'Identifier' &&
              (d.init?.type === 'ArrowFunctionExpression' || d.init?.type === 'FunctionExpression')
            ) {
              check(d.id.name, d.init, d.id)
            }
          }
        },
      }
    },
  },
}
