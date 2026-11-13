import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitRaw } from '../emit/index.js'
import { exists, readDirectory, removePath } from '../file/index.js'
import { fmtMarkdown } from '../format/index.js'
import {
  dbmlContent,
  erDiagramPng,
  erDiagramSvg,
  neighborhood,
  schemaSvg,
} from '../generator/dbml.js'
import { DOCS_FILES, docsMarkdown, modelDiagramPath } from '../generator/docs.js'
import { erContent } from '../generator/mermaid-er.js'
import { queryExamples } from '../generator/query-examples.js'
import { schemaSql } from '../migrate/adapter/schema-sql.js'
import { dialectOf, readSchemaFiles, schemaText } from '../schema/index.js'
import { formatSql } from '../sql/index.js'
import { makeSchema } from '../studio/server/domain/schema.js'
import { getString, getStrings } from '../utils/index.js'
import { GeneratorConfigError } from './errors.js'
import { compileQueries } from './query-compiler.js'

function themeOf(options: GeneratorOptions) {
  return getString(options.generator.config?.theme) === 'dark' ? 'dark' : 'light'
}

/**
 * The four ways the ER model of a schema is written out, each with the options it reads.
 *
 * The extension of each file picks one, so the file the caller names is the file they get: an
 * extension with no format behind it, and an option no chosen format reads, are both errors
 * rather than something silently ignored.
 */
const FORMATS = {
  '.md': {
    options: [],
    render: (options: GeneratorOptions) => erContent(options.dmmf.datamodel.models).join('\n'),
  },
  '.dbml': {
    options: [],
    render: (options: GeneratorOptions) => dbmlContent(options.dmmf.datamodel),
  },
  '.png': {
    options: ['theme'],
    render: (options: GeneratorOptions) => erDiagramPng(options.dmmf.datamodel, themeOf(options)),
  },
  '.svg': {
    options: ['theme'],
    render: (options: GeneratorOptions) => erDiagramSvg(options.dmmf.datamodel, themeOf(options)),
  },
} as const satisfies Record<
  string,
  {
    readonly options: readonly string[]
    /** A drawing is bytes; the two text formats are strings. `emitRaw` writes either. */
    readonly render: (options: GeneratorOptions) => string | Uint8Array
  }
>

/** What a directory is given: the docs, which read the theme of the diagrams they hold. */
const DOCS_OPTIONS = ['theme'] as const

type Format = keyof typeof FORMATS | 'docs'

function isFileFormat(extension: string): extension is keyof typeof FORMATS {
  return extension in FORMATS
}

const EXTENSIONS = `${Object.keys(FORMATS).join(', ')}, or a directory for the docs`

/**
 * What a path asks for: the format its extension names, the docs for a directory (a trailing
 * `/`, or no extension at all), and null for an extension with no format behind it.
 */
function formatOf(name: string): Format | null {
  if (name.endsWith('/') || path.extname(name) === '') return 'docs'
  const extension = path.extname(name).toLowerCase()
  return isFileFormat(extension) ? extension : null
}

function optionsOf(format: Format) {
  return format === 'docs' ? DOCS_OPTIONS : FORMATS[format].options
}

/** What the chosen format accepts, as the sentence the error ends with. */
function accepts(options: readonly string[]) {
  return options.length === 0 ? 'takes no options' : `takes ${options.join(', ')}`
}

/**
 * The files to write: the one `output` names, or every one `outputs` lists.
 *
 * Each entry is a whole path: a file, its extension included, so the file the caller writes is
 * the file they get, or a directory, which the docs are written into. A schema that wants the ER
 * model in several formats
 * declares `Hekireki-ER` once and lists them in `outputs`, each resolved the way Prisma resolves
 * `output`: against the directory of the schema file that declares the block.
 */
function filesOf(options: GeneratorOptions, outputs: readonly string[] | undefined) {
  return Effect.gen(function* () {
    const output = options.generator.isCustomOutput ? options.generator.output?.value : undefined
    if (output && outputs !== undefined) {
      return yield* new GeneratorConfigError({
        message:
          'Hekireki-ER takes output or outputs, not both: output names one file, outputs lists several.',
      })
    }
    if (output) {
      const format = formatOf(output)
      if (format === null) {
        return yield* new GeneratorConfigError({
          message: `output for Hekireki-ER has to name a file ending in ${EXTENSIONS}; "${output}" ends in "${path.extname(output)}".`,
        })
      }
      return [{ file: output, format }]
    }
    if (outputs === undefined) {
      return yield* new GeneratorConfigError({
        message: `output or outputs is required for Hekireki-ER: output names one file, outputs lists several, each ending in ${EXTENSIONS}.`,
      })
    }
    if (outputs.length === 0) {
      return yield* new GeneratorConfigError({
        message: 'outputs for Hekireki-ER has to name at least one file.',
      })
    }
    const base = path.dirname(options.generator.sourceFilePath)
    return yield* Effect.forEach(outputs, (name) => {
      const format = formatOf(name)
      if (format === null) {
        return new GeneratorConfigError({
          message: `outputs for Hekireki-ER has to name files ending in ${EXTENSIONS}; "${name}" ends in "${path.extname(name)}".`,
        })
      }
      return Effect.succeed({ file: path.resolve(base, name), format })
    })
  })
}

