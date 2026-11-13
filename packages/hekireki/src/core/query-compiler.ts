import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { Effect } from 'effect'
import * as z from 'zod'

import type { Dialect } from '../database/url.js'
import { planStatements } from '../generator/query-examples.js'
import type { PlannedStatement, QueryExample } from '../generator/query-examples.js'
import { QueryCompilerError } from './errors.js'

/** A query with the statements it sends, or, where the compiler refused it, why. */
export type CompiledQuery = {
  readonly example: QueryExample
  readonly statements: readonly PlannedStatement[] | null
  readonly error: string | null
}

type Compiler = { readonly compile: (request: string) => unknown }

const CompilerModule = z
  .object({
    QueryCompiler: z
      .custom<new (options: object) => Compiler>((value) => typeof value === 'function')
      .meta({ description: 'The class a compiler for one schema is made with.' }),
    __wbg_set_wasm: z
      .custom<(exports: WebAssembly.Exports) => void>((value) => typeof value === 'function')
      .meta({ description: 'Hands the bindings the instantiated module.' }),
  })
  .meta({ description: "The bindings of Prisma's query compiler, one module per database" })

const ModuleImports = z
  .custom<WebAssembly.ModuleImports>((value) => typeof value === 'object' && value !== null)
  .meta({ description: 'The bindings module, as the instance imports it' })

const WasmModule = z
  .object({
    wasm: z.string().meta({ description: 'The compiled module, in base64.', example: 'AGFzbQ==' }),
  })
  .meta({ description: 'The query compiler as @prisma/client ships it, the module in base64' })

const WasmStart = z
  .custom<() => void>((value) => typeof value === 'function')
  .meta({ description: 'The start hook wasm-bindgen puts on the instantiated module.' })

/** Where a panic in the compiler writes its message before the WebAssembly trap unwinds. */
const panics: { message: string | null } = { message: null }

/**
 * Each compiler class, instantiated once per file: wasm-bindgen keeps the instance in a cell of
 * the bindings module, so a second instantiation would pull the memory out from under the first.
 */
const loaded = new Map<string, new (options: object) => Compiler>()

function compilerError(error: unknown) {
  const { message } = panics
  // Reading a panic clears it.
  panics.message = null
  return new QueryCompilerError({
    message: message ?? (error instanceof Error ? error.message : String(error)),
  })
}

/**
 * The query compiler of the project's own `@prisma/client`, for one database: the one the client
 * the project generates runs, so the SQL is what its queries send. Resolved from where the schema
 * is, as the project's own imports are.
 */
function loadCompiler(schemaPath: string, dialect: Dialect) {
  return Effect.gen(function* () {
    Reflect.set(globalThis, 'PRISMA_WASM_PANIC_REGISTRY', {
      set_message: (message: string) => {
        panics.message = message
      },
    })
    const client = yield* Effect.try({
      // A path below the schema resolves from its directory, whether it names a file or one.
      try: () =>
        createRequire(path.join(path.resolve(schemaPath), 'noop.js')).resolve(
          '@prisma/client/package.json',
        ),
      catch: () =>
        new QueryCompilerError({
          message: '@prisma/client is not installed where the schema is',
        }),
    })
    const name = `query_compiler_fast_bg.${dialect}`
    const bindingsFile = path.join(path.dirname(client), 'runtime', `${name}.mjs`)
    const cached = loaded.get(bindingsFile)
    if (cached !== undefined) return cached
    const bindings = yield* Effect.tryPromise({
      try: (): Promise<unknown> => import(pathToFileURL(bindingsFile).href),
      catch: () =>
        new QueryCompilerError({
          message: `@prisma/client has no query compiler for ${dialect} (Prisma 7 or newer ships one)`,
        }),
    })
    const encoded = yield* Effect.tryPromise({
      try: (): Promise<unknown> =>
        import(
          pathToFileURL(path.join(path.dirname(bindingsFile), `${name}.wasm-base64.mjs`)).href
        ),
      catch: compilerError,
    })
    const runtime = CompilerModule.safeParse(bindings)
    const wasm = WasmModule.safeParse(encoded)
    const exported = ModuleImports.safeParse(bindings)
    if (!runtime.success || !wasm.success || !exported.success) {
      return yield* new QueryCompilerError({
        message: 'the query compiler of @prisma/client is not one hekireki can read',
      })
    }
    const compiler = yield* Effect.try({
      try: () => {
        const module = new WebAssembly.Module(Buffer.from(wasm.data.wasm, 'base64'))
        // The bindings are imported under the name the module was built against.
        const imports = Object.fromEntries(
          WebAssembly.Module.imports(module).map((entry) => [entry.module, exported.data]),
        )
        const instance = new WebAssembly.Instance(module, imports)
        // oxlint-disable-next-line eslint/no-underscore-dangle -- wasm-bindgen names its two hooks
        const start = WasmStart.safeParse(instance.exports.__wbindgen_start)
        if (!start.success) throw new TypeError('The compiler module exports no __wbindgen_start.')
        // oxlint-disable-next-line eslint/no-underscore-dangle -- wasm-bindgen names its two hooks
        runtime.data.__wbg_set_wasm(instance.exports)
        start.data()
        return runtime.data.QueryCompiler
      },
      catch: compilerError,
    })
    loaded.set(bindingsFile, compiler)
    return compiler
  })
}

/**
 * The SQL each query sends, as the project's Prisma Client builds it: every request compiled by
 * the client's own query compiler into the plan it runs, and the statements read off the plan.
 * Nothing connects to a database. A query the compiler refuses carries its message instead.
 *
 * @param input - the schema as one text and where it is, its database, and the queries
 * @returns each query with its statements, or why there are none
 */
export function compileQueries(input: {
  readonly schemaPath: string
  readonly datamodel: string
  readonly dialect: Dialect
  readonly examples: readonly QueryExample[]
}) {
  return Effect.gen(function* () {
    const QueryCompiler = yield* loadCompiler(input.schemaPath, input.dialect)
    const compiler = yield* Effect.try({
      try: () =>
        new QueryCompiler({
          datamodel: input.datamodel,
          provider: input.dialect === 'postgresql' ? 'postgres' : input.dialect,
          // What the driver adapters tell it: only PostgreSQL's reads relations in one join.
          connectionInfo: { supportsRelationJoins: input.dialect === 'postgresql' },
        }),
      catch: compilerError,
    })
    return yield* Effect.forEach(input.examples, (example) =>
      Effect.try({
        try: () => compiler.compile(JSON.stringify(example.request)),
        catch: compilerError,
      }).pipe(
        Effect.match({
          onSuccess: (plan): CompiledQuery => ({
            example,
            statements: planStatements(plan),
            error: null,
          }),
          onFailure: (error): CompiledQuery => ({
            example,
            statements: null,
            error: error.message,
          }),
        }),
      ),
    )
  })
}
