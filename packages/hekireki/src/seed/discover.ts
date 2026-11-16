import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { Effect } from 'effect'
import type * as z from 'zod'

import { adapterOf, makeAdapterArgs } from '../database/domain/adapter.js'
import type { Dialect } from '../database/url.js'
import { importFromProject } from '../file/index.js'
import type { GeneratorBlock } from '../schema/index.js'
import { SeedDatabaseError } from './errors.js'

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}

/** The `prisma-client` (or legacy `prisma-client-js`) generator block of the schema, if any. */
function clientGenerator(generators: readonly z.infer<typeof GeneratorBlock>[]) {
  return (
    generators.find((g) => ['prisma-client', 'prisma-client-js'].includes(g.provider.value)) ?? null
  )
}

/**
 * Where the schema says the Prisma Client is: the `output` of its `prisma-client` generator, or
 * `@prisma/client` for the legacy `prisma-client-js`; null, with the reason, when it says nothing.
 */
export function clientSource(generators: readonly z.infer<typeof GeneratorBlock>[]) {
  const generator = clientGenerator(generators)
  if (generator === null) {
    return { source: null, reason: 'no prisma-client generator in the schema' }
  }
  const source =
    generator.provider.value === 'prisma-client-js'
      ? '@prisma/client'
      : (generator.output?.value ?? null)
  return source === null
    ? { source: null, reason: 'the prisma-client generator has no output' }
    : { source, reason: null }
}

/** A package as the project resolves it, so the adapter and the client are the project's own. */
function importForSeed(specifier: string, cwd: string) {
  return importFromProject(specifier, cwd).pipe(
    Effect.mapError(
      (error) =>
        new SeedDatabaseError({
          message: `Cannot load "${specifier}" from ${cwd}: ${error.message}`,
        }),
    ),
  )
}

/** The driver adapter for the dialect, built from the project's package, or the reason there is none. */
function makeAdapter(dialect: Dialect, url: string, cwd: string, schemaDir: string) {
  return Effect.gen(function* () {
    const { pkg, name } = adapterOf(dialect, url)
    const loaded = yield* importForSeed(pkg, cwd).pipe(
      Effect.match({
        onFailure: (error) => ({
          module: null,
          reason: `${pkg} is not installed (${error.message})`,
        }),
        onSuccess: (module) => ({ module, reason: null }),
      }),
    )
    if (loaded.module === null) return { adapter: null, reason: loaded.reason }
    const factory = isRecord(loaded.module) ? loaded.module[name] : undefined
    if (typeof factory !== 'function') {
      return { adapter: null, reason: `${pkg} does not export ${name}` }
    }
    const args = makeAdapterArgs({ dialect, url, schemaDir })
    return yield* Effect.try({
      try: (): unknown => Reflect.construct(factory, [...args]),
      catch: (error) =>
        new SeedDatabaseError({ message: error instanceof Error ? error.message : String(error) }),
    }).pipe(
      Effect.match({
        onFailure: (error) => ({
          adapter: null,
          reason: `${pkg} could not build ${name}: ${error.message}`,
        }),
        onSuccess: (adapter) => ({ adapter, reason: null }),
      }),
    )
  })
}

/** The file the generated client starts at: `client.ts` as `prisma-client` writes it, or the JavaScript variants. */
function clientEntry(schemaDir: string, output: string) {
  const base = path.join(path.resolve(schemaDir, output), 'client')
  return (
    ['.ts', '.mts', '.js', '.mjs'].map((ext) => `${base}${ext}`).find(existsSync) ?? `${base}.ts`
  )
}

/**
 * The project's Prisma Client, found from the schema: the `prisma-client` generator's output
 * (or `@prisma/client` for the legacy generator), instantiated with the driver adapter package
 * the project has for its database and any other client `options`. Null, with the reason, when
 * any piece is missing, so the caller can fall back to the database URL.
 */
export function discoverClient(input: {
  readonly generators: readonly z.infer<typeof GeneratorBlock>[]
  readonly schemaDir: string
  readonly cwd: string
  readonly url: string
  readonly dialect: Dialect
  readonly options?: Readonly<Record<string, unknown>>
}) {
  return Effect.gen(function* () {
    const { source, reason } = clientSource(input.generators)
    if (source === null) return { client: null, source: null, reason }
    const loaded = yield* (
      source === '@prisma/client'
        ? importForSeed(source, input.cwd)
        : Effect.tryPromise({
            try: async () => {
              const namespace: unknown = await import(
                pathToFileURL(clientEntry(input.schemaDir, source)).href
              )
              return namespace
            },
            catch: (error) =>
              new SeedDatabaseError({
                message: error instanceof Error ? error.message : String(error),
              }),
          })
    ).pipe(
      Effect.match({
        onFailure: (error) => ({ value: null, error: error.message }),
        onSuccess: (value) => ({ value, error: null }),
      }),
    )
    if (loaded.error !== null) {
      return {
        client: null,
        source,
        reason: `the Prisma Client at ${source} could not be loaded (${loaded.error}); run \`prisma generate\``,
      }
    }
    const clientClass = isRecord(loaded.value) ? loaded.value['PrismaClient'] : undefined
    if (typeof clientClass !== 'function') {
      return { client: null, source, reason: `${source} does not export PrismaClient` }
    }
    const adapter = yield* makeAdapter(input.dialect, input.url, input.cwd, input.schemaDir)
    if (adapter.adapter === null) return { client: null, source, reason: adapter.reason }
    return yield* Effect.try({
      try: (): unknown =>
        Reflect.construct(clientClass, [{ ...input.options, adapter: adapter.adapter }]),
      catch: (error) =>
        new SeedDatabaseError({ message: error instanceof Error ? error.message : String(error) }),
    }).pipe(
      Effect.match({
        onFailure: (error) => ({
          client: null,
          source,
          reason: `the Prisma Client at ${source} could not be constructed (${error.message})`,
        }),
        onSuccess: (client) => ({ client, source, reason: null }),
      }),
    )
  })
}
