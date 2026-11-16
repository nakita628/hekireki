import { Config, Data, Effect, Option } from 'effect'

import { makeDatabaseUrlChoice, makeDatasourceUrl, makeSchemaDatasourceUrl } from './domain/url.js'

// The database URL as the environment gives it: the one place that reads a variable. What the
// URL text says, and which place wins, is domain/url.ts.

export type { Dialect } from './domain/url.js'

/** No place named a database URL; `reason` says where one would be looked for. */
export class DatabaseUrlNotFoundError extends Data.TaggedError('DatabaseUrlNotFoundError')<{
  readonly reason: string
}> {}

/**
 * A variable of the environment, as the `ConfigProvider` this runs with reads it: the process
 * environment by default, with the `.env` files behind it once `resolveDatabaseUrl` has added them.
 * One set to the empty string counts as not set.
 */
export function environmentVariable(name: string) {
  return Config.option(Config.String(name)).pipe(
    Effect.map(nonEmptyOrNull),
    Effect.orElseSucceed(() => null),
  )
}

/**
 * `--url`, then `url` in hekireki.config.ts, then whatever Prisma itself connects with: the
 * variable `datasource.url` names with `env("NAME")` in the Prisma config (or in the schema's
 * `datasource` block, Prisma 6 and earlier), read from the environment and `.env`, or the literal
 * written there. Only when Prisma names nothing is DATABASE_URL, Prisma's own default, looked up.
 */
export function makeDatabaseUrl(input: {
  /** The --url flag, when given. */
  readonly explicit: string | null
  /** The `url` of hekireki.config.ts, when set. */
  readonly configUrl: string | null
  /** The text of the Prisma config, when there is one. */
  readonly configText: string | null
  /** The Prisma config's file as the error names it: prisma.config.ts, .config/prisma.ts, ... */
  readonly configName: string | null
  /** The text of the Prisma schema files, when read. */
  readonly schemaText: string | null
}) {
  return Effect.gen(function* () {
    const fromConfig =
      input.configText === null ? null : makeDatasourceUrl({ configText: input.configText })
    const fromSchema =
      input.schemaText === null ? null : makeSchemaDatasourceUrl({ schemaText: input.schemaText })
    const datasource = fromConfig ?? fromSchema
    const named = datasource?.kind === 'env' ? yield* environmentVariable(datasource.name) : null
    // DATABASE_URL, Prisma's default name, is read only when Prisma names nothing.
    const fallback = datasource === null ? yield* environmentVariable('DATABASE_URL') : null
    const choice = makeDatabaseUrlChoice({
      explicit: input.explicit,
      configUrl: input.configUrl,
      datasource,
      named,
      fallback,
      where: fromConfig === null ? 'the schema' : (input.configName ?? 'prisma.config.ts'),
    })
    if (choice.found !== null) return choice.found
    return yield* new DatabaseUrlNotFoundError({ reason: choice.reason })
  })
}

function nonEmptyOrNull(value: Option.Option<string>) {
  return Option.getOrNull(Option.filter(value, (text) => text !== ''))
}
