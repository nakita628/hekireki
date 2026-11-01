import path from 'node:path'

import type { GeneratorOptions } from '@prisma/generator-helper'
import { Effect } from 'effect'

import { emitRaw } from '../emit/index.js'
import { openapiContent } from '../generator/openapi.js'
import { getBool, getString } from '../utils/index.js'
import { GeneratorConfigError } from './errors.js'
import { outputFile, requireOutput } from './output.js'

export function openapi(options: GeneratorOptions) {
  return Effect.gen(function* () {
    const output = yield* requireOutput(options, 'Hekireki-OpenAPI')
    const resolved = outputFile(output, 'openapi.yaml')
    // The extension of the file picks how the document is written.
    const extension = path.extname(resolved.file)
    if (!(extension === '.yaml' || extension === '.yml' || extension === '.json')) {
      return yield* new GeneratorConfigError({
        message: `output for Hekireki-OpenAPI must end in .yaml, .yml or .json: ${output}`,
      })
    }
    const config = options.generator.config ?? {}
    const content = openapiContent(options.dmmf.datamodel, {
      title: getString(config.title) ?? 'Generated from schema.prisma',
      version: getString(config.version) ?? '1.0.0',
      paths: getBool(config.paths),
      format: extension === '.json' ? 'json' : 'yaml',
    })
    return yield* emitRaw(content, resolved.dir, resolved.file)
  })
}
