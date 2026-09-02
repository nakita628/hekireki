import path from 'node:path'

import * as z from 'zod'

const ParseDotenvInput = z
  .object({
    text: z
      .string()
      .meta({ description: 'The file text.', example: 'DATABASE_URL="file:./dev.db"' }),
  })
  .readonly()
  .meta({
    description: 'The contents of a .env file',
    example: { text: 'DATABASE_URL="file:./dev.db"' },
  })

/** Reads `KEY=value` lines (quoted or bare, `export` allowed, `#` comments stripped). */
export function makeDotenv(
  input: z.infer<typeof ParseDotenvInput>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    input.text.split('\n').flatMap((line) => {
      const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u.exec(line)
      if (!match) return []
      const [, name = '', raw = ''] = match
      const trimmed = raw.trim()
      const unquoted =
        (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
          ? trimmed.slice(1, -1)
          : trimmed.replace(/\s+#.*$/u, '')
      return [[name, unquoted]]
    }),
  )
}

const ConfigDatasourceUrlInput = z
  .object({
    configText: z.string().meta({
      description: 'The file text.',
      example: "export default defineConfig({ datasource: { url: 'file:./dev.db' } })",
    }),
  })
  .readonly()
  .meta({ description: 'The text of prisma.config.ts' })

/** The `datasource.url` of prisma.config.ts, as `env("NAME")` or a literal; other shapes are not recognised. */
export function makeDatasourceUrl(
  input: z.infer<typeof ConfigDatasourceUrlInput>,
):
  | { readonly kind: 'env'; readonly name: string }
  | { readonly kind: 'literal'; readonly value: string }
  | null {
  const block = /datasource\s*:\s*\{([^}]*)\}/u.exec(input.configText)?.[1]
  if (!block) return null
  const env = /url\s*:\s*env\(\s*["'`]([^"'`]+)["'`]\s*\)/u.exec(block)?.[1]
  if (env) return { kind: 'env', name: env }
  const literal = /url\s*:\s*["'`]([^"'`]+)["'`]/u.exec(block)?.[1]
  return literal ? { kind: 'literal', value: literal } : null
}

const ResolveDatabaseUrlInput = z
  .object({
    explicit: z
      .string()
      .nullable()
      .meta({ description: 'The --url flag, when given.', example: 'file:./dev.db' }),
    env: z
      .record(z.string(), z.string().optional())
      .readonly()
      .meta({ description: 'The process environment.' }),
    dotenv: z
      .record(z.string(), z.string())
      .readonly()
      .meta({ description: 'The variables parsed from .env.' }),
    configText: z
      .string()
      .nullable()
      .meta({ description: 'The text of prisma.config.ts, when it exists.', example: null }),
  })
  .readonly()
  .meta({ description: 'Every place a database URL can come from, in precedence order' })

/** `--url`, then DATABASE_URL (environment, then .env), then prisma.config.ts. */
export function makeDatabaseUrl(input: z.infer<typeof ResolveDatabaseUrlInput>) {
  if (input.explicit !== null) {
    return { ok: true, value: { url: input.explicit, source: 'flag' } } as const
  }
  const lookup = (name: string) => input.env[name] ?? input.dotenv[name]
  const fromEnv = lookup('DATABASE_URL')
  if (fromEnv !== undefined && fromEnv !== '') {
    return { ok: true, value: { url: fromEnv, source: 'env' } } as const
  }
  const datasource =
    input.configText === null ? null : makeDatasourceUrl({ configText: input.configText })
  if (datasource?.kind === 'literal') {
    return { ok: true, value: { url: datasource.value, source: 'config' } } as const
  }
  if (datasource?.kind === 'env') {
    const value = lookup(datasource.name)
    if (value !== undefined && value !== '') {
      return { ok: true, value: { url: value, source: 'config' } } as const
    }
    return {
      ok: false,
      error: `prisma.config.ts reads the database URL from env("${datasource.name}"), but ${datasource.name} is not set.\n   Set it in .env or the environment, or pass --url <connection string>.`,
    } as const
  }
  return {
    ok: false,
    error:
      'No database URL found.\n   Set DATABASE_URL (in .env or the environment) or pass --url <connection string> to browse and edit data.',
  } as const
}

const DialectFromUrlInput = z
  .object({
    url: z
      .string()
      .meta({ description: 'The connection URL.', example: 'postgresql://localhost/app' }),
    schemaProvider: z
      .string()
      .nullable()
      .meta({ description: 'The datasource provider of the schema.', example: 'postgresql' }),
  })
  .readonly()
  .meta({ description: 'A connection URL and the schema datasource provider as a fallback' })

/** The dialect from the URL scheme, falling back to the schema provider. */
export function makeDialect(
  input: z.infer<typeof DialectFromUrlInput>,
): 'postgresql' | 'mysql' | 'sqlite' | null {
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

const SqliteFilePathInput = z
  .object({
    url: z.string().meta({ description: 'The sqlite URL.', example: 'file:./dev.db' }),
    baseDir: z
      .string()
      .meta({ description: 'The directory relative paths resolve against.', example: 'prisma' }),
  })
  .readonly()
  .meta({ description: 'A file: URL and the directory relative paths resolve against' })

/** The database file for a `file:` URL, relative to the schema directory; `:memory:` stays as is. */
export function makeSqliteFilePath(input: z.infer<typeof SqliteFilePathInput>) {
  const target = input.url.replace(/^file:/u, '').split('?')[0] ?? ''
  if (target === ':memory:' || target === '') return ':memory:'
  return path.isAbsolute(target) ? target : path.resolve(input.baseDir, target)
}

const RedactUrlInput = z
  .object({
    url: z.string().meta({
      description: 'The connection URL.',
      example: 'postgresql://user:secret@localhost/app',
    }),
  })
  .readonly()
  .meta({
    description: 'A connection URL',
    example: { url: 'postgresql://user:secret@localhost/app' },
  })

/** Hides the password of a connection URL. */
export function makeRedactedUrl(input: z.infer<typeof RedactUrlInput>) {
  return input.url.replace(/(\/\/[^:/@]+:)[^@/]+@/u, '$1***@')
}
