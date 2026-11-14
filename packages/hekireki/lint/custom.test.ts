import { RuleTester } from 'oxlint/plugins-dev'
import { describe, expect, it, test } from 'vite-plus/test'

import { documentedOptions } from './codegen.js'
import plugin, { handlerDocNames, layerModuleOf, layerNamespaceOf } from './custom.js'
import { isLayerModule, layerOf, leadingTsdoc, resolveRelative } from './helpers.js'

// RuleTester's own describe / it, run as vitest's: the titles and callbacks are the ones RuleTester
// builds, and `itOnly` is what a case marked `only: true` asks for.
/* oxlint-disable jest/valid-title, jest/valid-describe-callback, jest/expect-expect, jest/no-focused-tests */
RuleTester.describe = (name, fn) => {
  describe(name, fn)
}
RuleTester.it = (name, fn) => {
  test(name, fn)
}
RuleTester.itOnly = (name, fn) => {
  test.only(name, fn)
}
/* oxlint-enable jest/valid-title, jest/valid-describe-callback, jest/expect-expect, jest/no-focused-tests */

const tester = new RuleTester({ languageOptions: { sourceType: 'module' } })

function rule(name: string) {
  const found = plugin.rules[name]
  if (found === undefined) throw new Error(`unknown rule ${name}`)
  return found as Parameters<RuleTester['run']>[1]
}

function tsCase(code: string, filename = 'src/studio/server/usecases/x.ts') {
  return { code, filename }
}

function testCase(code: string) {
  return tsCase(code, 'src/studio/server/usecases/x.test.ts')
}

describe('path helpers', () => {
  it('recognises the modules of a layer', () => {
    expect(isLayerModule('src/studio/server/usecases/schema.ts', 'usecases')).toBe(true)
    expect(isLayerModule('src/studio/server/usecases/index.ts', 'usecases')).toBe(false)
    expect(isLayerModule('src/studio/server/usecases/schema.test.ts', 'usecases')).toBe(false)
    expect(isLayerModule('src\\studio\\server\\usecases\\schema.ts', 'usecases')).toBe(true)
    expect(isLayerModule('src/studio/server/services/query.ts', 'usecases')).toBe(false)
  })
})

tester.run('effect-gen-return', rule('effect-gen-return'), {
  valid: [
    tsCase(`export function read(input: string) {
  return Effect.gen(function* () {
    return yield* Effect.succeed(input)
  })
}`),
    tsCase(`export function scoped() {
  return Effect.gen(function* () {
    yield* Effect.never
  }).pipe(Effect.scoped)
}`),
    tsCase(`function make() {
  function reload() {
    return Effect.gen(function* () {
      return 1
    })
  }
  return { reload }
}`),
    testCase(`const program = Effect.gen(function* () { return 1 })`),
  ],
  invalid: [
    { ...tsCase(`const program = Effect.gen(function* () { return 1 })`), errors: 1 },
    { ...tsCase(`export const read = () => Effect.gen(function* () { return 1 })`), errors: 1 },
    { ...tsCase(`run(Effect.gen(function* () { return 1 }))`), errors: 1 },
    {
      ...tsCase(`export function read() { return Effect.gen(function* named() { return 1 }) }`),
      errors: 1,
    },
    { ...tsCase(`export function read() { return Effect.gen(() => 1) }`), errors: 1 },
  ],
})

tester.run('no-effect-fn', rule('no-effect-fn'), {
  valid: [tsCase(`export function f() { return Effect.gen(function* () { return 1 }) }`)],
  invalid: [
    { ...tsCase(`export const f = Effect.fn('f')(function* () { return 1 })`), errors: 1 },
    { ...tsCase(`export const f = Effect.fnUntraced(function* () { return 1 })`), errors: 1 },
  ],
})

tester.run('no-effect-flatmap', rule('no-effect-flatmap'), {
  valid: [
    tsCase(`const a = Effect.map(b, (x) => x)`),
    tsCase(`const a = Stream.flatMap(b, (x) => x)`),
  ],
  invalid: [
    { ...tsCase(`const a = Effect.flatMap(b, (x) => x)`), errors: 1 },
    { ...tsCase(`const a = b.pipe(Effect.andThen(c))`), errors: 1 },
  ],
})

tester.run('usecase-gen-straight-line', rule('usecase-gen-straight-line'), {
  valid: [
    tsCase(`const a = b.pipe(Effect.catchTag('X', () => c))`),
    tsCase(`const a = b.pipe(Effect.map((x) => x))`, 'src/studio/server/services/x.ts'),
  ],
  invalid: [
    { ...tsCase(`const a = b.pipe(Effect.map((x) => x))`), errors: 1 },
    { ...tsCase(`const a = b.pipe(Effect.tap((x) => x))`), errors: 1 },
  ],
})

tester.run('function-declaration', rule('function-declaration'), {
  valid: [
    tsCase(`export function f() { return 1 }`),
    tsCase(`export const h: RouteHandler<typeof r> = (c) => c.json({})`),
    tsCase(`function outer() { const inner = () => 1; return inner }`),
    testCase(`const helper = () => 1`),
  ],
  invalid: [
    { ...tsCase(`export const f = () => 1`), errors: 1 },
    { ...tsCase(`const f = function () { return 1 }`), errors: 1 },
  ],
})

