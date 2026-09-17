import nodeModule from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { Effect, FileSystem, Schema, SchemaIssue } from 'effect'

import { exists, readFile, writeFile } from '../file/index.js'
import type { LooseFieldRule, SeedValue as ConfigSeedValue } from './config.js'
import { SeedConfigError } from './errors.js'

/** The one file `hekireki seed` and `hekireki studio` look for when `--config` is omitted. */
export const CONFIG_FILE = 'hekireki.config.ts'

function isSeedValue(value: unknown): value is ConfigSeedValue {
  if (value === null) return true
  if (['string', 'number', 'bigint', 'boolean'].includes(typeof value)) return true
  if (value instanceof Date || value instanceof Uint8Array) return true
  if (Array.isArray(value)) return value.every(isSeedValue)
  return typeof value === 'object' && Object.values(value).every(isSeedValue)
}

const SeedValue = Schema.declare(isSeedValue, {
  expected: 'a string, number, bigint, boolean, Date, bytes, null, or JSON of those',
})

const Generator = Schema.declare(
  (value): value is Extract<LooseFieldRule, (...args: never[]) => unknown> =>
    typeof value === 'function',
  { expected: 'a rule function (faker, { index, row }) => value' },
)

const ClientFactory = Schema.declare(
  (value): value is () => unknown => typeof value === 'function',
  { expected: 'a function returning the Prisma Client: () => new PrismaClient({ adapter })' },
)

const NonNegativeInt = Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0)))

const Rate = Schema.Number.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 1 })))

const DateInput = Schema.declare(
  (value): value is string | Date =>
    value instanceof Date ||
    (typeof value === 'string' && !Number.isNaN(new Date(value).getTime())),
  { expected: 'a date' },
)

/** Whether the window `from`..`to` is the right way round; either edge missing is fine. */
const Ordered = Schema.makeFilter(
  (window: { readonly from?: string | Date; readonly to?: string | Date }) =>
    window.from === undefined ||
    window.to === undefined ||
    new Date(window.from).getTime() <= new Date(window.to).getTime(),
  { expected: 'from at or before to' },
)

const Bounded = Schema.makeFilter(
  (bounds: { readonly min?: number; readonly max?: number }) =>
    bounds.min === undefined || bounds.max === undefined || bounds.min <= bounds.max,
  { expected: 'min at or below max' },
)

const Range = Schema.Struct({ min: NonNegativeInt, max: NonNegativeInt }).pipe(
  Schema.check(Bounded),
)

const FieldRuleObject = Schema.Struct({
  value: Schema.optionalKey(SeedValue),
  values: Schema.optionalKey(Schema.Array(SeedValue)),
  min: Schema.optionalKey(Schema.Number),
  max: Schema.optionalKey(Schema.Number),
  from: Schema.optionalKey(DateInput),
  to: Schema.optionalKey(DateInput),
  length: Schema.optionalKey(Schema.Union([NonNegativeInt, Range])),
  nullRate: Schema.optionalKey(Rate),
}).pipe(Schema.check(Bounded, Ordered))

const FieldRule = Schema.Union([Generator, FieldRuleObject])

const RelationRule = Schema.Struct({
  min: Schema.optionalKey(NonNegativeInt),
  max: Schema.optionalKey(NonNegativeInt),
}).pipe(Schema.check(Bounded))

const ModelRule = Schema.Struct({
  count: Schema.optionalKey(NonNegativeInt),
  data: Schema.optionalKey(Schema.Array(Schema.Record(Schema.String, SeedValue))),
  fields: Schema.optionalKey(Schema.Record(Schema.String, FieldRule)),
  relations: Schema.optionalKey(Schema.Record(Schema.String, RelationRule)),
})

/** The loaded config as `hekireki seed` accepts it; the schema module's types are not needed at runtime. */
const SeedConfig = Schema.Struct({
  schema: Schema.optionalKey(Schema.String),
  seed: Schema.optionalKey(Schema.Int),
  locale: Schema.optionalKey(Schema.Union([Schema.String, Schema.Array(Schema.String)])),
  count: Schema.optionalKey(NonNegativeInt),
  nullRate: Schema.optionalKey(Rate),
  dates: Schema.optionalKey(
    Schema.Struct({ from: Schema.optionalKey(DateInput), to: Schema.optionalKey(DateInput) }).pipe(
      Schema.check(Ordered),
    ),
  ),
  output: Schema.optionalKey(Schema.String),
  url: Schema.optionalKey(Schema.String),
  reset: Schema.optionalKey(Schema.Boolean),
  client: Schema.optionalKey(ClientFactory),
  models: Schema.optionalKey(Schema.Record(Schema.String, ModelRule)),
})

/** Every problem of a config as `path: message`, unknown keys included, so a typo is not ignored. */
const decodeConfig = Schema.decodeUnknownEffect(SeedConfig, {
  errors: 'all',
  onExcessProperty: 'error',
})
const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1()

/** The default export of an imported module, when it has one. */
function defaultExportOf(namespace: unknown) {
  return typeof namespace === 'object' && namespace !== null && 'default' in namespace
    ? namespace.default
    : undefined
}

