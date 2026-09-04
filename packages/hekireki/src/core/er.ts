import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitRaw } from '../emit/index.js'
import { dbmlContent, erDiagramPng, erDiagramSvg } from '../generator/dbml.js'
import { erContent } from '../generator/mermaid-er.js'
import { getString, getStrings } from '../utils/index.js'
import { GeneratorConfigError } from './errors.js'

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
    options: ['mapToDbSchema'],
    render: (options: GeneratorOptions) =>
      dbmlContent(
        options.dmmf.datamodel,
        getString(options.generator.config?.mapToDbSchema) !== 'false',
      ),
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

type Format = keyof typeof FORMATS

const EXTENSIONS = Object.keys(FORMATS).join(', ')

function isFormat(extension: string): extension is Format {
  return extension in FORMATS
}

/** What the chosen format accepts, as the sentence the error ends with. */
function accepts(options: readonly string[]) {
  return options.length === 0 ? 'takes no options' : `takes ${options.join(', ')}`
}

/** How a path ends, as the error says it: an extension in quotes, or nothing at all. */
function endsIn(name: string) {
  const extension = path.extname(name)
  return extension === '' ? 'nothing' : `"${extension}"`
}

/**
 * The files to write, from `output` alone or from the names `outputs` lists inside it.
 *
 * One block writes as many files as it names, so a schema that wants the ER model in several
 * formats declares `Hekireki-ER` once — `outputs` is the list, `output` the directory it fills.
 */
function filesOf(output: string, outputs: readonly string[] | undefined) {
  return Effect.gen(function* () {
    if (outputs === undefined) {
      const extension = path.extname(output).toLowerCase()
      if (!isFormat(extension)) {
        return yield* new GeneratorConfigError({
          message: `output for Hekireki-ER has to name a file ending in ${EXTENSIONS}; "${output}" ends in ${endsIn(output)}.`,
        })
      }
      return [{ file: output, extension }]
    }
    if (outputs.length === 0) {
      return yield* new GeneratorConfigError({
        message: 'outputs for Hekireki-ER has to name at least one file.',
      })
    }
    if (path.extname(output) !== '') {
      return yield* new GeneratorConfigError({
        message: `output for Hekireki-ER names the directory the files in outputs go in, so it cannot name a file; "${output}" ends in ${endsIn(output)}.`,
      })
    }
    return yield* Effect.forEach(outputs, (name) => {
      const extension = path.extname(name).toLowerCase()
      if (!isFormat(extension)) {
        return new GeneratorConfigError({
          message: `outputs for Hekireki-ER has to name files ending in ${EXTENSIONS}; "${name}" ends in ${endsIn(name)}.`,
        })
      }
      return Effect.succeed({ file: path.resolve(output, name), extension })
    })
  })
}

export function er(options: GeneratorOptions) {
  return Effect.gen(function* () {
    if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
      return yield* new GeneratorConfigError({
        message:
          'output is required for Hekireki-ER. Please specify output in your generator config.',
      })
    }
    const config = options.generator.config ?? {}
    const outputs = getStrings(config.outputs)
    const files = yield* filesOf(options.generator.output.value, outputs)
    // Every option belongs to a format, so the options a block may carry are the ones the
    // formats it writes read between them — and `outputs`, which picks those formats.
    const read = new Set<string>(outputs === undefined ? [] : ['outputs'])
    for (const { extension } of files) {
      for (const option of FORMATS[extension].options) read.add(option)
    }
    const unread = Object.keys(config).filter((name) => !read.has(name))
    if (unread.length > 0) {
      const extensions = [...new Set(files.map(({ extension }) => extension))]
      return yield* new GeneratorConfigError({
        message: `Hekireki-ER does not read ${unread.map((name) => `"${name}"`).join(', ')} for ${
          extensions.length === 1
            ? `a ${extensions[0]} output`
            : `the ${extensions.join(', ')} outputs`
        }; ${extensions.map((extension) => `${extension} ${accepts(FORMATS[extension].options)}`).join(', ')}.`,
      })
    }
    return yield* Effect.forEach(
      files,
      ({ file, extension }) =>
        emitRaw(FORMATS[extension].render(options), path.dirname(file), file),
      { discard: true },
    )
  })
}
