import path from 'node:path'

import { Faker, allLocales } from '@faker-js/faker'
import { Effect } from 'effect'

import { DEFAULT_SCHEMA_PATHS } from '../cli/constants.js'
import { resolveDatabaseUrl } from '../database/resolve.js'
import type { Dialect } from '../database/url.js'
import { emitRaw } from '../emit/index.js'
import { exists } from '../file/index.js'
import { seedWithClient } from './client.js'
import type { SeedConfig } from './config.js'
import { ADAPTERS, discoverClient } from './discover.js'
import { SeedConfigError, SeedDatabaseError } from './errors.js'
import { generateSeedRows } from './generate/index.js'
import { loadSeedConfig, resolveConfigPath } from './load-config.js'
import type { ResolvedSeedConfig } from './options.js'
import { resolveSeedConfig } from './options.js'
import { makeSeedPlan } from './plan.js'
import { withTypeScriptImports } from './resolve.js'
import { dialectOf, parseSchema, readSchemaFiles, schemaText } from './schema.js'
import type { GeneratorBlock, SchemaFile } from './schema.js'
import { makeSeedSql } from './sql.js'

export type SeedOverrides = {
  readonly config: string | null
  readonly schema: string | null
  readonly url: string | null
  readonly output: string | null
  readonly seed: number | null
  readonly count: number | null
  readonly locale: string | null
  readonly reset: boolean
}

/**
 * The schema as named (resolved from `base`), else the first default path that exists under the
 * working directory, then beside the config.
 */
function findSchemaPath(explicit: string | null, base: string, cwd: string) {
  return Effect.gen(function* () {
    if (explicit !== null) {
      const resolved = path.resolve(base, explicit)
      if (yield* exists(resolved)) return resolved
      return yield* new SeedConfigError({
        message: `Schema not found: ${explicit}\n   Check --schema or the \`schema\` option of hekireki.config.ts.`,
      })
    }
    for (const dir of [cwd, base]) {
      for (const candidate of DEFAULT_SCHEMA_PATHS) {
        const resolved = path.resolve(dir, candidate)
        if (yield* exists(resolved)) return resolved
      }
    }
    return yield* new SeedConfigError({
      message: `No Prisma schema found (looked for ${DEFAULT_SCHEMA_PATHS.join(', ')}).\n   Pass --schema <path> or set \`schema\` in hekireki.config.ts.`,
    })
  })
}

/**
 * A faker speaking the configured locales, each falling back to the next, then to English, seeded
 * when the config names a seed and drawing fresh randomness otherwise.
 */
function makeFaker(seed: number | null, locales: readonly string[] | null) {
  return Effect.gen(function* () {
    const definitions = (locales ?? []).map((code) => ({
      code,
      definition: Object.entries(allLocales).find(
        ([name]) => name === code.replaceAll('-', '_'),
      )?.[1],
    }))
    const unknown = definitions.filter((entry) => entry.definition === undefined)
    if (unknown.length > 0) {
      return yield* new SeedConfigError({
        message: `Unknown faker locale: ${unknown.map((entry) => entry.code).join(', ')}.\n   Use one of ${Object.keys(allLocales).join(', ')}.`,
      })
    }
    const faker = new Faker({
      locale: [
        ...definitions.flatMap((entry) =>
          entry.definition === undefined ? [] : [entry.definition],
        ),
        allLocales.en,
        allLocales.base,
      ],
    })
    if (seed !== null) faker.seed(seed)
    // Without a `dates` window, dates fall in the year before the run. Anchored on the day, not
    // the millisecond, so two seeded runs on the same day agree.
    const today = new Date()
    faker.setDefaultRefDate(
      new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())),
    )
    return faker
  })
}

function withOverrides(config: SeedConfig, overrides: SeedOverrides) {
  return {
    ...config,
    ...(overrides.schema === null ? {} : { schema: overrides.schema }),
    ...(overrides.url === null ? {} : { url: overrides.url }),
    ...(overrides.output === null ? {} : { output: overrides.output }),
    ...(overrides.seed === null ? {} : { seed: overrides.seed }),
    ...(overrides.count === null ? {} : { count: overrides.count }),
    ...(overrides.locale === null
      ? {}
      : { locale: overrides.locale.split(',').map((s) => s.trim()) }),
    ...(overrides.reset ? { reset: true } : {}),
  }
}

/** The dialect the SQL is written for; the seeder writes the three databases Prisma has adapters for. */
function requireDialect(provider: string | null, purpose: string) {
  const dialect = dialectOf(provider)
  return dialect === null
    ? Effect.fail(
        new SeedConfigError({
          message: `Cannot ${purpose} for datasource provider "${provider ?? 'unknown'}".\n   Supported: postgresql, cockroachdb, mysql, sqlite.`,
        }),
      )
    : Effect.succeed(dialect)
}

/**
 * The Prisma Client the rows go through: the one `client` in the config returns, else the one
 * the schema generates, opened with the project's driver adapter and the database URL.
 */
