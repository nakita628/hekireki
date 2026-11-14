import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitRaw } from '../emit/index.js'
import { exists, readDirectory, readFile, writeFile } from '../file/index.js'
import { fmt } from '../format/index.js'
import {
  authModule,
  fillHandlers,
  guardedPaths,
  guardPaths,
  handlerBodies,
  routeOperations,
  zodOpenapiHonoYaml,
} from '../generator/zod-openapi-hono.js'
import { getString } from '../utils/index.js'
import { GeneratorConfigError, HonoTakibiError } from './errors.js'
import { requireOutput } from './output.js'

/** `prisma` as a file in `handlers/` imports it: a relative module one directory further up. */
function fromHandlers(specifier: string) {
  return specifier.startsWith('./') || specifier.startsWith('../')
    ? path.posix.join('..', specifier)
    : specifier
}

/** Runs Hono Takibi's template on the document, loaded only for this generator. */
function honoTakibi(input: string, output: string) {
  return Effect.tryPromise({
    try: async () => {
      const { generate } = await import('hono-takibi/generate')
      return generate({ input, output, template: { routeHandler: true } })
    },
    catch: (error) =>
      new HonoTakibiError({
        message: `Hekireki-ZodOpenAPIHono runs hono-takibi (npm install -D hono-takibi): ${error instanceof Error ? error.message : String(error)}`,
      }),
  })
}

/** Fills the empty handlers of one handler file, and leaves a file with none as it is. */
function fillHandlerFile(
  file: string,
  operations: ReadonlyMap<string, string>,
  bodies: ReadonlyMap<string, string>,
  prismaImport: string,
) {
  return Effect.gen(function* () {
    const code = yield* readFile(file)
    const filled = fillHandlers(code, operations, bodies, prismaImport)
    if (filled !== code) yield* writeFile(file, yield* fmt(filled))
  })
}

/**
 * `auth.ts`, written when it is not there and the user's after, and the app entry with `auth` on
 * every model's paths.
 */
function guardApp(output: string, paths: readonly string[]) {
  return Effect.gen(function* () {
    const module = path.join(output, 'auth.ts')
    if (!(yield* exists(module))) yield* writeFile(module, authModule())
    const entry = path.join(output, 'index.ts')
    const code = yield* readFile(entry)
    const guarded = guardPaths(code, paths)
    if (guarded !== code) yield* writeFile(entry, yield* fmt(guarded))
  })
}

/**
 * The Hono app of the CRUD of every model, in the directory `output` names: `openapi.yaml`, the
 * document of the CRUD as Prisma Client has the rows, and what Hono Takibi's template makes of it
 * (`routes.ts`, `handlers/`, `index.ts`), each handler calling Prisma Client as `prisma`, which
 * the module `prisma` names exports. With `auth = "jwt"`, every operation asks for a bearer JWT,
 * which `auth.ts` checks on every model's paths.
 */
export function zodOpenapiHono(options: GeneratorOptions) {
  return Effect.gen(function* () {
    const output = yield* requireOutput(options, 'Hekireki-ZodOpenAPIHono')
    if (path.extname(output) !== '') {
      return yield* new GeneratorConfigError({
        message: `output for Hekireki-ZodOpenAPIHono is the directory of the app, not a file: ${output}`,
      })
    }
    const config = options.generator.config ?? {}
    const prismaImport = getString(config.prisma) ?? './prisma'
    const auth = getString(config.auth)
    if (auth !== undefined && auth !== 'jwt') {
      return yield* new GeneratorConfigError({
        message: `auth for Hekireki-ZodOpenAPIHono must be "jwt": ${auth}`,
      })
    }
    const datamodel = options.dmmf.datamodel
    const document = path.join(output, 'openapi.yaml')
    yield* emitRaw(
      zodOpenapiHonoYaml(datamodel, {
        title: getString(config.title) ?? 'Generated from schema.prisma',
        version: getString(config.version) ?? '1.0.0',
        auth: auth !== undefined,
      }),
      output,
      document,
    )
    const routes = path.join(output, 'routes.ts')
    yield* honoTakibi(document, routes)
    const operations = routeOperations(yield* readFile(routes))
    const bodies = handlerBodies(datamodel)
    const handlers = path.join(output, 'handlers')
    const files = (yield* readDirectory(handlers)).filter((name) => name.endsWith('.ts'))
    yield* Effect.forEach(
      files,
      (name) =>
        fillHandlerFile(path.join(handlers, name), operations, bodies, fromHandlers(prismaImport)),
      { discard: true },
    )
    if (auth !== undefined) yield* guardApp(output, guardedPaths(datamodel))
    return undefined
  })
}
