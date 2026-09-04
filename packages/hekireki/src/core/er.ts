import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitRaw } from '../emit/index.js'
import { dbmlContent, erDiagramPng, erDiagramSvg } from '../generator/dbml.js'
import { erContent } from '../generator/mermaid-er.js'
import { getString } from '../utils/index.js'
import { GeneratorConfigError } from './errors.js'

function themeOf(options: GeneratorOptions) {
  return getString(options.generator.config?.theme) === 'dark' ? 'dark' : 'light'
}

/**
 * The four ways the ER model of a schema is written out, each with the options it reads.
 *
 * The extension of `output` picks one, so the file the caller names is the file they get: an
 * extension with no format behind it, and an option the chosen format does not read, are both
 * errors rather than something silently ignored.
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

const EXTENSIONS = Object.keys(FORMATS).join(', ')

function isFormat(extension: string): extension is keyof typeof FORMATS {
  return extension in FORMATS
}

/** What the chosen format accepts, as the sentence the error ends with. */
function accepts(options: readonly string[]) {
  return options.length === 0 ? 'takes no options' : `takes ${options.join(', ')}`
}

export function er(options: GeneratorOptions) {
  return Effect.gen(function* () {
    if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
      return yield* new GeneratorConfigError({
        message:
          'output is required for Hekireki-ER. Please specify output in your generator config.',
      })
    }
    const output = options.generator.output.value
    const extension = path.extname(output).toLowerCase()
    if (!isFormat(extension)) {
      return yield* new GeneratorConfigError({
        message: `output for Hekireki-ER has to name a file ending in ${EXTENSIONS}; "${output}" ends in ${extension === '' ? 'nothing' : `"${extension}"`}.`,
      })
    }
    const format = FORMATS[extension]
    const read: readonly string[] = format.options
    const unread = Object.keys(options.generator.config ?? {}).filter(
      (name) => !read.includes(name),
    )
    if (unread.length > 0) {
      return yield* new GeneratorConfigError({
        message: `Hekireki-ER does not read ${unread.map((name) => `"${name}"`).join(', ')} for a ${extension} output; ${extension} ${accepts(format.options)}.`,
      })
    }
    return yield* emitRaw(format.render(options), path.dirname(output), output)
  })
}
