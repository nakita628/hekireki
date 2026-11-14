import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { Data, Effect } from 'effect'

/** A package the project could not resolve or load; each caller words it for its own command. */
export class ProjectImportError extends Data.TaggedError('ProjectImportError')<{
  readonly specifier: string
  readonly cwd: string
  readonly message: string
}> {}

/**
 * A package as the project in `cwd` resolves it, its module namespace as imported: the project's
 * own database driver, Prisma adapter or generated client, never a copy hekireki ships.
 */
export function importFromProject(specifier: string, cwd: string) {
  return Effect.tryPromise({
    try: async (): Promise<unknown> =>
      import(pathToFileURL(createRequire(path.join(cwd, 'package.json')).resolve(specifier)).href),
    catch: (error) =>
      new ProjectImportError({
        specifier,
        cwd,
        message: error instanceof Error ? error.message : String(error),
      }),
  })
}