function findClient(input: {
  readonly config: ResolvedSeedConfig
  readonly generators: readonly GeneratorBlock[]
  readonly files: readonly SchemaFile[]
  readonly schemaPath: string
  readonly cwd: string
  readonly dialect: Dialect
}) {
  return Effect.gen(function* () {
    if (input.config.client !== null) {
      const factory = input.config.client
      const client = yield* Effect.tryPromise({
        try: () => Promise.resolve(factory()),
        catch: (error) =>
          new SeedDatabaseError({
            message: `\`client\` threw: ${error instanceof Error ? error.message : String(error)}`,
          }),
      })
      return { client, source: 'config' }
    }
    const schemaDir = path.dirname(input.schemaPath)
    const { url } = yield* resolveDatabaseUrl({
      explicitUrl: input.config.url,
      configUrl: null,
      configError: null,
      schemaText: schemaText(input.files),
      cwd: input.cwd,
      schemaDir,
      env: process.env,
    }).pipe(
      Effect.mapError(
        (error) =>
          new SeedDatabaseError({
            message: `${error.reason}\n   Or pass --sql <file> to write the rows as SQL instead.`,
          }),
      ),
    )
    const found = yield* discoverClient({
      generators: input.generators,
      schemaDir,
      cwd: input.cwd,
      url,
      dialect: input.dialect,
    })
    if (found.client === null) {
      const adapter = ADAPTERS[input.dialect]
      return yield* new SeedDatabaseError({
        message: `Prisma Client not found: ${found.reason ?? 'unknown'}.\n   Add a \`prisma-client\` generator to the schema and run \`prisma generate\`, install ${adapter.pkg}, set \`client\` in hekireki.config.ts, or pass --sql <file> to write the rows as a script instead.`,
      })
    }
    return { client: found.client, source: found.source ?? 'generated' }
  })
}

function seedProgram(overrides: SeedOverrides, cwd: string) {
  return Effect.gen(function* () {
    const configPath = yield* resolveConfigPath(overrides.config, cwd)
    const loaded = configPath === null ? {} : yield* loadSeedConfig(configPath)
    const configDir = configPath === null ? cwd : path.dirname(configPath)
    const config = resolveSeedConfig(withOverrides(loaded, overrides))
    const schemaPath = yield* findSchemaPath(
      config.schema,
      overrides.schema === null ? configDir : cwd,
      cwd,
    )
    const files = yield* readSchemaFiles(schemaPath)
    const schema = yield* parseSchema(files)
    const tables = yield* makeSeedPlan(schema.datamodel)
    const faker = yield* makeFaker(config.seed, config.locale)
    const entries = yield* generateSeedRows({ tables, config, faker })
    const report = {
      seed: config.seed,
      locale: config.locale ?? [],
      schemaPath,
      configPath,
      tables: entries.map((entry) => ({
        name: entry.table.name,
        table: entry.table.table,
        rows: entry.rows.length,
      })),
    }
    if (config.output !== null) {
      const dialect = yield* requireDialect(schema.provider, 'write SQL')
      const output = path.resolve(overrides.output === null ? configDir : cwd, config.output)
      const sql = makeSeedSql({
        dialect,
        entries,
        reset: config.reset,
        seed: config.seed,
        locale: config.locale ?? [],
      })
      yield* emitRaw(sql, path.dirname(output), output).pipe(
        Effect.mapError((error) => new SeedConfigError({ message: error.message })),
      )
      return { ...report, target: { kind: 'sql' as const, path: output } }
    }
    const dialect = yield* requireDialect(schema.provider, 'seed')
    const found = yield* findClient({
      config,
      generators: schema.generators,
      files,
      schemaPath,
      cwd,
      dialect,
    })
    const done = yield* seedWithClient({
      client: found.client,
      entries,
      reset: config.reset,
      dialect,
    }).pipe(
      Effect.mapError((error) =>
        /unique|duplicate/iu.test(error.message) && !config.reset
          ? new SeedDatabaseError({
              message: `${error.message}\n   The tables already hold rows; pass --reset to empty the seeded tables first.`,
            })
          : error,
      ),
    )
    return { ...report, target: { kind: 'client' as const, source: found.source, ...done } }
  })
}

/**
 * `hekireki seed`: the config and the schema in, rows out — through the project's Prisma Client,
 * or into a SQL file when `--sql` / `output` names one. Relative imports of the config and of the
 * generated client resolve as a bundler would while it runs.
 */
export function runSeed(overrides: SeedOverrides, cwd: string) {
  return withTypeScriptImports(seedProgram(overrides, cwd))
}

export type SeedReport = Effect.Success<ReturnType<typeof runSeed>>

/** The lines `hekireki seed` prints when it is done. */
export function seedBanner(report: SeedReport) {
  const width = Math.max(...report.tables.map((t) => t.name.length), 1)
  const rows = report.tables.map(
    (t) => `   ${t.name.padEnd(width)}  ${String(t.rows).padStart(6)} rows`,
  )
  const target =
    report.target.kind === 'sql'
      ? `   SQL: ${report.target.path}`
      : `   Prisma Client: ${report.target.source}, ${report.target.operations} writes in one transaction`
  return [
    `⚡️ Seeded ${report.tables.reduce((sum, t) => sum + t.rows, 0)} rows (seed ${report.seed ?? 'random'}, locale ${report.locale.length === 0 ? 'en' : report.locale.join(', ')})`,
    `   Schema: ${report.schemaPath}`,
    ...(report.configPath === null ? [] : [`   Config: ${report.configPath}`]),
    target,
    ...rows,
  ].join('\n')
}