tester.run('schema-pascal-case', rule('schema-pascal-case'), {
  valid: [
    tsCase(`const UserInput = z.object({}).meta({ description: 'x' })`),
    tsCase(`const result = z.safeParse(UserInput, value)`),
    tsCase(`const Theme = v.picklist(['a'])`),
    // Effect's Schema namespace: a shape, a check, and a decoder made out of one.
    tsCase(`const Rate = Schema.Number.pipe(Schema.check(Schema.isBetween({ minimum: 0 })))`),
    tsCase(`const Ordered = Schema.makeFilter((value) => value, { expected: 'x' })`),
    tsCase(`const Members = Schema.Array(Schema.String).pipe(Schema.check(Schema.isUnique))`),
    tsCase(`const decodeConfig = Schema.decodeUnknownEffect(SeedConfig, { errors: 'all' })`),
  ],
  invalid: [
    { ...tsCase(`const userInput = z.object({})`), errors: 1 },
    { ...tsCase(`const seedConfig = Schema.Struct({ url: Schema.String })`), errors: 1 },
    { ...tsCase(`const fixValue = Schema.declare(isFixValue, { expected: 'x' })`), errors: 1 },
  ],
})

tester.run('schema-meta', rule('schema-meta'), {
  valid: [
    tsCase(`const A = z.string().meta({ description: 'a' })`),
    tsCase(`const A = z.string().describe('a')`),
    tsCase(`const A = v.pipe(v.string(), v.description('a'))`),
    tsCase(`const A = v.pipe(v.string(), v.metadata({ example: 'a' }))`),
  ],
  invalid: [
    { ...tsCase(`const A = z.string()`), errors: 1 },
    { ...tsCase(`const A = z.string().meta({ title: 'a' })`), errors: 1 },
    { ...tsCase(`const A = v.string()`), errors: 1 },
    { ...tsCase(`const A = v.pipe(v.string(), v.metadata({ title: 'a' }))`), errors: 1 },
  ],
})

tester.run('schema-blank-line', rule('schema-blank-line'), {
  valid: [
    tsCase(
      `const A = z.string().meta({ description: 'a' })\n\nconst B = z.string().meta({ description: 'b' })`,
    ),
    tsCase(`const A = z.string().meta({ description: 'a' })\ntype A = z.infer<typeof A>`),
  ],
  invalid: [
    {
      ...tsCase(
        `const A = z.string().meta({ description: 'a' })\nconst B = z.string().meta({ description: 'b' })`,
      ),
      errors: 1,
    },
    {
      ...tsCase(
        `const A = z.string().meta({ description: 'a' })\n// comment\nconst B = z.string().meta({ description: 'b' })`,
      ),
      errors: 1,
    },
  ],
})

tester.run('schema-property-meta', rule('schema-property-meta'), {
  valid: [
    tsCase(
      `const A = z.object({ a: z.string().meta({ description: 'a', example: 'x' }) }).meta({ description: 'A' })`,
    ),
    tsCase(`const A = v.object({ a: v.pipe(v.string(), v.description('a')) })`),
  ],
  invalid: [
    { ...tsCase(`const A = z.object({ a: z.string() }).meta({ description: 'A' })`), errors: 1 },
    { ...tsCase(`const A = v.object({ a: v.string() })`), errors: 1 },
  ],
})

tester.run('schema-example', rule('schema-example'), {
  valid: [
    tsCase(`const A = z.string().meta({ description: 'a', example: 'x' })`),
    tsCase(`const A = z.array(z.string()).meta({ description: 'a' })`),
    tsCase(`const A = z.custom<X>().meta({ description: 'a' })`),
  ],
  invalid: [
    { ...tsCase(`const A = z.string().meta({ description: 'a' })`), errors: 1 },
    {
      ...tsCase(
        `const A = z.object({ n: z.number().meta({ description: 'n' }) }).meta({ description: 'A' })`,
      ),
      errors: 1,
    },
  ],
})

tester.run('schema-example-type', rule('schema-example-type'), {
  valid: [
    tsCase(`const A = z.string().meta({ description: 'a', example: 'x' })`),
    tsCase(`const A = z.enum(['a', 'b']).meta({ description: 'a', example: 'b' })`),
    tsCase(`const A = z.string().array().meta({ description: 'a', example: ['x'] })`),
  ],
  invalid: [
    { ...tsCase(`const A = z.string().meta({ description: 'a', example: 1 })`), errors: 1 },
    {
      ...tsCase(`const A = z.enum(['a', 'b']).meta({ description: 'a', example: 'c' })`),
      errors: 1,
    },
    {
      ...tsCase(`const A = z.array(z.string()).meta({ description: 'a', example: 'x' })`),
      errors: 1,
    },
  ],
})

tester.run('logic-camel-case', rule('logic-camel-case'), {
  valid: [
    tsCase(`const readRows = () => 1`),
    tsCase(`const MAX_TAKE = 1`),
    tsCase(`const Row = z.record(z.string(), z.string()).meta({ description: 'r' })`),
    // An Effect schema names a shape, so PascalCase is its own rule's business, not this one's.
    tsCase(`const SeedConfig = Schema.Struct({ url: Schema.String })`),
    tsCase(`function makeSchema() {}`),
  ],
  invalid: [
    { ...tsCase(`const ReadRows = () => 1`), errors: 1 },
    { ...tsCase(`function MakeSchema() {}`), errors: 1 },
  ],
})

