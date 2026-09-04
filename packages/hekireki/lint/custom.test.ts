import { RuleTester } from 'oxlint/plugins-dev'
import { describe, expect, it, test } from 'vite-plus/test'

import plugin, {
  isServiceModulePath,
  isTestPath,
  isUseCaseModulePath,
  isUseCaseSpecifier,
  layerModuleOf,
  layerNamespaceOf,
} from './custom.js'

RuleTester.describe = (name, fn) => {
  describe(name, fn)
}
RuleTester.it = (name, fn) => {
  test(name, fn)
}
RuleTester.itOnly = (name, fn) => {
  test.only(name, fn)
}

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
  it('recognises usecase and service module bodies', () => {
    expect(isUseCaseModulePath('src/studio/server/usecases/schema.ts')).toBe(true)
    expect(isUseCaseModulePath('src/studio/server/usecases/index.ts')).toBe(false)
    expect(isUseCaseModulePath('src/studio/server/usecases/schema.test.ts')).toBe(false)
    expect(isUseCaseModulePath('src\\studio\\server\\usecases\\schema.ts')).toBe(true)
    expect(isServiceModulePath('src/studio/server/services/query.ts')).toBe(true)
    expect(isServiceModulePath('src/studio/server/services/index.ts')).toBe(false)
    expect(isTestPath('a/b.test.tsx')).toBe(true)
    expect(isTestPath('a/b.tsx')).toBe(false)
  })

  it('recognises usecase import targets', () => {
    expect(isUseCaseSpecifier('./schema.js')).toBe(true)
    expect(isUseCaseSpecifier('../usecases/index.js')).toBe(true)
    expect(isUseCaseSpecifier('../services/index.js')).toBe(false)
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
  ],
  invalid: [{ ...tsCase(`const userInput = z.object({})`), errors: 1 }],
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

tester.run('no-usecase-to-usecase', rule('no-usecase-to-usecase'), {
  valid: [
    tsCase(`import { x } from '../services/index.js'`),
    tsCase(`import { x } from './schema.js'`, 'src/studio/server/usecases/index.ts'),
  ],
  invalid: [
    { ...tsCase(`import { x } from './schema.js'`), errors: 1 },
    { ...tsCase(`export * from '../usecases/schema.js'`), errors: 1 },
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
        `import { studioRuntime } from '../services/index.js'`,
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

tester.run('predicate-is-name', rule('predicate-is-name'), {
  valid: [tsCase(`function isLoopback() { return true }`), tsCase(`const readRows = () => 1`)],
  invalid: [
    { ...tsCase(`function readIsLoopback() { return true }`), errors: 1 },
    { ...tsCase(`const readIsEmpty = () => true`), errors: 1 },
  ],
})
