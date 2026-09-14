import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { Effect, Semaphore } from 'effect'
import type ts from 'typescript-5'
import * as z from 'zod'

import { clientSource } from '../../../seed/discover.js'
import { parseSchema } from '../../../seed/schema.js'
import { ClientUnavailableError } from '../errors/index.js'

type TypeScript = typeof ts

/** The name the query is checked under, beside the generated client so `./client` resolves. */
const QUERY_FILE = '__hekireki_studio_query__.ts'

const NO_SERVICE =
  'Completion against the client types needs TypeScript 5 in the project (typescript@7 ships no language service API).\n   Install it with `npm install -D typescript@5`; the editor still completes model and field names from the schema.'

const TypeScriptModule = z
  .custom<TypeScript>(
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

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

/** The project's own `typescript`: Studio ships none, and the types are checked the way the project checks them. */
function loadTypeScript(cwd: string) {
  return Effect.gen(function* () {
    const namespace = yield* Effect.tryPromise({
      try: async (): Promise<unknown> => {
        const resolved = createRequire(path.resolve(cwd, 'package.json')).resolve('typescript')
        const loaded: unknown = await import(pathToFileURL(resolved).href)
        const parsed = ModuleNamespace.safeParse(loaded)
        return parsed.success ? parsed.data.default : loaded
      },
      catch: (error) =>
        new ClientUnavailableError({
          reason: `Cannot load "typescript" from ${cwd}: ${messageOf(error)}\n   Install it with \`npm install -D typescript@5\` so the editor can complete against the client's types.`,
        }),
    })
    const parsed = TypeScriptModule.safeParse(namespace)
    if (!parsed.success) return yield* new ClientUnavailableError({ reason: NO_SERVICE })
    return parsed.data
  })
}

// The lines in front of the query: `prisma` is the client, and the import makes the file a
// module, so `await` at the top level is what it is in the application too.
function preambleOf(entry: string) {
  return `import type { PrismaClient } from '${entry}'\ndeclare const prisma: PrismaClient\n`
}

/** The version of a file on disk as the language service compares it: its mtime, so a `prisma generate` is seen. */
function diskVersion(typescript: TypeScript, file: string) {
  return String(typescript.sys.getModifiedTime?.(file)?.getTime() ?? 0)
}

type Loaded = {
  readonly ts: TypeScript
  readonly service: ts.LanguageService
  readonly file: string
  readonly preamble: string
  readonly cell: { text: string; version: number }
}

function makeChecker(input: {
  readonly ts: TypeScript
  readonly dir: string
  readonly entry: string
  readonly cwd: string
}): Loaded {
  const { ts: typescript } = input
  const file = path.join(input.dir, QUERY_FILE)
  const preamble = preambleOf(input.entry)
  // The one document the service edits; everything else is read from disk as the project has it.
  const cell = { text: '', version: 0 }
  const options: ts.CompilerOptions = {
    target: typescript.ScriptTarget.ESNext,
    module: typescript.ModuleKind.ESNext,
    moduleResolution: typescript.ModuleResolutionKind.Bundler,
    lib: ['lib.esnext.d.ts'],
    types: [],
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    allowImportingTsExtensions: true,
  }
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [file],
    getScriptVersion: (name) =>
      name === file ? String(cell.version) : diskVersion(typescript, name),
    getScriptSnapshot: (name) => {
      if (name === file) return typescript.ScriptSnapshot.fromString(`${preamble}${cell.text}`)
      const text = typescript.sys.readFile(name)
      return text === undefined ? undefined : typescript.ScriptSnapshot.fromString(text)
    },
    getCurrentDirectory: () => input.cwd,
    getCompilationSettings: () => options,
    getDefaultLibFileName: (settings) => typescript.getDefaultLibFilePath(settings),
    fileExists: (name) => typescript.sys.fileExists(name),
    readFile: (name, encoding) => typescript.sys.readFile(name, encoding),
    readDirectory: (dir, extensions, exclude, include, depth) =>
      typescript.sys.readDirectory(dir, extensions, exclude, include, depth),
    directoryExists: (dir) => typescript.sys.directoryExists(dir),
    getDirectories: (dir) => typescript.sys.getDirectories(dir),
    realpath: (name) => typescript.sys.realpath?.(name) ?? name,
  }
  const service = typescript.createLanguageService(host, typescript.createDocumentRegistry())
  return { ts: typescript, service, file, preamble, cell }
}