tester.run('layer-suffix-pascal-case', rule('layer-suffix-pascal-case'), {
  valid: [tsCase(`const TodoService = 1`), tsCase(`class QueryDomain {}`)],
  invalid: [
    { ...tsCase(`const todoService = 1`), errors: 1 },
    { ...tsCase(`function readUseCase() {}`), errors: 1 },
  ],
})

describe('layer import helpers', () => {
  it('resolves layer modules from a layer directory and from the server root', () => {
    expect(
      layerModuleOf('src/studio/server/handlers/prisma.ts', '../usecases/index.js'),
    ).toStrictEqual({ layer: 'usecases', module: 'index', sibling: false })
    expect(layerModuleOf('src/studio/server/services/load.ts', './language.js')).toStrictEqual({
      layer: 'services',
      module: 'language',
      sibling: true,
    })
    expect(layerModuleOf('src/studio/server/app.ts', './services/index.js')).toStrictEqual({
      layer: 'services',
      module: 'index',
      sibling: false,
    })
    expect(layerModuleOf('src/studio/server/handlers/prisma.ts', '../routes/index.js')).toBeNull()
    expect(layerModuleOf('src/studio/server/handlers/prisma.ts', 'effect')).toBeNull()
  })

  it('names the namespace after the module and its layer', () => {
    expect(layerNamespaceOf('usecases', 'prisma')).toBe('PrismaUseCase')
    expect(layerNamespaceOf('domain', 'database-error')).toBe('DatabaseErrorDomain')
    expect(layerNamespaceOf('services', 'runtime')).toBe('RuntimeService')
  })
})

tester.run('layer-namespace-import', rule('layer-namespace-import'), {
  valid: [
    tsCase(
      `import * as PrismaUseCase from '../usecases/index.js'`,
      'src/studio/server/handlers/prisma.ts',
    ),
    tsCase(`import type * as StateService from './services/index.js'`, 'src/studio/server/app.ts'),
    tsCase(`import * as ValuesDomain from './values.js'`, 'src/studio/server/domain/model.ts'),
    tsCase(`import * as z from 'zod'`),
    tsCase(`import { Effect } from 'effect'`),
    tsCase(`import { ContractViolationError } from '../errors/index.js'`),
    tsCase(`import { x } from '../services/index.js'`, 'src/studio/server/usecases/x.test.ts'),
    tsCase(`import { x } from '../services/index.js'`, 'src/other/place/x.ts'),
    tsCase(
      `import { client } from '../../lib/index.js'`,
      'src/studio/client/features/sql/sql-view.tsx',
    ),
    tsCase(
      `import { useUiStore } from '@/lib/index.js'`,
      'src/studio/client/features/sidebar/sidebar.tsx',
    ),
  ],
  invalid: [
    {
      ...tsCase(
        `import * as PrismaUseCase from '../usecases/prisma.js'`,
        'src/studio/server/handlers/prisma.ts',
      ),
      errors: 1,
    },
    {
      ...tsCase(
        `import { createStudioState } from '../services/index.js'`,
        'src/studio/server/handlers/prisma.ts',
      ),
      errors: 1,
    },
    {
      ...tsCase(
        `import * as Prisma from '../usecases/index.js'`,
        'src/studio/server/handlers/prisma.ts',
      ),
      errors: 1,
    },
    {
      ...tsCase(`import * as LoadService from './index.js'`, 'src/studio/server/services/state.ts'),
      errors: 1,
    },
    {
      ...tsCase(`import * as path from 'node:path'`, 'src/studio/server/services/load.ts'),
      errors: 1,
    },
    {
      ...tsCase(
        `import { makeSchema } from '../domain/index.js'`,
        'src/studio/server/services/load.ts',
      ),
      errors: 1,
    },
    {
      ...tsCase(
        `import { client } from '../../lib/client.js'`,
        'src/studio/client/features/sql/sql-view.tsx',
      ),
      errors: 1,
    },
  ],
})

tester.run('no-null-coercion-map', rule('no-null-coercion-map'), {
  valid: [
    tsCase(`const a = b.pipe(Effect.map((v) => v ?? 0))`, 'src/studio/server/services/x.ts'),
    tsCase(`const a = b.pipe(Effect.map((v) => v ?? null))`),
  ],
  invalid: [
    {
      ...tsCase(
        `const a = b.pipe(Effect.map((v) => v ?? null))`,
        'src/studio/server/services/x.ts',
      ),
      errors: 1,
    },
  ],
})

tester.run('no-dual-absence', rule('no-dual-absence'), {
  valid: [
    tsCase(`const CreateRow = z.object({ a: z.string().nullable().meta({ description: 'a' }) })`),
    tsCase(`const UpdateRow = z.object({ a: z.string().nullish().meta({ description: 'a' }) })`),
  ],
  invalid: [
    { ...tsCase(`const CreateRow = z.object({ a: z.string().nullish() })`), errors: 1 },
    { ...tsCase(`const CreateRow = z.object({ a: z.string().optional().nullable() })`), errors: 1 },
  ],
})

tester.run('no-let', rule('no-let'), {
  valid: [
    tsCase(`for (let i = 0; i < 3; i += 1) {}`),
    tsCase(`const a = 1`),
    testCase(`let a = 1`),
  ],
  invalid: [
    { ...tsCase(`let a = 1`), errors: 1 },
    { ...tsCase(`function f() { let a = 1; return a }`), errors: 1 },
  ],
})

