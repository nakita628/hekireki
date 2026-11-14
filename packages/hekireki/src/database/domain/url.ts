import path from 'node:path'
// The database URL as text: where a schema or a Prisma config names it, which of the places
// wins, its dialect, and how it is shown. Pure: no environment, no file, no Effect (url.ts reads
// the environment, resolve.ts the files, and driver.ts opens what this names).

import { LIBSQL_SCHEMES, SECRET_QUERY_PARAMETER } from '../../constants/index.js'
import type { Dialect, UrlSource } from '../../types/index.js'

export type { Dialect, UrlSource } from '../../types/index.js'

/** A `url` as a Prisma config or schema writes it: the variable it names, or the URL itself. */
export type DatasourceUrl =
  | { readonly kind: 'env'; readonly name: string }
  | { readonly kind: 'literal'; readonly value: string }

/**
 * The `datasource.url` of the Prisma config: a variable, as `env("NAME")`, `process.env.NAME` or
 * `process.env["NAME"]`, or a literal; other shapes are not recognised.
 */
export function makeDatasourceUrl(input: { readonly configText: string }): DatasourceUrl | null {
  const block = /datasource\s*:\s*\{([^}]*)\}/u.exec(input.configText)?.[1]
  if (!block) return null
  const env =
    /url\s*:\s*env\(\s*["'`]([^"'`]+)["'`]\s*\)/u.exec(block)?.[1] ??
    /url\s*:\s*process\.env(?:\.([A-Za-z_$][\w$]*)|\[\s*["'`]([^"'`]+)["'`]\s*\])/u
      .exec(block)
      ?.slice(1)
      .find((name) => name !== undefined)
  if (env) return { kind: 'env', name: env } as const
  const literal = /url\s*:\s*["'`]([^"'`]+)["'`]/u.exec(block)?.[1]
  return literal ? ({ kind: 'literal', value: literal } as const) : null
}

/** The `url` of the schema's `datasource` block (Prisma 6 and earlier), as `env("NAME")` or a literal. */
export function makeSchemaDatasourceUrl(input: {
  readonly schemaText: string
}): DatasourceUrl | null {
  const block = /datasource\s+\w+\s*\{([^}]*)\}/u.exec(input.schemaText)?.[1]
  if (!block) return null
  const env = /^\s*url\s*=\s*env\(\s*"([^"]+)"\s*\)/mu.exec(block)?.[1]
  if (env) return { kind: 'env', name: env } as const
  const literal = /^\s*url\s*=\s*"([^"]+)"/mu.exec(block)?.[1]
  return literal ? ({ kind: 'literal', value: literal } as const) : null
}

/**
 * Which URL wins: `--url`, then `url` in hekireki.config.ts, then what Prisma names (a literal, or
 * the value of the variable it names), then DATABASE_URL; or, when none is there, why not.
 *
 * @example
 * makeDatabaseUrlChoice({ explicit: null, configUrl: null, datasource: { kind: 'env', name: 'DB' },
 *   named: null, fallback: null, where: 'prisma.config.ts' })
 * // { found: null, reason: 'prisma.config.ts reads the database URL from env("DB"), but DB is not set. …' }
 */
export function makeDatabaseUrlChoice(input: {
  readonly explicit: string | null
  readonly configUrl: string | null
  /** What the Prisma config or the schema names, when either names one. */
  readonly datasource: DatasourceUrl | null
  /** The value of the variable `datasource` names, when it names one that is set. */
  readonly named: string | null
  /** DATABASE_URL, read only when Prisma names nothing. */
  readonly fallback: string | null
  /** The file the reason names: the Prisma config, or the schema. */
  readonly where: string
}):
  | { readonly found: { readonly url: string; readonly source: UrlSource }; readonly reason: null }
  | { readonly found: null; readonly reason: string } {
  const { datasource } = input
  const found: { readonly url: string; readonly source: UrlSource } | null =
    input.explicit !== null
      ? { url: input.explicit, source: 'flag' }
      : input.configUrl !== null && input.configUrl !== ''
        ? { url: input.configUrl, source: 'hekireki' }
        : datasource?.kind === 'literal'
          ? { url: datasource.value, source: 'prisma' }
          : input.named !== null
            ? { url: input.named, source: 'prisma' }
            : input.fallback !== null
              ? { url: input.fallback, source: 'env' }
              : null
  if (found !== null) return { found, reason: null }
  return {
    found: null,
    reason:
      datasource?.kind === 'env'
        ? `${input.where} reads the database URL from env("${datasource.name}"), but ${datasource.name} is not set.\n   Set it in .env or the environment, or pass --url <connection string>.`
        : 'No database URL found.\n   Set `url` in hekireki.config.ts, name the variable in prisma.config.ts (`datasource: { url: env("DATABASE_URL") }`) and set it in .env or the environment, or pass --url <connection string>.',
  }
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
  if (scheme === 'file' || scheme === 'libsql') return 'sqlite'
  const provider = input.schemaProvider
  if (provider === 'postgresql' || provider === 'cockroachdb') return 'postgresql'
  if (provider === 'mysql') return 'mysql'
  if (provider === 'sqlite') return 'sqlite'
  return null
}

/**
 * Whether a SQLite URL names a libSQL server (Turso, `sqld`) rather than a file. An `http(s)://`
 * or `ws(s)://` URL is one only for a SQLite schema: that is what `makeDialect` reads it as.
 *
 * @example
 * isLibsqlUrl({ url: 'libsql://app-org.turso.io?authToken=…' }) // true
 * isLibsqlUrl({ url: 'file:./dev.db' }) // false
 */
export function isLibsqlUrl(input: { readonly url: string }) {
  return LIBSQL_SCHEMES.has(input.url.split(':')[0]?.toLowerCase() ?? '')
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

/** Hides the password of a connection URL, and a token or password passed as a query parameter (Turso's `?authToken=`). */
export function makeRedactedUrl(input: { readonly url: string }) {
  return input.url
    .replaceAll(/(\/\/[^:/@]+:)[^@/]+@/gu, '$1***@')
    .replaceAll(SECRET_QUERY_PARAMETER, '$1***')
}

/**
 * The `?schema=` of a PostgreSQL URL, as Prisma spells the namespace to use. `pg` ignores the
 * parameter, so Studio sets the search path itself; `public` needs no setting.
 */
export function makePostgresSchema(input: { readonly url: string }) {
  // `URL.parse` answers null for text that is not a URL rather than throwing.
  const name = URL.parse(input.url)?.searchParams.get('schema') ?? null
  return name === null || name === '' || name === 'public' ? null : name
}