const CreateTypeCheckerInput = z
  .object({
    schemaDir: z.string().meta({
      description: 'Where the generator output resolves from.',
      example: '/app/prisma',
    }),
    cwd: z.string().meta({
      description: 'Where typescript and @prisma/client are resolved from.',
      example: '/app',
    }),
  })
  .readonly()
  .meta({ description: 'The project whose Prisma Client types the editor completes against' })

type SchemaFiles = readonly { readonly path: string; readonly content: string }[]

/**
 * A TypeScript language service over the project, loaded the first time it is asked for: the
 * project's own `typescript` checks a query file that sits beside the generated client and
 * declares `prisma` as its `PrismaClient`. Module resolution, the tsconfig-free compiler
 * options aside, is TypeScript's own over the project's files, so `prisma generate` is picked
 * up by the next request. The query text is swapped in before every question.
 */
export function createTypeChecker(input: z.infer<typeof CreateTypeCheckerInput>) {
  const lock = Semaphore.makeUnsafe(1)
  const holder: { loaded: { readonly files: SchemaFiles; readonly service: Loaded } | null } = {
    loaded: null,
  }

  function load(files: SchemaFiles) {
    return Effect.gen(function* () {
      if (holder.loaded?.files === files) return holder.loaded.service
      const schema = yield* parseSchema(files).pipe(
        Effect.mapError((error) => new ClientUnavailableError({ reason: error.message })),
      )
      const { source, reason } = clientSource(schema.generators)
      if (source === null) {
        return yield* new ClientUnavailableError({
          reason: `Prisma Client not found: ${reason ?? 'unknown'}.\n   Add a \`prisma-client\` generator to the schema and run \`prisma generate\`.`,
        })
      }
      const typescript = yield* loadTypeScript(input.cwd)
      const legacy = source === '@prisma/client'
      const dir = legacy ? input.cwd : path.resolve(input.schemaDir, source)
      if (!legacy && !typescript.sys.fileExists(path.join(dir, 'client.ts'))) {
        return yield* new ClientUnavailableError({
          reason: `No client.ts in ${dir}: run \`prisma generate\` so the client is written there.`,
        })
      }
      const service = makeChecker({
        ts: typescript,
        dir,
        entry: legacy ? source : './client',
        cwd: input.cwd,
      })
      // oxlint-disable-next-line custom/no-mutation -- the service is built once per schema snapshot and kept
      holder.loaded = { files, service }
      return service
    }).pipe(Semaphore.withPermit(lock))
  }

  /**
   * Puts the text in place and asks the service about it in one synchronous step: of two
   * requests that arrive together (completion and signature help on the same keystroke), neither
   * can swap its text in between the other's edit and question.
   */
  function ask<T>(
    files: SchemaFiles,
    text: string,
    offset: number,
    question: (context: Loaded & { readonly base: number; readonly position: number }) => T,
  ) {
    return Effect.gen(function* () {
      const loaded = yield* load(files)
      return yield* Effect.sync(() => {
        if (loaded.cell.text !== text) {
          // oxlint-disable-next-line custom/no-mutation -- the edited document is the one mutable cell of the service
          loaded.cell.text = text
          // oxlint-disable-next-line custom/no-mutation -- the version is what tells the service the text changed
          loaded.cell.version += 1
        }
        const base = loaded.preamble.length
        return question({
          ...loaded,
          base,
          position: base + Math.max(0, Math.min(offset, text.length)),
        })
      })
    })
  }

  return {
    /**
     * The version of the TypeScript the service runs on, or why there is no service.
     *
     * @param files - the schema files
     * @returns the version and the reason
     */
    status(files: SchemaFiles) {
      return load(files).pipe(
        Effect.match({
          onFailure: (error) => ({ typescript: null, typesError: error.reason }),
          onSuccess: (loaded) => ({ typescript: loaded.ts.version, typesError: null }),
        }),
      )
    },
    /**
     * The completions at the offset.
     *
     * @param files - the schema files
     * @param text - the query
     * @param offset - where the cursor is
     * @returns the items TypeScript lists
     */
    complete(files: SchemaFiles, text: string, offset: number) {
      return ask(files, text, offset, ({ service, file, position }) => {
        const found = service.getCompletionsAtPosition(file, position, {
          includeCompletionsWithInsertText: true,
          includeCompletionsForModuleExports: false,
        })
        return (found?.entries ?? []).map((entry) => ({
          label: entry.name,
          kind: entry.kind,
          sortText: entry.sortText,
          insertText: entry.insertText ?? null,
        }))
      })
    },
    /**
     * The type and documentation of one completion.
     *
     * @param files - the schema files
     * @param text - the query
     * @param offset - where the cursor is
     * @param name - the item
     * @returns the signature and the doc comment
     */
    detail(files: SchemaFiles, text: string, offset: number, name: string) {
      return ask(files, text, offset, ({ ts: typescript, service, file, position }) => {
        const found = service.getCompletionEntryDetails(
          file,
          position,
          name,
          undefined,
          undefined,
          undefined,
          undefined,
        )
        if (found === undefined) return { detail: null, documentation: null }
        const documentation = typescript.displayPartsToString(found.documentation)
        return {
          detail: typescript.displayPartsToString(found.displayParts) || null,
          documentation: documentation === '' ? null : documentation,
        }
      })
    },
    /**
     * What TypeScript says about the symbol at the offset.
     *
     * @param files - the schema files
     * @param text - the query
     * @param offset - where the pointer is
     * @returns the type and documentation as Markdown, and the symbol's range
     */
    hover(files: SchemaFiles, text: string, offset: number) {
      return ask(files, text, offset, ({ ts: typescript, service, file, position, base }) => {
        const info = service.getQuickInfoAtPosition(file, position)
        if (info === undefined || info.textSpan.start < base) {
          return { contents: null, range: null }
        }
        const signature = typescript.displayPartsToString(info.displayParts)
        const documentation = typescript.displayPartsToString(info.documentation)
        return {
          contents: [
            `\`\`\`typescript\n${signature}\n\`\`\``,
            ...(documentation === '' ? [] : [documentation]),
          ].join('\n\n'),
          range: {
            start: info.textSpan.start - base,
            end: info.textSpan.start + info.textSpan.length - base,
          },
        }
      })
    },
    /**
     * The signatures of the call the offset is inside.
     *
     * @param files - the schema files
     * @param text - the query
     * @param offset - where the cursor is
     * @returns the overloads and which one and which parameter is active
     */
    signature(files: SchemaFiles, text: string, offset: number) {
      return ask(files, text, offset, ({ ts: typescript, service, file, position }) => {
        const help = service.getSignatureHelpItems(file, position, undefined)
        if (help === undefined) return { signatures: [], activeSignature: 0, activeParameter: 0 }
        const print = (parts: ts.SymbolDisplayPart[]) => typescript.displayPartsToString(parts)
        return {
          signatures: help.items.map((item) => {
            const parameters = item.parameters.map((parameter) => ({
              label: print(parameter.displayParts),
              documentation: print(parameter.documentation) || null,
            }))
            return {
              label: `${print(item.prefixDisplayParts)}${parameters
                .map((parameter) => parameter.label)
                .join(print(item.separatorDisplayParts))}${print(item.suffixDisplayParts)}`,
              documentation: print(item.documentation) || null,
              parameters,
            }
          }),
          activeSignature: help.selectedItemIndex,
          activeParameter: help.argumentIndex,
        }
      })
    },
    /**
     * What TypeScript finds wrong with the query.
     *
     * @param files - the schema files
     * @param text - the query
     * @returns the problems in the query text, in order of position
     */
    check(files: SchemaFiles, text: string) {
      return ask(files, text, 0, ({ ts: typescript, service, file, base }) => {
        const found = [
          ...service.getSyntacticDiagnostics(file),
          ...service.getSemanticDiagnostics(file),
        ]
        return found
          .flatMap((diagnostic) => {
            const start = diagnostic.start
            if (start === undefined || start < base) return []
            const severity =
              diagnostic.category === typescript.DiagnosticCategory.Error
                ? ('error' as const)
                : diagnostic.category === typescript.DiagnosticCategory.Warning
                  ? ('warning' as const)
                  : ('info' as const)
            return [
              {
                message: typescript.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
                severity,
                range: { start: start - base, end: start + (diagnostic.length ?? 0) - base },
              },
            ]
          })
          .toSorted((a, b) => a.range.start - b.range.start)
      })
    },
  }
}
