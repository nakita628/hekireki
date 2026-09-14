import path from 'node:path'

import { Data, Effect } from 'effect'

/** Where a database URL was found, in precedence order. */
export type UrlSource = 'flag' | 'hekireki' | 'prisma' | 'env'

/** The SQL dialects a URL can point at. */
export type Dialect = 'postgresql' | 'mysql' | 'sqlite'

/** No place named a database URL; `reason` says where one would be looked for. */
export class DatabaseUrlNotFoundError extends Data.TaggedError('DatabaseUrlNotFoundError')<{
  readonly reason: string
}> {}

/** The `datasource.url` of prisma.config.ts, as `env("NAME")` or a literal; other shapes are not recognised. */
function makeDatasourceUrl(input: { readonly configText: string }) {
  const block = /datasource\s*:\s*\{([^}]*)\}/u.exec(input.configText)?.[1]
  if (!block) return null
  const env = /url\s*:\s*env\(\s*["'`]([^"'`]+)["'`]\s*\)/u.exec(block)?.[1]
  if (env) return { kind: 'env', name: env } as const
  const literal = /url\s*:\s*["'`]([^"'`]+)["'`]/u.exec(block)?.[1]
  return literal ? ({ kind: 'literal', value: literal } as const) : null
}

/** The `url` of the schema's `datasource` block (Prisma 6 and earlier), as `env("NAME")` or a literal. */
function makeSchemaDatasourceUrl(input: { readonly schemaText: string }) {
  const block = /datasource\s+\w+\s*\{([^}]*)\}/u.exec(input.schemaText)?.[1]
  if (!block) return null
  const env = /^\s*url\s*=\s*env\(\s*"([^"]+)"\s*\)/mu.exec(block)?.[1]
  if (env) return { kind: 'env', name: env } as const
  const literal = /^\s*url\s*=\s*"([^"]+)"/mu.exec(block)?.[1]
  return literal ? ({ kind: 'literal', value: literal } as const) : null
}

/**
 * `--url`, then `url` in hekireki.config.ts, then whatever Prisma itself connects with: the
 * variable `datasource.url` names with `env("NAME")` in prisma.config.ts (or in the schema's
 * `datasource` block, Prisma 6 and earlier), read from the environment and `.env`, or the literal
 * written there. Only when Prisma names nothing is DATABASE_URL, Prisma's own default, looked up.
 */
export function makeDatabaseUrl(input: {
  /** The --url flag, when given. */
  readonly explicit: string | null
  /** The `url` of hekireki.config.ts, when set. */
  readonly configUrl: string | null
  /** The process environment. */
  readonly env: Readonly<Record<string, string | undefined>>
  /** The variables of the `.env` files. */
  readonly dotenv: Readonly<Record<string, string>>
  /** The text of prisma.config.ts, when it exists. */
  readonly configText: string | null
  /** The text of the Prisma schema files, when read. */
  readonly schemaText: string | null
}) {
  return Effect.gen(function* () {
    const lookup = (name: string) => {
      const value = input.env[name] ?? input.dotenv[name]
      return value === undefined || value === '' ? null : value
    }
    const fromConfig =
      input.configText === null ? null : makeDatasourceUrl({ configText: input.configText })
    const fromSchema =
      input.schemaText === null ? null : makeSchemaDatasourceUrl({ schemaText: input.schemaText })
    const datasource = fromConfig ?? fromSchema
    const named = datasource?.kind === 'env' ? lookup(datasource.name) : null
    const found: { readonly url: string; readonly source: UrlSource } | null =
      input.explicit !== null
        ? { url: input.explicit, source: 'flag' }
        : input.configUrl !== null && input.configUrl !== ''
          ? { url: input.configUrl, source: 'hekireki' }
          : datasource?.kind === 'literal'
            ? { url: datasource.value, source: 'prisma' }
            : named !== null
              ? { url: named, source: 'prisma' }
              : datasource === null && lookup('DATABASE_URL') !== null
                ? { url: lookup('DATABASE_URL') ?? '', source: 'env' }
                : null
    if (found !== null) return found
    const where = fromConfig === null ? 'the schema' : 'prisma.config.ts'
    return yield* new DatabaseUrlNotFoundError({
      reason:
        datasource?.kind === 'env'
          ? `${where} reads the database URL from env("${datasource.name}"), but ${datasource.name} is not set.\n   Set it in .env or the environment, or pass --url <connection string>.`
          : 'No database URL found.\n   Set `url` in hekireki.config.ts, name the variable in prisma.config.ts (`datasource: { url: env("DATABASE_URL") }`) and set it in .env or the environment, or pass --url <connection string>.',
    })
  })
}

/** The dialect from the URL scheme, falling back to the schema provider. */
export function makeDialect(input: {
  readonly url: string
  /** The datasource provider of the schema, when the scheme says nothing. */
  readonly schemaProvider: string | null
}): Dialect | null {
  const scheme = input.url.split(':')[0]?.toLowerCase() ?? ''
  if (scheme === 'postgres' || scheme === 'postgresql') return 'postgresql'
  if (scheme === 'mysql') return 'mysql'
  if (scheme === 'file') return 'sqlite'
  const provider = input.schemaProvider
  if (provider === 'postgresql' || provider === 'cockroachdb') return 'postgresql'
  if (provider === 'mysql') return 'mysql'
  if (provider === 'sqlite') return 'sqlite'
  return null
}

/** The database file for a `file:` URL, relative to the schema directory; `:memory:` stays as is. */
export function makeSqliteFilePath(input: {
  readonly url: string
  /** The directory relative paths resolve against. */
  readonly baseDir: string
}) {
  const target = input.url.replace(/^file:/u, '').split('?')[0] ?? ''
  if (target === ':memory:' || target === '') return ':memory:'
  return path.isAbsolute(target) ? target : path.resolve(input.baseDir, target)
}

/** Hides the password of a connection URL. */
export function makeRedactedUrl(input: { readonly url: string }) {
  return input.url.replace(/(\/\/[^:/@]+:)[^@/]+@/u, '$1***@')
}

/**
 * The `?schema=` of a PostgreSQL URL, as Prisma spells the namespace to use. `pg` ignores the
 * parameter, so Studio sets the search path itself; `public` needs no setting.
 */
export function makePostgresSchema(input: { readonly url: string }) {
  try {
    const name = new URL(input.url).searchParams.get('schema')
    return name === null || name === '' || name === 'public' ? null : name
  } catch {
    return null
  }
}