tester.run('no-mutation', rule('no-mutation'), {
  valid: [
    tsCase(`const b = { ...a, x: 1 }`),
    tsCase(`const c = [...values].sort()`),
    tsCase(`const d = values.toSorted()`),
    tsCase(`class A { run() { this.count = 1; this.items.push(1) } }`),
    tsCase(`let n = 0; n = 1`),
    testCase(`values.push(1)`),
  ],
  invalid: [
    { ...tsCase(`a.x = 1`), errors: 1 },
    { ...tsCase(`a.x += 1`), errors: 1 },
    { ...tsCase(`a.n++`), errors: 1 },
    { ...tsCase(`delete a.x`), errors: 1 },
    { ...tsCase(`values.push(1)`), errors: 1 },
    { ...tsCase(`values.sort()`), errors: 1 },
  ],
})

tester.run('no-pass-through', rule('no-pass-through'), {
  valid: [
    tsCase(`function messageOf(error: unknown) { return String(error).trim() }`),
    tsCase(`function rowsOf(table: string, limit: number) { return read(limit, table) }`),
    tsCase(
      `function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' }`,
    ),
    tsCase(`function defineSchema<S extends Shape>(schema: S) { return schema }`),
    tsCase(`function countOf(rows: readonly string[]) { return rows.length }`),
    // A test spells its fixtures out.
    testCase(`function mockSchema(schema: string) { return schema }`),
  ],
  invalid: [
    { ...tsCase(`function parseExpr(p: Parser) { return parseOr(p) }`), errors: 1 },
    { ...tsCase(`function uriOf(path: string) { return Uri.parse(path) }`), errors: 1 },
    { ...tsCase(`function asIs(name: string) { return name }`), errors: 1 },
    { ...tsCase(`const isFunction = (value: unknown) => typeof value === 'function'`), errors: 1 },
  ],
})

tester.run('predicate-is-name', rule('predicate-is-name'), {
  valid: [tsCase(`function isLoopback() { return true }`), tsCase(`const readRows = () => 1`)],
  invalid: [
    { ...tsCase(`function readIsLoopback() { return true }`), errors: 1 },
    { ...tsCase(`const readIsEmpty = () => true`), errors: 1 },
  ],
})

const HANDLER_FILE = 'src/studio/server/handlers/docs.ts'

const DOCUMENTED_HANDLER = `/**
 * \`GET /docs\` handler. The documentation of the last schema that parsed.
 *
 * \`\`\`mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant H as Handler
 *   participant U as DocsUseCase
 *   C->>H: GET /docs
 *   H->>U: readDocs()
 *   U-->>H: Docs
 *   H-->>C: 200 Docs
 *   Note over H: on failure, Match.tag: ContractViolationError -> 500
 * \`\`\`
 */
export const getDocsRouteHandler: RouteHandler<typeof getDocsRoute> = (c) =>
  Effect.runPromise(
    Effect.matchEffect(DocsUseCase.readDocs(), {
      onSuccess: (value) => Effect.succeed(c.json(value, 200)),
      onFailure: (error) => Match.value(error).pipe(Match.tag('ContractViolationError', () => Effect.succeed(c.json({}, 500))), Match.exhaustive),
    }),
  )
`

describe('handler doc helpers', () => {
  it('reads the TSDoc block right above a statement, and only that one', () => {
    const at = (start: number) => ({ start, end: start })
    expect(leadingTsdoc('/** a */\nexport const x = 1', at(9))).toBe('/** a */')
    expect(leadingTsdoc('// a\nexport const x = 1', at(5))).toBeNull()
    expect(leadingTsdoc('/** a */\nconst y = 1\nexport const x = 1', at(21))).toBeNull()
    expect(leadingTsdoc('/** a */\nconst y = 1\n/** b */\nexport const x = 1', at(30))).toBe(
      '/** b */',
    )
  })

  it('lists the use cases a handler calls and the tags it answers, once each', () => {
    expect(
      handlerDocNames(
        `DocsUseCase.readDocs() Match.tag('A', 1) Match.tag('B', 2) Match.tag('A', 3)`,
      ),
    ).toStrictEqual(['readDocs', 'A', 'B'])
  })
})

tester.run('handler-doc', rule('handler-doc'), {
  valid: [
    tsCase(DOCUMENTED_HANDLER, HANDLER_FILE),
    // Outside handlers/, and in a handler test, nothing is asked.
    tsCase(`export const getDocsRouteHandler = (c) => c.json({}, 200)`),
    tsCase(
      `export const getDocsRouteHandler = (c) => c.json({}, 200)`,
      'src/studio/server/handlers/docs.test.ts',
    ),
    // A helper that is not a handler needs no diagram.
    tsCase(`export const SSE_PING = 1`, HANDLER_FILE),
  ],
  invalid: [
    {
      ...tsCase(`export const getDocsRouteHandler = (c) => c.json({}, 200)`, HANDLER_FILE),
      errors: 1,
    },
    {
      ...tsCase(DOCUMENTED_HANDLER.replace('The documentation', 'ドキュメント'), HANDLER_FILE),
      errors: 1,
    },
    {
      ...tsCase(
        DOCUMENTED_HANDLER.replace('`GET /docs` handler.', 'The docs handler.'),
        HANDLER_FILE,
      ),
      errors: 1,
    },
    {
      ...tsCase(DOCUMENTED_HANDLER.replace('sequenceDiagram', 'flowchart'), HANDLER_FILE),
      errors: 1,
    },
    {
      ...tsCase(DOCUMENTED_HANDLER.replace('ContractViolationError -> 500', ''), HANDLER_FILE),
      errors: 1,
    },
    {
      ...tsCase(DOCUMENTED_HANDLER.replace('H->>U: readDocs()', 'H->>U: read'), HANDLER_FILE),
      errors: 1,
    },
  ],
})

