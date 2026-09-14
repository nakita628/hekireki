import { existsSync, statSync } from 'node:fs'
import nodeModule from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { Effect } from 'effect'

function isFile(candidate: string) {
  return existsSync(candidate) && statSync(candidate).isFile()
}

/**
 * Resolves a relative or `file:` import the way a bundler does: `./data/users` and
 * `./generated/seed/schema` find `.ts` (or `.mts`, `.js`, `.mjs`, or an `index.ts`) files, and
 * `./x.js` finds `x.ts` when there is no `x.js`. Node.js alone wants the exact file name; the
 * config, the files it imports and a generated Prisma Client are TypeScript that `hekireki seed`
 * runs as such.
 */
export function resolveTypeScript(
  specifier: string,
  context: { readonly parentURL?: string | undefined },
  next: (specifier: string) => { readonly url: string; readonly shortCircuit?: boolean },
) {
  const parent = context.parentURL
  const relative = specifier.startsWith('./') || specifier.startsWith('../')
  if (!(relative || specifier.startsWith('file:'))) return next(specifier)
  if (relative && (parent === undefined || !parent.startsWith('file:'))) return next(specifier)
  const base = fileURLToPath(relative ? new URL(specifier, parent) : new URL(specifier))
  if (isFile(base)) return next(specifier)
  const found = [
    base.replace(/\.js$/u, '.ts'),
    `${base}.ts`,
    `${base}.mts`,
    `${base}.js`,
    `${base}.mjs`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.js'),
  ].find(isFile)
  // The file is answered directly: a `require` in the project (better-sqlite3, say) gets the
  // same hook, and Node's own CommonJS resolver does not take a `file:` URL as a specifier.
  return found === undefined
    ? next(specifier)
    : { url: pathToFileURL(found).href, shortCircuit: true }
}

/**
 * Runs the effect with the TypeScript resolution above registered as a module hook, and takes the
 * hook down again afterwards, whatever happened. A Node.js without `module.registerHooks`
 * (before 22.15) runs the effect as it is, and imports need their extensions.
 */
export function withTypeScriptImports<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return Effect.acquireUseRelease(
    Effect.sync(() =>
      typeof nodeModule.registerHooks === 'function'
        ? nodeModule.registerHooks({
            resolve: (specifier, context, nextResolve) =>
              resolveTypeScript(specifier, context, (resolved) => nextResolve(resolved, context)),
          })
        : null,
    ),
    () => effect,
    (hooks) =>
      Effect.sync(() => {
        hooks?.deregister()
      }),
  )
}
