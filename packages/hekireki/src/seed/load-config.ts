import nodeModule from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { Effect, FileSystem, Schema, SchemaIssue } from 'effect'

import { exists, readFile, writeFile } from '../file/index.js'
import type { LooseFieldRule, SeedValue } from './config.js'
import { SeedConfigError } from './errors.js'

/** The one file `hekireki seed` and `hekireki studio` look for when `--config` is omitted. */
export const CONFIG_FILE = 'hekireki.config.ts'

function isSeedValue(value: unknown): value is SeedValue {
  if (value === null) return true
  if (['string', 'number', 'bigint', 'boolean'].includes(typeof value)) return true
  if (value instanceof Date || value instanceof Uint8Array) return true
  if (Array.isArray(value)) return value.every(isSeedValue)
  return typeof value === 'object' && Object.values(value).every(isSeedValue)
}

type Generator = Extract<LooseFieldRule, (...args: never[]) => unknown>

const seedValue = Schema.declare(isSeedValue, {
  expected: 'a string, number, bigint, boolean, Date, bytes, null, or JSON of those',
})

const generator = Schema.declare((value): value is Generator => typeof value === 'function', {
  expected: 'a rule function (faker, { index, row }) => value',
})

const clientFactory = Schema.declare(
  (value): value is () => unknown => typeof value === 'function',
  { expected: 'a function returning the Prisma Client: () => new PrismaClient({ adapter })' },
)

const nonNegativeInt = Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0)))

const rate = Schema.Number.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 1 })))

const dateInput = Schema.declare(
  (value): value is string | Date =>
    value instanceof Date ||
    (typeof value === 'string' && !Number.isNaN(new Date(value).getTime())),
  { expected: 'a date' },
)

/** Whether the window `from`..`to` is the right way round; either edge missing is fine. */
const ordered = Schema.makeFilter(
  (window: { readonly from?: string | Date; readonly to?: string | Date }) =>
    window.from === undefined ||
    window.to === undefined ||
    new Date(window.from).getTime() <= new Date(window.to).getTime(),
  { expected: 'from at or before to' },
)

const bounded = Schema.makeFilter(
  (range: { readonly min?: number; readonly max?: number }) =>
    range.min === undefined || range.max === undefined || range.min <= range.max,
  { expected: 'min at or below max' },
)

const range = Schema.Struct({ min: nonNegativeInt, max: nonNegativeInt }).pipe(
  Schema.check(bounded),
)

const fieldRuleObject = Schema.Struct({
  value: Schema.optionalKey(seedValue),
  values: Schema.optionalKey(Schema.Array(seedValue)),
  min: Schema.optionalKey(Schema.Number),
  max: Schema.optionalKey(Schema.Number),
  from: Schema.optionalKey(dateInput),
  to: Schema.optionalKey(dateInput),
  length: Schema.optionalKey(Schema.Union([nonNegativeInt, range])),
  nullRate: Schema.optionalKey(rate),
}).pipe(Schema.check(bounded, ordered))

const fieldRule = Schema.Union([generator, fieldRuleObject])

const relationRule = Schema.Struct({
  min: Schema.optionalKey(nonNegativeInt),
  max: Schema.optionalKey(nonNegativeInt),
}).pipe(Schema.check(bounded))

const modelRule = Schema.Struct({
  count: Schema.optionalKey(nonNegativeInt),
  data: Schema.optionalKey(Schema.Array(Schema.Record(Schema.String, seedValue))),
  fields: Schema.optionalKey(Schema.Record(Schema.String, fieldRule)),
  relations: Schema.optionalKey(Schema.Record(Schema.String, relationRule)),
})

/** The loaded config as `hekireki seed` accepts it; the schema module's types are not needed at runtime. */
const seedConfig = Schema.Struct({
  schema: Schema.optionalKey(Schema.String),
  seed: Schema.optionalKey(Schema.Int),
  locale: Schema.optionalKey(Schema.Union([Schema.String, Schema.Array(Schema.String)])),
  count: Schema.optionalKey(nonNegativeInt),
  nullRate: Schema.optionalKey(rate),
  dates: Schema.optionalKey(
    Schema.Struct({ from: Schema.optionalKey(dateInput), to: Schema.optionalKey(dateInput) }).pipe(
      Schema.check(ordered),
    ),
  ),
  output: Schema.optionalKey(Schema.String),
  url: Schema.optionalKey(Schema.String),
  reset: Schema.optionalKey(Schema.Boolean),
  client: Schema.optionalKey(clientFactory),
  models: Schema.optionalKey(Schema.Record(Schema.String, modelRule)),
})

/** Every problem of a config as `path: message`, unknown keys included, so a typo is not ignored. */
const decodeConfig = Schema.decodeUnknownEffect(seedConfig, {
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