// layers.js, failures.js and docs.js

const SERVICE_FILE = 'src/studio/server/services/load.ts'
const DOMAIN_FILE = 'src/studio/server/domain/values.ts'

describe('shared helpers', () => {
  it('resolves a relative specifier against the importing file', () => {
    expect(resolveRelative('src/studio/server/services/load.ts', '../domain/index.js')).toBe(
      'src/studio/server/domain/index.js',
    )
    expect(resolveRelative('src/studio/server/app.ts', './services/index.js')).toBe(
      'src/studio/server/services/index.js',
    )
    expect(resolveRelative('src/studio/server/domain/sql.ts', '../../../sql/index.js')).toBe(
      'src/sql/index.js',
    )
    expect(resolveRelative('src/studio/server/app.ts', 'effect')).toBeNull()
  })

  it('names the layer a file belongs to', () => {
    expect(layerOf('src/studio/server/usecases/schema.ts')).toBe('usecases')
    expect(layerOf('src\\studio\\server\\domain\\sql.ts')).toBe('domain')
    expect(layerOf('src/studio/server/app.ts')).toBeNull()
  })
})

tester.run('layer-imports', rule('layer-imports'), {
  valid: [
    tsCase(`import type * as StateService from './state.js'`, SERVICE_FILE),
    tsCase(`import { SchemaLoadError } from '../errors/index.js'`, SERVICE_FILE),
    tsCase(`export * from './load.js'`, 'src/studio/server/services/index.ts'),
    tsCase(`import * as LoadService from './load.js'`, 'src/studio/server/services/load.test.ts'),
    tsCase(`import * as StudioService from '../services/index.js'`),
    tsCase(`import * as SchemaUseCase from '../usecases/index.js'`, HANDLER_FILE),
  ],
  invalid: [
    { ...tsCase(`import * as LanguageService from './language.js'`, SERVICE_FILE), errors: 1 },
    { ...tsCase(`import * as X from '../usecases/index.js'`, SERVICE_FILE), errors: 1 },
    { ...tsCase(`import { x } from './schema.js'`), errors: 1 },
    { ...tsCase(`export * from '../usecases/schema.js'`), errors: 1 },
    { ...tsCase(`import { h } from '../handlers/index.js'`), errors: 1 },
    { ...tsCase(`import * as StudioService from '../services/index.js'`, HANDLER_FILE), errors: 1 },
  ],
})

tester.run('domain-only-from-usecases', rule('domain-only-from-usecases'), {
  valid: [
    tsCase(`import * as SqlDomain from '../domain/index.js'`),
    tsCase(`import { makeCell } from './values.js'`, DOMAIN_FILE),
    tsCase(`import type { Dialect } from '../domain/index.js'`, SERVICE_FILE),
  ],
  invalid: [
    { ...tsCase(`import * as SqlDomain from '../domain/index.js'`, SERVICE_FILE), errors: 1 },
    {
      ...tsCase(`import * as SqlDomain from './domain/index.js'`, 'src/studio/server/app.ts'),
      errors: 1,
    },
  ],
})

tester.run('domain-import-allowlist', rule('domain-import-allowlist'), {
  valid: [
    tsCase(`import * as z from 'zod'`, DOMAIN_FILE),
    tsCase(`import { parse } from 'acorn'`, DOMAIN_FILE),
    tsCase(`import { makeCell } from './values.js'`, DOMAIN_FILE),
    tsCase(`import { quoteIdentifier } from '../../../sql/index.js'`, DOMAIN_FILE),
    tsCase(`import { erKey } from '../../../utils/relation.js'`, DOMAIN_FILE),
    tsCase(`import type { DMMF } from '@prisma/generator-helper'`, DOMAIN_FILE),
  ],
  invalid: [
    { ...tsCase(`import { Effect } from 'effect'`, DOMAIN_FILE), errors: 1 },
    { ...tsCase(`import fs from 'node:fs'`, DOMAIN_FILE), errors: 1 },
    { ...tsCase(`import * as LoadService from '../services/index.js'`, DOMAIN_FILE), errors: 1 },
    { ...tsCase(`const m = import('./values.js')`, DOMAIN_FILE), errors: 1 },
  ],
})

tester.run('domain-no-nondeterminism', rule('domain-no-nondeterminism'), {
  valid: [tsCase(`const at = new Date(input.at)`, DOMAIN_FILE)],
  invalid: [
    { ...tsCase(`const at = Date.now()`, DOMAIN_FILE), errors: 1 },
    { ...tsCase(`const at = new Date()`, DOMAIN_FILE), errors: 1 },
    { ...tsCase(`const id = crypto.randomUUID()`, DOMAIN_FILE), errors: 1 },
    { ...tsCase(`const n = Math.random()`, DOMAIN_FILE), errors: 1 },
  ],
})

tester.run('domain-no-side-effects', rule('domain-no-side-effects'), {
  valid: [tsCase(`export function makeCell(input: { a: number }) { return input.a }`, DOMAIN_FILE)],
  invalid: [
    { ...tsCase(`console.log(1)`, DOMAIN_FILE), errors: 1 },
    { ...tsCase(`const cwd = process.cwd()`, DOMAIN_FILE), errors: 1 },
    { ...tsCase(`export async function read() { return 1 }`, DOMAIN_FILE), errors: 1 },
    { ...tsCase(`let cache = 1`, DOMAIN_FILE), errors: 1 },
    { ...tsCase(`setTimeout(() => 1, 10)`, DOMAIN_FILE), errors: 1 },
  ],
})

