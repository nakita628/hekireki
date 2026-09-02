import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitRaw } from '../emit/index.js'
import { erContent } from '../generator/mermaid-er.js'
import { GeneratorConfigError } from './errors.js'

export function mermaidEr(options: GeneratorOptions) {
  return Effect.gen(function* () {
    if (!(options.generator.isCustomOutput && options.generator.output?.value)) {
      return yield* new GeneratorConfigError({
        message:
          'output is required for Hekireki-ER. Please specify output in your generator config.',
      })
    }
    const output = options.generator.output.value
    const content = erContent(options.dmmf.datamodel.models)
    const resolved = path.extname(output)
      ? { dir: path.dirname(output), file: output }
      : { dir: output, file: path.join(output, 'ER.md') }
    return yield* emitRaw(content.join('\n'), resolved.dir, resolved.file)
  })
}
