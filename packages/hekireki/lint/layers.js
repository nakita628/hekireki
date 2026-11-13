// The Studio server's layers: handlers → usecases → services, and usecases → domain. A handler
// maps HTTP to one usecase; a usecase composes services (I/O) and domain (pure decisions); a
// service touches one piece of I/O; domain takes values and returns values.

import {
  INDEX_FILE,
  TEST_FILE,
  exportedDeclarations,
  filenameOf,
  isAsConst,
  isLayerModule,
  isWithin,
  layerOf,
  memberOf,
  resolveRelative,
} from './helpers.js'

const DOMAIN_PATH = /(^|[\\/])studio[\\/]server[\\/]domain([\\/]|$)/u
const EFFECT_EDGE = /(^|[\\/])studio[\\/]server[\\/](handlers[\\/]|index\.ts$)/u
// What each layer may not import the values of, and why.
const FORBIDDEN_IMPORTS = {
  handlers: {
    services: 'Handlers depend on usecases only; a service sits behind a usecase.',
  },
  usecases: {
    usecases:
      'Usecases sit side by side, each owning a request end to end; move what they share into a service (I/O) or domain (a pure decision).',
    handlers: 'Usecases do not know about HTTP handlers.',
  },
  services: {
    services:
      'Each service touches one piece of I/O; call both from the usecase instead, so reading it shows everything that happens.',
    usecases: 'Services sit below usecases; they do not call back up.',
    handlers: 'Services sit below usecases; they do not call back up.',
  },
}
const DOMAIN_ALLOWED = [
  /^zod(\/.*)?$/u,
  /^acorn$/u,
  /^\.\/[^/]+$/u,
  /^(\.\.\/)+(types|utils|sql)(\/[\w-]+)?(\.js)?$/u,
]

// `import type` / `export type` carry no behaviour, so no layer rule counts them.
function isTypeOnly(node) {
  if (node.importKind === 'type' || node.exportKind === 'type') return true
  return (
    node.specifiers?.length > 0 &&
    node.specifiers.every((s) => s.importKind === 'type' || s.exportKind === 'type')
  )
}

function onImports(check) {
  return {
    ImportDeclaration: check,
    ExportNamedDeclaration(node) {
      if (node.source) check(node)
    },
    ExportAllDeclaration: check,
  }
}

// The `<method>` of `c.req.<method>(...)`.
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

function isSchemaParse(node) {
  return (
    node?.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.property.type === 'Identifier' &&
    node.callee.property.name === 'parse'
  )
}

export const layerRules = {
  // Why: each layer leans one way. A usecase owns a request and imports no other usecase; a
  //      service touches one piece of I/O and imports no other service; nothing calls back up.
  //   NG: services/state.ts:   import * as LoadService from './load.js'
  //   NG: usecases/client.ts:  import * as SchemaUseCase from './schema.js'
  //   NG: handlers/db.ts:      import * as StudioService from '../services/index.js'
  //   OK: usecases/schema.ts calls LoadService, then StateService
  //   OK: import type * as StateService from './state.js'
  'layer-imports': {
    meta: { docs: { description: 'each server layer imports only the layers below it' } },
    create(context) {
      const filename = filenameOf(context)
      const forbidden = Object.entries(FORBIDDEN_IMPORTS).find(([layer]) =>
        isLayerModule(filename, layer),
      )?.[1]
      if (forbidden === undefined) return {}
      return onImports((node) => {
        if (isTypeOnly(node)) return
        const source = node.source.value
        const resolved = resolveRelative(filename, source)
        const target = resolved === null ? null : layerOf(resolved)
        const why = target === null ? undefined : forbidden[target]
        if (why === undefined) return
        context.report({
          node: node.source,
          message: `\`${source}\` reaches ${target} from ${layerOf(filename)}. ${why} \`import type\` is fine.`,
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
        if (isTypeOnly(node)) return
        const source = node.source.value
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
          if (isTypeOnly(node)) return
          const source = node.source.value
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
          if (memberOf(node.callee, 'c') !== 'json') return
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
  //      Compose with `yield*`; only the handlers (and index.ts's error handler) run Effects.
  //   NG: usecases/database.ts: await Effect.runPromise(StudioService.readState())
  //   OK: usecases/database.ts: yield* StudioService.readState()
  //   OK: handlers/db.ts:       Effect.runPromise(Effect.matchEffect(...))
  'effect-run-at-edge': {
    meta: { docs: { description: 'run Effects only at the edge (handlers, index.ts)' } },
    create(context) {
      const filename = filenameOf(context)
      if (TEST_FILE.test(filename) || EFFECT_EDGE.test(filename)) return {}
      return {
        CallExpression(node) {
          const method = memberOf(node.callee, 'Effect')
          if (method === null || !method.startsWith('run')) return
          context.report({
            node,
            message: `\`Effect.${method}\` away from the edge. Return the Effect and compose it with \`yield*\`; only handlers and index.ts run Effects, so every failure stays in the type until the edge maps it.`,
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
        const parent = node.superClass
        const tagged =
          parent?.type === 'CallExpression' && memberOf(parent.callee, 'Data') === 'TaggedError'
        if (inErrors && tagged) return
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
      return {
        ExportNamedDeclaration(node) {
          for (const { name, fn, node: target } of exportedDeclarations(node)) {
            const [first, ...rest] = fn?.params ?? []
            if (first === undefined) continue
            const param = first.type === 'AssignmentPattern' ? first.left : first
            if (rest.length === 0 && param.type === 'Identifier' && param.name === 'input') continue
            context.report({
              node: target,
              message: `\`${name}\` must take at most one argument, an object named \`input\` (\`${name}(input: { readonly … })\`). Named fields cannot be passed in the wrong order.`,
            })
          }
        },
      }
    },
  },
}
