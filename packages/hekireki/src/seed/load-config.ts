import { existsSync, statSync } from 'node:fs'
import nodeModule from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { Effect, FileSystem } from 'effect'
import * as z from 'zod'

import { exists, readFile, writeFile } from '../file/index.js'
import type { LooseFieldRule, SeedValue } from './config.js'
import { SeedConfigError } from './errors.js'

/** Where `hekireki seed` looks for its config when `--config` is omitted, in order. */
export const CONFIG_CANDIDATES = [
  'hekireki.config.ts',
  'hekireki.config.mts',
  'hekireki.config.js',
  'hekireki.config.mjs',
] as const

function isSeedValue(value: unknown): value is SeedValue {
  if (value === null) return true
  if (['string', 'number', 'bigint', 'boolean'].includes(typeof value)) return true
  if (value instanceof Date || value instanceof Uint8Array) return true
  if (Array.isArray(value)) return value.every(isSeedValue)
  return typeof value === 'object' && Object.values(value).every(isSeedValue)
}

type Generator = Extract<LooseFieldRule, (...args: never[]) => unknown>

const SeedValueSchema = z
  .custom<SeedValue>(
    isSeedValue,
    'Expected a string, number, bigint, boolean, Date, bytes, null, or JSON of those',
  )
  .meta({ description: 'A value a column can hold', example: 'fixed' })

const GeneratorSchema = z
  .custom<Generator>(
    (value) => typeof value === 'function',
    'Expected a rule function (faker, { index, row }) => value',
  )
  .meta({
    description: 'A function of the seeded faker that makes the value',
    example: 'faker => faker.person.fullName()',
  })

const ClientFactorySchema = z
  .custom<() => unknown>(
    (value) => typeof value === 'function',
    'Expected a function returning the Prisma Client: () => new PrismaClient({ adapter })',
  )
  .meta({
    description: 'A function returning the Prisma Client',
    example: '() => new PrismaClient({ adapter })',
  })

const NonNegativeInt = z.int().min(0).meta({ description: 'A count or a length', example: 3 })

const Rate = z
  .number()
  .min(0)
  .max(1)
  .meta({ description: 'How often an optional field is null, from 0 to 1', example: 0.2 })

const DateInput = z
  .union([z.string(), z.date()])
  .meta({ description: 'An ISO 8601 date or a Date', example: '2025-01-01' })

const Range = z
  .strictObject({
    min: NonNegativeInt.meta({ description: 'The shortest length.', example: 1 }),
    max: NonNegativeInt.meta({ description: 'The longest length.', example: 3 }),
  })
  .meta({ description: 'A length range', example: { min: 1, max: 3 } })

const FieldRuleObject = z
  .strictObject({
    value: SeedValueSchema.optional().meta({
      description: 'The value every row gets.',
      example: 'fixed',
    }),
    values: z
      .array(SeedValueSchema)
      .optional()
      .meta({ description: 'The values rows draw from.', example: ['ADMIN', 'EDITOR'] }),
    min: z
      .number()
      .optional()
      .meta({ description: 'The lower bound of a number, or the shortest list.', example: 0 }),
    max: z
      .number()
      .optional()
      .meta({ description: 'The upper bound of a number, or the longest list.', example: 100 }),
    from: DateInput.optional().meta({
      description: 'The earliest DateTime.',
      example: '2025-01-01',
    }),
    to: DateInput.optional().meta({ description: 'The latest DateTime.', example: '2025-12-31' }),
    length: z
      .union([NonNegativeInt, Range])
      .optional()
      .meta({ description: 'The length of a string, or its range.', example: 8 }),
    nullRate: Rate.optional().meta({
      description: 'How often an optional field is null.',
      example: 0.2,
    }),
  })
  .meta({ description: 'Bounds for one field', example: { min: 18, max: 65 } })

const FieldRuleSchema = z.union([GeneratorSchema, FieldRuleObject]).meta({
  description: 'A field rule: bounds, or a generator function',
  example: { min: 18, max: 65 },
})

const RelationRuleSchema = z
  .strictObject({
    min: NonNegativeInt.optional().meta({
      description: 'The fewest partners per row.',
      example: 0,
    }),
    max: NonNegativeInt.optional().meta({ description: 'The most partners per row.', example: 3 }),
  })
  .meta({
    description: 'How many partners each row of an implicit many-to-many gets',
    example: { min: 0, max: 3 },
  })

const ModelRuleSchema = z
  .strictObject({
    count: NonNegativeInt.optional().meta({ description: 'Rows to generate.', example: 100 }),
    data: z
      .array(z.record(z.string(), SeedValueSchema))
      .optional()
      .meta({
        description: 'Real rows, inserted as written.',
        example: [{ email: 'ann@example.com' }],
      }),
    fields: z
      .record(z.string(), FieldRuleSchema)
      .optional()
      .meta({ description: 'Rules per field name.', example: { age: { min: 18, max: 65 } } }),
    relations: z
      .record(z.string(), RelationRuleSchema)
      .optional()
      .meta({
        description: 'Rules per implicit many-to-many list field.',
        example: { tags: { min: 0, max: 3 } },
      }),
  })
  .meta({ description: 'Rules for one model', example: { count: 100 } })