tester.run('handler-one-usecase', rule('handler-one-usecase'), {
  valid: [tsCase(`export const h = (c) => DocsUseCase.readDocs()`, HANDLER_FILE)],
  invalid: [
    {
      ...tsCase(
        `export const h = (c) => [DocsUseCase.readDocs(), DatabaseUseCase.readDbStatus()]`,
        HANDLER_FILE,
      ),
      errors: 1,
    },
  ],
})

tester.run('handler-request-valid', rule('handler-request-valid'), {
  valid: [
    tsCase(`const data = c.req.valid('json')`, HANDLER_FILE),
    tsCase(`const data = { ...c.req.valid('param'), ...c.req.valid('json') }`, HANDLER_FILE),
    // `c.req.path` is no read of the input.
    tsCase(`const at = c.req.path`, HANDLER_FILE),
  ],
  invalid: [
    { ...tsCase(`const body = await c.req.json()`, HANDLER_FILE), errors: 1 },
    { ...tsCase(`const { model } = c.req.valid('param')`, HANDLER_FILE), errors: 1 },
    { ...tsCase(`MigrateUseCase.rehearse(c.req.valid('json'))`, HANDLER_FILE), errors: 1 },
  ],
})

tester.run('handler-response-shape', rule('handler-response-shape'), {
  valid: [
    tsCase(`c.json(DocsSchema.parse(docs), 200)`, HANDLER_FILE),
    tsCase(`c.json({ type: '/problems/not-found', status: 404 } as const, 404)`, HANDLER_FILE),
  ],
  invalid: [
    { ...tsCase(`c.json(docs, 200)`, HANDLER_FILE), errors: 1 },
    {
      ...tsCase(`c.json(NotFoundProblemSchema.parse({ status: 404 }), 404)`, HANDLER_FILE),
      errors: 1,
    },
    { ...tsCase(`c.json({ status: 404 }, 404)`, HANDLER_FILE), errors: 1 },
  ],
})

tester.run('effect-run-at-edge', rule('effect-run-at-edge'), {
  valid: [
    tsCase(`Effect.runPromise(program)`, HANDLER_FILE),
    tsCase(`Effect.runPromise(program)`, 'src/studio/server/index.ts'),
    testCase(`Effect.runPromise(program)`),
  ],
  invalid: [
    { ...tsCase(`Effect.runPromise(program)`), errors: 1 },
    { ...tsCase(`Effect.runPromise(program)`, 'src/studio/server/app.ts'), errors: 1 },
    { ...tsCase(`Effect.runPromise(program)`, 'src/studio/server/start.ts'), errors: 1 },
    { ...tsCase(`Effect.runSync(program)`, SERVICE_FILE), errors: 1 },
  ],
})

tester.run('no-throw', rule('no-throw'), {
  valid: [testCase(`throw new Error('x')`)],
  invalid: [{ ...tsCase(`throw new Error('x')`), errors: 1 }],
})

tester.run('no-try-catch', rule('no-try-catch'), {
  valid: [testCase(`try { f() } catch { g() }`), tsCase(`try { f() } finally { g() }`)],
  invalid: [{ ...tsCase(`try { f() } catch { g() }`), errors: 1 }],
})

tester.run('no-class', rule('no-class'), {
  valid: [
    tsCase(
      `export class UnknownModelError extends Data.TaggedError('UnknownModelError')<{}> {}`,
      'src/studio/server/errors/index.ts',
    ),
  ],
  invalid: [
    { ...tsCase(`class State {}`), errors: 1 },
    {
      ...tsCase(`class NotFound extends Error {}`, 'src/studio/server/errors/index.ts'),
      errors: 1,
    },
  ],
})

tester.run('layer-function-shape', rule('layer-function-shape'), {
  valid: [
    tsCase(`export function readDbStatus() { return 1 }`),
    tsCase(`export function runSql(input: { sql: string }) { return input.sql }`),
    tsCase(`export const runSql = (input: { sql: string }) => input.sql`),
    tsCase(`function local(a: number, b: number) { return a + b }`),
  ],
  invalid: [
    {
      ...tsCase(`export function runSql(sql: string, params: unknown[]) { return sql }`),
      errors: 1,
    },
    { ...tsCase(`export function runSql(sql: string) { return sql }`), errors: 1 },
  ],
})

tester.run('no-type-assertion', rule('no-type-assertion'), {
  valid: [tsCase(`const KINDS = ['sqlite'] as const`), testCase(`const x = value as Config`)],
  invalid: [
    { ...tsCase(`const x = value as Config`), errors: 1 },
    { ...tsCase(`const x = <Config>value`), errors: 1 },
  ],
})

tester.run('match-exhaustive', rule('match-exhaustive'), {
  valid: [tsCase(`Match.value(error).pipe(Match.tag('A', a), Match.exhaustive)`)],
  invalid: [
    { ...tsCase(`Match.value(error).pipe(Match.tag('A', a))`), errors: 1 },
    { ...tsCase(`Match.value(error).pipe(Match.tag('A', a), Match.orElse(b))`), errors: 2 },
  ],
})

