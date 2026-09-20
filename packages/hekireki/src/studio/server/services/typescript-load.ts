import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { Effect } from 'effect'
import type ts from 'typescript-5'
import * as z from 'zod'

import { ClientUnavailableError } from '../errors/index.js'

const NO_SERVICE =
  'Completion against the client types needs TypeScript 5 in the project (typescript@7 ships no language service API).\n   Install it with `npm install -D typescript@5`; the editor still completes model and field names from the schema.'

const TypeScriptModule = z
  .custom<typeof ts>(
    (value) =>
      typeof value === 'object' &&
      value !== null &&
      typeof Reflect.get(value, 'createLanguageService') === 'function' &&
      typeof Reflect.get(value, 'version') === 'string',
  )
  .meta({ description: 'The typescript package, with the language service API of the 5.x line.' })

const ModuleNamespace = z
  .object({
    default: z.unknown().meta({ description: 'The default export, when the package is CommonJS.' }),
  })
  .meta({ description: 'An imported module namespace' })

/** The project's own `typescript`: Studio ships none, and the types are checked the way the project checks them. */
export function loadTypeScript(cwd: string) {
  return Effect.gen(function* () {
    const namespace = yield* Effect.tryPromise({
      try: async (): Promise<unknown> => {
        const resolved = createRequire(path.resolve(cwd, 'package.json')).resolve('typescript')
        const loaded: unknown = await import(pathToFileURL(resolved).href)
        const result = ModuleNamespace.safeParse(loaded)
        return result.success ? result.data.default : loaded
      },
      catch: (error) =>
        new ClientUnavailableError({
          reason: `Cannot load "typescript" from ${cwd}: ${error instanceof Error ? error.message : String(error)}\n   Install it with \`npm install -D typescript@5\` so the editor can complete against the client's types.`,
        }),
    })
    const result = TypeScriptModule.safeParse(namespace)
    if (!result.success) return yield* new ClientUnavailableError({ reason: NO_SERVICE })
    return result.data
  })
}
