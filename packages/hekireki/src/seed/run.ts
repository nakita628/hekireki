import path from 'node:path'

import { Faker, allLocales } from '@faker-js/faker'
import { Effect } from 'effect'

import { DEFAULT_SCHEMA_PATHS } from '../cli/constants.js'
import { emitRaw } from '../emit/index.js'
import { exists } from '../file/index.js'
import { connectDatabase } from '../studio/server/services/database.js'
import { parseSchemaFiles, readSchemaFiles } from '../studio/server/services/load.js'
import { seedWithClient } from './client.js'
import type { SeedConfig } from './config.js'
import { resolveSeedConfig } from './config.js'
import { SeedConfigError, SeedDatabaseError } from './errors.js'
import { generateSeedRows } from './generate.js'
import type { SeedTableRows } from './generate.js'
import { loadSeedConfig, resolveConfigPath } from './load-config.js'
import { makeSeedPlan } from './plan.js'
import { insertStatements, makeSeedSql, resetStatements, sequenceStatements } from './sql.js'
import type { Dialect, Statement } from './sql.js'

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

const DIALECTS: Readonly<Record<string, Dialect>> = {
  postgresql: 'postgresql',
  postgres: 'postgresql',
  cockroachdb: 'postgresql',
  mysql: 'mysql',
  sqlite: 'sqlite',
}

/** The dialect the SQL is written for, from the schema's datasource provider. */
function dialectOf(provider: string | null) {
  return provider === null ? null : (DIALECTS[provider] ?? null)
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

function withOverrides(config: SeedConfig, overrides: SeedOverrides): SeedConfig {
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

type Driver = {
  readonly query: (statement: Statement) => Effect.Effect<unknown, { readonly cause: string }>
}

function runStatements(driver: Driver, statements: readonly Statement[]) {
  return Effect.forEach(statements, (statement) => driver.query(statement), {
    discard: true,
  }).pipe(Effect.mapError((error) => new SeedDatabaseError({ message: error.cause })))
}

/** The statements in one transaction; a failure rolls it back before it is reported. */
function transaction(driver: Driver, dialect: Dialect, body: readonly Statement[]) {
  return Effect.gen(function* () {
    if (dialect === 'sqlite') {
      yield* runStatements(driver, [{ sql: 'PRAGMA foreign_keys = ON', params: [] }])
    }
    yield* runStatements(driver, [
      { sql: dialect === 'mysql' ? 'START TRANSACTION' : 'BEGIN', params: [] },
    ])
    yield* runStatements(driver, body).pipe(
      Effect.tapError(() =>
        runStatements(driver, [{ sql: 'ROLLBACK', params: [] }]).pipe(
          Effect.orElseSucceed(() => undefined),
        ),
      ),
    )
    yield* runStatements(driver, [{ sql: 'COMMIT', params: [] }])
  })
}

/** Runs the reset, the inserts and the sequence fix-ups in one transaction against the database. */
function insertIntoDatabase(input: {
  readonly url: string | null
  readonly provider: string | null
  readonly cwd: string
  readonly schemaDir: string
  readonly entries: readonly SeedTableRows[]
  readonly reset: boolean
}) {
  return Effect.gen(function* () {
    const db = yield* connectDatabase({
      explicitUrl: input.url,
      schemaProvider: input.provider,
      cwd: input.cwd,
      schemaDir: input.schemaDir,
      env: process.env,
    })
    if (!db.status.connected || db.status.dialect === null) {
      return yield* new SeedDatabaseError({
        message: `${db.status.error ?? 'No database connected.'}\n   Pass --url <connection-string>, or --sql <file> to write the rows as SQL instead.`,
      })
    }
    // `connectDatabase` returns one of two shapes; naming the union of their drivers lets it be yielded.
    const opened: Effect.Effect<
      Effect.Success<typeof db.driver>,
      Effect.Error<typeof db.driver>
    > = db.driver
    const driver = yield* opened.pipe(
      Effect.mapError((error) => new SeedDatabaseError({ message: error.reason })),
    )
    const dialect = db.status.dialect
    const tables = input.entries.map((entry) => entry.table)
    const body = [
      ...(input.reset ? resetStatements(dialect, tables) : []),
      ...input.entries
        .filter((entry) => entry.rows.length > 0)
        .flatMap((entry) => insertStatements(dialect, entry)),
      ...sequenceStatements(dialect, tables),
    ]
    yield* transaction(driver, dialect, body).pipe(
      Effect.mapError((error) =>
        /unique|duplicate/iu.test(error.message) && !input.reset
          ? new SeedDatabaseError({
              message: `${error.message}\n   The tables already hold rows; pass --reset to empty the seeded tables first.`,
            })
          : error,
      ),
      Effect.ensuring(db.close),
    )
    return { dialect, url: db.status.url ?? '' }
  })
}

/**
 * `hekireki seed`: the config and the schema in, rows out — into the database the schema's
 * datasource points at, or into a SQL file when `--sql` / `output` names one.
 */
export function runSeed(overrides: SeedOverrides, cwd: string) {
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
    const files = yield* readSchemaFiles({ schemaPath }).pipe(
      Effect.mapError((error) => new SeedConfigError({ message: error.message })),
    )
    const parsed = yield* parseSchemaFiles({ files }).pipe(
      Effect.mapError((error) => new SeedConfigError({ message: error.message })),
    )
    const tables = yield* makeSeedPlan(parsed.dmmf.datamodel)
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
      const dialect = dialectOf(parsed.schema.provider)
      if (dialect === null) {
        return yield* new SeedConfigError({
          message: `Cannot write SQL for datasource provider "${parsed.schema.provider ?? 'unknown'}".\n   Supported: postgresql, cockroachdb, mysql, sqlite.`,
        })
      }
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
    if (config.client !== null) {
      const factory = config.client
      const client = yield* Effect.tryPromise({
        try: () => Promise.resolve(factory()),
        catch: (error) =>
          new SeedDatabaseError({
            message: `\`client\` threw: ${error instanceof Error ? error.message : String(error)}`,
          }),
      })
      const done = yield* seedWithClient({
        client,
        entries,
        reset: config.reset,
        dialect: dialectOf(parsed.schema.provider),
      }).pipe(
        Effect.mapError((error) =>
          /unique|duplicate/iu.test(error.message) && !config.reset
            ? new SeedDatabaseError({
                message: `${error.message}\n   The tables already hold rows; pass --reset to empty the seeded tables first.`,
              })
            : error,
        ),
      )
      return { ...report, target: { kind: 'client' as const, ...done } }
    }
    const written = yield* insertIntoDatabase({
      url: config.url,
      provider: parsed.schema.provider,
      cwd,
      schemaDir: path.dirname(schemaPath),
      entries,
      reset: config.reset,
    })
    return { ...report, target: { kind: 'database' as const, ...written } }
  })
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
      : report.target.kind === 'client'
        ? `   Prisma Client: ${report.target.operations} writes in one transaction`
        : `   Database: ${report.target.dialect} ${report.target.url}`.trimEnd()
  return [
    `⚡️ Seeded ${report.tables.reduce((sum, t) => sum + t.rows, 0)} rows (seed ${report.seed ?? 'random'}, locale ${report.locale.length === 0 ? 'en' : report.locale.join(', ')})`,
    `   Schema: ${report.schemaPath}`,
    ...(report.configPath === null ? [] : [`   Config: ${report.configPath}`]),
    target,
    ...rows,
  ].join('\n')
}
