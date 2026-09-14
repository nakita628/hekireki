import path from 'node:path'
import { parseEnv } from 'node:util'

import { Effect } from 'effect'

import { readFile } from '../file/index.js'
import { DatabaseUrlNotFoundError, makeDatabaseUrl } from './url.js'

/**
 * The database URL from every place a project puts one, in order: `--url`, `url` in
 * hekireki.config.ts, the variable Prisma names in prisma.config.ts or the schema (read from the
 * environment, then `.env` in the working directory, then `.env` beside the schema, where Prisma
 * reads it too), the literal written there, and DATABASE_URL when Prisma names nothing.
 * `hekireki studio` and `hekireki seed` both resolve through here, so one setting serves both.
 */
export function resolveDatabaseUrl(options: {
  /** The --url flag, when given. */
  readonly explicitUrl: string | null
  /** The `url` of hekireki.config.ts, when set. */
  readonly configUrl: string | null
  /** Why hekireki.config.ts could not be read, when it could not. */
  readonly configError: string | null
  /** The text of the schema files, for the `url` of a datasource block. */
  readonly schemaText: string | null
  /** Where .env and prisma.config.ts are looked up. */
  readonly cwd: string
  /** Where a second .env and prisma.config.ts are looked up. */
  readonly schemaDir: string
  /** The process environment. */
  readonly env: Readonly<Record<string, string | undefined>>
}) {
  return Effect.gen(function* () {
    // Both .env files, the schema's first: the working directory's entries overwrite it below.
    const variables = yield* Effect.forEach([...new Set([options.schemaDir, options.cwd])], (dir) =>
      readFile(path.join(dir, '.env')).pipe(
        Effect.map((text) =>
          Object.entries(parseEnv(text)).flatMap(([name, value]) =>
            value === undefined ? [] : [[name, value] as const],
          ),
        ),
        Effect.orElseSucceed(() => []),
      ),
    )
    // prisma.config.ts where Prisma reads it (the working directory), else beside the schema.
    const configText = yield* Effect.firstSuccessOf(
      [...new Set([options.cwd, options.schemaDir])].map((dir) =>
        readFile(path.join(dir, 'prisma.config.ts')),
      ),
    ).pipe(Effect.orElseSucceed(() => null))
    // A config that could not be read may have held the URL, so that is the reason to give.
    return yield* makeDatabaseUrl({
      explicit: options.explicitUrl,
      configUrl: options.configUrl,
      env: options.env,
      dotenv: Object.fromEntries(variables.flat()),
      configText,
      schemaText: options.schemaText,
    }).pipe(
      Effect.mapError((error) =>
        options.configError === null
          ? error
          : new DatabaseUrlNotFoundError({
              reason: `hekireki.config.ts could not be read for its \`url\`: ${options.configError}`,
            }),
      ),
    )
  })
}