/**
 * The explicit config path when it is a TypeScript file that exists, else `hekireki.config.ts` in
 * `cwd` when that exists, else null. The config is TypeScript only: it is typed against the schema
 * module `prisma generate` writes, and a JavaScript file would lose that check.
 */
export function resolveConfigPath(explicit: string | null, cwd: string) {
  return Effect.gen(function* () {
    if (explicit !== null) {
      if (!/\.[cm]?ts$/u.test(explicit)) {
        return yield* new SeedConfigError({
          message: `Config must be a TypeScript file: ${explicit}\n   Write it as hekireki.config.ts, typed against the schema module.`,
        })
      }
      const resolved = path.resolve(cwd, explicit)
      if (yield* exists(resolved)) return resolved
      return yield* new SeedConfigError({
        message: `Config not found: ${explicit}\n   Check the path passed to --config.`,
      })
    }
    const resolved = path.resolve(cwd, CONFIG_FILE)
    return (yield* exists(resolved)) ? resolved : null
  })
}

/** The import failure as Node.js raised it, so the caller can tell TypeScript syntax it cannot read from anything else. */
class ImportFailure {
  readonly _tag = 'ImportFailure'
  constructor(readonly error: unknown) {}
}

function importModule(file: string) {
  return Effect.tryPromise({
    try: async () => {
      const namespace: unknown = await import(pathToFileURL(file).href)
      return namespace
    },
    catch: (error) => new ImportFailure(error),
  })
}

function importError(file: string, failure: ImportFailure) {
  const { error } = failure
  return new SeedConfigError({
    message: `Cannot load ${file}: ${error instanceof Error ? error.message : String(error)}`,
  })
}

/** Whether the import failed because this Node.js cannot read TypeScript syntax on its own. */
function isTypeScriptUnsupported(failure: ImportFailure) {
  const { error } = failure
  if (error instanceof SyntaxError) return true
  const code = error instanceof Error && 'code' in error ? error.code : null
  return (
    code === 'ERR_UNKNOWN_FILE_EXTENSION' ||
    code === 'ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING' ||
    code === 'ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX'
  )
}

/**
 * Imports a TypeScript config on a Node.js without type stripping by stripping the types itself
 * and importing the result from a sibling file, so `import ... from 'hekireki'` resolves as it
 * would from the config.
 */
function importStripped(file: string, original: SeedConfigError) {
  return Effect.gen(function* () {
    if (typeof nodeModule.stripTypeScriptTypes !== 'function') return yield* original
    const source = yield* readFile(file).pipe(Effect.mapError(() => original))
    const stripped = yield* Effect.try({
      try: () => nodeModule.stripTypeScriptTypes(source, { mode: 'strip' }),
      catch: () => original,
    })
    const sibling = path.join(
      path.dirname(file),
      `.${path.basename(file, path.extname(file))}.${process.pid}.mjs`,
    )
    yield* writeFile(sibling, stripped).pipe(Effect.mapError(() => original))
    const fs = yield* FileSystem.FileSystem
    return yield* importModule(sibling).pipe(
      Effect.mapError((failure) => importError(file, failure)),
      Effect.ensuring(fs.remove(sibling).pipe(Effect.orElseSucceed(() => undefined))),
    )
  })
}

/** Loads the config module and checks its default export against what `hekireki seed` accepts. */
export function loadSeedConfig(file: string) {
  return Effect.gen(function* () {
    const namespace = yield* importModule(file).pipe(
      Effect.catch((failure) =>
        isTypeScriptUnsupported(failure)
          ? importStripped(file, importError(file, failure))
          : Effect.fail(importError(file, failure)),
      ),
    )
    const exported = defaultExportOf(namespace)
    if (exported === undefined) {
      return yield* new SeedConfigError({
        message: `${file} has no default export.\n   Write \`export default defineConfig({ ... })\`.`,
      })
    }
    // The decisions of a data migration used to be written here; they are made in Studio now.
    if (typeof exported === 'object' && exported !== null && 'migrate' in exported) {
      return yield* new SeedConfigError({
        message: `Invalid config in ${file}:\n   migrate: the config no longer holds the decisions of a data migration.\n   Make them on the Migrate page of hekireki studio, which keeps them in .hekireki/migrate.json beside the schema for hekireki migrate check and plan to read.`,
      })
    }
    return yield* decodeConfig(exported).pipe(
      Effect.mapError((error) => {
        const issues = formatIssues(error.issue).issues.map(
          (issue) => `${(issue.path ?? []).map(String).join('.') || '(root)'}: ${issue.message}`,
        )
        return new SeedConfigError({
          message: `Invalid config in ${file}:\n   ${issues.join('\n   ')}`,
        })
      }),
    )
  })
}

/**
 * The `url` of the hekireki.config.ts in `cwd`, so `hekireki studio` opens the database `hekireki
 * seed` writes to without being told twice; null when there is no config or it sets no `url`.
 */
export function readConfigUrl(cwd: string) {
  return Effect.gen(function* () {
    const file = yield* resolveConfigPath(null, cwd)
    if (file === null) return null
    const config = yield* loadSeedConfig(file)
    return config.url ?? null
  })
}