/** The loaded config as `hekireki seed` accepts it; the schema module's types are not needed at runtime. */
const SeedConfigSchema = z
  .strictObject({
    schema: z
      .string()
      .optional()
      .meta({ description: 'The schema path.', example: 'prisma/schema.prisma' }),
    seed: z.int().optional().meta({ description: 'The faker seed.', example: 42 }),
    locale: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .meta({ description: 'The faker locale, or a list tried in order.', example: 'ja' }),
    count: NonNegativeInt.optional().meta({
      description: 'Rows per model by default.',
      example: 10,
    }),
    nullRate: Rate.optional().meta({
      description: 'How often an optional field is null.',
      example: 0.1,
    }),
    dates: z
      .strictObject({
        from: DateInput.optional().meta({
          description: 'The earliest DateTime.',
          example: '2025-01-01',
        }),
        to: DateInput.optional().meta({
          description: 'The latest DateTime.',
          example: '2025-12-31',
        }),
      })
      .optional()
      .meta({
        description: 'The window every DateTime falls in.',
        example: { from: '2025-01-01', to: '2025-12-31' },
      }),
    output: z
      .string()
      .optional()
      .meta({ description: 'Where to write the SQL.', example: 'prisma/seed.sql' }),
    url: z.string().optional().meta({ description: 'The database URL.', example: 'file:./dev.db' }),
    reset: z
      .boolean()
      .optional()
      .meta({ description: 'Delete the seeded tables first.', example: true }),
    client: ClientFactorySchema.optional().meta({
      description: 'The Prisma Client to write through.',
      example: '() => new PrismaClient({ adapter })',
    }),
    models: z
      .record(z.string(), ModelRuleSchema)
      .optional()
      .meta({ description: 'Rules per model name.', example: { User: { count: 100 } } }),
  })
  .meta({ description: 'The hekireki.config.ts seed config', example: { seed: 42, count: 10 } })

const ModuleNamespace = z
  .object({
    default: z
      .unknown()
      .meta({ description: 'The default export of the config module.', example: {} }),
  })
  .meta({ description: 'An imported config module', example: { default: {} } })

/** The explicit config path when it exists, else the first candidate in `cwd` that does, else null. */
export function resolveConfigPath(explicit: string | null, cwd: string) {
  return Effect.gen(function* () {
    if (explicit !== null) {
      const resolved = path.resolve(cwd, explicit)
      if (yield* exists(resolved)) return resolved
      return yield* new SeedConfigError({
        message: `Config not found: ${explicit}\n   Check the path passed to --config.`,
      })
    }
    for (const candidate of CONFIG_CANDIDATES) {
      const resolved = path.resolve(cwd, candidate)
      if (yield* exists(resolved)) return resolved
    }
    return null
  })
}

/** The import failure as Node.js raised it, so the caller can tell TypeScript syntax it cannot read from anything else. */
class ImportFailure {
  readonly _tag = 'ImportFailure'
  constructor(readonly error: unknown) {}
}

function isFile(candidate: string) {
  return existsSync(candidate) && statSync(candidate).isFile()
}

/**
 * Resolves a relative import the way a bundler does while the config loads: `./data/users` and
 * `./generated/seed/schema` find `.ts` (or `.mts`, or `index.ts`) files, and `./x.js` finds
 * `x.ts` when there is no `x.js`. Node.js alone wants the exact file name, and the config and the
 * files it imports are TypeScript it runs as such.
 */
function resolveTypeScript(
  specifier: string,
  context: { readonly parentURL?: string | undefined },
  next: (specifier: string) => { readonly url: string },
) {
  const parent = context.parentURL
  if (!(specifier.startsWith('./') || specifier.startsWith('../')) || parent === undefined) {
    return next(specifier)
  }
  if (!parent.startsWith('file:')) return next(specifier)
  const base = fileURLToPath(new URL(specifier, parent))
  if (isFile(base)) return next(specifier)
  const found = [
    base.replace(/\.js$/u, '.ts'),
    `${base}.ts`,
    `${base}.mts`,
    path.join(base, 'index.ts'),
  ].find(isFile)
  return found === undefined ? next(specifier) : next(pathToFileURL(found).href)
}

/** Imports the module with the TypeScript resolution above in place, then takes it down again. */
function importModule(file: string) {
  return Effect.tryPromise({
    try: async (): Promise<unknown> => {
      const hooks =
        typeof nodeModule.registerHooks === 'function'
          ? nodeModule.registerHooks({
              resolve: (specifier, context, nextResolve) =>
                resolveTypeScript(specifier, context, (resolved) => nextResolve(resolved, context)),
            })
          : null
      try {
        return await import(pathToFileURL(file).href)
      } finally {
        hooks?.deregister()
      }
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
    const typescript = /\.[cm]?ts$/u.test(file)
    const namespace = yield* importModule(file).pipe(
      Effect.catch((failure) =>
        typescript && isTypeScriptUnsupported(failure)
          ? importStripped(file, importError(file, failure))
          : Effect.fail(importError(file, failure)),
      ),
    )
    const parsedModule = ModuleNamespace.safeParse(namespace)
    const exported = parsedModule.success ? parsedModule.data.default : undefined
    if (exported === undefined) {
      return yield* new SeedConfigError({
        message: `${file} has no default export.\n   Write \`export default defineConfig({ ... })\`.`,
      })
    }
    const parsed = SeedConfigSchema.safeParse(exported)
    if (!parsed.success) {
      const issues = parsed.error.issues.map(
        (issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`,
      )
      return yield* new SeedConfigError({
        message: `Invalid config in ${file}:\n   ${issues.join('\n   ')}`,
      })
    }
    return parsed.data
  })
}