tester.run('catch-must-log', rule('catch-must-log'), {
  valid: [
    tsCase(`read.pipe(Effect.catch((error) => Effect.logDebug('read failed', error)))`),
    tsCase(`read.pipe(Effect.catch(() => Effect.fail(new UnknownModelError({ model }))))`),
    testCase(`read.pipe(Effect.ignore)`),
  ],
  invalid: [
    { ...tsCase(`read.pipe(Effect.catch(() => Effect.void))`), errors: 1 },
    { ...tsCase(`read.pipe(Effect.orElseSucceed(() => null))`), errors: 1 },
    { ...tsCase(`read.pipe(Effect.ignore)`), errors: 1 },
  ],
})

tester.run('require-tsdoc', rule('require-tsdoc'), {
  valid: [
    tsCase(`/** Reads. */\nexport function read() { return 1 }`, 'src/studio/server/app.ts'),
    tsCase(
      `/**\n * Reads.\n * @param input.sql - the statement\n * @returns the rows\n */\nexport function read(input: { sql: string }) { return input.sql }`,
      SERVICE_FILE,
    ),
    tsCase(
      `/**\n * Reads.\n * @param input.sql - the statement\n * @returns the rows\n * @example read({ sql: 'x' }) // 'x'\n */\nexport function read(input: { sql: string }) { return input.sql }`,
      DOMAIN_FILE,
    ),
    // A constant is not a function.
    tsCase(`export const LIMIT = 1`, SERVICE_FILE),
    // An input typed by name may be documented field by field.
    tsCase(
      `/**\n * Reads.\n * @param input.sql - the statement\n * @returns the rows\n */\nexport function read(input: Input) { return input.sql }`,
      SERVICE_FILE,
    ),
  ],
  invalid: [
    { ...tsCase(`export function read() { return 1 }`, 'src/studio/server/app.ts'), errors: 1 },
    {
      ...tsCase(
        `/** Reads. */\nexport function read(input: { sql: string }) { return 1 }`,
        SERVICE_FILE,
      ),
      errors: 1,
    },
    {
      ...tsCase(
        `/**\n * Reads.\n * @param input.sql - the statement\n * @returns the rows\n */\nexport function read(input: { sql: string }) { return input.sql }`,
        DOMAIN_FILE,
      ),
      errors: 1,
    },
  ],
})

tester.run('require-sequence-diagram', rule('require-sequence-diagram'), {
  valid: [
    tsCase(
      '/**\n * Reads.\n * ```mermaid\n * sequenceDiagram\n * ```\n */\nexport function read() {}',
    ),
    tsCase('export * from "./read.js"', 'src/studio/server/usecases/index.ts'),
  ],
  invalid: [{ ...tsCase('/** Reads. */\nexport function read() {}'), errors: 1 }],
})

tester.run('require-diagram', rule('require-diagram'), {
  valid: [
    tsCase(
      '/**\n * Reads.\n * ```mermaid\n * flowchart LR\n * ```\n */\nexport function read() {}',
      SERVICE_FILE,
    ),
  ],
  invalid: [{ ...tsCase('/** Reads. */\nexport function read() {}', SERVICE_FILE), errors: 1 }],
})

// performance.js

tester.run('effect-explicit-concurrency', rule('effect-explicit-concurrency'), {
  valid: [
    tsCase(`Effect.all([a, b], { concurrency: 2 })`),
    tsCase(`Effect.forEach(xs, run, { concurrency: 1, discard: true })`),
    tsCase(`Effect.all([a, b], { concurrency: 'unbounded' })`),
    testCase(`Effect.all([a, b])`),
  ],
  invalid: [
    { ...tsCase(`Effect.all([a, b])`), errors: 1 },
    { ...tsCase(`Effect.all([a, b], { discard: true })`), errors: 1 },
    { ...tsCase(`Effect.forEach(xs, run)`), errors: 1 },
  ],
})

tester.run('no-lookup-in-loop', rule('no-lookup-in-loop'), {
  valid: [
    tsCase(
      `const byName = new Map(fields.map((f) => [f.name, f])); rows.map((row) => byName.get(row.name))`,
    ),
    // What the loop hands in, or declares for each turn, is not repeated work.
    tsCase(`rows.map((row) => row.cells.find((c) => c.ok))`),
    tsCase(`rows.map((row) => { const child = pick(row); return child.fields.find((f) => f.ok) })`),
    tsCase(`for (const row of rows) row.cells.includes(1)`),
    tsCase(`const field = fields.find((f) => f.name === name)`),
  ],
  invalid: [
    { ...tsCase(`rows.map((row) => fields.find((f) => f.name === row.name))`), errors: 1 },
    { ...tsCase(`for (const row of rows) names.includes(row.name)`), errors: 1 },
    { ...tsCase(`rows.filter((row) => model.fields.some((f) => f.name === row.name))`), errors: 1 },
  ],
})

tester.run('one-studio-read', rule('one-studio-read'), {
  valid: [
    tsCase(`function read() { const { state, db } = StudioService.studio(); return [state, db] }`),
    tsCase(
      `function a() { return StudioService.studio().state }\nfunction b() { return StudioService.studio().db }`,
    ),
  ],
  invalid: [
    {
      ...tsCase(
        `function read() { const state = StudioService.studio().state; const db = StudioService.studio().db; return [state, db] }`,
      ),
      errors: 1,
    },
  ],
})

