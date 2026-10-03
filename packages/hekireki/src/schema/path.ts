import path from 'node:path'

import { Effect } from 'effect'

import { exists, readFile } from '../file/index.js'

// Kept apart from index.ts, which loads the Prisma engine: the command line finds the schema with
// this before `--help` or a rejected flag, and must not pay for the engine to do it.

/** Where Prisma looks for a schema when neither the command nor prisma.config.ts names one. */
export const DEFAULT_SCHEMA_PATHS = ['prisma/schema.prisma', 'schema.prisma']

const CONFIG_EXTENSIONS = ['.js', '.ts', '.mjs', '.cjs', '.mts', '.cts']

// The config files Prisma looks for in a directory, in its order (@prisma/config,
// findPrismaConfigFile): prisma7.config and .config/prisma7 first, then the names before them,
// each also as a directory holding an index file.
const CONFIG_FILES = [
  'prisma7.config',
  path.join('.config', 'prisma7'),
  ...[
    'prisma.config',
    path.join('.config', 'prisma'),
    path.join('.config', 'prisma.config'),
  ].flatMap((name) => [name, path.join(name, 'index')]),
].flatMap((base) => CONFIG_EXTENSIONS.map((extension) => `${base}${extension}`))

/** The Prisma config file of `dir` as Prisma finds it, with its text; null when there is none. */
export function readPrismaConfig(dir: string) {
  return Effect.gen(function* () {
    for (const name of CONFIG_FILES) {
      const file = path.join(dir, name)
      const text = yield* readFile(file).pipe(Effect.orElseSucceed(() => null))
      if (text !== null) return { file, text }
    }
    return null
  })
}

/** The `schema` of a Prisma config when it is written as a string; a computed path is not read. */
function configuredSchema(configText: string) {
  return /\bschema\s*:\s*["'`]([^"'`]+)["'`]/u.exec(configText)?.[1] ?? null
}

/**
 * The schema Prisma reads in `dir` when the command names none: the `schema` of the Prisma config
 * there, from the config file's own directory as Prisma resolves it, whether or not it exists (so
 * a wrong one is named rather than passed over), else the first default path that exists; null
 * when there is neither.
 */
export function prismaSchemaPath(dir: string) {
  return Effect.gen(function* () {
    const config = yield* readPrismaConfig(dir)
    const configured = config === null ? null : configuredSchema(config.text)
    if (config !== null && configured !== null) {
      return path.isAbsolute(configured)
        ? configured
        : path.join(path.dirname(config.file), configured)
    }
    for (const candidate of DEFAULT_SCHEMA_PATHS) {
      const resolved = path.join(dir, candidate)
      if (yield* exists(resolved)) return resolved
    }
    return null
  })
}
