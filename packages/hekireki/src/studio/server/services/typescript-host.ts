import path from 'node:path'

import type ts from 'typescript-5'

/** The name the query is checked under, beside the generated client so `./client` resolves. */
const QUERY_FILE = '__hekireki_studio_query__.ts'

/**
 * A language service over one query file placed in `dir`, importing `PrismaClient` from
 * `entry`; every other file is read from disk as the project has it. The query text lives in
 * the returned `cell`, whose version tells the service when it changed.
 */
export function makeChecker(input: {
  readonly ts: typeof ts
  readonly dir: string
  readonly entry: string
  readonly cwd: string
}) {
  const { ts: typescript } = input
  const file = path.join(input.dir, QUERY_FILE)
  // The lines in front of the query: `prisma` is the client, and the import makes the file a
  // module, so `await` at the top level is what it is in the application too.
  const preamble = `import type { PrismaClient } from '${input.entry}'\ndeclare const prisma: PrismaClient\n`
  // The one document the service edits; everything else is read from disk as the project has it.
  const cell = { text: '', version: 0 }
  const options = {
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
    // A file on disk is versioned by its mtime, so a `prisma generate` is seen.
    getScriptVersion: (name) =>
      name === file
        ? String(cell.version)
        : String(typescript.sys.getModifiedTime?.(name)?.getTime() ?? 0),
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
