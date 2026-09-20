import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// oxlint-disable-next-line import/no-namespace -- the generated bindings name no type for the module
import type * as SchemaEngineWasm from '@prisma/schema-engine-wasm/schema_engine_bg'
import { Effect, Semaphore } from 'effect'
import * as z from 'zod'

import { readBytes } from '../../file/index.js'
import { MigrateEngineError } from '../errors.js'

/** The bindings of the engine, as `@prisma/schema-engine-wasm` declares them. */
type Bindings = typeof SchemaEngineWasm

/**
 * The engine commands are sent to: the commands of `SchemaEngine` Studio sends. The wasm engine
 * reads the database through the adapter; the native one (`native-engine.ts`) through its URL, and
 * answers the same commands with the same shapes.
 */
export type Engine = Pick<
  Awaited<ReturnType<Bindings['SchemaEngine']['new']>>,
  | 'diff'
  | 'diagnoseMigrationHistory'
  | 'applyMigrations'
  | 'markMigrationApplied'
  | 'markMigrationRolledBack'
>

const WasmStart = z
  .custom<() => void>((value) => typeof value === 'function')
  .meta({ description: 'The start hook wasm-bindgen puts on the instantiated module.' })

/**
 * Where a panic in the engine writes its message before the WebAssembly trap unwinds. Without
 * this global the trap surfaces as `Cannot read properties of undefined (reading 'set_message')`,
 * which says nothing about what went wrong.
 */
const panics: { message: string | null } = { message: null }

/**
 * What a failed command is reported as: the panic the engine wrote, else the thrown error. The
 * panic is taken as it is read, so a later failure cannot report a stale one.
 */
function engineError(error: unknown) {
  const { message } = panics
  // oxlint-disable-next-line custom/no-mutation -- reading a panic clears it
  panics.message = null
  return new MigrateEngineError({
    message: message ?? (error instanceof Error ? error.message : String(error)),
  })
}

/**
 * The bindings, instantiated once. `schema_engine_bg.js` holds the instance in a module-level
 * cell that `__wbg_set_wasm` writes, so a second instantiation would pull the memory out from
 * under the first engine.
 */
const loaded: { bindings: Bindings | null } = { bindings: null }
const lock = Semaphore.makeUnsafe(1)

function instantiate() {
  return Effect.gen(function* () {
    const entry = yield* Effect.try({
      try: () =>
        createRequire(import.meta.url).resolve('@prisma/schema-engine-wasm/schema_engine_bg'),
      catch: engineError,
    })
    const bindings = yield* Effect.tryPromise({
      try: (): Promise<Bindings> => import(pathToFileURL(entry).href),
      catch: engineError,
    })
    // The package's own entry point imports the .wasm as a module, which only a bundler can do;
    // the bytes next to the bindings are instantiated against them instead.
    const bytes = yield* readBytes(path.join(path.dirname(entry), 'schema_engine_bg.wasm')).pipe(
      Effect.mapError(engineError),
    )
    return yield* Effect.try({
      try: () => {
        // `Uint8Array.from` copies the bytes into a plain ArrayBuffer, which is what
        // WebAssembly.Module takes; what the file system hands back may be backed by a shared one.
        const instance = new WebAssembly.Instance(new WebAssembly.Module(Uint8Array.from(bytes)), {
          './schema_engine_bg.js': bindings,
        })
        // oxlint-disable-next-line eslint/no-underscore-dangle -- wasm-bindgen names its two hooks
        const result = WasmStart.safeParse(instance.exports.__wbindgen_start)
        if (!result.success) {
          throw new TypeError('The engine module exports no __wbindgen_start.')
        }
        // oxlint-disable-next-line eslint/no-underscore-dangle -- wasm-bindgen names its two hooks
        bindings.__wbg_set_wasm(instance.exports)
        result.data()
        return bindings
      },
      catch: engineError,
    })
  })
}

/** The bindings of the engine, loaded the first time they are asked for. */
export function schemaEngineBindings() {
  return Effect.gen(function* () {
    Reflect.set(globalThis, 'PRISMA_WASM_PANIC_REGISTRY', {
      set_message: (message: string) => {
        // oxlint-disable-next-line custom/no-mutation -- the one cell a panic can write to
        panics.message = message
      },
    })
    if (loaded.bindings !== null) return loaded.bindings
    const bindings = yield* instantiate()
    // oxlint-disable-next-line custom/no-mutation -- the bindings are instantiated once and kept
    loaded.bindings = bindings
    return bindings
  }).pipe(Semaphore.withPermit(lock))
}

/**
 * An engine connected through `adapter`, reading `files` as its datamodel. The engine panics on
 * an empty datamodel (`psl::validate_multi_file() must be called with at least one file`), so
 * only a schema that parsed is ever handed to it.
 *
 * @param input - the schema files the commands are read against, the adapter every statement
 * goes through, and where the engine's log lines go
 */
export function openSchemaEngine(input: {
  readonly files: readonly { readonly path: string; readonly content: string }[]
  readonly adapter: object
  /** Where the engine's log lines go; they are JSON, one line each. */
  readonly onLog?: (line: string) => void
}) {
  return Effect.gen(function* () {
    if (input.files.length === 0) {
      return yield* new MigrateEngineError({
        message: 'The schema engine needs at least one schema file.',
      })
    }
    const bindings = yield* schemaEngineBindings()
    return yield* Effect.tryPromise({
      try: () =>
        bindings.SchemaEngine.new(
          { datamodels: input.files.map((file) => [file.path, file.content]) },
          input.onLog ?? ((line: string) => line),
          input.adapter,
        ),
      catch: engineError,
    })
  })
}

/** Sends one command to the engine, a panic reported as the message the engine wrote. */
export function engineCommand<A>(run: () => Promise<A>) {
  return Effect.tryPromise({ try: run, catch: engineError })
}