tester.run('hoist-constant', rule('hoist-constant'), {
  valid: [
    tsCase(`const READ = new RegExp('^select', 'iu')`),
    tsCase(`function f(name: string) { return new RegExp(name) }`),
    tsCase(`function f(xs: string[]) { return new Set(xs) }`),
  ],
  invalid: [
    {
      ...tsCase(`function f(sql: string) { return new RegExp('^select', 'iu').test(sql) }`),
      errors: 1,
    },
    { ...tsCase(`function f(w: string) { return new Set(['select', 'with']).has(w) }`), errors: 1 },
  ],
})

function generatorCase(code: string) {
  return { code, filename: 'src/helper/x.ts' }
}

tester.run('documentation-read', rule('documentation-read'), {
  valid: [
    generatorCase(`const prose = stripAnnotations(model.documentation)`),
    generatorCase(
      `const doc = stripAnnotations(model.fields.find((f) => f.name === name)?.documentation)`,
    ),
    generatorCase(`const calls = arCalls(field.documentation, 'field')`),
    generatorCase(`const config = extractConfigDict(model.documentation)`),
    { code: `const doc = field.documentation`, filename: 'src/helper/x.test.ts' },
  ],
  invalid: [
    {
      ...generatorCase(`const lines = goCommentLines(field.documentation)`),
      errors: [{ message: /stripAnnotations/u }],
    },
    {
      ...generatorCase(`const doc = field.documentation ?? ''`),
      errors: [{ message: /stripAnnotations/u }],
    },
    {
      ...generatorCase(
        `const prose = stripAnnotations(field.documentation ?? owner.documentation)`,
      ),
      errors: [{ message: /stripAnnotations/u }, { message: /stripAnnotations/u }],
    },
    {
      ...generatorCase(`const lines = rustDocLines(model.fields[0]?.documentation, '')`),
      errors: [{ message: /stripAnnotations/u }],
    },
  ],
})

tester.run('doc-block-helper', rule('doc-block-helper'), {
  valid: [
    generatorCase(`const lines = docBlockLines(stripAnnotations(model.documentation), '')`),
    generatorCase(`const line = '    /** @var list<string> */'`),
    generatorCase(
      'const code = `class X\\n{\\n    /** @var list<string> */\\n    public array $a = [];\\n}`',
    ),
    { code: 'const line = `/** ${prose} */`', filename: 'src/helper/x.test.ts' },
  ],
  invalid: [
    {
      ...generatorCase('const line = `/** ${prose} */`'),
      errors: [{ message: /docBlockLines/u }],
    },
    {
      ...generatorCase(`const lines = ['/**', ...body.map((line) => \` * \${line}\`), ' */']`),
      errors: [{ message: /docBlockLines/u }],
    },
    {
      ...generatorCase('const line = `${indent}/**\\n${indent} * ${prose}\\n${indent} */`'),
      errors: [{ message: /docBlockLines/u }],
    },
  ],
})

describe('documentedOptions', () => {
  const readme = [
    '| Provider | Writes | Options |',
    '| --- | --- | --- |',
    '| `hekireki-zod` | Zod | `type`, `relation`, `zod` (`"v4"`, `"mini"`) |',
    '| `hekireki-er` | ER diagram | `outputs`: files, one per extension (`.md`, `.png`); `theme` (`light`, `dark`) |',
    '| `hekireki-seed` | Schema module | |',
  ].join('\n')

  it('reads the option each item of the cell starts with, leaving the values out', () => {
    expect(documentedOptions(readme, 'hekireki-zod')).toStrictEqual(['type', 'relation', 'zod'])
    expect(documentedOptions(readme, 'hekireki-er')).toStrictEqual(['outputs', 'theme'])
    expect(documentedOptions(readme, 'hekireki-seed')).toStrictEqual([])
  })

  it('is null for a provider no row names', () => {
    expect(documentedOptions(readme, 'hekireki-gorm')).toBeNull()
  })
})

tester.run('generator-pure', rule('generator-pure'), {
  valid: [
    generatorCase(`const line = '.$defaultFn(() => crypto.randomUUID())'`),
    generatorCase(`const at = new Date(value)`),
    generatorCase(`function code(document) { return document.datamodel }`),
    { code: `const now = Date.now()`, filename: 'src/helper/x.test.ts' },
  ],
  invalid: [
    { ...generatorCase(`const at = new Date()`), errors: [{ message: /reads the clock/u }] },
    { ...generatorCase(`const id = crypto.randomUUID()`), errors: [{ message: /run to run/u }] },
    { ...generatorCase(`const n = Math.random()`), errors: [{ message: /run to run/u }] },
    { ...generatorCase(`const zone = process.env.TZ`), errors: [{ message: /`process`/u }] },
    { ...generatorCase(`console.log('x')`), errors: [{ message: /`console`/u }] },
    { ...generatorCase(`async function emit() {}`), errors: [{ message: /async/u }] },
  ],
})

tester.run('helper-no-generator-import', rule('helper-no-generator-import'), {
  valid: [
    generatorCase(`import { stripAnnotations } from '../utils/index.js'`),
    generatorCase(`import { makeZodSchema } from './zod.js'`),
    {
      code: `import { djangoCode } from '../generator/django.js'`,
      filename: 'src/helper/x.test.ts',
    },
  ],
  invalid: [
    {
      ...generatorCase(`import { djangoCode } from '../generator/django.js'`),
      errors: [{ message: /utils -> helper -> generator/u }],
    },
  ],
})