/**
 * Writes the schema's docs into the directory `dir`: README.md (with each model's queries beside
 * the SQL they send), beside the ER diagram it links
 * (er.svg) and one diagram per model with a relation (tables/<Model>.svg: the model and the models
 * it joins). The diagram of a model that is gone is removed, so a directory written again holds
 * none that is stale.
 */
function writeDocs(options: GeneratorOptions, dir: string) {
  return Effect.gen(function* () {
    const theme = themeOf(options)
    // CockroachDB reads as PostgreSQL elsewhere, but its tables are not PostgreSQL's to write.
    const provider = options.datasources[0]?.activeProvider ?? null
    const dialect = provider === 'cockroachdb' ? null : dialectOf(provider)
    const files = dialect === null ? [] : yield* readSchemaFiles(options.schemaPath)
    const statements =
      dialect === null ? [] : yield* schemaSql({ files, dialect, cwd: process.cwd() })
    // Each query beside the SQL it sends, compiled by the project's own Prisma Client; where
    // there is none to compile with (no `@prisma/client`, or one older than Prisma 7), the calls
    // are shown alone.
    const examples = queryExamples(options.dmmf.datamodel)
    const compiled =
      dialect === null
        ? null
        : yield* compileQueries({
            schemaPath: options.schemaPath,
            datamodel: schemaText(files),
            dialect,
            examples,
          }).pipe(Effect.orElseSucceed(() => null))
    const queries = yield* Effect.forEach(
      compiled ?? examples.map((example) => ({ example, statements: null, error: null })),
      ({ example, statements: planned, error }) =>
        Effect.forEach(planned ?? [], ({ sql, params }) =>
          formatSql(sql, dialect).pipe(Effect.map((text) => ({ sql: text, params }))),
        ).pipe(
          Effect.map((formatted) => ({
            example,
            statements: planned === null ? null : formatted,
            error,
          })),
        ),
    )
    const readme = yield* fmtMarkdown(
      docsMarkdown({ datamodel: options.dmmf.datamodel, statements, queries }),
    )
    const schema = makeSchema({
      dmmf: { datamodel: options.dmmf.datamodel },
      files: [],
      provider: null,
      blocks: [],
    })
    const diagrams = schema.models
      .filter((model) =>
        schema.relations.some((r) => r.from.model === model.name || r.to.model === model.name),
      )
      .map((model) => ({
        name: modelDiagramPath(model.name),
        data: schemaSvg(neighborhood(schema, model.name), theme),
      }))
    const modelsDir = path.join(dir, DOCS_FILES.models)
    const kept = new Set(diagrams.map(({ name }) => path.basename(name)))
    const present = (yield* exists(modelsDir)) ? yield* readDirectory(modelsDir) : []
    yield* Effect.forEach(
      present.filter((name) => name.endsWith('.svg') && !kept.has(name)),
      (name) => removePath(path.join(modelsDir, name)),
      { discard: true },
    )
    yield* Effect.forEach(
      [
        { name: 'README.md', data: readme },
        { name: DOCS_FILES.diagram, data: erDiagramSvg(options.dmmf.datamodel, theme) },
        ...diagrams,
      ],
      ({ name, data }) => {
        const file = path.join(dir, name)
        return emitRaw(data, path.dirname(file), file)
      },
      { discard: true },
    )
  })
}

export function er(options: GeneratorOptions) {
  return Effect.gen(function* () {
    const config = options.generator.config ?? {}
    const outputs = getStrings(config.outputs)
    const files = yield* filesOf(options, outputs)
    // Every option belongs to a format, so the options a block may carry are the ones the
    // formats it writes read between them — and `outputs`, which picks those formats.
    const read = new Set<string>(outputs === undefined ? [] : ['outputs'])
    for (const { format } of files) {
      for (const option of optionsOf(format)) read.add(option)
    }
    const unread = Object.keys(config).filter((name) => !read.has(name))
    if (unread.length > 0) {
      const formats = [...new Set(files.map(({ format }) => format))]
      const named = formats.map((format) => (format === 'docs' ? 'docs directory' : format))
      return yield* new GeneratorConfigError({
        message: `Hekireki-ER does not read ${unread.map((name) => `"${name}"`).join(', ')} for ${
          named.length === 1 ? `a ${named[0]} output` : `the ${named.join(', ')} outputs`
        }; ${formats.map((format, i) => `${named[i]} ${accepts(optionsOf(format))}`).join(', ')}.`,
      })
    }
    return yield* Effect.forEach(
      files,
      ({ file, format }) =>
        format === 'docs'
          ? writeDocs(options, file)
          : emitRaw(FORMATS[format].render(options), path.dirname(file), file),
      { discard: true },
    )
  })
}
