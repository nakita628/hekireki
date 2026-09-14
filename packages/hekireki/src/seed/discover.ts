import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { Effect } from 'effect'

import type { Dialect } from '../database/url.js'
import { makeSqliteFilePath } from '../database/url.js'
import { SeedDatabaseError } from './errors.js'
import type { GeneratorBlock } from './schema.js'

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}

/** The `prisma-client` (or legacy `prisma-client-js`) generator block of the schema, if any. */
function clientGenerator(generators: readonly GeneratorBlock[]) {
  return (
    generators.find((g) => ['prisma-client', 'prisma-client-js'].includes(g.provider.value)) ?? null
  )
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

/** A package as the project resolves it, so the adapter and the client are the project's own. */
function importFromProject(specifier: string, cwd: string) {
  return Effect.tryPromise({
    try: async () => {
      const resolved = createRequire(path.join(cwd, 'package.json')).resolve(specifier)
      const loaded: unknown = await import(pathToFileURL(resolved).href)
      return loaded
    },
    catch: (error) =>
      new SeedDatabaseError({
        message: `Cannot load "${specifier}" from ${cwd}: ${messageOf(error)}`,
      }),
  })
}

/** The driver adapter package and class Prisma publishes for each dialect. */
export const ADAPTERS: Readonly<Record<Dialect, { readonly pkg: string; readonly name: string }>> =
  {
    postgresql: { pkg: '@prisma/adapter-pg', name: 'PrismaPg' },
    mysql: { pkg: '@prisma/adapter-mariadb', name: 'PrismaMariaDb' },
    sqlite: { pkg: '@prisma/adapter-better-sqlite3', name: 'PrismaBetterSqlite3' },
  }

function isConstructor(value: unknown): value is new (argument: unknown) => unknown {
  return typeof value === 'function'
}

function isClientConstructor(
  value: unknown,
): value is new (options: { readonly adapter: unknown }) => unknown {
  return typeof value === 'function'
}

/** The driver adapter for the dialect, built from the project's package, or the reason there is none. */
function makeAdapter(dialect: Dialect, url: string, cwd: string, schemaDir: string) {
  return Effect.gen(function* () {
    const { pkg, name } = ADAPTERS[dialect]
    const loaded = yield* importFromProject(pkg, cwd).pipe(
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
    if (!isConstructor(factory)) {
      return { adapter: null, reason: `${pkg} does not export ${name}` }
    }
    const argument =
      dialect === 'sqlite' ? { url: makeSqliteFilePath({ url, baseDir: schemaDir }) } : url
    return yield* Effect.try({
      try: () => new factory(argument),
      catch: (error) => new SeedDatabaseError({ message: messageOf(error) }),
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
 * the project has for its database. Null, with the reason, when any piece is missing, so the
 * caller can fall back to the database URL.
 */
export function discoverClient(input: {
  readonly generators: readonly GeneratorBlock[]
  readonly schemaDir: string
  readonly cwd: string
  readonly url: string
  readonly dialect: Dialect
}) {
  return Effect.gen(function* () {
    const generator = clientGenerator(input.generators)
    if (generator === null) {
      return { client: null, source: null, reason: 'no prisma-client generator in the schema' }
    }
    const source =
      generator.provider.value === 'prisma-client-js'
        ? '@prisma/client'
        : (generator.output?.value ?? null)
    if (source === null) {
      return { client: null, source: null, reason: 'the prisma-client generator has no output' }
    }
    const loaded = yield* (
      source === '@prisma/client'
        ? importFromProject(source, input.cwd)
        : Effect.tryPromise({
            try: async () => {
              const namespace: unknown = await import(
                pathToFileURL(clientEntry(input.schemaDir, source)).href
              )
              return namespace
            },
            catch: (error) => new SeedDatabaseError({ message: messageOf(error) }),
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
    const clientClass = isRecord(loaded.value) ? loaded.value.PrismaClient : undefined
    if (!isClientConstructor(clientClass)) {
      return { client: null, source, reason: `${source} does not export PrismaClient` }
    }
    const adapter = yield* makeAdapter(input.dialect, input.url, input.cwd, input.schemaDir)
    if (adapter.adapter === null) return { client: null, source, reason: adapter.reason }
    return yield* Effect.try({
      try: () => new clientClass({ adapter: adapter.adapter }),
      catch: (error) => new SeedDatabaseError({ message: messageOf(error) }),
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
