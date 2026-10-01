import path from 'node:path'
import { parseEnv } from 'node:util'

import { ConfigProvider, Effect } from 'effect'

import { readFile } from '../file/index.js'
import { readPrismaConfig } from '../schema/path.js'
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
    // The Prisma config where Prisma reads it (the working directory), else beside the schema,
    // under any of the names Prisma looks for.
    const configs = yield* Effect.forEach([...new Set([options.cwd, options.schemaDir])], (dir) =>
      readPrismaConfig(dir),
    )
    const config = configs.find((found) => found !== null) ?? null
    // A config that could not be read may have held the URL, so that is the reason to give.
    return yield* makeDatabaseUrl({
      explicit: options.explicitUrl,
      configUrl: options.configUrl,
      configText: config?.text ?? null,
      // Named as the person sees it: from the working directory, or as found outside it.
      configName:
        config === null
          ? null
          : path.relative(options.cwd, config.file).startsWith('..')
            ? config.file
            : path.relative(options.cwd, config.file),
      schemaText: options.schemaText,
    }).pipe(
      // The .env files stand behind the environment the caller runs with, as they do for Prisma.
      Effect.provide(
        ConfigProvider.layerAdd(ConfigProvider.fromEnvRecord(Object.fromEntries(variables.flat()))),
      ),
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
